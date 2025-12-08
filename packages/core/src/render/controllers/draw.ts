import { PencilBrush, Path, type FabricObject } from 'fabric';
import type { PathObject } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import type { BrushSetting, Controller, ControllerContext } from './controller';

const DEFAULT_WIDTH = 12;
const DEFAULT_COLOR = 'rgba(0, 0, 0, 0.5)';

/**
 * freedraw controller（mode 'freedraw'，由 Editor.startFreeDrawing 进入）：
 * - canvas.isDrawingMode = true，PencilBrush 应用 width/color（旧默认 12 / rgba(0,0,0,0.5)）
 * - path:created → 取 path data → 从画布移除临时 path → dispatch
 *   AddObject(PathObject { tool:'freedraw', path, stroke, strokeWidth, fill:'' })
 *   （由 renderer 统一重建，保证 state 是唯一事实源）→ fire objectAdded
 * 移植自旧 src/modules/draw.ts。
 */
export class DrawController implements Controller {
    readonly mode = 'freedraw' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private width = DEFAULT_WIDTH;
    private color = DEFAULT_COLOR;

    /** 更新笔刷配置；激活中即时应用到 freeDrawingBrush。 */
    setBrush(setting: BrushSetting): void {
        if (setting.width !== undefined) {
            this.width = setting.width;
        }
        if (setting.color !== undefined) {
            this.color = setting.color;
        }
        const brush = this.active ? this.ctx?.canvas.freeDrawingBrush : undefined;
        if (brush !== undefined) {
            brush.width = this.width;
            brush.color = this.color;
        }
    }

    private readonly onPathCreated = ({ path: fPath }: { path: FabricObject }): void => {
        const ctx = this.ctx;
        if (ctx === undefined || !(fPath instanceof Path)) {
            return;
        }
        // fabric 已把临时 path 加进画布：先移除，最终对象由 renderer 依 state 重建
        ctx.canvas.remove(fPath);
        const object: PathObject = {
            id: createId(),
            kind: 'path',
            tool: 'freedraw',
            path: fPath.path.map((segment) => segment.join(' ')).join(' '),
            left: fPath.left,
            top: fPath.top,
            angle: fPath.angle,
            scaleX: fPath.scaleX,
            scaleY: fPath.scaleY,
            stroke: this.color,
            strokeWidth: this.width,
            fill: ''
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
        const { canvas } = ctx;
        // fabric 6 不预置 freeDrawingBrush，需显式挂 PencilBrush
        canvas.freeDrawingBrush ??= new PencilBrush(canvas);
        canvas.freeDrawingBrush.width = this.width;
        canvas.freeDrawingBrush.color = this.color;
        canvas.isDrawingMode = true;
        canvas.on('path:created', this.onPathCreated);
    }

    deactivate(): void {
        if (!this.active || this.ctx === undefined) {
            return;
        }
        this.active = false;
        const { canvas } = this.ctx;
        canvas.isDrawingMode = false;
        canvas.off('path:created', this.onPathCreated);
        this.ctx = undefined;
    }
}
