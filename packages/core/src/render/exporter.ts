import type { Canvas, FabricObject, ImageFormat, TMat2D } from 'fabric';
import type { BackgroundImage } from '../model/doc';
import type { FabricRenderer } from './fabric-renderer';

/**
 * 导出助手（Task 8）。仅内核内部使用，不从 index.ts 导出。
 *
 * 坐标约定与 FabricRenderer 一致：doc 坐标系 = 背景图片像素，
 * vpt = [s,0,0,s,tx,ty]。
 *
 * fabric 6 的 toDataURL/toBlob 走 toCanvasElement：在离屏 canvas 上以
 * 「当前 vpt 的 scale/translate × multiplier，再减 left/top」重绘，
 * 不触碰屏幕画布，因此改/还原 vpt 无需 renderAll（同步任务内恢复，无闪烁）。
 */

/** fabric vpt 恒等矩阵 [a,b,c,d,e,f]。 */
const IDENTITY_VPT: TMat2D = [1, 0, 0, 1, 0, 0];

/**
 * 导出参数（内核内部；Editor 的公开 ExportImageOptions 与本类型结构兼容）。
 * - type：MIME 类型，缺省/未识别按 png
 * - quality：jpeg/webp 质量 0..1（png 忽略）
 * - multiplier：输出倍率（输出像素 = 裁剪尺寸 × multiplier），缺省 1；非正数按 1 处理
 */
export interface ExportParams {
    type?: string;
    quality?: number;
    multiplier?: number;
}

interface NormalizedExportParams {
    format: ImageFormat;
    quality?: number;
    multiplier: number;
}

/** 兼容旧签名（裸 MIME 字符串）与选项对象两种入参。 */
function normalizeParams(input?: string | ExportParams): NormalizedExportParams {
    const params: ExportParams = typeof input === 'string' ? { type: input } : (input ?? {});
    const multiplier =
        params.multiplier !== undefined && params.multiplier > 0 ? params.multiplier : 1;
    return { format: toImageFormat(params.type), quality: params.quality, multiplier };
}

/** 'image/jpeg' → 'jpeg' 等；缺省/未识别 → 'png'。 */
function toImageFormat(type?: string): ImageFormat {
    if (type === 'image/jpeg') {
        return 'jpeg';
    }
    if (type === 'image/webp') {
        return 'webp';
    }
    return 'png';
}

/** 以 identity vpt 同步执行 fn，finally 中恢复原 vpt（裁剪矩形导出复用，见 CropController.applyCrop）。 */
export function withIdentityViewport<T>(canvas: Canvas, fn: () => T): T {
    const saved = [...canvas.viewportTransform] as TMat2D;
    canvas.setViewportTransform([...IDENTITY_VPT]);
    try {
        // toBlob 的 Promise 只包裹 canvasEl.toBlob 回调，vpt 读取在
        // 同步的 toCanvasElement 内完成，finally 恢复是安全的
        return fn();
    } finally {
        canvas.setViewportTransform(saved);
    }
}

/**
 * jpeg 无 alpha 通道：canvas toDataURL('image/jpeg') 会把透明区合成为黑色，
 * 商业惯例白底合成。导出期间临时将画布 backgroundColor 置白（fabric toCanvasElement
 * 先铺背景色再绘对象），finally 恢复；png/webp 保留透明语义（webp 支持 alpha）不打底。
 * 只临时改渲染投影的实例属性，同步任务内恢复（同 withIdentityViewport），不触碰 Doc/EditorState。
 */
function withJpegWhiteBackground<T>(canvas: Canvas, format: ImageFormat, fn: () => T): T {
    if (format !== 'jpeg') {
        return fn();
    }
    const saved = canvas.backgroundColor;
    canvas.backgroundColor = '#ffffff';
    try {
        return fn();
    } finally {
        canvas.backgroundColor = saved;
    }
}

/**
 * 整图导出 dataURL：identity vpt + doc 坐标裁剪 → 背景原始像素 × multiplier。
 * 无背景时导出当前画布现状（保留 vpt）。jpeg 白底合成（见 withJpegWhiteBackground）。
 */
export function exportDocDataURL(
    renderer: FabricRenderer,
    background: BackgroundImage | null,
    options?: string | ExportParams
): string {
    const canvas = renderer.canvas;
    const { format, quality, multiplier } = normalizeParams(options);
    return withJpegWhiteBackground(canvas, format, () => {
        if (background === null) {
            return canvas.toDataURL({ format, quality, multiplier });
        }
        return withIdentityViewport(canvas, () =>
            canvas.toDataURL({
                format,
                quality,
                multiplier,
                left: 0,
                top: 0,
                width: background.width,
                height: background.height
            })
        );
    });
}

