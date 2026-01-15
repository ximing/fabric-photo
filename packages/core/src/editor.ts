import { Emitter, type EditorEventMap } from './events';
import { createId } from './model/id';
import type { EditorObject, ImageObject, PathObject, ShapeObject } from './model/doc';
import { History } from './plugins/history';
import { Keymap } from './plugins/keymap';
import type { Plugin } from './plugins/plugin';
import { exportDocBlob, exportDocDataURL, exportViewportImage, getViewportDocRect } from './render/exporter';
import type { ControllerContext } from './render/controllers/controller';
import { ArrowController } from './render/controllers/arrow';
import { CropController } from './render/controllers/crop';
import { DrawController } from './render/controllers/draw';
import { LineController } from './render/controllers/line';
import { MosaicController } from './render/controllers/mosaic';
import { PanController } from './render/controllers/pan';
import { SelectController } from './render/controllers/select';
import { ShapeController } from './render/controllers/shape';
import { DEFAULT_TEXT, TEXT_STYLE_DEFAULTS, TextController, createTextObject } from './render/controllers/text';
import type { TextStyleOptions } from './render/controllers/text';
import { FabricRenderer } from './render/fabric-renderer';
import { preloadImage } from './render/object-factory';
import type { Renderer } from './render/renderer';
import { EditorState, ZOOM_MAX, ZOOM_MIN, type EditorMode, type Viewport } from './state/editor-state';
import { SetBackground, TransformDoc } from './steps/doc-steps';
import { AddObject, ClearObjects, RemoveObject, UpdateObject, type ObjectAttrs } from './steps/object-steps';
import { ReorderObjects, computeReorderedIds, type ReorderAction } from './steps/reorder-objects-step';
import { Transaction } from './transform/transaction';

export interface EditorOptions {
    container?: HTMLElement; // 传入时自动创建 FabricRenderer；缺省 + renderer 缺省 = 无头模式（测试）
    cssMaxWidth?: number;
    cssMaxHeight?: number;
    plugins?: Plugin[]; // 追加插件（history/keymap 始终默认注册）
    renderer?: Renderer; // 显式注入优先；缺省且给了 container 时自动 new FabricRenderer
}

/** 容器可见区域在 doc 坐标系下的矩形（getViewPortInfo 返回值）。 */
export interface ViewportInfo {
    width: number;
    height: number;
    left: number;
    top: number;
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameViewport(a: Viewport, b: Viewport): boolean {
    return a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;
}

/**
 * 编辑器主类：dispatch 流程 + 订阅 + 语义事件 + undo/redo 驱动 History。
 * dispatch 顺序固定：filter → apply → append → 置 state → history 收账 →
 * renderer 同步 → 事件 → 其余插件 onTransaction。
 */
export class Editor {
    private currentState: EditorState;
    private readonly emitter = new Emitter<EditorEventMap>();
    private readonly listeners = new Set<(state: EditorState, prev: EditorState) => void>();
    private readonly plugins: Plugin[];
    private readonly historyPlugin: History;
    private readonly renderer?: Renderer;
    /** 对象剪贴板（内部，不操作系统剪贴板）：copy/cut 时存选中对象的深拷贝。 */
    private clipboard: EditorObject[] = [];
    /** 同一轮连续 paste 的级联偏移倍数（第 n 次偏移 16*n）；copy/cut 后重置为 1。 */
    private pasteCascade = 1;
    /** renderer 为 FabricRenderer 时的具体引用（导出 API 需要访问 fabric canvas）。 */
    private readonly fabricRenderer?: FabricRenderer;
    /** 绘制三件套 controller（仅 FabricRenderer 存在时创建；无头模式下对应 API 仅切 mode）。 */
    private readonly drawController?: DrawController;
    private readonly lineController?: LineController;
    private readonly arrowController?: ArrowController;
    /** shape controller（同上，仅 FabricRenderer 存在时创建）。 */
    private readonly shapeController?: ShapeController;
    /** text controller（同上，仅 FabricRenderer 存在时创建）。 */
    private readonly textController?: TextController;
    /** mosaic controller（同上，仅 FabricRenderer 存在时创建）。 */
    private readonly mosaicController?: MosaicController;
    /** crop controller（同上，仅 FabricRenderer 存在时创建）。 */
    private readonly cropController?: CropController;

