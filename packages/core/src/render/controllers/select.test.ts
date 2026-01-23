import type { Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { MosaicObject, PathObject, ShapeObject, TextObject } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { UpdateObject } from '../../steps/object-steps';
import type { Transaction } from '../../transform/transaction';
import type { ControllerContext } from './controller';
import { SelectController } from './select';
import { createTextObject } from './text';

type CanvasEventHandler = (event: { target?: unknown; ctx?: unknown }) => void;

/** node 环境下的 fake canvas：仅捕获 object:moving/object:modified 处理器（selection 事件本测试不触发）。 */
function makeHarness(state: EditorState, canvasObjects: unknown[] = []) {
    const handlers = new Map<string, CanvasEventHandler>();
    const canvas = {
        on: vi.fn((name: string, fn: CanvasEventHandler) => {
            handlers.set(name, fn);
        }),
        off: vi.fn(),
        // 拖拽吸附快照用：canvasObjects 为目标盒来源；单位 vpt（zoom 1）
        getObjects: () => canvasObjects,
        viewportTransform: [1, 0, 0, 1, 0, 0]
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
        },
        fireAfterRender: (ctx2d: unknown): void => {
            handlers.get('after:render')?.({ ctx: ctx2d });
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
        const target = {
            flipX: false,
            flipY: false,
            data: { fpId: rect.id },
            set,
            getBoundingRect: () => ({ left: 0, top: 0, width: 0, height: 0 })
        };
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
        // 无吸附目标（空画布）→ computeSnap 不命中 → 不会调 set 做位置修正
        harness.fireMoving({
            flipX: true,
            flipY: false,
            data: { fpId: rect.id },
            set,
            getBoundingRect: () => ({ left: 0, top: 0, width: 0, height: 0 })
        });
        expect(set).not.toHaveBeenCalled();
    });
});

