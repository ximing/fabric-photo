import { IText, type FabricObject, type TPointerEventInfo } from 'fabric';
import type { TextObject } from '../../model/doc';
import { createId } from '../../model/id';
import { AddObject, RemoveObject, UpdateObject } from '../../steps/object-steps';
import { Transaction } from '../../transform/transaction';
import { getFpId } from '../object-factory';
import type { Controller, ControllerContext } from './controller';

/** 文本可变样式字段（addText/changeTextStyle 共用）。 */
export type TextStyleKey = 'fontSize' | 'fontFamily' | 'fill' | 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textAlign';
export type TextStyleOptions = Partial<Pick<TextObject, TextStyleKey>>;

/**
 * 样式默认值表：addText 缺省样式 + changeTextStyle toggle 的重置目标
 * （对齐旧 defaultStyles/resetStyles 与 brief 默认表；旧 resetStyles 缺 fontSize/fontFamily，
 *  按 brief 补齐 fontSize 50、fontFamily 'sans-serif'）。
 */
export const TEXT_STYLE_DEFAULTS: Required<Pick<TextObject, TextStyleKey>> = {
    fontWeight: 'normal',
    fontStyle: '',
    textDecoration: '',
    fill: '#000000',
    fontSize: 50,
    fontFamily: 'sans-serif',
    textAlign: 'left'
};

/** 新建文本的默认文案（沿用旧 readme 示例的「双击编辑」）。 */
export const DEFAULT_TEXT = '双击编辑';

export function createTextObject(text: string, left: number, top: number, styles?: TextStyleOptions): TextObject {
    return {
        id: createId(),
        kind: 'text',
        text,
        left,
        top,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        ...TEXT_STYLE_DEFAULTS,
        ...styles
    };
}

/**
 * text controller（mode 'text'，由 Editor.startTextMode 进入）：
 * - mouse:down 空白 → 在该点落 TextObject（默认文案「双击编辑」）并立即进入编辑
 *   （对齐旧 activateText「点击空白新建」语义）；命中已有对象则不动（等双击）
 * - mouse:dblclick 命中 IText → enterEditing 原地编辑（旧 DOM textarea 方案废弃，
 *   用 fabric 6 IText 原生编辑；进入前置 editable:true，退出后还原 false）
 * - editing:exited → 回读 text dispatch UpdateObject；trim 后为空 → RemoveObject
 *   （对齐旧「空文本自动 remove」）
 * - 编辑中点击别处仅退出编辑不新建（对齐旧 isPrevEditing 语义）；deactivate 时
 *   若仍在编辑先 exitEditing（同步触发 editing:exited 完成提交）
 * - text 模式下 IText 保持 evented（selectable 仍由 renderer 关闭）供双击命中；
 *   编辑态不选中对象，因此 fabric 原生 onDeselect 退出路径不触发，退出全由本 controller 显式驱动
 */
export class TextController implements Controller {
    readonly mode = 'text' as const;

    private ctx: ControllerContext | undefined;
    private active = false;
    private editing: IText | undefined;

    isEditing(): boolean {
        return this.editing !== undefined;
    }

    /** 当前编辑对象的 fpId（Editor.changeText/changeTextStyle 把编辑中对象并入目标集）。 */
    getEditingId(): string | undefined {
        return this.editing === undefined ? undefined : getFpId(this.editing);
    }

    /** 进入指定文本对象的编辑态（Editor.addText defaultEdit 与本 controller 新建流程共用）。 */
    editObject(id: string): void {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        for (const fObj of ctx.canvas.getObjects()) {
            if (fObj instanceof IText && getFpId(fObj) === id) {
                this.startEditing(fObj);
                return;
            }
        }
    }

    private startEditing(itext: IText): void {
        if (this.editing === itext && itext.isEditing) {
            return;
        }
        this.editing?.exitEditing(); // 先提交当前编辑（同步 fire editing:exited）
        this.editing = itext;
        itext.set({ editable: true });
        itext.once('editing:exited', () => {
            this.commitEditing(itext);
        });
        itext.enterEditing();
    }

    private commitEditing(itext: IText): void {
        itext.set({ editable: false });
        if (this.editing === itext) {
            this.editing = undefined;
        }
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        const fpId = getFpId(itext);
        if (fpId === undefined) {
            return;
        }
        const obj = ctx.getState().getObject(fpId);
        if (obj === undefined || obj.kind !== 'text') {
            return; // 编辑期间对象已被移除（如 clearObjects），无需提交
        }
        const text = itext.text;
        if (text.trim() === '') {
            ctx.dispatch(new Transaction(ctx.getState()).addStep(new RemoveObject(fpId)));
            ctx.fire('objectRemoved', { id: fpId });
        } else if (text !== obj.text) {
            ctx.dispatch(new Transaction(ctx.getState()).addStep(new UpdateObject(fpId, { text })));
        }
    }

    private readonly onMouseDown = (event: TPointerEventInfo): void => {
        const ctx = this.ctx;
        if (ctx === undefined) {
            return;
        }
        // 编辑中点击别处：仅退出编辑（对齐旧 isPrevEditing：本次点击不再新建/选中）
        if (this.editing !== undefined) {
            this.editing.exitEditing();
            return;
        }
        if (event.target !== undefined) {
            return; // 命中已有对象（文本），等双击进入编辑
        }
        const { x, y } = event.scenePoint;
        const object = createTextObject(DEFAULT_TEXT, x, y);
        ctx.dispatch(new Transaction(ctx.getState()).addStep(new AddObject(object)));
        ctx.fire('objectAdded', { object });
        this.editObject(object.id);
    };

    private readonly onDblClick = (event: TPointerEventInfo): void => {
        const target = event.target;
        if (target instanceof IText) {
            this.startEditing(target);
        }
    };

    /** text 模式下新增的 IText 保持可命中（renderer 在非 normal 模式统一置 evented:false，这里补回）。 */
    private readonly onObjectAdded = ({ target }: { target: FabricObject }): void => {
        if (target instanceof IText) {
            target.set({ evented: true });
        }
    };

    activate(ctx: ControllerContext): void {
        if (this.active) {
            return;
        }
        this.active = true;
        this.ctx = ctx;
        const { canvas } = ctx;
        canvas.defaultCursor = 'text';
        for (const fObj of canvas.getObjects()) {
            if (fObj instanceof IText) {
                fObj.set({ evented: true });
            }
        }
        canvas.on('mouse:down', this.onMouseDown);
        canvas.on('mouse:dblclick', this.onDblClick);
        canvas.on('object:added', this.onObjectAdded);
    }

    deactivate(): void {
        if (!this.active || this.ctx === undefined) {
            return;
        }
        this.active = false;
        const { canvas } = this.ctx;
        // 仍在编辑 → 先退出（同步触发 editing:exited 完成提交，此时 ctx 仍有效）
        this.editing?.exitEditing();
        canvas.off('mouse:down', this.onMouseDown);
        canvas.off('mouse:dblclick', this.onDblClick);
        canvas.off('object:added', this.onObjectAdded);
        canvas.defaultCursor = 'default';
        this.ctx = undefined;
    }
}