    constructor(options: EditorOptions = {}) {
        this.currentState = new EditorState();
        this.historyPlugin = new History((sizes) => this.emitter.emit('historyChange', sizes));
        this.renderer =
            options.renderer ??
            (options.container !== undefined
                ? new FabricRenderer({
                      container: options.container,
                      cssMaxWidth: options.cssMaxWidth,
                      cssMaxHeight: options.cssMaxHeight
                  })
                : undefined);
        this.fabricRenderer = this.renderer instanceof FabricRenderer ? this.renderer : undefined;
        this.plugins = [this.historyPlugin, new Keymap(this), ...(options.plugins ?? [])];
        if (this.fabricRenderer !== undefined) {
            const ctx: ControllerContext = {
                canvas: this.fabricRenderer.canvas,
                getState: () => this.currentState,
                dispatch: (tr) => this.dispatch(tr),
                fire: (name, payload) => {
                    this.emitter.emit(name, payload);
                }
            };
            this.fabricRenderer.setControllerContext(ctx);
            // select controller（mode 'normal'）注册即激活
            this.fabricRenderer.registerController(new SelectController());
            this.fabricRenderer.registerController(new PanController());
            this.drawController = new DrawController();
            this.lineController = new LineController();
            this.arrowController = new ArrowController();
            this.shapeController = new ShapeController();
            this.textController = new TextController();
            this.mosaicController = new MosaicController();
            this.cropController = new CropController();
            this.fabricRenderer.registerController(this.drawController);
            this.fabricRenderer.registerController(this.lineController);
            this.fabricRenderer.registerController(this.arrowController);
            this.fabricRenderer.registerController(this.shapeController);
            this.fabricRenderer.registerController(this.textController);
            this.fabricRenderer.registerController(this.mosaicController);
            this.fabricRenderer.registerController(this.cropController);
        }
    }

    get state(): EditorState {
        return this.currentState;
    }

    get history(): History {
        return this.historyPlugin;
    }

    newTransaction(): Transaction {
        return new Transaction(this.currentState);
    }

    dispatch(tr: Transaction): void {
        const oldState = this.currentState;
        // ① filterTransaction：任一 false → 整体丢弃
        for (const plugin of this.plugins) {
            if (plugin.filterTransaction !== undefined && !plugin.filterTransaction(tr, oldState)) {
                return;
            }
        }
        // ② apply
        let newState = oldState.apply(tr);
        // ③ appendTransaction：返回值继续 apply
        for (const plugin of this.plugins) {
            const appended = plugin.appendTransaction?.(tr, oldState, newState);
            if (appended !== null && appended !== undefined) {
                newState = newState.apply(appended);
            }
        }
        // ④ 置 state
        this.currentState = newState;
        // ⑤ history 收账（undo/redo 事务 addToHistory=false 自动跳过）
        if (tr.addToHistory) {
            this.historyPlugin.onTransaction(tr, oldState, newState);
        }
        // ⑥ renderer 同步
        this.renderer?.syncState(newState, oldState);
        const modeChanged = newState.mode !== oldState.mode;
        if (modeChanged) {
            this.renderer?.setMode(newState.mode, oldState.mode);
        }
        // ⑦ 事件
        for (const listener of [...this.listeners]) {
            listener(newState, oldState);
        }
        this.emitter.emit('change', { state: newState, prev: oldState });
        if (modeChanged) {
            this.emitter.emit('change:mode', { mode: newState.mode, prevMode: oldState.mode });
        }
        if (!sameSelection(newState.selection, oldState.selection)) {
            this.emitter.emit('change:selection', { selection: newState.selection });
        }
        if (!sameViewport(newState.viewport, oldState.viewport)) {
            this.emitter.emit('change:viewport', { viewport: newState.viewport });
        }
        // 背景从有到无（含 undo 加载/换图）→ clearImage
        if (oldState.doc.background !== null && newState.doc.background === null) {
            this.emitter.emit('clearImage', {});
        }
        // ⑧ 其余插件 onTransaction
        for (const plugin of this.plugins) {
            if (plugin !== this.historyPlugin) {
                plugin.onTransaction?.(tr, oldState, newState);
            }
        }
    }

