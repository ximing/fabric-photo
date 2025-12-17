import type { TPointerEventInfo } from 'fabric';
import type { MosaicObject, MosaicRect } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import type { Controller, ControllerContext } from './controller';

const DEFAULT_DIMENSIONS = 8;

/**
 * mosaic controller（mode 'mosaic'，由 Editor.startMosaicDrawing 进入）：
 * - mouse:down 开始一次涂抹：在 fabric wrapperEl 上挂一块透明覆盖 canvas 作预览层
 *   （旧实现是克隆 lower-canvas 的 DOM 覆盖层；新架构下层 canvas 始终可见，
 *   透明覆盖层视觉等价），并清空本次 mosaicRects
 * - mouse:move 取指针周围 dimensions×dimensions（doc 像素）区域的平均色：
 *   从 lower-canvas 2d context getImageData，屏幕取样边长 = dimensions × s（s = vpt[0]），
 *   落盘的块坐标/尺寸始终用 doc 像素（x/y = 块左上角 doc 坐标，size = dimensions）；
 *   预览按屏幕坐标画到覆盖层（取色算法逐行移植自旧 src/modules/mosaic.ts，
 *   旧的 CSS ratio hack 替换为 vpt 换算，zoom ≠ 1 时涂抹位置与落点一致）
 * - mouse:up 移除覆盖层 → 由 rects 计算外接框 → dispatch
 *   AddObject(MosaicObject { left/top = 外接框中心，width/height = 外接框，
 *   rects 归一化到外接框左上角 }) → renderer 用 MosaicShape 重建
 * - 取样自 lower-canvas（不含本次预览），对齐旧「取样原图内容」语义；
 *   取色只平均 rgb（旧实现平均了 alpha 但未使用）
 */
export class MosaicController implements Controller {
    readonly mode = 'mosaic' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private dimensions = DEFAULT_DIMENSIONS;
    /** 本次涂抹收集的块（doc 坐标）。 */
    private rects: MosaicRect[] = [];
    /** 预览覆盖层（screen 像素坐标系，与 backstore 1:1）。 */
    private overlay: HTMLCanvasElement | undefined;

    /** 设置涂抹块边长（doc 像素）；非法值沿用当前值（对齐旧 parseInt || 现值）。 */
    setDimensions(dimensions?: number): void {
        if (dimensions === undefined) {
            return;
        }
        const parsed = Math.floor(dimensions);
        if (Number.isFinite(parsed) && parsed > 0) {
            this.dimensions = parsed;
        }
    }

    /** 从 lower-canvas 取屏幕方形区域的平均色（rgb 均值，逐行移植旧实现）。 */
    private averageColor(screenX: number, screenY: number, screenSize: number): string {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return 'rgb(0,0,0)';
        }
        const size = Math.max(1, Math.round(screenSize));
        const imageData = ctx.canvas.contextContainer.getImageData(
            Math.floor(screenX),
            Math.floor(screenY),
            size,
            size
        );
        const rgba = [0, 0, 0, 0];
        const length = imageData.data.length / 4;
        for (let i = 0; i < length; i++) {
            rgba[0] += imageData.data[i * 4];
            rgba[1] += imageData.data[i * 4 + 1];
            rgba[2] += imageData.data[i * 4 + 2];
            rgba[3] += imageData.data[i * 4 + 3];
        }
        return `rgb(${Math.floor(rgba[0] / length)},${Math.floor(rgba[1] / length)},${Math.floor(rgba[2] / length)})`;
    }

    private createOverlay(): HTMLCanvasElement {
        const { canvas } = this.ctx as ControllerContext;
        const overlay = document.createElement('canvas');
        overlay.width = canvas.getWidth();
        overlay.height = canvas.getHeight();
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.pointerEvents = 'none';
        canvas.wrapperEl.appendChild(overlay);
        return overlay;
    }

    private removeOverlay(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    private readonly onMouseDown = (): void => {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        this.rects = [];
        // 同步重绘一次：保证 lower-canvas 像素为最新（requestRenderAll 依赖 RAF，
        // 在 RAF 被节流的环境（如无头/后台 tab）可能迟迟不渲染，导致取色全零）
        ctx.canvas.renderAll();
        this.removeOverlay();
        this.overlay = this.createOverlay();
        ctx.canvas.on('mouse:move', this.onMouseMove);
        ctx.canvas.on('mouse:up', this.onMouseUp);
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (ctx === undefined || this.overlay === undefined) {
            return;
        }
        const scale = ctx.canvas.viewportTransform[0]; // vpt = [s,0,0,s,tx,ty]
        const size = this.dimensions;
        const screenSize = size * scale;
        // doc 块：以指针为中心的 dimensions×dimensions 方块（左上角锚）
        const docX = event.scenePoint.x - size / 2;
        const docY = event.scenePoint.y - size / 2;
        const screenX = event.viewportPoint.x - screenSize / 2;
        const screenY = event.viewportPoint.y - screenSize / 2;
        const color = this.averageColor(screenX, screenY, screenSize);
        this.rects.push({ x: docX, y: docY, size, color });
        const overlayCtx = this.overlay.getContext('2d');
        if (overlayCtx === null) {
            return;
        }
        overlayCtx.fillStyle = color;
        overlayCtx.fillRect(screenX, screenY, screenSize, screenSize);
    };

    private readonly onMouseUp = (): void => {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        ctx.canvas.off('mouse:move', this.onMouseMove);
        ctx.canvas.off('mouse:up', this.onMouseUp);
        this.removeOverlay();
        const rects = this.rects;
        this.rects = [];
        if (rects.length === 0) {
            return;
        }
        // 外接框（含块右/下边缘）
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const rect of rects) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.size);
            maxY = Math.max(maxY, rect.y + rect.size);
        }
        const width = maxX - minX;
        const height = maxY - minY;
        const object: MosaicObject = {
            id: createId(),
            kind: 'mosaic',
            left: minX + width / 2,
            top: minY + height / 2,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            width,
            height,
            // 归一化到外接框左上角（与 MosaicShape._render 的中心原点约定配套）
            rects: rects.map((rect) => ({ ...rect, x: rect.x - minX, y: rect.y - minY }))
        };
        ctx.dispatch(new Transaction(ctx.getState()).addStep(new AddObject(object)));
        ctx.fire('objectAdded', { object });
    };

    activate(ctx: ControllerContext): void {
        if (this.active) {
            return;
        }
        this.active = true;
        this.ctx = ctx;
        ctx.canvas.defaultCursor = 'crosshair';
        ctx.canvas.on('mouse:down', this.onMouseDown);
    }

    deactivate(): void {
        if (!this.active || this.ctx === undefined) {
            return;
        }
        this.active = false;
        const { canvas } = this.ctx;
        canvas.off('mouse:down', this.onMouseDown);
        canvas.off('mouse:move', this.onMouseMove);
        canvas.off('mouse:up', this.onMouseUp);
        canvas.defaultCursor = 'default';
        this.removeOverlay();
        this.rects = [];
        this.ctx = undefined;
    }
}
