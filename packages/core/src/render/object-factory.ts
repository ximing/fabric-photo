import { Ellipse, FabricImage, IText, Path, Rect, Triangle, util, type FabricObject } from 'fabric';
import type { EditorObject, ImageObject, PathObject, ShapeObject, TextObject } from '../model/doc';

/**
 * fabric 6.9.1 的类型声明里没有 FabricObject.data（运行时有），
 * 这里用交叉类型补齐，按 brief 挂 `{ fpId }` 做 state ↔ fabric 映射。
 */
export interface FabricObjectData {
    fpId?: string;
}

export function setFpId(fObj: FabricObject, id: string): void {
    (fObj as FabricObject & { data?: FabricObjectData }).data = { fpId: id };
}

export function getFpId(fObj: FabricObject): string | undefined {
    return (fObj as FabricObject & { data?: FabricObjectData }).data?.fpId;
}

// —— 图片元素缓存（image 对象与背景共用）：createFabricObject 是同步的，
// 调用方必须先通过 preloadImage 保证 src 已入缓存。 ——

const imageCache = new Map<string, HTMLImageElement>();
const imagePending = new Map<string, Promise<HTMLImageElement>>();

export function preloadImage(src: string): Promise<HTMLImageElement> {
    const cached = imageCache.get(src);
    if (cached !== undefined) {
        return Promise.resolve(cached);
    }
    const pending = imagePending.get(src);
    if (pending !== undefined) {
        return pending;
    }
    const promise = util
        .loadImage(src, { crossOrigin: 'anonymous' })
        .then((img) => {
            imageCache.set(src, img);
            imagePending.delete(src);
            return img;
        })
        .catch((err: unknown) => {
            imagePending.delete(src);
            throw err;
        });
    imagePending.set(src, promise);
    return promise;
}

export function getCachedImage(src: string): HTMLImageElement | undefined {
    return imageCache.get(src);
}

// —— 属性映射 ——

interface BaseAttrs {
    left: number;
    top: number;
    angle: number;
    scaleX: number;
    scaleY: number;
}

function baseAttrs(obj: EditorObject): BaseAttrs {
    return {
        left: obj.left,
        top: obj.top,
        angle: obj.angle,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY
    };
}

function shapeAttrs(obj: ShapeObject): Record<string, unknown> {
    return { fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth };
}

function textDecoration(obj: TextObject): { underline: boolean; linethrough: boolean } {
    return {
        underline: obj.textDecoration === 'underline',
        linethrough: obj.textDecoration === 'line-through'
    };
}

function textAttrs(obj: TextObject): Record<string, unknown> {
    return {
        fontSize: obj.fontSize,
        fontFamily: obj.fontFamily,
        fill: obj.fill,
        fontWeight: obj.fontWeight,
        fontStyle: obj.fontStyle,
        textAlign: obj.textAlign,
        ...textDecoration(obj)
    };
}

function pathAttrs(obj: PathObject): Record<string, unknown> {
    return {
        stroke: obj.stroke,
        strokeWidth: obj.strokeWidth,
        // 自由绘制/线条类路径无填充；空串交给 fabric 会得到非法 Color，显式转 transparent
        fill: obj.fill === '' ? 'transparent' : obj.fill,
        // 对齐旧 freedraw 笔迹（PencilBrush 产出的 path 默认 round 端点/拐角）
        ...(obj.tool === 'freedraw' ? { strokeLineCap: 'round', strokeLineJoin: 'round' } : {})
    };
}

/**
 * 由 path 字符串探测 fabric 自动定位后的 left/top（bbox 原点语义）。
 * line/arrow controller 落盘 PathObject 时调用：保证 createFabricObject
 * 以显式 left/top 重建后与预览几何完全一致。
 */
export function probePathPosition(pathData: string): { left: number; top: number } {
    const probe = new Path(pathData);
    return { left: probe.left, top: probe.top };
}

function imageAttrs(obj: ImageObject): Record<string, unknown> {
    // 显式 width/height 覆盖自然尺寸，最终显示尺寸 = width × scaleX
    return { width: obj.width, height: obj.height };
}

/** 按 kind 分派创建 fabric 对象；调用方需保证 image 的 src 已 preload。 */
export function createFabricObject(obj: EditorObject): FabricObject {
    let fObj: FabricObject;
    switch (obj.kind) {
        case 'shape':
            if (obj.shapeType === 'rect') {
                fObj = new Rect({ ...baseAttrs(obj), width: obj.width, height: obj.height, ...shapeAttrs(obj) });
            } else if (obj.shapeType === 'circle') {
                // 对齐旧 shape.ts：用 Ellipse 伪造 circle
                fObj = new Ellipse({ ...baseAttrs(obj), rx: obj.width / 2, ry: obj.height / 2, ...shapeAttrs(obj) });
            } else {
                fObj = new Triangle({ ...baseAttrs(obj), width: obj.width, height: obj.height, ...shapeAttrs(obj) });
            }
            break;
        case 'text':
            // editable 初始关闭，进入文本编辑由 text controller（Task 14）接管
            fObj = new IText(obj.text, { ...baseAttrs(obj), ...textAttrs(obj), editable: false });
            break;
        case 'path':
            fObj = new Path(obj.path, { ...baseAttrs(obj), ...pathAttrs(obj) });
            break;
        case 'image': {
            const img = getCachedImage(obj.src);
            if (img === undefined) {
                throw new Error(`image src not preloaded: ${obj.src.slice(0, 64)}`);
            }
            fObj = new FabricImage(img, { ...baseAttrs(obj), ...imageAttrs(obj) });
            break;
        }
        case 'mosaic':
            // Task 15 补齐
            throw new Error('mosaic renderer not implemented');
    }
    setFpId(fObj, obj.id);
    return fObj;
}

/** 全量覆盖可变字段；调用方需保证 image 的新 src 已 preload。 */
export function updateFabricObject(fObj: FabricObject, obj: EditorObject): void {
    switch (obj.kind) {
        case 'shape':
            if (obj.shapeType === 'circle') {
                fObj.set({ ...baseAttrs(obj), rx: obj.width / 2, ry: obj.height / 2, ...shapeAttrs(obj) });
            } else {
                fObj.set({ ...baseAttrs(obj), width: obj.width, height: obj.height, ...shapeAttrs(obj) });
            }
            break;
        case 'text':
            fObj.set({ ...baseAttrs(obj), text: obj.text, ...textAttrs(obj) });
            break;
        case 'path':
            // path 数据本身不可变（绘制完成后不改），仅覆盖样式与几何
            fObj.set({ ...baseAttrs(obj), ...pathAttrs(obj) });
            break;
        case 'image': {
            const img = getCachedImage(obj.src);
            if (img === undefined) {
                throw new Error(`image src not preloaded: ${obj.src.slice(0, 64)}`);
            }
            const fImg = fObj as FabricImage;
            if (fImg.getElement() !== img) {
                fImg.setElement(img);
            }
            fObj.set({ ...baseAttrs(obj), ...imageAttrs(obj) });
            break;
        }
        case 'mosaic':
            throw new Error('mosaic renderer not implemented');
    }
    fObj.setCoords();
}