describe('SelectController 拖拽吸附（B4-BUG-1：修正基于当前 raw 位置，提交精确贴合吸附线）', () => {
    /** 静态目标 rect：bbox {200,100,100,50} → 竖线 x = 200/250/300，横线 y = 100/125/150。 */
    function staticRect(): ShapeObject {
        return {
            id: 'static1',
            kind: 'shape',
            shapeType: 'rect',
            left: 200,
            top: 100,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            width: 100,
            height: 50,
            fill: '#000000',
            stroke: '',
            strokeWidth: 0
        };
    }

    function draggedRect(left: number, top: number): ShapeObject {
        return {
            id: 'drag1',
            kind: 'shape',
            shapeType: 'rect',
            left,
            top,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            width: 80,
            height: 40,
            fill: '#000000',
            stroke: '',
            strokeWidth: 0
        };
    }

    /** 静态目标的 fabric 替身：快照只读 getBoundingRect + data.fpId（静止对象 aCoords 不陈旧）。 */
    function fakeStaticTarget(fpId: string, box: { left: number; top: number; width: number; height: number }) {
        return { data: { fpId }, getBoundingRect: () => ({ ...box }) };
    }

    /**
     * 被拖对象的 fabric 替身，忠实模拟 aCoords 一帧延迟：
     * getBoundingRect 读 aCoordsBox；只有 setCoords()（render 或吸附修正后）才按当前
     * left/top 重算——即 object:moving 里 getBoundingRect 拿到的是上一帧位置。
     * 修复后的实现不得再用它取被拖盒。
     */
    function fakeDraggedTarget(fpId: string, initial: { left: number; top: number; width: number; height: number }, centerOrigin = false) {
        return {
            left: initial.left,
            top: initial.top,
            width: initial.width,
            height: initial.height,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            flipX: false,
            flipY: false,
            originX: centerOrigin ? 'center' : 'left',
            originY: centerOrigin ? 'center' : 'top',
            data: { fpId },
            aCoordsBox: { ...initial },
            set(attrs: Record<string, unknown>): void {
                Object.assign(this, attrs);
            },
            setCoords(): void {
                const width = this.width * this.scaleX;
                const height = this.height * this.scaleY;
                this.aCoordsBox = {
                    left: this.originX === 'center' ? this.left - width / 2 : this.left,
                    top: this.originY === 'center' ? this.top - height / 2 : this.top,
                    width,
                    height
                };
            },
            getBoundingRect(): { left: number; top: number; width: number; height: number } {
                return this.aCoordsBox;
            }
        };
    }

    /** 模拟 fabric 拖拽一帧：raw 指针直改 left/top（aCoords 保持上一帧），再 fire moving。 */
    function moveFrame(target: { left: number; top: number }, left: number, top: number, fire: () => void): void {
        target.left = left;
        target.top = top;
        fire();
    }

    it('连续 moving 序列：每帧修正都基于当前 raw 位置，命中即精确落在吸附线（无一帧延迟）', () => {
        const staticObj = staticRect();
        const dragObj = draggedRect(0, 300);
        const state = new EditorState({ doc: { background: null, objects: [staticObj, dragObj] } });
        const harness = makeHarness(state, [fakeStaticTarget(staticObj.id, { left: 200, top: 100, width: 100, height: 50 })]);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        // aCoords 初始停在 left=0：模拟从远处开始拖拽、尚未 render 到新位置
        const target = fakeDraggedTarget(dragObj.id, { left: 0, top: 300, width: 80, height: 40 });

        // 远离阈值：不修正
        moveFrame(target, 150, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(150);
        moveFrame(target, 180, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(180);

        // 进入阈值（|200-196|=4 ≤ 5）：左边缘吸附到 x=200。
        // 旧实现此处 aCoords 仍停在 180（上一帧）→ 不修正；修复后必须精确落 200。
        moveFrame(target, 196, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(200);

        // 上一帧修正后 aCoords=200；本帧 raw=203。旧实现拿 aCoords 算 delta=0 → 不修正，
        // 提交值滞留 203；修复后重新基于 raw 203 算 delta=-3 → 精确回到 200（无振荡）。
        moveFrame(target, 203, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(200);

        moveFrame(target, 197, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(200);

        // 越过阈值：raw=230 时三条边（230/270/310）距所有竖线（200/250/300）均 > 5 → 脱吸跟随
        moveFrame(target, 230, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(230);
    });

    it('快速接近目标（单帧大位移进入阈值）也立即修正', () => {
        const staticObj = staticRect();
        const dragObj = draggedRect(0, 300);
        const state = new EditorState({ doc: { background: null, objects: [staticObj, dragObj] } });
        const harness = makeHarness(state, [fakeStaticTarget(staticObj.id, { left: 200, top: 100, width: 100, height: 50 })]);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        const target = fakeDraggedTarget(dragObj.id, { left: 0, top: 300, width: 80, height: 40 });
        // 一帧从 0 跳到 199：aCoords 停在 0，旧实现完全错过修正
        moveFrame(target, 199, 300, () => harness.fireMoving(target));
        expect(target.left).toBe(200);
    });

    it('松手提交（object:modified）的位置精确等于吸附线', () => {
        const staticObj = staticRect();
        const dragObj = draggedRect(0, 300);
        const state = new EditorState({ doc: { background: null, objects: [staticObj, dragObj] } });
        const harness = makeHarness(state, [fakeStaticTarget(staticObj.id, { left: 200, top: 100, width: 100, height: 50 })]);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        const target = fakeDraggedTarget(dragObj.id, { left: 0, top: 300, width: 80, height: 40 });
        moveFrame(target, 197, 302, () => harness.fireMoving(target)); // x 吸附到 200；y=302 不在任何横线阈值内
        expect(target.left).toBe(200);
        expect(target.top).toBe(302);

        harness.fireModified(target);
        expect(harness.dispatched).toHaveLength(1);
        const step = harness.dispatched[0].steps[0] as UpdateObject;
        expect(step).toBeInstanceOf(UpdateObject);
        // shape 提交折算宽高；几何必须精确落在吸附线上（误差 0）
        expect(step.attrs).toEqual({ left: 200, top: 302, angle: 0, width: 80, height: 40, scaleX: 1, scaleY: 1 });
    });

    it('参考线指向当前实际吸附的线（after:render 画线位置 = 吸附线）', () => {
        const staticObj = staticRect();
        const dragObj = draggedRect(0, 300);
        const state = new EditorState({ doc: { background: null, objects: [staticObj, dragObj] } });
        const harness = makeHarness(state, [fakeStaticTarget(staticObj.id, { left: 200, top: 100, width: 100, height: 50 })]);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        const target = fakeDraggedTarget(dragObj.id, { left: 0, top: 300, width: 80, height: 40 });
        moveFrame(target, 203, 300, () => harness.fireMoving(target)); // 修正回 200
        expect(target.left).toBe(200);

        const ctx2d = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            strokeStyle: '',
            lineWidth: 0
        };
        harness.fireAfterRender(ctx2d);
        // 单位 vpt：竖线 x=200，范围覆盖被拖盒（300..340）与目标盒（100..150）→ 100..340
        expect(ctx2d.moveTo).toHaveBeenCalledWith(200, 100);
        expect(ctx2d.lineTo).toHaveBeenCalledWith(200, 340);
    });

    it('center origin（mosaic）被拖盒按中心折算左上角后再吸附', () => {
        const staticObj = staticRect();
        const mosaicObj: MosaicObject = {
            id: 'mosaic1',
            kind: 'mosaic',
            left: 0,
            top: 300,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            width: 100,
            height: 40,
            rects: []
        };
        const state = new EditorState({ doc: { background: null, objects: [staticObj, mosaicObj] } });
        const harness = makeHarness(state, [fakeStaticTarget(staticObj.id, { left: 200, top: 100, width: 100, height: 50 })]);
        const controller = new SelectController();
        controller.activate(harness.ctx);

        // center origin：left=245 → 盒左缘 195，距线 200 为 5（阈值内）→ 左缘贴 200，left=250
        const target = fakeDraggedTarget(mosaicObj.id, { left: 245, top: 300, width: 100, height: 40 }, true);
        harness.fireMoving(target);
        expect(target.left).toBe(250);
    });
});
