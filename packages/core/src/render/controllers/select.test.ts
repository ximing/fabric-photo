import type { Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { PathObject, ShapeObject, TextObject } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { UpdateObject } from '../../steps/object-steps';
import type { Transaction } from '../../transform/transaction';
import type { ControllerContext } from './controller';
import { SelectController } from './select';
import { createTextObject } from './text';

type ModifiedHandler = (event: { target: unknown }) => void;

/** node 环境下的 fake canvas：仅捕获 object:moving/object:modified 处理器（selection 事件本测试不触发）。 */
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
        },
        fireMoving: (target: unknown): void => {
            handlers.get('object:moving')?.({ target });
        }
    };
}

/** 伪 fabric 对象：object:modified 读回只需几何字段 + flip 标志 + data.fpId。 */
function fakeFabricObject(
    fpId: string,
    geometry: { left: number; top: number; angle: number; scaleX: number; scaleY: number; flipX?: boolean; flipY?: boolean }
) {
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

describe('SelectController flip（负 scale）保持', () => {
    /** state 中已水平翻转（scaleX = -1）的 rect。 */
    function flippedRect(): ShapeObject {
        return {
            id: 'rect1',
            kind: 'shape',
            shapeType: 'rect',
            left: 10,
            top: 20,
            angle: 0,
            scaleX: -1,
            scaleY: 1,
            width: 100,
            height: 50,
            fill: '#000000',
            stroke: '',
            strokeWidth: 0
        };
    }

    it('shape 缩放提交：幅度折算进宽高，翻转符号保留为 -1', () => {
        const rect = flippedRect();
        const state = new EditorState({ doc: { background: null, objects: [rect] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        // fabric 归一化：scale 恒正、翻转在 flipX；用户拖宽到 1.5 倍
        harness.fireModified(fakeFabricObject(rect.id, { left: 10, top: 20, angle: 0, scaleX: 1.5, scaleY: 1, flipX: true }));
        expect(harness.dispatched).toHaveLength(1);
        const step = harness.dispatched[0].steps[0] as UpdateObject;
        expect(step).toBeInstanceOf(UpdateObject);
        expect(step.attrs).toEqual({ left: 10, top: 20, angle: 0, width: 150, height: 50, scaleX: -1, scaleY: 1 });
    });

    it('已翻转对象原地 modified（fabric 表示与 state 一致）：不产生空历史', () => {
        const rect = flippedRect();
        const state = new EditorState({ doc: { background: null, objects: [rect] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        // 修复前：回读丢 flip → committed scaleX=+1 ≠ state -1 → 会误产一笔擦除翻转的历史
        harness.fireModified(fakeFabricObject(rect.id, { left: 10, top: 20, angle: 0, scaleX: 1, scaleY: 1, flipX: true }));
        expect(harness.dispatched).toHaveLength(0);
    });

    it('geometry-only kind（path）回读合并 flip 符号', () => {
        const pathObj: PathObject = {
            id: 'path1',
            kind: 'path',
            tool: 'freedraw',
            path: 'M 0 0 L 10 10',
            stroke: '#000000',
            strokeWidth: 2,
            fill: '',
            left: 10,
            top: 20,
            angle: 0,
            scaleX: 1,
            scaleY: -2
        };
        const state = new EditorState({ doc: { background: null, objects: [pathObj] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        harness.fireModified(fakeFabricObject(pathObj.id, { left: 15, top: 25, angle: 0, scaleX: 1, scaleY: 2, flipY: true }));
        expect(harness.dispatched).toHaveLength(1);
        const step = harness.dispatched[0].steps[0] as UpdateObject;
        expect(step.attrs).toEqual({ left: 15, top: 25, angle: 0, scaleX: 1, scaleY: -2 });
    });

    it('text 缩放提交：fontSize 折算 + 翻转符号保留', () => {
        const textObj: TextObject = createTextObject('hi', 10, 20); // fontSize 50
        const state = new EditorState({ doc: { background: null, objects: [textObj] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        harness.fireModified(fakeFabricObject(textObj.id, { left: 30, top: 40, angle: 0, scaleX: 2, scaleY: 3, flipX: true }));
        const step = harness.dispatched[0].steps[0] as UpdateObject;
        expect(step.attrs).toEqual({ left: 30, top: 40, angle: 0, scaleX: -1, scaleY: 1, fontSize: 150 });
    });

    it('object:moving 期间 fabric flip 标志与 state 脱节时按 state 重新施加', () => {
        const rect = flippedRect(); // state: scaleX=-1, scaleY=1
        const state = new EditorState({ doc: { background: null, objects: [rect] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        const set = vi.fn(function (this: Record<string, unknown>, attrs: Record<string, unknown>) {
            Object.assign(this, attrs);
        });
        const target = { flipX: false, flipY: false, data: { fpId: rect.id }, set };
        harness.fireMoving(target);
        expect(set).toHaveBeenCalledWith({ flipX: true, flipY: false });
        expect(target.flipX).toBe(true);
        expect(target.flipY).toBe(false);
    });

    it('object:moving 期间 fabric flip 标志与 state 一致时不改写（幂等，无多余 set）', () => {
        const rect = flippedRect();
        const state = new EditorState({ doc: { background: null, objects: [rect] } });
        const harness = makeHarness(state);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        const set = vi.fn();
        harness.fireMoving({ flipX: true, flipY: false, data: { fpId: rect.id }, set });
        expect(set).not.toHaveBeenCalled();
    });
});
