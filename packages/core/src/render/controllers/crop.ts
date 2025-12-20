import type { TPointerEventInfo } from 'fabric';
import { SetBackground } from '../../steps/doc-steps';
import { Transaction } from '../../transform/transaction';
import { withIdentityViewport } from '../exporter';
import { Cropzone } from '../shapes/cropzone';
import type { Controller, ControllerContext } from './controller';

/** 拖空白重画 cropzone 的起判位移（对齐旧 consts.MOUSE_MOVE_THRESHOLD）。 */
const MOUSE_MOVE_THRESHOLD = 10;

/** doc 坐标系下的矩形（裁剪区域）。 */
export interface CropRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** 移植旧 src/lib/util.ts 的 clamp（min > max 时交换）。 */
function clamp(value: number, minValue: number, maxValue: number): number {
    let min = minValue;
    let max = maxValue;
    if (min > max) {
        const temp = min;
        min = max;
        max = temp;
    }
    return Math.max(min, Math.min(value, max));
}

/**
 * crop controller（mode 'crop'，由 Editor.startCropping / startCropByBoundInfo 进入）：
 * - startCropping 路径：创建 Cropzone（背景图 80%、距边 10%，对齐旧实现换算后的 doc 尺寸；
 *   旧代码的 css/backstore ratio 换算在新渲染模型下退化为直接取背景宽高比例），
 *   蚂蚁线遮罩见 shapes/cropzone.ts；Shift（keydown/keyup 跟踪）拖空白重画锁正方形
 *   （MOUSE_MOVE_THRESHOLD=10 起判，逐行移植旧 cropper._calcRectDimensionFromPoint）
 * - startCropByBoundInfo 路径（suppressCropzoneUI 标记）：仅切 mode 不出裁剪框
 *   （对齐旧 startCropByBoundInfo 只置 state 的语义）
 * - applyCrop 是两条裁剪路径的统一落盘：cropzone 先移出画布（避免遮罩进入导出图）
 *   → clamp 到背景范围 → identity vpt 导出矩形 dataURL（复用 exporter 的 vpt 临时重置模式）
 *   → dispatch SetBackground（可撤销；对象清空对齐旧换图语义）+ 回 normal
 * - cropzone 是渲染层临时对象：不进 state.doc.objects（fpInternal 标记见 cropzone.ts）；
 *   其他对象 selectable/evented 由 renderer 在非 normal 模式统一关闭
 */
export class CropController implements Controller {
    readonly mode = 'crop' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private cropzone: Cropzone | undefined;
    /** 下一次 activate 不创建 cropzone（startCropByBoundInfo 无 UI 路径）。 */
    private suppressUI = false;
    private withShiftKey = false;
    private startX = 0;
    private startY = 0;

    /** 下一次 activate 不创建 cropzone UI（Editor.startCropByBoundInfo 调用）。 */
    suppressCropzoneUI(): void {
        this.suppressUI = true;
    }

    /** 当前 cropzone 的 doc 矩形；无 cropzone 或 isValid false 时返回 undefined。 */
    getCropInfo(): CropRect | undefined {
        const cropzone = this.cropzone;
        if (cropzone === undefined || !cropzone.isValid()) {
            return undefined;
        }
        return {
            left: cropzone.left,
            top: cropzone.top,
            width: cropzone.scaledWidth(),
            height: cropzone.scaledHeight()
        };
    }

    /**
     * 统一裁剪落盘路径（endCropping(true) 与 endCropByBoundInfo 共用）：
     * clamp 到背景范围 → 临时重置 vpt 导出该矩形 dataURL → SetBackground + 回 normal。
     * 矩形完全在背景外（宽高 clamp 后 <= 0）时仅退出模式。
     */
    applyCrop(rect: CropRect): void {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        this.discardCropzone();
        const bg = ctx.getState().doc.background;
        if (bg === null) {
            ctx.dispatch(new Transaction(ctx.getState()).setMode('normal'));
            return;
        }
        const left = clamp(rect.left, 0, bg.width);
        const top = clamp(rect.top, 0, bg.height);
        const width = clamp(rect.width, 0, bg.width - left);
        const height = clamp(rect.height, 0, bg.height - top);
        if (width <= 0 || height <= 0) {
            ctx.dispatch(new Transaction(ctx.getState()).setMode('normal'));
            return;
        }
        const dataURL = withIdentityViewport(ctx.canvas, () =>
            ctx.canvas.toDataURL({ format: 'png', multiplier: 1, left, top, width, height })
        );
        ctx.dispatch(
            new Transaction(ctx.getState())
                .addStep(new SetBackground({ src: dataURL, width, height, name: bg.name, angle: 0 }))
                .setMode('normal')
        );
    }

