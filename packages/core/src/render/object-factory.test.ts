import { describe, expect, it } from 'vitest';
import type { ShapeObject } from '../model/doc';
import { applyRotateSnap, createFabricObject, fabricToScale, ROTATE_SNAP_ANGLE, scaleToFabric } from './object-factory';

/**
 * 负 scale（翻转）↔ fabric { abs(scale), flip } 幂等换算的纯函数测试。
 * 背景：fabric 6.9.1 的 _set 对负 scale 是「toggle flip 并取绝对值」，
 * 投影必须绕开该路径，否则同一 state 连续同步会让 flipX 震荡。
 */
describe('scaleToFabric（state 带符号 scale → fabric 幂等投影）', () => {
    it('正 scale：原样通过，flip 标志为 false', () => {
        expect(scaleToFabric(1, 2.5)).toEqual({ scaleX: 1, scaleY: 2.5, flipX: false, flipY: false });
    });

    it('负 scale：取绝对值，符号入 flip 标志', () => {
        expect(scaleToFabric(-1, -2.5)).toEqual({ scaleX: 1, scaleY: 2.5, flipX: true, flipY: true });
    });

    it('混合符号：两轴独立换算', () => {
        expect(scaleToFabric(-3, 4)).toEqual({ scaleX: 3, scaleY: 4, flipX: true, flipY: false });
        expect(scaleToFabric(3, -4)).toEqual({ scaleX: 3, scaleY: 4, flipX: false, flipY: true });
    });

    it('幂等：同一负 scale state 多次投影结果完全相同（模拟 updateFabricObject 重入，flip 不震荡）', () => {
        const first = scaleToFabric(-1, -1);
        for (let i = 0; i < 10; i++) {
            expect(scaleToFabric(-1, -1)).toEqual(first);
        }
    });

    it('0 不视为翻转', () => {
        expect(scaleToFabric(0, 0)).toEqual({ scaleX: 0, scaleY: 0, flipX: false, flipY: false });
    });
});

describe('fabricToScale（fabric 归一化 { scale, flip } → state 带符号 scale）', () => {
    it('flip false：原样通过', () => {
        expect(fabricToScale(2, false)).toBe(2);
    });

    it('flip true：取负', () => {
        expect(fabricToScale(2, true)).toBe(-2);
    });
});

describe('往返守恒', () => {
    it('fabricToScale(scaleToFabric(s)) === s（正/负/小数/0）', () => {
        const cases: Array<[number, number]> = [
            [1, 1],
            [-1, -1],
            [2.5, 0.75],
            [-2.5, 3],
            [3, -0.75],
            [0, 0]
        ];
        for (const [sx, sy] of cases) {
            const projected = scaleToFabric(sx, sy);
            expect(fabricToScale(projected.scaleX, projected.flipX)).toBe(sx);
            expect(fabricToScale(projected.scaleY, projected.flipY)).toBe(sy);
        }
    });
});

/**
 * Shift 旋转 15° 吸附接线：createFabricObject 产出的对象 snapAngle=15，
 * 且 mtr actionHandler 被包装（未按 Shift 时临时清零 snapAngle，按住 Shift 才吸附）。
 */
describe('applyRotateSnap（Shift 旋转 15° 吸附）', () => {
    const rectObject: ShapeObject = {
        id: 's1',
        kind: 'shape',
        shapeType: 'rect',
        left: 10,
        top: 20,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 100,
        height: 50,
        fill: 'transparent',
        stroke: '#ff0000',
        strokeWidth: 4
    };

    it('吸附倍角为 15°', () => {
        expect(ROTATE_SNAP_ANGLE).toBe(15);
    });

    it('createFabricObject 产出的对象 snapAngle=15', () => {
        const fObj = createFabricObject(rectObject);
        expect(fObj.snapAngle).toBe(15);
    });

    it('未按 Shift：actionHandler 执行期间 snapAngle 临时清零（自由旋转），结束后恢复 15', () => {
        const fObj = createFabricObject(rectObject);
        const wrapped = fObj.controls.mtr.actionHandler;
        // 探针 target：baseHandler（wrapWithFixedAnchor 链）第一步就调用
        // getRelativeCenterPoint，借此记录「baseHandler 看到的 snapAngle」并抛错中止
        //（同时验证包装层的 finally 恢复路径）
        const observed: Array<number | undefined> = [];
        const fakeTarget = {
            snapAngle: 15,
            getRelativeCenterPoint: () => {
                observed.push(fakeTarget.snapAngle);
                throw new Error('probe-stop');
            }
        };
        expect(() =>
            // @ts-expect-error 探针 target 不是完整 FabricObject
            wrapped({ shiftKey: false }, { target: fakeTarget }, 0, 0)
        ).toThrow('probe-stop');
        expect(observed).toEqual([0]); // 未按 Shift：baseHandler 看到 snapAngle=0
        expect(fakeTarget.snapAngle).toBe(15); // 结束后恢复
    });

    it('按住 Shift：baseHandler 看到原值 snapAngle=15（吸附生效）', () => {
        const fObj = createFabricObject(rectObject);
        const mtr = fObj.controls.mtr;
        const wrapped = mtr.actionHandler;
        const observed: Array<number | undefined> = [];
        const fakeTarget = {
            snapAngle: 15,
            getRelativeCenterPoint: () => {
                observed.push(fakeTarget.snapAngle);
                throw new Error('probe-stop');
            }
        };
        expect(() =>
            // @ts-expect-error 探针 target 不是完整 FabricObject
            wrapped({ shiftKey: true }, { target: fakeTarget }, 0, 0)
        ).toThrow('probe-stop');
        expect(observed).toEqual([15]);
    });

    it('重复接线安全：二次 applyRotateSnap 后 snapAngle 仍为 15', () => {
        const fObj = createFabricObject(rectObject);
        applyRotateSnap(fObj);
        expect(fObj.snapAngle).toBe(15);
    });
});
