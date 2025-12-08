import { Path, type TPointerEventInfo } from 'fabric';
import type { PathObject } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import { probePathPosition } from '../object-factory';
import type { BrushSetting, Controller, ControllerContext } from './controller';

const DEFAULT_WIDTH = 5;
const DEFAULT_COLOR = 'rgba(0, 0, 0, 0.5)';
const DEFAULT_HEAD_WIDTH = 20;
const DEFAULT_HEAD_HEIGHT = 20;
/** 旧 arrow.ts 的拖动判定阈值（曼哈顿距离），小于视为误触不落对象。 */
const DRAG_THRESHOLD = 5;

/** 箭头角度（度）：照搬旧 src/modules/arrow.ts calcArrowAngle。 */
function calcArrowAngle(x1: number, y1: number, x2: number, y2: number): number {
    let angle = 0;
    const x = x2 - x1;
    const y = y2 - y1;
    if (x === 0) {
        angle = y === 0 ? 0 : y > 0 ? Math.PI / 2 : (Math.PI * 3) / 2;
    } else if (y === 0) {
        angle = x > 0 ? 0 : Math.PI;
    } else {
        angle = x < 0 ? Math.atan(y / x) + Math.PI : y < 0 ? Math.atan(y / x) + 2 * Math.PI : Math.atan(y / x);
    }
    return (angle * 180) / Math.PI;
}

function rotate(x: number, y: number, rad: number): { x: number; y: number } {
    return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) };
}

/**
 * 线 + 三角箭头合成单 SVG path：
 * `M x1 y1 L x2 y2 M tipX tipY L wing1X wing1Y L wing2X wing2Y Z`
 * 三角形以 (x2,y2) 为中心（对齐旧 arrow.ts：triangle origin center 位于当前指针），
 * 顶角指向 (x1,y1) → (x2,y2) 方向；角度算法与旧 Group 方案一致。
 */
function buildArrowPath(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    headWidth: number,
    headHeight: number
): string {
    const angleDeg =
        x1 === x2 && y1 === y2 ? -45 : calcArrowAngle(x2, y2, x1, y1) - 90;
    const rad = (angleDeg * Math.PI) / 180;
    const tip = rotate(0, -headHeight / 2, rad);
    const wing1 = rotate(-headWidth / 2, headHeight / 2, rad);
    const wing2 = rotate(headWidth / 2, headHeight / 2, rad);
    return (
        `M ${x1} ${y1} L ${x2} ${y2} ` +
        `M ${x2 + tip.x} ${y2 + tip.y} ` +
        `L ${x2 + wing1.x} ${y2 + wing1.y} ` +
        `L ${x2 + wing2.x} ${y2 + wing2.y} Z`
    );
}

/**
 * arrow controller（mode 'arrow'，由 Editor.startArrowDrawing 进入）：
 * - mouse:down 记尾点；mouse:move 超阈值后以单个 fabric.Path 预览（线+三角箭头合成 path）；
 *   mouse:up 移除预览 → dispatch AddObject(PathObject { tool:'arrow', path: 合成 path }）
 *   → fire objectAdded
 * - crosshair 光标；其他对象 selectable/evented 由 renderer 在非 normal 模式统一关闭
 * 移植自旧 src/modules/arrow.ts（旧为 Line+Triangle+Circle 的 Group，落盘改为单 PathObject）。
 */
export class ArrowController implements Controller {
    readonly mode = 'arrow' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private width = DEFAULT_WIDTH;
    private color = DEFAULT_COLOR;
    private readonly headWidth = DEFAULT_HEAD_WIDTH;
    private readonly headHeight = DEFAULT_HEAD_HEIGHT;
    private preview: Path | undefined;
    private dragging = false;
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

    private makePreview(path: string): Path {
        return new Path(path, {
            stroke: this.color,
            strokeWidth: this.width,
            fill: 'transparent',
            selectable: false,
            evented: false
        });
    }

    private replacePreview(path: string): void {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        if (this.preview !== undefined) {
            ctx.canvas.remove(this.preview);
        }
        this.preview = this.makePreview(path);
        ctx.canvas.add(this.preview);
        ctx.canvas.requestRenderAll();
    }

    private clearPreview(): void {
        if (this.ctx !== undefined && this.preview !== undefined) {
            this.ctx.canvas.remove(this.preview);
        }
        this.preview = undefined;
    }

    private readonly onMouseDown = (event: TPointerEventInfo): void => {
        if (this.ctx === undefined) {
            return;
        }
        this.dragging = true;
        this.startX = event.scenePoint.x;
        this.startY = event.scenePoint.y;
    };

    private readonly onMouseMove = (event: TPointerEventInfo): void => {
        if (!this.dragging || this.ctx === undefined) {
            return;
        }
        const { x, y } = event.scenePoint;
        if (Math.abs(x - this.startX) + Math.abs(y - this.startY) <= DRAG_THRESHOLD) {
            return;
        }
        this.replacePreview(buildArrowPath(this.startX, this.startY, x, y, this.headWidth, this.headHeight));
    };

    private readonly onMouseUp = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (!this.dragging || ctx === undefined) {
            return;
        }
        this.dragging = false;
        this.clearPreview();
        const x = event.scenePoint.x;
        const y = event.scenePoint.y;
        if (Math.abs(x - this.startX) + Math.abs(y - this.startY) <= DRAG_THRESHOLD) {
            return; // 未有效拖动，不落对象
        }
        const path = buildArrowPath(this.startX, this.startY, x, y, this.headWidth, this.headHeight);
        const { left, top } = probePathPosition(path);
        const object: PathObject = {
            id: createId(),
            kind: 'path',
            tool: 'arrow',
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
        this.dragging = false;
        this.clearPreview();
        this.ctx = undefined;
    }
}
