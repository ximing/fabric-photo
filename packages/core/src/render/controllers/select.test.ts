import type { Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { TextObject } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { UpdateObject } from '../../steps/object-steps';
import type { Transaction } from '../../transform/transaction';
import type { ControllerContext } from './controller';
import { SelectController } from './select';
import { createTextObject } from './text';

type ModifiedHandler = (event: { target: unknown }) => void;

/** node 环境下的 fake canvas：仅捕获 object:modified 处理器（selection 事件本测试不触发）。 */
function makeHarness(state: EditorState) {
    const handlers = new Map<string, ModifiedHandler>();
    const canvas = {
        on: vi.fn((name: string, fn: ModifiedHandler) => {
            handlers.set(name, fn);
        }),
        off: vi.fn()
    };
    const dispatched: Transaction[] = [];
    const ctx: ControllerContext = {
        canvas: canvas as unknown as Canvas,
        getState: () => state,
        dispatch: (tr) => {
            dispatched.push(tr);
        },
        fire: vi.fn()
    };
    return {
        ctx,
        dispatched,
        fireModified: (target: unknown): void => {
            handlers.get('object:modified')?.({ target });
        }
    };
}

/** 伪 fabric 对象：object:modified 读回只需几何字段 + data.fpId。 */
function fakeFabricObject(fpId: string, geometry: { left: number; top: number; angle: number; scaleX: number; scaleY: number }) {
    return { ...geometry, data: { fpId } };
}

describe('SelectController text 分支', () => {
    it('文本缩放提交：scale 折算进 fontSize（×scaleY）并归一 scaleX/scaleY', () => {
        const textObj: TextObject = createTextObject('hi', 10, 20); // fontSize 50
        const state = new EditorState({ doc: { background: null, objects: [textObj] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        harness.fireModified(fakeFabricObject(textObj.id, { left: 30, top: 40, angle: 0, scaleX: 2, scaleY: 3 }));
        expect(harness.dispatched).toHaveLength(1);
        const step = harness.dispatched[0].steps[0];
        expect(step).toBeInstanceOf(UpdateObject);
        expect((step as UpdateObject).attrs).toEqual({ left: 30, top: 40, angle: 0, scaleX: 1, scaleY: 1, fontSize: 150 });
    });

    it('文本仅位移（scale 1）：fontSize 不变、只读回几何', () => {
        const textObj: TextObject = createTextObject('hi', 10, 20);
        const state = new EditorState({ doc: { background: null, objects: [textObj] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        harness.fireModified(fakeFabricObject(textObj.id, { left: 15, top: 25, angle: 0, scaleX: 1, scaleY: 1 }));
        const step = harness.dispatched[0].steps[0] as UpdateObject;
        expect(step.attrs).toEqual({ left: 15, top: 25, angle: 0, scaleX: 1, scaleY: 1, fontSize: 50 });
    });

    it('原地点击控制点（无任何变化）：不产生空历史', () => {
        const textObj: TextObject = createTextObject('hi', 10, 20);
        const state = new EditorState({ doc: { background: null, objects: [textObj] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        harness.fireModified(fakeFabricObject(textObj.id, { left: 10, top: 20, angle: 0, scaleX: 1, scaleY: 1 }));
        expect(harness.dispatched).toHaveLength(0);
    });
});
