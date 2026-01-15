import { Ellipse, FabricImage, IText, Path, Rect, Triangle, util, type FabricObject } from 'fabric';
import type { EditorObject, ImageObject, PathObject, ShapeObject, TextObject } from '../model/doc';
import { MosaicShape } from './shapes/mosaic-shape';

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

export interface FabricScaleAttrs {
    scaleX: number;
    scaleY: number;
    flipX: boolean;
    flipY: boolean;
}

/**
 * state 带符号 scale（负值表示翻转）→ fabric 幂等投影。
 * fabric 6.9.1 的 FabricObject._set 对负 scale 的语义是「toggle flipX/flipY 并取绝对值」
 * （dist index.js ~7101），不是幂等赋值：直接 set({ scaleX: -1 }) 会让 flipX
 * 随同步次数震荡（false→true→false），而 state 恒为 -1。
 * 故 state → fabric 一律显式换算为 { abs(scale), flip 标志 }，绕开负 scale 赋值路径。
 */
export function scaleToFabric(scaleX: number, scaleY: number): FabricScaleAttrs {
    return {
        scaleX: Math.abs(scaleX),
        scaleY: Math.abs(scaleY),
        flipX: scaleX < 0,
        flipY: scaleY < 0
    };
}

/** fabric 归一化后的 { scale（恒正）, flip } → state 带符号 scale（object:modified 回读用）。 */
export function fabricToScale(scale: number, flip: boolean): number {
    return flip ? -scale : scale;
}

interface BaseAttrs {
    left: number;
    top: number;
    angle: number;
    scaleX: number;
    scaleY: number;
    flipX: boolean;
    flipY: boolean;
}

function baseAttrs(obj: EditorObject): BaseAttrs {
    return {
        left: obj.left,
        top: obj.top,
        angle: obj.angle,
        ...scaleToFabric(obj.scaleX, obj.scaleY)
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
        case 'text': {
            // editable 初始关闭，进入文本编辑由 text controller 显式驱动；
            // objectCaching:false + 隐藏中点控制点（对齐旧 text 模块渲染参数）
            const itext = new IText(obj.text, {
                ...baseAttrs(obj),
                ...textAttrs(obj),
                editable: false,
                objectCaching: false
            });
            itext.setControlsVisibility({ mb: false, ml: false, mr: false, mt: false });
            fObj = itext;
            break;
        }
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
            // rects 已归一化到外接框左上角；doc 的 left/top 为外接框中心。
            // fabric 6 默认 originX:'left'/originY:'top'，必须显式 center origin，
            // 否则命中框/选框相对可见内容偏移 (+w/2, +h/2)
            fObj = new MosaicShape({
                ...baseAttrs(obj),
                originX: 'center',
                originY: 'center',
                width: obj.width,
                height: obj.height,
                mosaicRects: obj.rects
            });
            break;
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
            // 马赛克内容绘制后不可变（对齐 path），仅覆盖几何
            fObj.set({ ...baseAttrs(obj), width: obj.width, height: obj.height, mosaicRects: obj.rects });
            break;
    }
    fObj.setCoords();
}
