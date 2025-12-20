import type { Canvas, ImageFormat, TMat2D } from 'fabric';
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
 * 整图导出 dataURL：identity vpt + doc 坐标裁剪 → 背景原始像素。
 * 无背景时导出当前画布现状（保留 vpt）。
 */
export function exportDocDataURL(
    renderer: FabricRenderer,
    background: BackgroundImage | null,
    type?: string
): string {
    const canvas = renderer.canvas;
    const format = toImageFormat(type);
    if (background === null) {
        return canvas.toDataURL({ format, multiplier: 1 });
    }
    return withIdentityViewport(canvas, () =>
        canvas.toDataURL({
            format,
            multiplier: 1,
            left: 0,
            top: 0,
            width: background.width,
            height: background.height
        })
    );
}

/** 整图导出 Blob，进制与 exportDocDataURL 相同。 */
export function exportDocBlob(
    renderer: FabricRenderer,
    background: BackgroundImage | null,
    type?: string
): Promise<Blob | null> {
    const canvas = renderer.canvas;
    const format = toImageFormat(type);
    if (background === null) {
        return canvas.toBlob({ format, multiplier: 1 });
    }
    return withIdentityViewport(canvas, () =>
        canvas.toBlob({
            format,
            multiplier: 1,
            left: 0,
            top: 0,
            width: background.width,
            height: background.height
        })
    );
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
