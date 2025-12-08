import { Line, type TPointerEventInfo } from 'fabric';
import type { PathObject } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import { probePathPosition } from '../object-factory';
import type { BrushSetting, Controller, ControllerContext } from './controller';

const DEFAULT_WIDTH = 12;
const DEFAULT_COLOR = 'rgba(0, 0, 0, 0.5)';

/**
 * line controller（mode 'line'，由 Editor.startLineDrawing 进入）：
 * - mouse:down 建临时 fabric.Line 预览；mouse:move 更新 x2/y2；
 *   mouse:up 移除预览 → dispatch AddObject(PathObject { tool:'line', path:'M x1 y1 L x2 y2' }）
 *   → fire objectAdded；原地点击（起终同点）不落对象
 * - crosshair 光标；其他对象 selectable/evented 由 renderer 在非 normal 模式统一关闭
 * 移植自旧 src/modules/line.ts。
 */
export class LineController implements Controller {
    readonly mode = 'line' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private width = DEFAULT_WIDTH;
    private color = DEFAULT_COLOR;
    private preview: Line | undefined;
    private startX = 0;
    private startY = 0;

    /** 更新笔刷配置（影响下一次落盘的对象样式）。 */
    setBrush(setting: BrushSetting): void {
        if (setting.width !== undefined) {
            this.width = setting.width;
        }
        if (setting.color !== undefined) {
            this.color = setting.color;
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
        this.preview = new Line([x, y, x, y], {
            stroke: this.color,
            strokeWidth: this.width,
            selectable: false,
            evented: false
        });
        ctx.canvas.add(this.preview);
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        if (this.preview === undefined || this.ctx === undefined) {
            return;
        }
        this.preview.set({ x2: event.scenePoint.x, y2: event.scenePoint.y });
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
        const x1 = this.startX;
        const y1 = this.startY;
        const x2 = event.scenePoint.x;
        const y2 = event.scenePoint.y;
        if (x1 === x2 && y1 === y2) {
            return; // 原地点击不产生零长度线对象
        }
        const path = `M ${x1} ${y1} L ${x2} ${y2}`;
        const { left, top } = probePathPosition(path);
        const object: PathObject = {
            id: createId(),
            kind: 'path',
            tool: 'line',
            path,
            left,
            top,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
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
        canvas.defaultCursor = 'crosshair';
        canvas.on('mouse:down', this.onMouseDown);
        canvas.on('mouse:move', this.onMouseMove);
        canvas.on('mouse:up', this.onMouseUp);
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
        if (this.preview !== undefined) {
            canvas.remove(this.preview);
            this.preview = undefined;
        }
        this.ctx = undefined;
    }
}