    subscribe(listener: (state: EditorState, prev: EditorState) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    on<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void {
        this.emitter.on(name, handler);
    }

    once<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void {
        this.emitter.once(name, handler);
    }

    off<K extends keyof EditorEventMap>(name: K, handler?: (payload: EditorEventMap[K]) => void): void {
        this.emitter.off(name, handler);
    }

    // —— undo/redo ——

    undo(): void {
        const entry = this.historyPlugin.popUndo();
        if (entry === null) {
            return;
        }
        this.dispatch(this.historyPlugin.makeTransaction(this.currentState, entry, 'undo'));
        this.historyPlugin.pushRedo(entry);
    }

    redo(): void {
        const entry = this.historyPlugin.popRedo();
        if (entry === null) {
            return;
        }
        this.dispatch(this.historyPlugin.makeTransaction(this.currentState, entry, 'redo'));
        this.historyPlugin.pushUndo(entry);
    }

    clearUndoStack(): void {
        this.historyPlugin.clearUndo();
    }

    clearRedoStack(): void {
        this.historyPlugin.clearRedo();
    }

    isEmptyUndoStack(): boolean {
        return this.historyPlugin.undoSize === 0;
    }

    isEmptyRedoStack(): boolean {
        return this.historyPlugin.redoSize === 0;
    }

    isEdited(): boolean {
        return this.historyPlugin.undoSize > 0;
    }

    // —— 图片加载 ——

    /**
     * 从 URL 加载背景图：探测原始宽高 → dispatch SetBackground → fire loadImage。
     * 加载失败 reject 且 state 不变。
     */
    async loadImageFromURL(url: string, imageName: string): Promise<void> {
        if (!url || !imageName) {
            throw new Error('loadImageFromURL requires both url and imageName');
        }
        const img = await preloadImage(url);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        this.dispatch(
            this.newTransaction().addStep(new SetBackground({ src: url, width, height, name: imageName, angle: 0 }))
        );
        this.emitter.emit('loadImage', { name: imageName, width, height });
    }

    /** 从 File 加载背景图：FileReader → dataURL → loadImageFromURL。 */
    async loadImageFromFile(imgFile: File, imageName?: string): Promise<void> {
        const dataURL = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => {
                reject(reader.error ?? new Error('failed to read image file'));
            };
            reader.readAsDataURL(imgFile);
        });
        await this.loadImageFromURL(dataURL, imageName ?? imgFile.name);
    }

    /** 贴一张新图片对象到画布（背景）中心；对齐旧 addImageObject 语义（left/top = 中心点）。 */
    async addImageObject(imgUrl: string): Promise<void> {
        if (!imgUrl) {
            throw new Error('addImageObject requires an image url');
        }
        const bg = this.currentState.doc.background;
        if (bg === null) {
            throw new Error('addImageObject requires a loaded background image');
        }
        const img = await preloadImage(imgUrl);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const object: ImageObject = {
            id: createId(),
            kind: 'image',
            src: imgUrl,
            width,
            height,
            left: bg.width / 2,
            top: bg.height / 2,
            angle: 0,
            scaleX: 1,
            scaleY: 1
        };
        this.dispatch(this.newTransaction().addStep(new AddObject(object)));
        this.emitter.emit('objectAdded', { object });
    }

    // —— 便捷查询 ——

    getCurrentState(): EditorMode {
        return this.currentState.mode;
    }

    getImageName(): string {
        return this.currentState.doc.background?.name ?? '';
    }

