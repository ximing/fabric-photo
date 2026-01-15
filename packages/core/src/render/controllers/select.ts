import { ActiveSelection, type BasicTransformEvent, type FabricObject, type ModifiedEvent } from 'fabric';
import type { EditorObject } from '../../model/doc';
import { UpdateObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import { fabricToScale, getFpId } from '../object-factory';
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
 * select controller（mode 'normal'，默认激活）：
 * - fabric selection:created/updated/cleared → tr.setSelection(fpIds)（不进历史）
 * - 拖拽/缩放预览由 fabric 原生直改（无事务）；object:modified → 读回最终几何 →
 *   UpdateObject 入历史（「对象变换可撤销」落地处）
 * - ActiveSelection 多选变换：先 discardActiveObject 让 fabric 把组变换兑现到各成员，
 *   逐个 UpdateObject 后再重建 ActiveSelection 还原选中态
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
        // state 已是目标选中集（如 renderer 程序化同步触发的事件）→ 跳过，避免回声事务
        if (sameIdSet(ids, ctx.getState().selection)) {
            return;
        }
        ctx.dispatch(new Transaction(ctx.getState()).setSelection(ids).setMeta('addToHistory', false));
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
        if (fpId === undefined) {
            return; // ActiveSelection 等渲染层内部对象
        }
        const obj = ctx.getState().getObject(fpId);
        if (obj === undefined) {
            return;
        }
        const flipX = obj.scaleX < 0;
        const flipY = obj.scaleY < 0;
        if (target.flipX !== flipX || target.flipY !== flipY) {
            target.set({ flipX, flipY });
        }
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
