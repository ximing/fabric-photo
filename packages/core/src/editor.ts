import { Emitter, type EditorEventMap } from './events';
import { createId } from './model/id';
import type { ImageObject } from './model/doc';
import { History } from './plugins/history';
import { Keymap } from './plugins/keymap';
import type { Plugin } from './plugins/plugin';
import { exportDocBlob, exportDocDataURL, exportViewportImage, getViewportDocRect } from './render/exporter';
import { FabricRenderer } from './render/fabric-renderer';
import { preloadImage } from './render/object-factory';
import type { Renderer } from './render/renderer';
import { EditorState, type EditorMode, type Viewport } from './state/editor-state';
import { SetBackground } from './steps/doc-steps';
import { AddObject } from './steps/object-steps';
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
    /** renderer 为 FabricRenderer 时的具体引用（导出 API 需要访问 fabric canvas）。 */
    private readonly fabricRenderer?: FabricRenderer;

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