    /** 结束当前进行中的交互（裁剪/绘制等），回到 normal 模式。 */
    endAll(): void {
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    // —— 旋转（TransformDoc，可撤销）——

    /** 当前背景角度（度）；无背景返回 0。 */
    getAngle(): number {
        return this.currentState.doc.background?.angle ?? 0;
    }

    /**
     * 旋转到绝对角度（%360 归一，可撤销）：dispatch TransformDoc，
     * 背景 angle + 外接框宽高与全部对象随转。无背景或归一后角度未变为 no-op
     * （对齐旧 setAngle 的 reject 语义，改为静默 no-op）。
     * rotateImage 事件语义由 change + change:viewport 覆盖，不单独设事件。
     */
    setAngle(angle: number): void {
        const bg = this.currentState.doc.background;
        if (bg === null) {
            return;
        }
        const target = ((angle % 360) + 360) % 360;
        if (target === bg.angle) {
            return;
        }
        this.dispatch(this.newTransaction().addStep(new TransformDoc(target)));
    }

    /** 相对旋转 delta 度：setAngle(getAngle() + delta)（对齐旧 rotate 语义）。 */
    rotate(delta: number): void {
        this.setAngle(this.getAngle() + delta);
    }

    // —— 对象操作 ——

    /** 删除当前选中对象（单选/多选逐个 RemoveObject，同事务）；每个被删对象 fire objectRemoved。 */
    removeActiveObject(): void {
        const selection = this.currentState.selection;
        if (selection.length === 0) {
            return;
        }
        const tr = this.newTransaction().setSelection([]);
        const removed: string[] = [];
        for (const id of selection) {
            if (this.currentState.getObject(id) !== undefined) {
                tr.addStep(new RemoveObject(id));
                removed.push(id);
            }
        }
        if (removed.length === 0) {
            return;
        }
        this.dispatch(tr);
        for (const id of removed) {
            this.emitter.emit('objectRemoved', { id });
        }
    }

    /** 清空全部对象（ClearObjects step，可撤销），同时清空选中。 */
    clearObjects(): void {
        if (this.currentState.doc.objects.length === 0) {
            return;
        }
        this.dispatch(this.newTransaction().addStep(new ClearObjects()).setSelection([]));
    }

    /** 取消全部选中（dispatch setSelection([])，不进历史）。 */
    deactivateAll(): void {
        if (this.currentState.selection.length === 0) {
            return;
        }
        this.dispatch(this.newTransaction().setSelection([]).setMeta('addToHistory', false));
    }

    // —— 剪贴板（内部对象剪贴板，不操作系统剪贴板）——

    /**
     * 复制当前选中（单选/多选）到内部剪贴板（深拷贝，按 doc z 序）；
     * 重置连续 paste 的级联偏移。无选中返回 false。
     */
    copyActiveObjects(): boolean {
        const objects = this.selectedObjects();
        if (objects.length === 0) {
            return false;
        }
        this.clipboard = structuredClone(objects);
        this.pasteCascade = 1;
        return true;
    }

    /**
     * 粘贴内部剪贴板：每个对象深拷贝 + 新 id + left/top 偏移 +16×级联倍数
     * （同一轮连续 paste 第 n 次偏移 16*n，copy/cut 后重置为 1）；
     * 一笔 Transaction 多个 AddObject step 并选中粘贴结果（可一步撤销）。
     * 剪贴板为空返回 false。
     */
    paste(): boolean {
        if (this.clipboard.length === 0) {
            return false;
        }
        const offset = 16 * this.pasteCascade;
        this.pasteCascade += 1;
        this.pasteClones(this.clipboard, offset);
        return true;
    }

    /** 剪切 = copyActiveObjects 成功后一笔 Transaction 移除选中对象（RemoveObject steps）。 */
    cutActiveObjects(): boolean {
        if (!this.copyActiveObjects()) {
            return false;
        }
        const tr = this.newTransaction().setSelection([]);
        const removed: string[] = [];
        for (const id of this.currentState.selection) {
            if (this.currentState.getObject(id) !== undefined) {
                tr.addStep(new RemoveObject(id));
                removed.push(id);
            }
        }
        this.dispatch(tr);
        for (const id of removed) {
            this.emitter.emit('objectRemoved', { id });
        }
        return true;
    }

    /** 与 paste 同语义（新 id + 偏移 +16 + 选中结果）但不读/不写剪贴板，偏移恒 +16。无选中返回 false。 */
    duplicateActiveObjects(): boolean {
        const objects = this.selectedObjects();
        if (objects.length === 0) {
            return false;
        }
        this.pasteClones(objects, 16);
        return true;
    }

    /** 当前选中对象（按 doc z 序，过滤无效 id）。 */
    private selectedObjects(): EditorObject[] {
        const selected = new Set(this.currentState.selection);
        return this.currentState.doc.objects.filter((o) => selected.has(o.id));
    }

    /** 共用落盘路径：sources 逐个深拷贝 + 新 id + left/top += offset，一笔事务 AddObject 并选中。 */
    private pasteClones(sources: readonly EditorObject[], offset: number): void {
        const tr = this.newTransaction();
        const pastedIds: string[] = [];
        for (const source of sources) {
            const clone = structuredClone(source);
            clone.id = createId();
            clone.left += offset;
            clone.top += offset;
            tr.addStep(new AddObject(clone));
            pastedIds.push(clone.id);
        }
        tr.setSelection(pastedIds);
        this.dispatch(tr);
    }

    // —— z 序 ——

    /** 选中对象（支持多选，保持相对顺序）置顶；无选中或已在顶 no-op 不 dispatch。 */
    bringToFront(): void {
        this.reorderActiveObjects('front');
    }

    /** 选中对象置底；无选中或已在底 no-op 不 dispatch。 */
    sendToBack(): void {
        this.reorderActiveObjects('back');
    }

    /** 选中对象上移一层；无选中或已紧邻顶层 no-op 不 dispatch。 */
    bringForward(): void {
        this.reorderActiveObjects('forward');
    }

    /** 选中对象下移一层；无选中或已紧邻底层 no-op 不 dispatch。 */
    sendBackward(): void {
        this.reorderActiveObjects('backward');
    }

    private reorderActiveObjects(action: ReorderAction): void {
        const selection = this.currentState.selection;
        if (selection.length === 0) {
            return;
        }
        const doc = this.currentState.doc;
        const after = computeReorderedIds(doc, selection, action);
        if (after === null) {
            return;
        }
        this.dispatch(
            this.newTransaction().addStep(new ReorderObjects(doc.objects.map((o) => o.id), after))
        );
    }

    // —— 翻转 ——

    /**
     * 翻转当前选中对象（单选/多选，一笔 Transaction 多个 UpdateObject）：
     * horizontal 取负 scaleX，vertical 取负 scaleY。无选中返回 false。
     */
    flipActiveObjects(axis: 'horizontal' | 'vertical'): boolean {
        const objects = this.selectedObjects();
        if (objects.length === 0) {
            return false;
        }
        const key = axis === 'horizontal' ? 'scaleX' : 'scaleY';
        const tr = this.newTransaction();
        for (const obj of objects) {
            tr.addStep(new UpdateObject(obj.id, { [key]: -obj[key] }));
        }
        this.dispatch(tr);
        return true;
    }

    // —— 视口（zoom/pan）——

    /**
     * 设置缩放倍率（clamp [0.05, 8]）；viewport 事务默认入历史（对齐现状可撤销）。
     * 支点恒为容器中心：pan 按 zoom 比例同步缩放（pan' = pan·zoom'/zoom），
     * 使容器中心下的 doc 点在缩放前后不动（有图/无图均成立，居中项随 s 线性）。
     */
    setZoom(rate: number): void {
        const zoom = Math.min(Math.max(rate, ZOOM_MIN), ZOOM_MAX);
        const vp = this.currentState.viewport;
        if (zoom === vp.zoom) {
            return;
        }
        const ratio = zoom / vp.zoom; // vp.zoom ∈ [0.05, 8]，不会为 0
        this.dispatch(this.newTransaction().setViewport({ zoom, panX: vp.panX * ratio, panY: vp.panY * ratio }));
    }

    getZoom(): number {
        return this.currentState.viewport.zoom;
    }

    /** 进入平移模式（mode 'pan'，拖动画布平移，瞬时不入历史；光标 grab/grabbing）。 */
    startPan(): void {
        if (this.currentState.mode === 'pan') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('pan'));
    }

