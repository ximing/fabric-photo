import { ActiveSelection, type BasicTransformEvent, type FabricObject, type ModifiedEvent } from 'fabric';
import type { EditorObject } from '../../model/doc';
import { UpdateObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import { fabricToScale, getFpId } from '../object-factory';
import { SNAP_THRESHOLD_PX, computeSnap, type SnapBox, type SnapGuide } from '../snapping';
import type { Controller, ControllerContext } from './controller';

/**
 * 拖拽/缩放/旋转结束后需要读回的几何字段。
 * fabric 把 scale 归一化为恒正、翻转存 flipX/flipY，回读必须合并符号，
 * 否则任何 object:modified 提交都会把 state 里的翻转（负 scale）写丢。
 */
function readGeometry(fObj: FabricObject): Record<string, number> {
    return {
        left: fObj.left,
        top: fObj.top,
        angle: fObj.angle,
        scaleX: fabricToScale(fObj.scaleX, fObj.flipX),
        scaleY: fabricToScale(fObj.scaleY, fObj.flipY)
    };
}

/**
 * object:modified 提交属性（按 kind 分派）：
 * shape 把 scale 折算回 width/height 并归一 scaleX/scaleY（移植自旧 shape-resize-helper
 * 的 adjustDimensionOnScaling；doc 模型中 circle 以 width/height 存储，渲染时再折算
 * rx/ry，故 rect/circle/triangle 共用同一折算公式）；
 * text 把 scale 折算进 fontSize 并归一 scaleX/scaleY（对齐旧 _onFabricScaling 的
 * fontSize × scaleY——中点控制点已隐藏，角点缩放近似等比，只取 scaleY）；
 * 其余 kind 只读回几何。
 */
function readCommittedAttrs(obj: EditorObject, fObj: FabricObject): Record<string, number> {
    const geometry = readGeometry(fObj);
    if (obj.kind === 'shape') {
        // 宽高折算后 scale 幅度归一，但翻转符号必须保留为 ±1（否则提交即丢翻转）
        return {
            ...geometry,
            width: obj.width * fObj.scaleX,
            height: obj.height * fObj.scaleY,
            scaleX: fObj.flipX ? -1 : 1,
            scaleY: fObj.flipY ? -1 : 1
        };
    }
    if (obj.kind === 'text') {
        return {
            ...geometry,
            fontSize: obj.fontSize * fObj.scaleY,
            scaleX: fObj.flipX ? -1 : 1,
            scaleY: fObj.flipY ? -1 : 1
        };
    }
    return geometry;
}

function sameAttrs(obj: EditorObject, attrs: Record<string, number>): boolean {
    const record = obj as unknown as Record<string, unknown>;
    return Object.keys(attrs).every((key) => record[key] === attrs[key]);
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * 被拖盒（doc 坐标）：必须按当前 raw transform（left/top + 尺寸×scale）现算，
 * 不能用 getBoundingRect()——fabric 只在 render/修正后 setCoords，object:moving 里
 * 的 aCoords 是上一帧位置，修正量基于旧位置算、加到当前 raw 位置上会形成一帧延迟
 * 反馈（提交偏差最大达吸附阈值、快速接近时不修正、轨迹振荡）。
 * 口径与 model/bbox.ts 一致：忽略 angle，center origin（mosaic）折算左上角，
 * ActiveSelection 组取组 bbox（left/top origin、宽高×组 scale）。
 */
function draggedBox(target: FabricObject): SnapBox {
    const width = target.width * Math.abs(target.scaleX);
    const height = target.height * Math.abs(target.scaleY);
    return {
        left: target.originX === 'center' ? target.left - width / 2 : target.left,
        top: target.originY === 'center' ? target.top - height / 2 : target.top,
        width,
        height
    };
}

/**
 * select controller（mode 'normal'，默认激活）：
 * - fabric selection:created/updated/cleared → tr.setSelection(fpIds)（不进历史）
 * - 拖拽/缩放预览由 fabric 原生直改（无事务）；object:modified → 读回最终几何 →
 *   UpdateObject 入历史（「对象变换可撤销」落地处）
 * - ActiveSelection 多选变换：先 discardActiveObject 让 fabric 把组变换兑现到各成员，
 *   逐个 UpdateObject 后再重建 ActiveSelection 还原选中态
 * - 拖拽吸附（智能参考线）：object:moving 中 computeSnap 命中即修正位置并在
 *   after:render 直画 #0d99ff 参考线（不进 state），mouse up 清除
 */
export class SelectController implements Controller {
    readonly mode = 'normal' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    /**
     * 多选提交重入守卫：commitActiveSelection 里 discardActiveObject 时，
     * fabric（_discardActiveObject）发现当前 transform 属于该 ActiveSelection 会
     * endCurrentTransform → 再次 fire object:modified；不守卫会无限递归。
     */
    private committing = false;

    private readonly onSelectionChange = (): void => {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        const ids: string[] = [];
        for (const fObj of ctx.canvas.getActiveObjects()) {
            const fpId = getFpId(fObj);
            if (fpId !== undefined) {
                ids.push(fpId);
            }
        }
        // 回声判定对「画布可选中子集」做：locked/hidden 对象只在面板（state.selection）里
        // 选中、不呈现在画布上，syncSelection 程序化 discard 触发的 selection:cleared
        // 若直接对比 state.selection 会把面板选中误清空
        const state = ctx.getState();
        const canvasSelectable = state.selection.filter((id) => {
            const obj = state.getObject(id);
            return obj !== undefined && obj.locked !== true && obj.hidden !== true;
        });
        // state 已是目标选中集（如 renderer 程序化同步触发的事件）→ 跳过，避免回声事务
        if (sameIdSet(ids, canvasSelectable)) {
            return;
        }
        ctx.dispatch(new Transaction(state).setSelection(ids).setMeta('addToHistory', false));
    };

    /**
     * 拖拽期间按 state 校正 flip 标志：
     * fabric 会在若干路径改写 flip 表示（如 ActiveSelection 成组/解散时
     * applyTransformToObject 清 flipX/flipY 并按矩阵重分解），move 手势本身
     * 不会合法改变 flip，故一旦发现 fabric 标志与 state 脱节即以 state 为准重新施加，
     * 保证拖拽已翻转对象全程画布显示与 state 一致。
     * （scaling 不挂此守卫：拖过原点翻转是 fabric 原生合法行为，由回读合并符号正确处理。）
     */
    private readonly onObjectMoving = (event: BasicTransformEvent & { target?: FabricObject }): void => {
        const ctx = this.ctx;
        const target = event.target;
        if (ctx === undefined || target === undefined || this.committing) {
            return;
        }
        const fpId = getFpId(target);
        if (fpId !== undefined) {
            const obj = ctx.getState().getObject(fpId);
            if (obj !== undefined) {
                const flipX = obj.scaleX < 0;
                const flipY = obj.scaleY < 0;
                if (target.flipX !== flipX || target.flipY !== flipY) {
                    target.set({ flipX, flipY });
                }
            }
        }
        this.applySnapping(ctx, target);
    };

    // —— 智能参考线（拖拽吸附）：纯计算见 render/snapping.ts，这里只做 fabric 接线 ——

    /** 拖拽开始时快照的对齐目标盒列表；null = 不在拖拽中。 */
    private snapTargets: SnapBox[] | null = null;
    /** 背景（画布）中心线坐标；无背景为 null（不出中心线）。 */
    private snapCenter: { x: number; y: number } | null = null;
    /** 当前命中的参考线（after:render 直画到画布顶层，不进 state）。 */
    private snapGuides: SnapGuide[] = [];

    /**
     * object:moving 中的吸附：目标列表在拖拽开始快照一次（moving 高频触发），
     * 命中即把被拖对象（单选或 ActiveSelection 组 bbox）位置修正到对齐位。
     */
    private applySnapping(ctx: ControllerContext, target: FabricObject): void {
        if (this.snapTargets === null) {
            this.snapshotSnapTargets(ctx, target);
        }
        const targets = this.snapTargets;
        if (targets === null) {
            return; // 不可达（snapshot 必定赋值），仅收窄类型
        }
        const scale = ctx.canvas.viewportTransform[0] || 1;
        const result = computeSnap(draggedBox(target), targets, this.snapCenter, SNAP_THRESHOLD_PX / scale);
        if (result.dx !== 0 || result.dy !== 0) {
            target.set({ left: target.left + result.dx, top: target.top + result.dy });
            target.setCoords();
        }
        this.snapGuides = result.guides;
    }

    /** 拖拽开始时的目标快照：其他所有非 locked/hidden 对象的 bbox + 背景中心线。 */
    private snapshotSnapTargets(ctx: ControllerContext, dragged: FabricObject): void {
        const draggedIds = new Set<string>();
        if (dragged instanceof ActiveSelection) {
            for (const member of dragged.getObjects()) {
                const fpId = getFpId(member);
                if (fpId !== undefined) {
                    draggedIds.add(fpId);
                }
            }
        } else {
            const fpId = getFpId(dragged);
            if (fpId !== undefined) {
                draggedIds.add(fpId);
            }
        }
        const state = ctx.getState();
        const boxes: SnapBox[] = [];
        for (const fObj of ctx.canvas.getObjects()) {
            const fpId = getFpId(fObj);
            if (fpId === undefined || draggedIds.has(fpId)) {
                continue;
            }
            const obj = state.getObject(fpId);
            if (obj === undefined || obj.locked === true || obj.hidden === true) {
                continue; // locked/hidden 不作为对齐目标
            }
            const rect = fObj.getBoundingRect();
            boxes.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        }
        const bg = state.doc.background;
        this.snapCenter = bg === null ? null : { x: bg.width / 2, y: bg.height / 2 };
        this.snapTargets = boxes;
    }

    /** 手势结束（mouse up）：清目标快照与参考线，重绘一次擦掉已画的线。 */
    private readonly onMouseUp = (): void => {
        this.snapTargets = null;
        this.snapCenter = null;
        if (this.snapGuides.length > 0) {
            this.snapGuides = [];
            this.ctx?.canvas.requestRenderAll();
        }
    };

    /**
     * 参考线绘制：after:render 的 ctx 为容器主 context（此时 vpt 已 restore、
     * 控制点已画完），手动应用 vpt 把 doc 坐标换算到屏幕像素画 1px 细线。
     */
    private readonly onAfterRender = (event: { ctx: CanvasRenderingContext2D }): void => {
        const canvas = this.ctx?.canvas;
        if (canvas === undefined || this.snapGuides.length === 0) {
            return;
        }
        const vpt = canvas.viewportTransform;
        const ctx2d = event.ctx;
        ctx2d.save();
        ctx2d.strokeStyle = '#0d99ff';
        ctx2d.lineWidth = 1;
        for (const guide of this.snapGuides) {
            ctx2d.beginPath();
            if (guide.orientation === 'vertical') {
                const x = guide.position * vpt[0] + vpt[4];
                ctx2d.moveTo(x, guide.from * vpt[3] + vpt[5]);
                ctx2d.lineTo(x, guide.to * vpt[3] + vpt[5]);
            } else {
                const y = guide.position * vpt[3] + vpt[5];
                ctx2d.moveTo(guide.from * vpt[0] + vpt[4], y);
                ctx2d.lineTo(guide.to * vpt[0] + vpt[4], y);
            }
            ctx2d.stroke();
        }
        ctx2d.restore();
    };

    private readonly onObjectModified = (event: ModifiedEvent): void => {        const ctx = this.ctx;
        const target = event.target;
        if (ctx === undefined || target === undefined || this.committing) {
            return;
        }
        if (target instanceof ActiveSelection) {
            this.commitActiveSelection(target);
            return;
        }
        const fpId = getFpId(target);
        if (fpId === undefined) {
            return;
        }
        const obj = ctx.getState().getObject(fpId);
        if (obj === undefined) {
            return;
        }
        // locked 对象不可交互（selectable/evented false），正常不会产生 modified；
        // 兜底跳过其提交，保证「锁定 = 不可几何变换」语义不被意外路径绕过
        if (obj.locked === true) {
            return;
        }
        const attrs = readCommittedAttrs(obj, target);
        if (sameAttrs(obj, attrs)) {
            return; // 无实际位移（如原地点击控制点），不产生空历史
        }
        ctx.dispatch(new Transaction(ctx.getState()).addStep(new UpdateObject(fpId, attrs)));
    };

    activate(ctx: ControllerContext): void {
        if (this.active) {
            return;
        }
        this.active = true;
        this.ctx = ctx;
        ctx.canvas.on('selection:created', this.onSelectionChange);
        ctx.canvas.on('selection:updated', this.onSelectionChange);
        ctx.canvas.on('selection:cleared', this.onSelectionChange);
        ctx.canvas.on('object:moving', this.onObjectMoving);
        ctx.canvas.on('object:modified', this.onObjectModified);
        ctx.canvas.on('mouse:up', this.onMouseUp);
        ctx.canvas.on('after:render', this.onAfterRender);
    }

    deactivate(): void {
        if (!this.active || this.ctx === undefined) {
            return;
        }
        this.active = false;
        const { canvas } = this.ctx;
        canvas.off('selection:created', this.onSelectionChange);
        canvas.off('selection:updated', this.onSelectionChange);
        canvas.off('selection:cleared', this.onSelectionChange);
        canvas.off('object:moving', this.onObjectMoving);
        canvas.off('object:modified', this.onObjectModified);
        canvas.off('mouse:up', this.onMouseUp);
        canvas.off('after:render', this.onAfterRender);
        // 模式切换可能发生在拖拽中：清吸附状态并重绘擦掉残留参考线
        this.snapTargets = null;
        this.snapCenter = null;
        if (this.snapGuides.length > 0) {
            this.snapGuides = [];
            canvas.requestRenderAll();
        }
        this.ctx = undefined;
    }

    /**
     * 多选变换提交：ActiveSelection 成员的 left/top 在组存续期间是相对坐标，
     * discard 后 fabric（Group._exitGroup）才把组变换兑现成各成员的绝对几何。
     */
    private commitActiveSelection(selection: ActiveSelection): void {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        this.committing = true;
        try {
            const { canvas } = ctx;
            const members = selection.getObjects().slice();
            canvas.discardActiveObject(); // 触发 selection:cleared → onSelectionChange 同步空选
            const tr = new Transaction(ctx.getState());
            for (const member of members) {
                const fpId = getFpId(member);
                if (fpId === undefined) {
                    continue;
                }
                const obj = ctx.getState().getObject(fpId);
                if (obj === undefined) {
                    continue;
                }
                const attrs = readCommittedAttrs(obj, member);
                if (!sameAttrs(obj, attrs)) {
                    tr.addStep(new UpdateObject(fpId, attrs));
                }
            }
            if (tr.steps.length > 0) {
                ctx.dispatch(tr);
            }
            // 还原多选选中态（触发 selection:created → onSelectionChange 同步回 state）
            canvas.setActiveObject(new ActiveSelection(members, { canvas }));
            canvas.requestRenderAll();
        } finally {
            this.committing = false;
        }
    }
}
