import type { Canvas, TMat2D } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDoc, type BackgroundImage } from '../../model/doc';
import { EditorState } from '../../state/editor-state';
import { SetBackground } from '../../steps/doc-steps';
import { Transaction } from '../../transform/transaction';
import { Cropzone } from '../shapes/cropzone';
import type { ControllerContext } from './controller';
import { CropController } from './crop';

type MouseHandler = (event: {
    scenePoint: { x: number; y: number };
    target?: unknown;
    e?: unknown;
}) => void;
type KeyHandler = (event: { key: string }) => void;

const BG: BackgroundImage = { src: 'data:,bg', width: 1000, height: 800, name: 'demo', angle: 0 };

/**
 * node 环境下为 CropController 准备 fake canvas 与 document 桩（同 shape.test.ts 套路）：
 * canvas 捕获 mouse:down/move/up 处理器并记录 add/remove/setActiveObject/toDataURL/
 * setViewportTransform 调用；document 捕获 keydown/keyup（Shift 跟踪）。
 */
function makeHarness(bg: BackgroundImage | null = BG) {
    const mouseHandlers = new Map<string, MouseHandler>();
    const docListeners = new Map<string, Set<KeyHandler>>();
    const calls = {
        add: [] as unknown[],
        remove: [] as unknown[],
        setActiveObject: [] as unknown[],
        toDataURL: [] as unknown[],
        vpt: [] as TMat2D[]
    };
    const canvas = {
        defaultCursor: '',
        viewportTransform: [2, 0, 0, 2, 5, 5] as TMat2D,
        on: vi.fn((name: string, fn: MouseHandler) => {
            mouseHandlers.set(name, fn);
        }),
        off: vi.fn((name: string) => {
            mouseHandlers.delete(name);
        }),
        add: vi.fn((obj: unknown) => {
            calls.add.push(obj);
        }),
        remove: vi.fn((obj: unknown) => {
            calls.remove.push(obj);
        }),
        setActiveObject: vi.fn((obj: unknown) => {
            calls.setActiveObject.push(obj);
        }),
        requestRenderAll: vi.fn(),
        setViewportTransform: vi.fn((vpt: TMat2D) => {
            calls.vpt.push([...vpt] as TMat2D);
            canvas.viewportTransform = vpt;
        }),
        toDataURL: vi.fn((options: unknown) => {
            calls.toDataURL.push(options);
            return 'data:image/png;base64,CROP';
        })
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
    const state = new EditorState({ doc: createDoc(bg), mode: 'crop' });
    const dispatched: Transaction[] = [];
    const ctx: ControllerContext = {
        canvas: canvas as unknown as Canvas,
        getState: () => state,
        dispatch: (tr) => {
            dispatched.push(tr);
        },
        fire: vi.fn()
    };
    const fireMouse = (name: string, x: number, y: number, target?: unknown): void => {
        mouseHandlers.get(name)?.({ scenePoint: { x, y }, target });
    };
    const fireKey = (name: string, key: string): void => {
        for (const fn of docListeners.get(name) ?? []) {
            fn({ key });
        }
    };
    return { ctx, canvas, calls, dispatched, fireMouse, fireKey };
}

function addedCropzone(calls: { add: unknown[] }): Cropzone {
    expect(calls.add).toHaveLength(1);
    const cropzone = calls.add[0];
    expect(cropzone).toBeInstanceOf(Cropzone);
    return cropzone as Cropzone;
}

describe('CropController', () => {
    let harness: ReturnType<typeof makeHarness>;
    let controller: CropController;

    beforeEach(() => {
        vi.unstubAllGlobals();
        harness = makeHarness();
        controller = new CropController();
    });

    it('activate 创建 80% 裁剪框（距边 10%，doc 尺寸）并设为激活对象', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        expect(cropzone).toMatchObject({ left: 100, top: 80, width: 800, height: 640 });
        expect(cropzone.boundsWidth).toBe(1000);
        expect(cropzone.boundsHeight).toBe(800);
        expect(harness.calls.setActiveObject[0]).toBe(cropzone);
        expect(harness.canvas.defaultCursor).toBe('crosshair');
    });

    it('suppressCropzoneUI 后不创建裁剪框（startCropByBoundInfo 路径）', () => {
        controller.suppressCropzoneUI();
        controller.activate(harness.ctx);
        expect(harness.calls.add).toHaveLength(0);
        expect(harness.canvas.defaultCursor).toBe('crosshair');
    });

    it('无背景时不创建裁剪框', () => {
        const empty = makeHarness(null);
        new CropController().activate(empty.ctx);
        expect(empty.calls.add).toHaveLength(0);
    });

    it('拖空白重画：阈值内不动，超过 MOUSE_MOVE_THRESHOLD 重设矩形', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        harness.fireMouse('mouse:down', 500, 400);
        harness.fireMouse('mouse:move', 505, 404); // |dx|+|dy| = 9 <= 10
        expect(cropzone.left).toBe(100);
        harness.fireMouse('mouse:move', 700, 600);
        expect(cropzone).toMatchObject({ left: 500, top: 400, width: 200, height: 200 });
        harness.fireMouse('mouse:up', 700, 600);
        expect(harness.calls.setActiveObject[1]).toBe(cropzone);
    });

    it('反向拖动 clamp 在背景范围内', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        harness.fireMouse('mouse:down', 500, 400);
        harness.fireMouse('mouse:move', -200, 9000); // 越界 → clamp 到 [0,0] / bg 边缘
        expect(cropzone).toMatchObject({ left: 0, top: 400, width: 500, height: 400 });
    });

    it('Shift 拖空白锁正方形并锚定起点角', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        harness.fireMouse('mouse:down', 500, 400);
        harness.fireKey('keydown', 'Shift');
        harness.fireMouse('mouse:move', 300, 300); // dx=-200, dy=-100 → 等比 200，锚起点
        expect(cropzone).toMatchObject({ left: 300, top: 200, width: 200, height: 200 });
        harness.fireKey('keyup', 'Shift');
        harness.fireMouse('mouse:move', 700, 450); // 非 Shift → 自由矩形
        expect(cropzone).toMatchObject({ left: 500, top: 400, width: 200, height: 50 });
    });

    it('getCropInfo 返回 cropzone 的 doc 矩形；无 cropzone 返回 undefined', () => {
        expect(controller.getCropInfo()).toBeUndefined();
        controller.activate(harness.ctx);
        expect(controller.getCropInfo()).toEqual({ left: 100, top: 80, width: 800, height: 640 });
    });

    it('applyCrop：cropzone 先移除 → identity vpt 导出 clamp 后矩形 → SetBackground + 回 normal（可撤销）', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        controller.applyCrop({ left: -50, top: 100, width: 2000, height: 400 });

        // cropzone 先于导出移除（遮罩不进导出图）
        expect(harness.calls.remove[0]).toBe(cropzone);
        const removeOrder = harness.canvas.remove.mock.invocationCallOrder[0];
        const exportOrder = harness.canvas.toDataURL.mock.invocationCallOrder[0];
        expect(removeOrder).toBeLessThan(exportOrder);

        // clamp 到背景范围；identity vpt 包裹（导出时 vpt 临时重置再恢复）
        expect(harness.calls.toDataURL[0]).toEqual({
            format: 'png',
            multiplier: 1,
            left: 0,
            top: 100,
            width: 1000,
            height: 400
        });
        expect(harness.calls.vpt[0]).toEqual([1, 0, 0, 1, 0, 0]);
        expect(harness.calls.vpt[harness.calls.vpt.length - 1]).toEqual([2, 0, 0, 2, 5, 5]);

        // SetBackground 可撤销 + mode 回 normal
        expect(harness.dispatched).toHaveLength(1);
        const tr = harness.dispatched[0];
        expect(tr.modeValue).toBe('normal');
        expect(tr.steps).toHaveLength(1);
        const step = tr.steps[0];
        expect(step).toBeInstanceOf(SetBackground);
        const next = harness.ctx.getState().apply(tr);
        expect(next.doc.background).toMatchObject({
            src: 'data:image/png;base64,CROP',
            width: 1000,
            height: 400,
            name: 'demo',
            angle: 0
        });
        // invert → 恢复原背景（对象清空语义由 doc-steps 测试覆盖）
        const restored = next.apply(new Transaction(next).addStep(step.invert()));
        expect(restored.doc.background).toEqual(BG);
    });

    it('applyCrop 矩形完全在背景外：仅回 normal，不落 SetBackground', () => {
        controller.activate(harness.ctx);
        controller.applyCrop({ left: 5000, top: 0, width: 100, height: 100 });
        expect(harness.calls.toDataURL).toHaveLength(0);
        expect(harness.dispatched).toHaveLength(1);
        expect(harness.dispatched[0].steps).toHaveLength(0);
        expect(harness.dispatched[0].modeValue).toBe('normal');
    });

    it('deactivate 移除 cropzone 并恢复光标', () => {
        controller.activate(harness.ctx);
        const cropzone = addedCropzone(harness.calls);
        controller.deactivate();
        expect(harness.calls.remove[0]).toBe(cropzone);
        expect(harness.canvas.defaultCursor).toBe('default');
        expect(controller.getCropInfo()).toBeUndefined();
    });
});