    /** 退出平移模式，回到 normal。 */
    endPan(): void {
        if (this.currentState.mode !== 'pan') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    // —— 绘制（freedraw / line / arrow）——

    /**
     * 进入自由绘制模式（mode 'freedraw'）；setting 先写入 controller 再切 mode。
     * 已在 freedraw 模式时为 no-op（对齐旧 startFreeDrawing）。
     */
    startFreeDrawing(setting?: { width?: number; color?: string }): void {
        if (this.currentState.mode === 'freedraw') {
            return;
        }
        if (setting !== undefined) {
            this.drawController?.setBrush(setting);
        }
        this.dispatch(this.newTransaction().setMode('freedraw'));
    }

    /** 退出自由绘制模式，回到 normal。 */
    endFreeDrawing(): void {
        if (this.currentState.mode !== 'freedraw') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    /** 进入直线绘制模式（mode 'line'）。 */
    startLineDrawing(setting?: { width?: number; color?: string }): void {
        if (this.currentState.mode === 'line') {
            return;
        }
        if (setting !== undefined) {
            this.lineController?.setBrush(setting);
        }
        this.dispatch(this.newTransaction().setMode('line'));
    }

    /** 退出直线绘制模式，回到 normal。 */
    endLineDrawing(): void {
        if (this.currentState.mode !== 'line') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    /** 进入箭头绘制模式（mode 'arrow'）。 */
    startArrowDrawing(setting?: { width?: number; color?: string }): void {
        if (this.currentState.mode === 'arrow') {
            return;
        }
        if (setting !== undefined) {
            this.arrowController?.setBrush(setting);
        }
        this.dispatch(this.newTransaction().setMode('arrow'));
    }

    /** 退出箭头绘制模式，回到 normal。 */
    endArrowDrawing(): void {
        if (this.currentState.mode !== 'arrow') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    /** 按当前 mode 路由 setBrush 到 draw/line/arrow controller；非绘制模式 no-op。 */
    setBrush(setting: { width?: number; color?: string }): void {
        switch (this.currentState.mode) {
            case 'freedraw':
                this.drawController?.setBrush(setting);
                break;
            case 'line':
                this.lineController?.setBrush(setting);
                break;
            case 'arrow':
                this.arrowController?.setBrush(setting);
                break;
        }
    }

    /** 修改选中 freedraw/line 路径的样式（stroke/strokeWidth，可撤销）。 */
    changeFreeDrawingPathStyle(setting?: { width?: number; color?: string }): void {
        this.changeSelectedPathStyle(['freedraw', 'line'], setting);
    }

    /** 修改选中 arrow 路径的样式（stroke/strokeWidth，可撤销）。 */
    changeArrowStyle(setting?: { width?: number; color?: string }): void {
        this.changeSelectedPathStyle(['arrow'], setting);
    }

    // —— 形状（rect / circle / triangle）——

    /** 进入形状绘制模式（mode 'shape'）；形状类型与样式由 setDrawingShape 预设。 */
    startDrawingShapeMode(): void {
        if (this.currentState.mode === 'shape') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('shape'));
    }

    /** 退出形状绘制模式，回到 normal。 */
    endDrawingShapeMode(): void {
        if (this.currentState.mode !== 'shape') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    /** 记录当前绘制形状的类型与样式（影响下一次拖出的对象）；无头模式为 no-op。 */
    setDrawingShape(
        type: ShapeObject['shapeType'],
        options?: { fill?: string; stroke?: string; strokeWidth?: number }
    ): void {
        this.shapeController?.setShape(type, options);
    }

    /**
     * 直接添加一个形状对象（可撤销）并 fire objectAdded。
     * left/top 缺省取画布中心（doc 坐标；对齐旧 addShape 的 canvas.getCenter 语义，
     * 无头模式退化到 0,0）；width/height 缺省 100，样式缺省 白底/黑边/1px。
     */
    addShape(
        type: ShapeObject['shapeType'],
        options?: Partial<Pick<ShapeObject, 'left' | 'top' | 'width' | 'height' | 'fill' | 'stroke' | 'strokeWidth'>>
    ): void {
        let left = options?.left;
        let top = options?.top;
        if (left === undefined || top === undefined) {
            const info = this.getViewPortInfo();
            left ??= info.left + info.width / 2;
            top ??= info.top + info.height / 2;
        }
        const object: ShapeObject = {
            id: createId(),
            kind: 'shape',
            shapeType: type,
            left,
            top,
            width: options?.width ?? 100,
            height: options?.height ?? 100,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            fill: options?.fill ?? '#ffffff',
            stroke: options?.stroke ?? '#000000',
            strokeWidth: options?.strokeWidth ?? 1
        };
        this.dispatch(this.newTransaction().addStep(new AddObject(object)));
        this.emitter.emit('objectAdded', { object });
    }

    /** 修改选中 shape 对象的样式（fill/stroke/strokeWidth，可撤销）；无匹配对象或空配置为 no-op。 */
    changeShape(options: { fill?: string; stroke?: string; strokeWidth?: number }): void {
        const attrs: ObjectAttrs = {};
        if (options.fill !== undefined) {
            attrs.fill = options.fill;
        }
        if (options.stroke !== undefined) {
            attrs.stroke = options.stroke;
        }
        if (options.strokeWidth !== undefined) {
            attrs.strokeWidth = options.strokeWidth;
        }
        if (Object.keys(attrs).length === 0) {
            return;
        }
        const tr = this.newTransaction();
        let changed = false;
        for (const id of this.currentState.selection) {
            const obj = this.currentState.getObject(id);
            if (obj !== undefined && obj.kind === 'shape') {
                tr.addStep(new UpdateObject(id, attrs));
                changed = true;
            }
        }
        if (changed) {
            this.dispatch(tr);
        }
    }

    // —— 马赛克（涂抹取平均色）——

    /**
     * 进入马赛克涂抹模式（mode 'mosaic'）；dimensions 为涂抹块边长（doc 像素，默认 8，
     * 对齐旧 startMosaicDrawing 缺省）。已在 mosaic 模式时为 no-op（对齐旧实现）。
     */
    startMosaicDrawing(setting?: { dimensions?: number }): void {
        if (this.currentState.mode === 'mosaic') {
            return;
        }
        if (setting !== undefined) {
            this.mosaicController?.setDimensions(setting.dimensions);
        }
        this.dispatch(this.newTransaction().setMode('mosaic'));
    }

    /** 退出马赛克涂抹模式，回到 normal。 */
    endMosaicDrawing(): void {
        if (this.currentState.mode !== 'mosaic') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    // —— 裁剪（cropzone 蚂蚁线 + 矩形直裁，两条路径统一可撤销）——

    /**
     * 进入裁剪模式（mode 'crop'）：出现背景图 80% 的蚂蚁线裁剪框，可拖动/缩放
     * （clamp 在背景范围内），Shift 拖空白重画锁正方形。已在 crop 模式时为 no-op。
     */
    startCropping(): void {
        if (this.currentState.mode === 'crop') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('crop'));
    }

    /**
     * 结束裁剪。isApplying=true（默认）：cropzone 无效（isValid false）→ 直接退出；
     * 有效 → 导出裁剪矩形为新背景（SetBackground，可撤销；对象清空对齐旧换图语义）。
     * isApplying=false：丢弃裁剪框退出。endCropping 语义由 change:mode 事件覆盖。
     */
    endCropping(isApplying = true): void {
        if (this.currentState.mode !== 'crop') {
            return;
        }
        const cropInfo = isApplying ? this.cropController?.getCropInfo() : undefined;
        if (cropInfo === undefined) {
            this.dispatch(this.newTransaction().setMode('normal'));
            return;
        }
        this.cropController?.applyCrop(cropInfo);
    }

    /**
     * 进入无 UI 的矩形裁剪模式（对齐旧 startCropByBoundInfo：仅切 mode，不出裁剪框）；
     * 配合 endCropByBoundInfo(cropInfo) 使用。已在 crop 模式时为 no-op。
     */
    startCropByBoundInfo(): void {
        if (this.currentState.mode === 'crop') {
            return;
        }
        this.cropController?.suppressCropzoneUI();
        this.dispatch(this.newTransaction().setMode('crop'));
    }

    /**
     * 按 cropInfo（doc 坐标，缺省 = 整图）裁剪：与 endCropping(true) 同一
     * SetBackground 落盘路径，可撤销。无背景或无头模式下仅退出模式。
     */
    endCropByBoundInfo(cropInfo?: { left: number; top: number; width: number; height: number }): void {
        if (this.currentState.mode !== 'crop') {
            return;
        }
        const bg = this.currentState.doc.background;
        if (this.cropController === undefined || bg === null) {
            this.dispatch(this.newTransaction().setMode('normal'));
            return;
        }
        this.cropController.applyCrop(cropInfo ?? { left: 0, top: 0, width: bg.width, height: bg.height });
    }

    // —— 文本（IText 原地编辑）——

    /** 进入文本模式（mode 'text'）：点击画布空白在该点新建文本并进入编辑，双击已有文本再编辑。 */
    startTextMode(): void {
        if (this.currentState.mode === 'text') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('text'));
    }

    /** 退出文本模式，回到 normal（编辑中的文本先提交）。 */
    endTextMode(): void {
        if (this.currentState.mode !== 'text') {
            return;
        }
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    /**
     * 添加文本对象（可撤销）并 fire objectAdded；非 text 模式时顺带切到 text 模式（对齐旧 addText）。
     * text 缺省「双击编辑」；position 缺省画布中心（doc 坐标，无头模式退化到 0,0）；
     * defaultEdit=true 时创建后立即进入编辑（无头模式为 no-op）。
     */
    addText(
        text?: string,
        options?: { styles?: TextStyleOptions; position?: { x: number; y: number } },
        defaultEdit = false
    ): void {
        let left: number;
        let top: number;
        if (options?.position !== undefined) {
            left = options.position.x;
            top = options.position.y;
        } else {
            const info = this.getViewPortInfo();
            left = info.left + info.width / 2;
            top = info.top + info.height / 2;
        }
        const object = createTextObject(text ?? DEFAULT_TEXT, left, top, options?.styles);
        const tr = this.newTransaction().addStep(new AddObject(object));
        if (this.currentState.mode !== 'text') {
            tr.setMode('text');
        }
        this.dispatch(tr);
        this.emitter.emit('objectAdded', { object });
        if (defaultEdit) {
            this.textController?.editObject(object.id);
        }
    }

    /** 修改选中文本（含编辑中的文本）的内容（可撤销）；无目标或内容未变为 no-op。 */
    changeText(text: string): void {
        const tr = this.newTransaction();
        let changed = false;
        for (const id of this.textTargetIds()) {
            const obj = this.currentState.getObject(id);
            if (obj !== undefined && obj.kind === 'text' && obj.text !== text) {
                tr.addStep(new UpdateObject(id, { text }));
                changed = true;
            }
        }
        if (changed) {
            this.dispatch(tr);
        }
    }

    /**
     * 修改选中文本（含编辑中的文本）的样式（可撤销），toggle 语义（对齐旧 setStyle）：
     * 传入值与该字段当前值相同 → 重置为该字段默认值（TEXT_STYLE_DEFAULTS）；否则设为传入值。
     */
    changeTextStyle(styleObj?: TextStyleOptions): void {
        if (styleObj === undefined) {
            return;
        }
        const tr = this.newTransaction();
        let changed = false;
        for (const id of this.textTargetIds()) {
            const obj = this.currentState.getObject(id);
            if (obj === undefined || obj.kind !== 'text') {
                continue;
            }
            const attrs: ObjectAttrs = {};
            for (const key of Object.keys(styleObj) as (keyof TextStyleOptions)[]) {
                const value = styleObj[key];
                if (value === undefined) {
                    continue;
                }
                attrs[key] = obj[key] === value ? TEXT_STYLE_DEFAULTS[key] : value;
            }
            if (Object.keys(attrs).length > 0) {
                tr.addStep(new UpdateObject(id, attrs));
                changed = true;
            }
        }
        if (changed) {
            this.dispatch(tr);
        }
    }

    /** 是否有文本正处于编辑态（keymap 的 Delete 守卫通过鸭子类型调用）。 */
    isTextEditing(): boolean {
        return this.textController?.isEditing() ?? false;
    }

    /** changeText/changeTextStyle 的目标集：选中文本 + 编辑中的文本（对齐旧「作用于 active 文本」）。 */
    private textTargetIds(): string[] {
        const ids = [...this.currentState.selection];
        const editingId = this.textController?.getEditingId();
        if (editingId !== undefined && !ids.includes(editingId)) {
            ids.push(editingId);
        }
        return ids;
    }

    /** 对当前选中且 kind==='path' 且 tool 在 tools 内的对象 dispatch UpdateObject。 */
    private changeSelectedPathStyle(
        tools: ReadonlyArray<PathObject['tool']>,
        setting?: { width?: number; color?: string }
    ): void {
        if (setting === undefined) {
            return;
        }
        const attrs: ObjectAttrs = {};
        if (setting.color !== undefined) {
            attrs.stroke = setting.color;
            if (tools.includes('arrow')) {
                // 箭头头部为填充三角（对齐旧实心行为），换色需同步 fill，否则头部滞留旧色
                attrs.fill = setting.color;
            }
        }
        if (setting.width !== undefined) {
            attrs.strokeWidth = setting.width;
        }
        if (Object.keys(attrs).length === 0) {
            return;
        }
        const tr = this.newTransaction();
        let changed = false;
        for (const id of this.currentState.selection) {
            const obj = this.currentState.getObject(id);
            if (obj !== undefined && obj.kind === 'path' && tools.includes(obj.tool)) {
                tr.addStep(new UpdateObject(id, attrs));
                changed = true;
            }
        }
        if (changed) {
            this.dispatch(tr);
        }
    }

    /**
     * 调整 fit 上限与容器尺寸（对齐旧 resizeCanvasDimension：setCssMaxDimension + refit）。
     * dimension 缺省时 no-op；refit 不进历史。
     */
    resizeCanvasDimension(dimension?: { width?: number; height?: number }): void {
        if (dimension === undefined) {
            return;
        }
        this.fabricRenderer?.setCssMaxDimension(dimension);
        this.refitViewport();
    }

    /** refit：viewport 归位（zoom 1、pan 0），fitScale 随 cssMax 重算、图像重新居中；不进历史。 */
    adjustCanvasDimension(): void {
        this.refitViewport();
    }

    /**
     * 容器尺寸变化通知（React CanvasView 的 ResizeObserver 触发）：有 renderer 时委托做
     * 无状态重排（zoom/pan 保持，按新容器尺寸重算居中）；无头模式 no-op。
     */
    notifyResize(): void {
        this.renderer?.notifyResize();
    }

    /**
     * refit 始终 dispatch：即使 viewport 已是 {1,0,0}（setCssMaxDimension 改过 cssMax/尺寸后
     * 视觉仍需重算），也要触发 syncState → syncCanvasSize + applyViewport。viewport 内容
     * 不变时 sameViewport 抑制 change:viewport，不发历史、无可见副作用。
     */
    private refitViewport(): void {
        this.dispatch(
            this.newTransaction().setViewport({ zoom: 1, panX: 0, panY: 0 }).setMeta('addToHistory', false)
        );
    }

    // —— 导出 ——

    private requireFabricRenderer(): FabricRenderer {
        if (this.fabricRenderer === undefined) {
            throw new Error('Export requires a FabricRenderer (unavailable in headless mode)');
        }
        return this.fabricRenderer;
    }

    /**
     * 导出整图 dataURL（背景原始像素，不受 zoom/pan 影响）；无背景时导出当前画布现状。
     * @param type - MIME 类型，如 'image/png'（默认）、'image/jpeg'、'image/webp'
     */
    toDataURL(type?: string): string {
        return exportDocDataURL(this.requireFabricRenderer(), this.currentState.doc.background, type);
    }

    /** 导出整图 Blob，进制同 toDataURL。 */
    toBlobData(type?: string): Promise<Blob | null> {
        return exportDocBlob(this.requireFabricRenderer(), this.currentState.doc.background, type);
    }

    /** 当前视口可见区域（容器 CSS 像素）的 dataURL。 */
    getViewPortImage(): string {
        return exportViewportImage(this.requireFabricRenderer());
    }

    /** 容器可见区域在 doc 坐标系下的矩形；无头模式返回全 0。 */
    getViewPortInfo(): ViewportInfo {
        if (this.fabricRenderer === undefined) {
            return { width: 0, height: 0, left: 0, top: 0 };
        }
        return getViewportDocRect(this.fabricRenderer);
    }

    destroy(): void {
        this.renderer?.destroy();
        for (const plugin of this.plugins) {
            plugin.destroy?.();
        }
        this.listeners.clear();
        this.emitter.clear();
    }
}
