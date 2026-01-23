import { describe, expect, it } from 'vitest';
import { SNAP_THRESHOLD_PX, computeSnap, type SnapBox } from './snapping';

// computeSnap 纯函数：命中/不命中/多目标取最近/阈值边界/参考线输出（node 无头）

const CENTER = { x: 400, y: 300 };

function box(left: number, top: number, width = 100, height = 80): SnapBox {
    return { left, top, width, height };
}

describe('computeSnap', () => {
    it('阈值常量 = 5 屏幕像素', () => {
        expect(SNAP_THRESHOLD_PX).toBe(5);
    });

    it('不命中：所有边距目标线均超阈值，dx/dy 为 0 且无参考线', () => {
        const result = computeSnap(box(0, 0), [box(300, 300)], CENTER, 5);
        expect(result.dx).toBe(0);
        expect(result.dy).toBe(0);
        expect(result.guides).toEqual([]);
    });

    it('命中目标左边线：被拖盒左边贴近目标左边，修正到对齐位并出竖直参考线', () => {
        // 被拖左边 103，目标左边 100 → dx = -3
        const result = computeSnap(box(103, 500), [box(100, 200)], null, 5);
        expect(result.dx).toBe(-3);
        expect(result.dy).toBe(0);
        expect(result.guides).toEqual([
            // 参考线范围覆盖被拖盒（500..580）与目标盒（200..280）
            { orientation: 'vertical', position: 100, from: 200, to: 580 }
        ]);
    });

    it('命中目标中心线与右边线：centerX/right 同样参与', () => {
        // centerX：被拖中心 148 + w/2=50 → 198，目标中心 200 → dx = +2
        const centerHit = computeSnap(box(148, 500, 100), [box(100, 200, 200)], null, 5);
        expect(centerHit.dx).toBe(2);
        // right：被拖右边 304，目标右边 300 → dx = -4
        const rightHit = computeSnap(box(204, 500, 100), [box(100, 200, 200)], null, 5);
        expect(rightHit.dx).toBe(-4);
    });

    it('垂直方向命中：顶/底边与 horizontal 参考线（范围为 x 轴并集）', () => {
        // 被拖顶 297，目标顶 300 → dy = +3；横向范围 = [min(403,100), max(503,200)]
        const result = computeSnap(box(403, 297), [box(100, 300, 100, 50)], null, 5);
        expect(result.dx).toBe(0);
        expect(result.dy).toBe(3);
        expect(result.guides).toEqual([{ orientation: 'horizontal', position: 300, from: 100, to: 503 }]);
    });

    it('命中画布中心线（无目标盒）：参考线范围只覆盖被拖盒', () => {
        // 被拖中心 x = 348+50 = 398，画布中心 400 → dx = +2
        const result = computeSnap(box(348, 10), [], CENTER, 5);
        expect(result.dx).toBe(2);
        expect(result.guides).toEqual([{ orientation: 'vertical', position: 400, from: 10, to: 90 }]);
    });

    it('多目标取最近：两个目标线都在阈值内时选 |delta| 更小者', () => {
        // 被拖左边 101：目标 A 左边 100（delta -1），目标 B 左边 104（delta +3）→ 取 -1
        const result = computeSnap(box(101, 500), [box(100, 200), box(104, 700)], null, 5);
        expect(result.dx).toBe(-1);
        expect(result.guides[0].position).toBe(100);
    });

    it('同一被拖盒多条边同时贴近不同目标线时取最近（中心线更近则压过边线）', () => {
        // 被拖盒 left=196 w=100：左边距目标左边 200 差 4；中心 246 距目标中心 245 差 1 → 取中心
        const result = computeSnap(box(196, 500), [box(200, 200, 90)], null, 5);
        expect(result.dx).toBe(-1);
        expect(result.guides[0].position).toBe(245);
    });

    it('阈值边界：|delta| == threshold 命中，threshold + ε 不命中', () => {
        const atBoundary = computeSnap(box(105, 500), [box(100, 200)], null, 5);
        expect(atBoundary.dx).toBe(-5);
        const beyond = computeSnap(box(105.5, 500), [box(100, 200)], null, 5);
        expect(beyond.dx).toBe(0);
        expect(beyond.guides).toEqual([]);
    });

    it('两轴独立：可同时命中 x 与 y，各出一条参考线', () => {
        const result = computeSnap(box(103, 298), [box(100, 300)], null, 5);
        expect(result.dx).toBe(-3);
        expect(result.dy).toBe(2);
        expect(result.guides.map((g) => g.orientation)).toEqual(['vertical', 'horizontal']);
    });

    it('恰好对齐（delta 0）视为命中：不出修正量但仍出参考线', () => {
        const result = computeSnap(box(100, 500), [box(100, 200)], null, 5);
        expect(result.dx).toBe(0);
        expect(result.guides).toEqual([{ orientation: 'vertical', position: 100, from: 200, to: 580 }]);
    });

    it('空目标且无画布中心：永不命中', () => {
        const result = computeSnap(box(0, 0), [], null, 5);
        expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
    });
});
