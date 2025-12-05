import { ActiveSelection, Canvas, FabricImage, type FabricObject } from 'fabric';
import type { BackgroundImage, EditorObject } from '../model/doc';
import type { EditorMode, EditorState } from '../state/editor-state';
import type { Controller, ControllerContext } from './controllers/controller';
import { createFabricObject, getCachedImage, preloadImage, updateFabricObject } from './object-factory';
import type { Renderer } from './renderer';

const DEFAULT_CSS_MAX_WIDTH = 700;
const DEFAULT_CSS_MAX_HEIGHT = 400;

export interface FabricRendererOptions {
    container: HTMLElement;
    cssMaxWidth?: number; // 默认 700
    cssMaxHeight?: number; // 默认 400
}

/**
 * fabric 6 渲染层实现。
 *
 * 渲染模型（架构决策补充 1/2，Figma 模式）：
 * - canvas 元素铺满 container（backstore = CSS = container 的 CSS 像素，1:1）；
 *   灰底由 container 的 CSS 负责
 * - doc 坐标系 = 背景图片像素坐标系；vpt = [s,0,0,s,tx,ty]，
 *   s = fitScale × zoom，tx/ty = 容器中心 − 图片中心 × s + pan
 * - 背景图以 center origin 放在 (bg.width/2, bg.height/2) 并带 angle，
 *   其外接框恰为 doc 坐标系的 [0,0,bg.width,bg.height]
 */
export class FabricRenderer implements Renderer {
    private readonly containerEl: HTMLElement;
    private readonly cssMaxWidth: number;
    private readonly cssMaxHeight: number;
    private readonly fabricCanvas: Canvas;
    private readonly canvasEl: HTMLCanvasElement;
    /** fpId → fabric 对象 */
    private readonly objectMap = new Map<string, FabricObject>();
    /** fpId → 上次同步用的 EditorObject 引用（不可变更新检测） */
    private readonly refMap = new Map<string, EditorObject>();
    private readonly pendingSrcs = new Set<string>();
    private bgRef: BackgroundImage | null | undefined; // undefined = 从未同步
    private bgGeneration = 0;
    private mode: EditorMode = 'normal';
    private readonly controllers = new Map<EditorMode, Controller>();
    private controllerContext: ControllerContext | undefined;
    private activeController: Controller | undefined;
    private lastState: EditorState | undefined;
    private destroyed = false;
    private canvasWidth = 0;
    private canvasHeight = 0;

    constructor(options: FabricRendererOptions) {
        this.containerEl = options.container;
        this.cssMaxWidth = options.cssMaxWidth ?? DEFAULT_CSS_MAX_WIDTH;
        this.cssMaxHeight = options.cssMaxHeight ?? DEFAULT_CSS_MAX_HEIGHT;
        this.canvasEl = document.createElement('canvas');
        this.containerEl.appendChild(this.canvasEl);
        this.fabricCanvas = new Canvas(this.canvasEl, { enableRetinaScaling: false });
        this.fabricCanvas.selection = true;
        this.syncCanvasSize();
    }

    /** 仅供 controllers 使用（Task 10 起）。 */
    get canvas(): Canvas {
        return this.fabricCanvas;
    }

    get container(): HTMLElement {
        return this.containerEl;
    }

    get cssMax(): { width: number; height: number } {
        return { width: this.cssMaxWidth, height: this.cssMaxHeight };
    }

    /** min(cssMaxW/imgW, cssMaxH/imgH, 1)；无图返回 1。 */
    fitScale(state: EditorState): number {
        const bg = state.doc.background;
        if (bg === null) {
            return 1;
        }
        return Math.min(this.cssMaxWidth / bg.width, this.cssMaxHeight / bg.height, 1);
    }

