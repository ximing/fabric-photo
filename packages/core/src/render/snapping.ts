/**
 * 拖拽吸附（智能参考线）纯计算模块：不依赖 fabric，node 无头可测。
 * select controller 只做 fabric 接线（快照目标、套用 dx/dy、按 guides 画线）。
 */

/** 吸附阈值（屏幕像素）；controller 按当前 vpt 缩放折算成 doc 距离传入。 */
export const SNAP_THRESHOLD_PX = 5;

/** doc 坐标系下的轴对齐矩形（left/top 为左上角）。 */
export interface SnapBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** 一条命中的参考线：vertical 为竖线（position = x），horizontal 为横线（position = y）；from/to 为线段在另一轴上的起止。 */
export interface SnapGuide {
    orientation: 'vertical' | 'horizontal';
    position: number;
    from: number;
    to: number;
}

export interface SnapResult {
    /** 命中时施加到被拖对象 left 的修正量；未命中为 0。 */
    dx: number;
    /** 命中时施加到被拖对象 top 的修正量；未命中为 0。 */
    dy: number;
    /** 命中的参考线（每轴至多一条，供渲染层直画，不进 state）。 */
    guides: SnapGuide[];
}

interface LineCandidate {
    pos: number;
    /** 产生该线的目标盒；null = 画布中心线（无目标盒，参考线范围只覆盖被拖盒）。 */
    box: SnapBox | null;
}

/**
 * 一轴上的吸附求解：被拖盒三条候选边 × 全部目标线，取 |delta| 最小且 ≤ threshold 者
 * （同距保留先命中者）。extentOf 取目标盒在垂直轴上的 [from, to] 用于参考线范围。
 */
function snapAxis(
    draggedEdges: readonly number[],
    lines: readonly LineCandidate[],
    threshold: number,
    draggedFrom: number,
    draggedTo: number,
    extentOf: (box: SnapBox) => readonly [number, number]
): { delta: number; position: number; from: number; to: number } | null {
    let best: { delta: number; position: number; from: number; to: number } | null = null;
    for (const edge of draggedEdges) {
        for (const line of lines) {
            const delta = line.pos - edge;
            if (Math.abs(delta) > threshold) {
                continue;
            }
            if (best !== null && Math.abs(delta) >= Math.abs(best.delta)) {
                continue; // 已有更近（或同距先到）的命中
            }
            const [targetFrom, targetTo] = line.box === null ? [draggedFrom, draggedTo] : extentOf(line.box);
            best = {
                delta,
                position: line.pos,
                from: Math.min(draggedFrom, targetFrom),
                to: Math.max(draggedTo, targetTo)
            };
        }
    }
    return best;
}

/**
 * 计算拖拽吸附：被拖盒（多选组拖动用组 bbox）对其他可见对象的
 * left/centerX/right 与 top/centerY/bottom 六线 + 画布水平/垂直中心线做阈值吸附。
 * 每轴独立取最近命中；返回位置修正量 dx/dy 与命中参考线（未命中轴不出线）。
 */
export function computeSnap(
    dragged: SnapBox,
    targets: readonly SnapBox[],
    canvasCenter: { x: number; y: number } | null,
    threshold: number
): SnapResult {
    const xLines: LineCandidate[] = [];
    const yLines: LineCandidate[] = [];
    for (const box of targets) {
        xLines.push({ pos: box.left, box }, { pos: box.left + box.width / 2, box }, { pos: box.left + box.width, box });
        yLines.push({ pos: box.top, box }, { pos: box.top + box.height / 2, box }, { pos: box.top + box.height, box });
    }
    if (canvasCenter !== null) {
        xLines.push({ pos: canvasCenter.x, box: null });
        yLines.push({ pos: canvasCenter.y, box: null });
    }
    const snapX = snapAxis(
        [dragged.left, dragged.left + dragged.width / 2, dragged.left + dragged.width],
        xLines,
        threshold,
        dragged.top,
        dragged.top + dragged.height,
        (box) => [box.top, box.top + box.height]
    );
    const snapY = snapAxis(
        [dragged.top, dragged.top + dragged.height / 2, dragged.top + dragged.height],
        yLines,
        threshold,
        dragged.left,
        dragged.left + dragged.width,
        (box) => [box.left, box.left + box.width]
    );
    const guides: SnapGuide[] = [];
    if (snapX !== null) {
        guides.push({ orientation: 'vertical', position: snapX.position, from: snapX.from, to: snapX.to });
    }
    if (snapY !== null) {
        guides.push({ orientation: 'horizontal', position: snapY.position, from: snapY.from, to: snapY.to });
    }
    return { dx: snapX?.delta ?? 0, dy: snapY?.delta ?? 0, guides };
}
