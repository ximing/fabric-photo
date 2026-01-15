import { describe, expect, it } from 'vitest';
import { fabricToScale, scaleToFabric } from './object-factory';

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
