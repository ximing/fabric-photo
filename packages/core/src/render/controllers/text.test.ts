import type { Canvas, IText } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { TextObject } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { AddObject, RemoveObject, UpdateObject } from '../../steps/object-steps';
import type { Transaction } from '../../transform/transaction';
import type { ControllerContext } from './controller';
import { DEFAULT_TEXT, TEXT_STYLE_DEFAULTS, TextController, createTextObject } from './text';

type MouseHandler = (event: { scenePoint: { x: number; y: number }; target?: unknown }) => void;

/** node 环境下的 fake canvas：捕获 mouse/object 事件处理器，getObjects 可注入。 */
function makeHarness(state?: EditorState) {
    const handlers = new Map<string, (event: never) => void>();
    const canvas = {
        defaultCursor: '',
        on: vi.fn((name: string, fn: never) => {
            handlers.set(name, fn as (event: never) => void);
        }),
        off: vi.fn(),
        getObjects: vi.fn(() => [] as unknown[])
    };
    const dispatched: Transaction[] = [];
    const fired: { name: string; payload: unknown }[] = [];
    const ctx: ControllerContext = {
        canvas: canvas as unknown as Canvas,
        getState: () => state ?? new EditorState(),
        dispatch: (tr) => {
            dispatched.push(tr);
        },
        fire: (name, payload) => {
            fired.push({ name, payload });
        }
    };
    const fireMouse = (name: string, x: number, y: number, target?: unknown): void => {
        handlers.get(name)?.({ scenePoint: { x, y }, target } as never);
    };
    return { ctx, canvas, dispatched, fired, fireMouse };
}

function lastAddedText(dispatched: Transaction[]): TextObject {
    const tr = dispatched[dispatched.length - 1];
    const step = tr.steps[0];
    expect(step).toBeInstanceOf(AddObject);
    return (step as AddObject).object as TextObject;
}

/** 伪 IText：承载 commitEditing 需要的 text/data/exitEditing（node 环境无法构造真 IText）。 */
function makeFakeIText(text: string, fpId: string) {
    return {
        text,
        data: { fpId },
        isEditing: true,
        set: vi.fn(),
        once: vi.fn(),
        enterEditing: vi.fn(),
        exitEditing: vi.fn(function (this: { isEditing: boolean }) {
            this.isEditing = false;
        })
    } as unknown as IText;
}

describe('createTextObject', () => {
    it('默认样式取 TEXT_STYLE_DEFAULTS，styles 覆盖', () => {
        const obj = createTextObject('hi', 10, 20);
        expect(obj).toMatchObject({ kind: 'text', text: 'hi', left: 10, top: 20, scaleX: 1, scaleY: 1, ...TEXT_STYLE_DEFAULTS });
        const styled = createTextObject('hi', 0, 0, { fontWeight: 'bold', fontSize: 80 });
        expect(styled).toMatchObject({ fontWeight: 'bold', fontSize: 80, fill: '#000000' });
    });
});

describe('TextController', () => {
    it('text 模式点击空白：落「双击编辑」文本对象并 fire objectAdded', () => {
        const harness = makeHarness();
        const controller = new TextController();
        controller.activate(harness.ctx);

        harness.fireMouse('mouse:down', 120, 80);
        expect(harness.dispatched).toHaveLength(1);
        const obj = lastAddedText(harness.dispatched);
        expect(obj).toMatchObject({ kind: 'text', text: DEFAULT_TEXT, left: 120, top: 80 });
        expect(harness.fired).toEqual([{ name: 'objectAdded', payload: { object: expect.objectContaining({ id: obj.id }) } }]);
        // fake canvas 无对象可编辑 → 不进入编辑态，也不抛错
        expect(controller.isEditing()).toBe(false);
    });

    it('点击命中已有对象：不新建', () => {
        const harness = makeHarness();
        const controller = new TextController();
        controller.activate(harness.ctx);

        harness.fireMouse('mouse:down', 10, 10, { fake: 'target' });
        expect(harness.dispatched).toHaveLength(0);
    });

    it('编辑中点击别处：仅退出编辑，不新建（对齐旧 isPrevEditing）', () => {
        const harness = makeHarness();
        const controller = new TextController();
        controller.activate(harness.ctx);
        const editing = makeFakeIText('abc', 't1');
        (controller as unknown as { editing: IText }).editing = editing;

        harness.fireMouse('mouse:down', 50, 50);
        expect(editing.exitEditing).toHaveBeenCalledTimes(1);
        expect(harness.dispatched).toHaveLength(0);
    });

    it('双击非 IText 目标：无动作', () => {
        const harness = makeHarness();
        const controller = new TextController();
        controller.activate(harness.ctx);

        harness.fireMouse('mouse:dblclick', 10, 10, { fake: 'rect' });
        expect(harness.dispatched).toHaveLength(0);
        expect(controller.isEditing()).toBe(false);
    });

    it('editing:exited 提交：文本变化 → UpdateObject；trim 后为空 → RemoveObject 并 fire objectRemoved', () => {
        const textObj = createTextObject('原文', 0, 0);
        const state = new EditorState({ doc: { background: null, objects: [textObj] } });
        const harness = makeHarness(state);
        const controller = new TextController();
        controller.activate(harness.ctx);

        // 文本变化 → UpdateObject
        const it1 = makeFakeIText('新文本', textObj.id);
        (controller as unknown as { editing: IText }).editing = it1;
        (controller as unknown as { commitEditing(o: IText): void }).commitEditing(it1);
        expect(controller.isEditing()).toBe(false);
        const tr1 = harness.dispatched[harness.dispatched.length - 1];
        expect(tr1.steps[0]).toBeInstanceOf(UpdateObject);
        expect((tr1.steps[0] as UpdateObject).attrs).toEqual({ text: '新文本' });

        // trim 后为空 → RemoveObject + objectRemoved
        const it2 = makeFakeIText('   ', textObj.id);
        (controller as unknown as { editing: IText }).editing = it2;
        (controller as unknown as { commitEditing(o: IText): void }).commitEditing(it2);
        const tr2 = harness.dispatched[harness.dispatched.length - 1];
        expect(tr2.steps[0]).toBeInstanceOf(RemoveObject);
        expect((tr2.steps[0] as RemoveObject).id).toBe(textObj.id);
        expect(harness.fired).toContainEqual({ name: 'objectRemoved', payload: { id: textObj.id } });

        // 文本未变 → 无 dispatch
        const before = harness.dispatched.length;
        const it3 = makeFakeIText('原文', textObj.id);
        (controller as unknown as { editing: IText }).editing = it3;
        (controller as unknown as { commitEditing(o: IText): void }).commitEditing(it3);
        expect(harness.dispatched).toHaveLength(before);
    });

    it('deactivate 时仍在编辑：先 exitEditing 提交再清理', () => {
        const harness = makeHarness();
        const controller = new TextController();
        controller.activate(harness.ctx);
        const editing = makeFakeIText('abc', 't1');
        (controller as unknown as { editing: IText }).editing = editing;

        controller.deactivate();
        expect(editing.exitEditing).toHaveBeenCalledTimes(1);
        expect(harness.canvas.off).toHaveBeenCalledWith('mouse:down', expect.any(Function));
        expect(harness.canvas.off).toHaveBeenCalledWith('mouse:dblclick', expect.any(Function));
        expect(harness.canvas.defaultCursor).toBe('default');
    });
});