    syncState(state: EditorState, prev: EditorState): void {
        if (this.destroyed) {
            return;
        }
        this.lastState = state;
        this.syncCanvasSize();
        if (state.doc.background !== this.bgRef) {
            this.syncBackground(state);
        }
        if (state.doc.objects !== prev.doc.objects) {
            this.syncObjects(state);
        }
        this.syncSelection(state);
        this.applyViewport(state);
        this.fabricCanvas.requestRenderAll();
    }

    /**
     * 注册 mode 对应的 controller；若与当前 mode 一致且上下文已注入则立即激活
     * （覆盖初始 mode 'normal' 的 select controller 激活路径）。
     */
    registerController(controller: Controller): void {
        this.controllers.set(controller.mode, controller);
        if (controller.mode === this.mode && this.controllerContext !== undefined && !this.destroyed) {
            controller.activate(this.controllerContext);
            this.activeController = controller;
        }
    }

    /** 注入 controller 运行上下文（Editor 接管 renderer 时调用一次）。 */
    setControllerContext(ctx: ControllerContext): void {
        this.controllerContext = ctx;
    }

    /** mode 切换：先 deactivate 旧 controller，再切交互开关，最后 activate 新 controller。 */
    setMode(mode: EditorMode, _prevMode: EditorMode): void {
        this.mode = mode;
        this.activeController?.deactivate();
        this.activeController = undefined;
        const interactive = mode === 'normal';
        this.fabricCanvas.selection = interactive;
        if (!interactive) {
            this.fabricCanvas.discardActiveObject();
        }
        for (const fObj of this.objectMap.values()) {
            this.applyInteractivity(fObj);
        }
        const next = this.controllers.get(mode);
        if (next !== undefined && this.controllerContext !== undefined) {
            next.activate(this.controllerContext);
            this.activeController = next;
        }
        // dispatch 顺序是 syncState → setMode：回到 normal 时把选中态补回来
        if (this.lastState !== undefined) {
            this.syncSelection(this.lastState);
        }
        this.fabricCanvas.requestRenderAll();
    }

    destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.activeController?.deactivate();
        this.activeController = undefined;
        this.bgGeneration++; // 使进行中的背景加载失效
        this.fabricCanvas.destroy();
        this.canvasEl.remove();
        this.objectMap.clear();
        this.refMap.clear();
        this.pendingSrcs.clear();
    }

    // —— 内部 ——

    /** canvas 铺满 container；尺寸变化时同步 backstore 与 CSS（1:1）。 */
    private syncCanvasSize(): void {
        const width = this.containerEl.clientWidth;
        const height = this.containerEl.clientHeight;
        if (width <= 0 || height <= 0) {
            return;
        }
        if (width === this.canvasWidth && height === this.canvasHeight) {
            return;
        }
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.fabricCanvas.setDimensions({ width, height });
    }

    private syncBackground(state: EditorState): void {
        const bg = state.doc.background;
        this.bgRef = bg;
        const generation = ++this.bgGeneration;
        if (bg === null) {
            this.fabricCanvas.backgroundImage = undefined;
            return;
        }
        void preloadImage(bg.src)
            .then((imgEl) => {
                if (this.destroyed || generation !== this.bgGeneration) {
                    return;
                }
                // center origin：外接框 = doc 坐标系全幅，angle 旋转后仍对齐
                const img = new FabricImage(imgEl, {
                    originX: 'center',
                    originY: 'center',
                    left: bg.width / 2,
                    top: bg.height / 2,
                    angle: bg.angle
                });
                this.fabricCanvas.backgroundImage = img;
                this.fabricCanvas.requestRenderAll();
            })
            .catch(() => {
                // 加载失败静默跳过；错误通道由 Task 9 图片加载流程统一处理
            });
    }

    private syncObjects(state: EditorState): void {
        const canvas = this.fabricCanvas;
        const seen = new Set<string>();
        for (const obj of state.doc.objects) {
            seen.add(obj.id);
            const fObj = this.objectMap.get(obj.id);
            if (fObj === undefined) {
                if (obj.kind === 'image' && getCachedImage(obj.src) === undefined) {
                    this.ensureImageAndRefresh(obj.src);
                    continue; // 加载完成后统一补齐
                }
                const created = createFabricObject(obj);
                this.applyInteractivity(created);
                canvas.add(created);
                this.objectMap.set(obj.id, created);
                this.refMap.set(obj.id, obj);
            } else if (this.refMap.get(obj.id) !== obj) {
                if (obj.kind === 'image' && getCachedImage(obj.src) === undefined) {
                    this.ensureImageAndRefresh(obj.src);
                    continue;
                }
                updateFabricObject(fObj, obj);
                this.refMap.set(obj.id, obj);
            }
        }
        // state 无 canvas 有 → 移除
        for (const [id, fObj] of [...this.objectMap]) {
            if (!seen.has(id)) {
                canvas.remove(fObj);
                this.objectMap.delete(id);
                this.refMap.delete(id);
            }
        }
        // z 序 = state.doc.objects 数组序
        state.doc.objects.forEach((obj, index) => {
            const fObj = this.objectMap.get(obj.id);
            if (fObj !== undefined) {
                canvas.moveObjectTo(fObj, index);
            }
        });
    }

    /** 图片 src 未入缓存时异步加载，完成后基于 lastState 重同步。 */
    private ensureImageAndRefresh(src: string): void {
        if (this.pendingSrcs.has(src)) {
            return;
        }
        this.pendingSrcs.add(src);
        void preloadImage(src)
            .then(() => {
                this.pendingSrcs.delete(src);
                if (this.destroyed || this.lastState === undefined) {
                    return;
                }
                this.syncObjects(this.lastState);
                this.syncSelection(this.lastState);
                this.fabricCanvas.requestRenderAll();
            })
            .catch(() => {
                this.pendingSrcs.delete(src);
            });
    }

    private syncSelection(state: EditorState): void {
        const canvas = this.fabricCanvas;
        // 非 normal 模式不呈现选中态（selection 数据仍保留在 state 里）
        const targets: FabricObject[] = [];
        if (this.mode === 'normal') {
            for (const id of state.selection) {
                const fObj = this.objectMap.get(id);
                if (fObj !== undefined) {
                    targets.push(fObj);
                }
            }
        }
        const current = canvas.getActiveObjects();
        // 按集合比较：ActiveSelection 成员序与 state.selection 序可能不同，避免反复重建
        if (current.length === targets.length && current.every((fObj) => targets.includes(fObj))) {
            return;
        }
        if (targets.length === 0) {
            canvas.discardActiveObject();
        } else if (targets.length === 1) {
            canvas.setActiveObject(targets[0]);
        } else {
            canvas.setActiveObject(new ActiveSelection(targets, { canvas }));
        }
    }

    /** vpt = [s,0,0,s,tx,ty]；s = fitScale × zoom；tx/ty = 容器居中 + pan。 */
    private applyViewport(state: EditorState): void {
        if (this.canvasWidth <= 0 || this.canvasHeight <= 0) {
            return;
        }
        const bg = state.doc.background;
        if (bg === null) {
            // 无图语义：fit = 1，以容器中心为原点，避免清背景后残留旧 vpt
            const s = state.viewport.zoom;
            this.fabricCanvas.setViewportTransform([
                s,
                0,
                0,
                s,
                this.canvasWidth / 2 + state.viewport.panX,
                this.canvasHeight / 2 + state.viewport.panY
            ]);
            return;
        }
        const s = this.fitScale(state) * state.viewport.zoom;
        const tx = this.canvasWidth / 2 - (bg.width / 2) * s + state.viewport.panX;
        const ty = this.canvasHeight / 2 - (bg.height / 2) * s + state.viewport.panY;
        this.fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    }

    private applyInteractivity(fObj: FabricObject): void {
        const interactive = this.mode === 'normal';
        fObj.set({ selectable: interactive, evented: interactive });
    }
}
