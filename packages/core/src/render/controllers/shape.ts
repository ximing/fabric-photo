import { Ellipse, Rect, Triangle, type FabricObject, type TPointerEventInfo } from 'fabric';
import type { ShapeObject } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import type { Controller, ControllerContext } from './controller';

/** 可绘制形状类型（与 ShapeObject.shapeType 一致）。 */
export type ShapeType = ShapeObject['shapeType'];

/** 形状样式配置（影响下一次落盘的对象样式）。 */
export interface ShapeStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
}

const DEFAULT_TYPE: ShapeType = 'rect';
const DEFAULT_FILL = '#ffffff';
const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = 1;

/**
 * shape controller（mode 'shape'，由 Editor.startDrawingShapeMode 进入）：
 * - mouse:down 记起点并建 fabric 预览（Rect/Ellipse/Triangle；circle 对齐旧实现用 Ellipse 伪造）；
 *   mouse:move 更新 left/top/宽高——反向拖动时 left/top 取 min（doc 模型 left/top 即 bbox 左上角，
 *   等价于旧 shape-resize-helper 在 angle=0 下的 origin 换算）；Shift（keydown/keyup 跟踪）
 *   锁等比（对齐旧 isRegular：宽高取 max，triangle 高 = √3/2·宽）；
 *   mouse:up 移除预览 → dispatch AddObject(ShapeObject) → fire objectAdded；
 *   原地点击（宽高均 0）不落对象
 * - crosshair 光标；其他对象 selectable/evented 由 renderer 在非 normal 模式统一关闭
 * 移植自旧 src/modules/shape.ts + src/lib/shape-resize-helper.ts（origin 换算在 doc 模型下
 * 退化为 min/max，未移植旧 strokeWidth 尺寸补偿——fabric 6 描边语义不同且对落盘数据无影响）。
 */
export class ShapeController implements Controller {
    readonly mode = 'shape' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private type: ShapeType = DEFAULT_TYPE;
    private fill = DEFAULT_FILL;
    private stroke = DEFAULT_STROKE;
    private strokeWidth = DEFAULT_STROKE_WIDTH;
    private withShiftKey = false;
    private preview: FabricObject | undefined;
    private startX = 0;
    private startY = 0;

    /** 记录当前形状类型与样式（影响下一次落盘的对象）。 */
    setShape(type: ShapeType, style?: ShapeStyle): void {
        this.type = type;
        if (style?.fill !== undefined) {
            this.fill = style.fill;
        }
        if (style?.stroke !== undefined) {
            this.stroke = style.stroke;
        }
        if (style?.strokeWidth !== undefined) {
            this.strokeWidth = style.strokeWidth;
        }
    }

    private makePreview(left: number, top: number): FabricObject {
        const common = {
            left,
            top,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            selectable: false,
            evented: false
        };
        switch (this.type) {
            case 'rect':
                return new Rect({ ...common, width: 0, height: 0 });
            case 'circle':
                return new Ellipse({ ...common, rx: 0, ry: 0 });
            case 'triangle':
                return new Triangle({ ...common, width: 0, height: 0 });
        }
    }

    /**
     * 由起点与当前指针计算落盘几何（含 Shift 等比）；left/top 为 bbox 左上角。
     * 锚定起点角（对齐旧 adjustOriginByMovingPointer 的 isRegular 语义）：box 沿拖动
     * 方向从起点延伸；Shift 等比放大时短轴方向也不越过起点线（非 Shift 时退化为 min）。
     */
    private geometryAt(
        x: number,
        y: number
    ): { left: number; top: number; width: number; height: number } {
        let width = Math.abs(x - this.startX);
        let height = Math.abs(y - this.startY);
        if (this.withShiftKey) {
            width = Math.max(width, height);
            height = this.type === 'triangle' ? (Math.sqrt(3) / 2) * width : width;
        }
        return {
            left: x >= this.startX ? this.startX : this.startX - width,
            top: y >= this.startY ? this.startY : this.startY - height,
            width,
            height
        };
    }

    private updatePreview(geometry: { left: number; top: number; width: number; height: number }): void {
        const preview = this.preview;
        if (preview === undefined) {
            return;
        }
        if (this.type === 'circle') {
            preview.set({
                left: geometry.left,
                top: geometry.top,
                rx: geometry.width / 2,
                ry: geometry.height / 2
            });
        } else {
            preview.set({
                left: geometry.left,
                top: geometry.top,
                width: geometry.width,
                height: geometry.height
            });
        }
    }

    private readonly onMouseDown = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        const { x, y } = event.scenePoint;
        this.startX = x;
        this.startY = y;
        this.preview = this.makePreview(x, y);
        ctx.canvas.add(this.preview);
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        if (this.preview === undefined || this.ctx === undefined) {
            return;
        }
        this.updatePreview(this.geometryAt(event.scenePoint.x, event.scenePoint.y));
        this.ctx.canvas.requestRenderAll();
    };

    private readonly onMouseUp = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        const preview = this.preview;
        if (ctx === undefined || preview === undefined) {
            return;
        }
        this.preview = undefined;
        ctx.canvas.remove(preview);
        const geometry = this.geometryAt(event.scenePoint.x, event.scenePoint.y);
        if (geometry.width === 0 && geometry.height === 0) {
            return; // 原地点击不落对象
        }
        const object: ShapeObject = {
            id: createId(),
            kind: 'shape',
            shapeType: this.type,
            left: geometry.left,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth
        };
        ctx.dispatch(new Transaction(ctx.getState()).addStep(new AddObject(object)));
        ctx.fire('objectAdded', { object });
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
        canvas.on('mouse:down', this.onMouseDown);
        canvas.on('mouse:move', this.onMouseMove);
        canvas.on('mouse:up', this.onMouseUp);
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
        canvas.defaultCursor = 'default';
        this.withShiftKey = false;
        if (this.preview !== undefined) {
            canvas.remove(this.preview);
            this.preview = undefined;
        }
        this.ctx = undefined;
    }
}
