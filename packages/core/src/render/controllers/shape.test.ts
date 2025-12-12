import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeObject } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { AddObject } from '../../steps/object-steps';
import type { Transaction } from '../../transform/transaction';
import type { ControllerContext } from './controller';
import { ShapeController } from './shape';

type MouseHandler = (event: { scenePoint: { x: number; y: number } }) => void;
type KeyHandler = (event: { key: string }) => void;

/**
 * node 环境下为 ShapeController 准备 fake canvas 与 document 桩：
 * canvas 捕获 mouse:down/move/up 处理器；document 捕获 keydown/keyup 处理器，
 * fireKey 直接调用已注册的键盘监听（等价 document 分发）。
 */
function makeHarness() {
    const mouseHandlers = new Map<string, MouseHandler>();
    const docListeners = new Map<string, Set<KeyHandler>>();
    const canvas = {
        defaultCursor: '',
        on: vi.fn((name: string, fn: MouseHandler) => {
            mouseHandlers.set(name, fn);
        }),
        off: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        requestRenderAll: vi.fn()
    };
    vi.stubGlobal('document', {
        addEventListener: (name: string, fn: KeyHandler) => {
            let set = docListeners.get(name);
            if (set === undefined) {
                set = new Set();
                docListeners.set(name, set);
            }
            set.add(fn);
        },
        removeEventListener: (name: string, fn: KeyHandler) => {
            docListeners.get(name)?.delete(fn);
        }
    });
    const dispatched: Transaction[] = [];
    const ctx: ControllerContext = {
        canvas: canvas as unknown as Canvas,
        getState: () => new EditorState(),
        dispatch: (tr) => {
            dispatched.push(tr);
        },
        fire: vi.fn()
    };
    const fireMouse = (name: string, x: number, y: number): void => {
        mouseHandlers.get(name)?.({ scenePoint: { x, y } });
    };
    const fireKey = (name: string, key: string): void => {
        for (const fn of docListeners.get(name) ?? []) {
            fn({ key });
        }
    };
    return { ctx, dispatched, fireMouse, fireKey };
}

function lastAddedObject(dispatched: Transaction[]): ShapeObject {
    const tr = dispatched[dispatched.length - 1];
    const step = tr.steps[0];
    expect(step).toBeInstanceOf(AddObject);
    return (step as AddObject).object as ShapeObject;
}

describe('ShapeController', () => {
    let harness: ReturnType<typeof makeHarness>;
    let controller: ShapeController;

    beforeEach(() => {
        vi.unstubAllGlobals();
        harness = makeHarness();
        controller = new ShapeController();
        controller.activate(harness.ctx);
    });

    function drag(x1: number, y1: number, x2: number, y2: number, shift = false): void {
        harness.fireMouse('mouse:down', x1, y1);
        if (shift) {
            harness.fireKey('keydown', 'Shift');
        }
        harness.fireMouse('mouse:move', x2, y2);
        harness.fireMouse('mouse:up', x2, y2);
        if (shift) {
            harness.fireKey('keyup', 'Shift');
        }
    }

    it('Shift 非 45° 拖（右上方）锚定起点角：短轴方向不越过起点线', () => {
        // 起点 (100,100) → (150,80)：dx=50, dy=-20，等比 width=height=50；
        // 旧 isRegular 语义 box y∈[50,100]（锚在起点），而非 y∈[80,130]（min 锚）
        drag(100, 100, 150, 80, true);
        const obj = lastAddedObject(harness.dispatched);
        expect(obj).toMatchObject({ shapeType: 'rect', left: 100, top: 50, width: 50, height: 50 });
    });

    it('Shift 反向拖（左下方）锚定起点角', () => {
        // 起点 (100,100) → (70,140)：dx=-30, dy=40，等比 width=height=40；
        // box x∈[60,100], y∈[100,140]
        drag(100, 100, 70, 140, true);
        const obj = lastAddedObject(harness.dispatched);
        expect(obj).toMatchObject({ left: 60, top: 100, width: 40, height: 40 });
    });

    it('非 Shift 反向拖退化为 min 锚（与修复前行为一致）', () => {
        drag(100, 100, 50, 60);
        const obj = lastAddedObject(harness.dispatched);
        expect(obj).toMatchObject({ left: 50, top: 60, width: 50, height: 40 });
    });

    it('Shift 拖出正圆（width===height）且锚定起点角', () => {
        controller.setShape('circle');
        drag(100, 100, 160, 130, true); // dx=60, dy=30 → 等比 60
        const obj = lastAddedObject(harness.dispatched);
        expect(obj).toMatchObject({ shapeType: 'circle', left: 100, top: 100, width: 60, height: 60 });
    });

    it('Shift triangle 高 = √3/2·宽，锚定起点角', () => {
        controller.setShape('triangle');
        drag(100, 100, 180, 110, true); // dx=80, dy=10 → 宽 80，高 80·√3/2
        const obj = lastAddedObject(harness.dispatched);
        expect(obj).toMatchObject({ shapeType: 'triangle', left: 100, top: 100, width: 80 });
        expect(obj.height).toBeCloseTo((Math.sqrt(3) / 2) * 80, 10);
    });

    it('原地点击（宽高均 0）不落对象', () => {
        drag(100, 100, 100, 100);
        expect(harness.dispatched).toHaveLength(0);
    });
});
