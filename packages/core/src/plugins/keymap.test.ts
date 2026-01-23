import { describe, expect, it } from 'vitest';
import { stepZoom, ZOOM_STEP } from './keymap';
import { ZOOM_MAX, ZOOM_MIN } from '../state/editor-state';

/**
 * 缩放快捷键的步进计算（纯函数）测试：步长与 react 顶栏 +/- 按钮一致（0.2），
 * clamp 走 [ZOOM_MIN, ZOOM_MAX]（0.05–8）。DOM 接线（Mod+= / Mod+- / Mod+0）
 * 无 node 侧测试惯例，靠浏览器验证。
 */
describe('stepZoom（Mod+= / Mod+- 步进缩放）', () => {
    it('步长为 0.2（与顶栏按钮一致）', () => {
        expect(ZOOM_STEP).toBe(0.2);
    });

    it('正向步进：1 → 1.2 → 1.4', () => {
        expect(stepZoom(1, ZOOM_STEP)).toBe(1.2);
        expect(stepZoom(1.2, ZOOM_STEP)).toBe(1.4);
    });

    it('负向步进：1 → 0.8 → 0.6', () => {
        expect(stepZoom(1, -ZOOM_STEP)).toBe(0.8);
        expect(stepZoom(0.8, -ZOOM_STEP)).toBeCloseTo(0.6);
    });

    it('clamp 下限：逼近 ZOOM_MIN 后不再下探', () => {
        expect(stepZoom(0.1, -ZOOM_STEP)).toBe(ZOOM_MIN);
        expect(stepZoom(ZOOM_MIN, -ZOOM_STEP)).toBe(ZOOM_MIN);
    });

    it('clamp 上限：逼近 ZOOM_MAX 后不再上探', () => {
        expect(stepZoom(7.95, ZOOM_STEP)).toBe(ZOOM_MAX);
        expect(stepZoom(ZOOM_MAX, ZOOM_STEP)).toBe(ZOOM_MAX);
    });
});