/** 整图导出 Blob，进制与 exportDocDataURL 相同。 */
export function exportDocBlob(
    renderer: FabricRenderer,
    background: BackgroundImage | null,
    options?: string | ExportParams
): Promise<Blob | null> {
    const canvas = renderer.canvas;
    const { format, quality, multiplier } = normalizeParams(options);
    return withJpegWhiteBackground(canvas, format, () => {
        if (background === null) {
            return canvas.toBlob({ format, quality, multiplier });
        }
        return withIdentityViewport(canvas, () =>
            canvas.toBlob({
                format,
                quality,
                multiplier,
                left: 0,
                top: 0,
                width: background.width,
                height: background.height
            })
        );
    });
}

/**
 * 仅选中导出（商业惯例：裁剪到选中集 bbox、不含背景、透明底；jpeg 无 alpha 改白底合成）。
 * 实现：临时隐藏未选中对象并摘掉背景，identity vpt 下按 bbox 裁剪导出，finally 恢复
 * （toBlob 的像素读取在同步的 toCanvasElement 内完成，恢复时机安全，同 withIdentityViewport）。
 * 选中集为空（或无对应 fabric 对象）时抛错——调用方应先在 UI 层禁用。
 */
export function exportSelectionDataURL(
    renderer: FabricRenderer,
    selection: readonly string[],
    options?: string | ExportParams
): string {
    const canvas = renderer.canvas;
    const { format, quality, multiplier } = normalizeParams(options);
    const target = resolveSelection(renderer, selection);
    return withJpegWhiteBackground(canvas, format, () =>
        withSelectionOnly(canvas, target, () =>
            withIdentityViewport(canvas, () =>
                canvas.toDataURL({
                    format,
                    quality,
                    multiplier,
                    left: target.bbox.left,
                    top: target.bbox.top,
                    width: target.bbox.width,
                    height: target.bbox.height
                })
            )
        )
    );
}

/** 仅选中导出 Blob，进制与 exportSelectionDataURL 相同。 */
export function exportSelectionBlob(
    renderer: FabricRenderer,
    selection: readonly string[],
    options?: string | ExportParams
): Promise<Blob | null> {
    const canvas = renderer.canvas;
    const { format, quality, multiplier } = normalizeParams(options);
    const target = resolveSelection(renderer, selection);
    return withJpegWhiteBackground(canvas, format, () =>
        withSelectionOnly(canvas, target, () =>
            withIdentityViewport(canvas, () =>
                canvas.toBlob({
                    format,
                    quality,
                    multiplier,
                    left: target.bbox.left,
                    top: target.bbox.top,
                    width: target.bbox.width,
                    height: target.bbox.height
                })
            )
        )
    );
}

interface SelectionExportTarget {
    objects: FabricObject[];
    bbox: { left: number; top: number; width: number; height: number };
}

/** 解析选中集对应的 fabric 对象与其 doc 坐标 bbox 并集；空集抛错。 */
function resolveSelection(renderer: FabricRenderer, selection: readonly string[]): SelectionExportTarget {
    const objects = renderer.getObjectsByIds(selection);
    if (objects.length === 0) {
        throw new Error('Selection export requires at least one selected object');
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of objects) {
        // getBoundingRect 基于 getCoords（对象自身变换后、不含 vpt）= doc 坐标
        const rect = obj.getBoundingRect();
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.left + rect.width);
        maxY = Math.max(maxY, rect.top + rect.height);
    }
    return { objects, bbox: { left: minX, top: minY, width: maxX - minX, height: maxY - minY } };
}

/**
 * 以「只渲染选中对象」的画布状态同步执行 fn：隐藏其余可见对象 + 摘掉背景，finally 恢复。
 * 选中对象自身的 visible 不改动（state 里 hidden 的选中对象导出时仍不可见，与画布一致）。
 */
function withSelectionOnly<T>(canvas: Canvas, target: SelectionExportTarget, fn: () => T): T {
    const keep = new Set<FabricObject>(target.objects);
    const toggled: FabricObject[] = [];
    for (const obj of canvas.getObjects()) {
        if (!keep.has(obj) && obj.visible) {
            obj.visible = false;
            toggled.push(obj);
        }
    }
    const backgroundImage = canvas.backgroundImage;
    canvas.backgroundImage = undefined;
    try {
        return fn();
    } finally {
        canvas.backgroundImage = backgroundImage;
        for (const obj of toggled) {
            obj.visible = true;
        }
    }
}

/** 当前视口可见区域（容器 CSS 像素）的 dataURL，保留当前 vpt。 */
export function exportViewportImage(renderer: FabricRenderer): string {
    const canvas = renderer.canvas;
    return canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        left: 0,
        top: 0,
        width: renderer.container.clientWidth,
        height: renderer.container.clientHeight
    });
}

/** 容器可见区域在 doc 坐标系下的矩形（vpt 逆变换：(screenPt - t) / s）。 */
export function getViewportDocRect(renderer: FabricRenderer): {
    width: number;
    height: number;
    left: number;
    top: number;
} {
    const vpt = renderer.canvas.viewportTransform;
    const s = vpt[0];
    if (s === 0) {
        return { width: 0, height: 0, left: 0, top: 0 };
    }
    return {
        width: renderer.container.clientWidth / s,
        height: renderer.container.clientHeight / s,
        left: -vpt[4] / s,
        top: -vpt[5] / s
    };
}
