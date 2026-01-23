import { describe, expect, it } from 'vitest';
import { computeFitScale } from './fabric-renderer';

/**
 * computeFitScale（容器 resize refit 的核心口径）：fit 盒 = min(cssMax, 画布实际尺寸)。
 * 背景（任务 #9）：cssMax（700×400）只是「最大显示尺寸」上限；视口缩窄（如 960px 窗口
 * 下画布区 672px < 700px）时若仍按 cssMax fit，zoom=1 的图像会溢出画布可见区域，
 * 右侧被面板遮挡。画布实际尺寸参与取 min 后，容器 resize → notifyResize 即完成 refit
 * （zoom/pan 语义不变，backstore 1:1 不拉伸）。
 */
describe('computeFitScale', () => {
    it('画布比 cssMax 宽：按 cssMax 上限 fit（现状语义不变）', () => {
        // 图 1400×800，cssMax 700×400 → 0.5；画布 1000×600 不参与
        expect(computeFitScale(700, 400, 1000, 600, 1400, 800)).toBe(0.5);
    });

    it('画布比 cssMax 窄：按画布实际尺寸收缩（refit 修复点）', () => {
        // 960px 视口场景：画布区 672×400 < cssMax 700×400 → fit 672/1400
        expect(computeFitScale(700, 400, 672, 400, 1400, 800)).toBe(672 / 1400);
    });

    it('高度轴更严格时按高度收缩', () => {
        // 画布 700×300：高 300/800 = 0.375 < 宽 700/1400 = 0.5
        expect(computeFitScale(700, 400, 700, 300, 1400, 800)).toBe(0.375);
    });

    it('画布尺寸未测量（≤ 0）：该轴回退 cssMax', () => {
        expect(computeFitScale(700, 400, 0, 0, 1400, 800)).toBe(0.5);
        // 宽已测（672 < 700）、高未测 → 宽轴 672/1400 = 0.48 生效
        expect(computeFitScale(700, 400, 672, 0, 1400, 800)).toBe(0.48);
    });

    it('图比 fit 盒小：不放大（上限 1）', () => {
        expect(computeFitScale(700, 400, 1000, 600, 400, 300)).toBe(1);
        // 画布极窄时仍收缩（上限不妨碍缩小）
        expect(computeFitScale(700, 400, 200, 600, 400, 300)).toBe(0.5);
    });

    it('cssMax 变化（resizeCanvasDimension）仍生效：fit 盒随 cssMax 更新', () => {
        // cssMax 调到 500×300、画布 672×400 → fit 盒 500×300 → 500/1400 ≈ 0.357（宽轴更严）
        expect(computeFitScale(500, 300, 672, 400, 1400, 800)).toBe(500 / 1400);
    });
});