describe('Cropzone', () => {
    function makeCropzone(): Cropzone {
        return new Cropzone({ left: 100, top: 100, width: 200, height: 100, boundsWidth: 1000, boundsHeight: 800 });
    }

    it('isValid：left/top >= 0 且宽高 > 0（旧语义逐行移植）', () => {
        expect(makeCropzone().isValid()).toBe(true);
        expect(new Cropzone({ left: -1, top: 0, width: 10, height: 10 }).isValid()).toBe(false);
        expect(new Cropzone({ left: 0, top: 0, width: 0, height: 10 }).isValid()).toBe(false);
        expect(new Cropzone({ left: 0, top: 0, width: 10, height: 0 }).isValid()).toBe(false);
    });

    it('moving clamp 在背景范围内', () => {
        const cropzone = makeCropzone();
        cropzone.set({ left: -50, top: 9000 });
        cropzone.fire('moving', {} as never);
        expect(cropzone.left).toBe(0);
        expect(cropzone.top).toBe(800 - 100); // boundsHeight - height
    });

    it('scaling(br)：真实宽高落地且 scale 归 1，clamp 到背景边缘', () => {
        const cropzone = makeCropzone();
        cropzone.fire('scaling', {
            pointer: { x: 5000, y: 700 },
            transform: { corner: 'br' }
        } as never);
        expect(cropzone).toMatchObject({ left: 100, top: 100, width: 900, height: 600, scaleX: 1, scaleY: 1 });
    });

    it('scaling(tl)：左/上随指针收缩，右/下边缘不动', () => {
        const cropzone = makeCropzone();
        cropzone.fire('scaling', {
            pointer: { x: 50, y: 50 },
            transform: { corner: 'tl' }
        } as never);
        // right = 100+200 = 300，bottom = 100+100 = 200 → left 50/top 50，w 250，h 150
        expect(cropzone).toMatchObject({ left: 50, top: 50, width: 250, height: 150, scaleX: 1, scaleY: 1 });
    });
});
