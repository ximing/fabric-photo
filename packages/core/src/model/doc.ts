export interface BaseObject {
    id: string;
    left: number;            // 背景图片像素坐标系
    top: number;
    angle: number;           // 度
    scaleX: number;
    scaleY: number;
}

export interface ShapeObject extends BaseObject {
    kind: 'shape';
    shapeType: 'rect' | 'circle' | 'triangle';
    width: number;
    height: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
}

export interface TextObject extends BaseObject {
    kind: 'text';
    text: string;
    fontSize: number;
    fontFamily: string;
    fill: string;
    fontWeight: string;
    fontStyle: string;         // '' | 'italic'
    textDecoration: string;    // '' | 'underline' | 'line-through'
    textAlign: string;
}

export interface PathObject extends BaseObject {
    kind: 'path';
    tool: 'freedraw' | 'line' | 'arrow';
    path: string;              // SVG path data
    stroke: string;
    strokeWidth: number;
    fill: string;
}

export interface MosaicRect { x: number; y: number; size: number; color: string }

export interface MosaicObject extends BaseObject {
    kind: 'mosaic';
    width: number;
    height: number;
    rects: MosaicRect[];
}

export interface ImageObject extends BaseObject {
    kind: 'image';
    src: string;               // dataURL 或跨域 URL
    width: number;
    height: number;
}

export type EditorObject = ShapeObject | TextObject | PathObject | MosaicObject | ImageObject;

export interface BackgroundImage {
    src: string;               // dataURL 或跨域 URL
    width: number;             // 当前外接框像素（旋转后可能互换/扩大）
    height: number;
    name: string;
    angle: number;             // 度，0 为原始方向
}

export interface Doc {
    background: BackgroundImage | null;
    objects: EditorObject[];   // 数组序即 z 序
}

export function createDoc(background: BackgroundImage | null = null): Doc {
    return { background, objects: [] };
}

export function docToJSON(doc: Doc): string {
    return JSON.stringify(doc);
}

const OBJECT_KINDS = new Set(['shape', 'text', 'path', 'mosaic', 'image']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBackground(value: unknown): value is BackgroundImage {
    if (value === null) {
        return true;
    }
    if (!isRecord(value)) {
        return false;
    }
    return (
        typeof value.src === 'string' &&
        typeof value.width === 'number' &&
        typeof value.height === 'number' &&
        typeof value.name === 'string' &&
        typeof value.angle === 'number'
    );
}

function isValidObject(value: unknown): value is EditorObject {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.id === 'string' && typeof value.kind === 'string' && OBJECT_KINDS.has(value.kind);
}

export function docFromJSON(json: string): Doc {
    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        throw new Error('invalid doc JSON');
    }
    if (!isRecord(data) || !isValidBackground(data.background)) {
        throw new Error('invalid doc JSON');
    }
    if (!Array.isArray(data.objects) || !data.objects.every(isValidObject)) {
        throw new Error('invalid doc JSON');
    }
    return data as unknown as Doc;
}

export function cloneDoc(doc: Doc): Doc {
    return structuredClone(doc);
}