    /** 从画布移除 cropzone（幂等）；导出裁剪矩形前必须先移除，避免遮罩进入导出图。 */
    discardCropzone(): void {
        const cropzone = this.cropzone;
        if (cropzone === undefined) {
            return;
        }
        this.cropzone = undefined;
        this.ctx?.canvas.remove(cropzone);
    }

    /** 由起点与当前指针计算 cropzone 矩形（含 Shift 锁正方形）；逐行移植旧 cropper。 */
    private calcRectDimensionFromPoint(x: number, y: number): CropRect {
        const cropzone = this.cropzone as Cropzone;
        const boundsWidth = cropzone.boundsWidth;
        const boundsHeight = cropzone.boundsHeight;
        const startX = this.startX;
        const startY = this.startY;
        let left = clamp(x, 0, startX);
        let top = clamp(y, 0, startY);
        let width = clamp(x, startX, boundsWidth) - left;
        let height = clamp(y, startY, boundsHeight) - top;

        if (this.withShiftKey) {
            if (width > height) {
                height = width;
            } else if (height > width) {
                width = height;
            }

            if (startX >= x) {
                left = startX - width;
            }

            if (startY >= y) {
                top = startY - height;
            }
        }

        return { left, top, width, height };
    }

    private readonly onMouseDown = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (ctx === undefined || this.cropzone === undefined) {
            return;
        }
        // 点在 cropzone 上 → 走 fabric 自身的移动/缩放（clamp 在 cropzone 内部做）
        if (event.target !== undefined && event.target !== null) {
            return;
        }
        const { x, y } = event.scenePoint;
        this.startX = x;
        this.startY = y;
        ctx.canvas.on('mouse:move', this.onMouseMove);
        ctx.canvas.on('mouse:up', this.onMouseUp);
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        const cropzone = this.cropzone;
        if (ctx === undefined || cropzone === undefined) {
            return;
        }
        const x = event.scenePoint.x;
        const y = event.scenePoint.y;
        if (Math.abs(x - this.startX) + Math.abs(y - this.startY) <= MOUSE_MOVE_THRESHOLD) {
            return;
        }
        // 旧实现 remove + set + add 是 fabric 1.7.3 的重绘手段；fabric 6 直接 set + requestRenderAll
        cropzone.set(this.calcRectDimensionFromPoint(x, y));
        cropzone.setCoords();
        ctx.canvas.requestRenderAll();
    };

    private readonly onMouseUp = (): void => {
        const ctx = this.ctx;
        if (ctx === undefined || this.cropzone === undefined) {
            return;
        }
        ctx.canvas.setActiveObject(this.cropzone);
        ctx.canvas.off('mouse:move', this.onMouseMove);
        ctx.canvas.off('mouse:up', this.onMouseUp);
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Shift') {
            this.withShiftKey = true;
        }
    };

    private readonly onKeyUp = (event: KeyboardEvent): void => {
        if (event.key === 'Shift') {
            this.withShiftKey = false;
        }
    };

    activate(ctx: ControllerContext): void {
        if (this.active) {
            return;
        }
        this.active = true;
        this.ctx = ctx;
        const { canvas } = ctx;
        canvas.defaultCursor = 'crosshair';
        const bg = ctx.getState().doc.background;
        const withUI = !this.suppressUI && bg !== null;
        this.suppressUI = false;
        if (!withUI || bg === null) {
            return;
        }
        const cropzone = new Cropzone({
            left: bg.width * 0.1,
            top: bg.height * 0.1,
            width: bg.width * 0.8,
            height: bg.height * 0.8,
            boundsWidth: bg.width,
            boundsHeight: bg.height,
            strokeWidth: 0,
            cornerStyle: 'circle',
            cornerColor: '#FFFFFF',
            cornerStrokeColor: '#118BFB',
            cornerSize: 15,
            fill: 'transparent',
            hasBorders: false,
            lockScalingFlip: true,
            lockRotation: true
        });
        // 对齐旧 hasRotatingPoint:false（fabric 6 用控制点可见性表达）
        cropzone.setControlsVisibility({ mtr: false });
        canvas.add(cropzone);
        canvas.setActiveObject(cropzone);
        this.cropzone = cropzone;
        canvas.on('mouse:down', this.onMouseDown);
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
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
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        this.discardCropzone();
        canvas.defaultCursor = 'default';
        this.withShiftKey = false;
        this.ctx = undefined;
    }
}
