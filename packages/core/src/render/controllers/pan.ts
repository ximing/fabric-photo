import type { TPointerEventInfo } from 'fabric';
import { Transaction } from '../../transform/transaction';
import type { Controller, ControllerContext } from './controller';

/**
 * pan controller（mode 'pan'，由 Editor.startPan 进入）：
 * - mouse:down 记起点，cursor 切 grabbing
 * - mouse:move 按指针位移累加 panX/panY → dispatch setViewport（addToHistory:false，瞬时，不入历史）
 * - mouse:up 结束拖拽
 * 不做边界 clamp（架构决策 7）；非 normal 模式对象 selectable/evented 已由 renderer 关闭。
 */
export class PanController implements Controller {
    readonly mode = 'pan' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private dragging = false;
    private lastX = 0;
    private lastY = 0;

    private readonly onMouseDown = (event: TPointerEventInfo): void => {
        if (this.ctx === undefined) {
            return;
        }
        this.dragging = true;
        this.lastX = event.viewportPoint.x;
        this.lastY = event.viewportPoint.y;
        this.ctx.canvas.setCursor('grabbing');
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (ctx === undefined || !this.dragging) {
            return;
        }
        const { x, y } = event.viewportPoint;
        const vp = ctx.getState().viewport;
        ctx.dispatch(
            new Transaction(ctx.getState())
                .setViewport({ panX: vp.panX + (x - this.lastX), panY: vp.panY + (y - this.lastY) })
                .setMeta('addToHistory', false)
        );
        this.lastX = x;
        this.lastY = y;
    };

    private readonly onMouseUp = (): void => {
        if (!this.dragging || this.ctx === undefined) {
            return;
        }
        this.dragging = false;
        this.ctx.canvas.setCursor('grab');
    };

    activate(ctx: ControllerContext): void {
        if (this.active) {
            return;
        }
        this.active = true;
        this.ctx = ctx;
        ctx.canvas.defaultCursor = 'grab';
        ctx.canvas.on('mouse:down', this.onMouseDown);
        ctx.canvas.on('mouse:move', this.onMouseMove);
        ctx.canvas.on('mouse:up', this.onMouseUp);
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
        this.dragging = false;
        this.ctx = undefined;
    }
}
