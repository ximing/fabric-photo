import type { EditorObject } from './doc';

/** doc 坐标系下的轴对齐矩形（left/top 为左上角），对齐分布与吸附共用的几何描述。 */
export interface ObjectBBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * 从 path 数据提取数值对（本编辑器产生的 path 均为绝对坐标 M/L/Q/C/Z，
 * 参数成对出现），返回路径数据自身的宽高；解析失败返回 0×0。
 * 曲线取全部数值点（含控制点）的外接范围，为近似值。
 */
function pathDataSize(path: string): { width: number; height: number } {
    const numbers = path.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi);
    if (numbers === null || numbers.length < 2) {
        return { width: 0, height: 0 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < numbers.length; i += 2) {
        const x = Number(numbers[i]);
        const y = Number(numbers[i + 1]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    return { width: maxX - minX, height: maxY - minY };
}

/**
 * 对象的未旋转 bbox（v1 简化：忽略 angle，按未旋转外接框处理；scale 取绝对值，
 * 翻转不改变 bbox 范围）。与 object-factory 的 origin 投影保持一致：
 * shape/image/text/path 为 left/top 原点，mosaic 为 center 原点。
 *
 * 无 width/height 字段的 kind 取近似尺寸（README「对齐与分布」注明）：
 * - text：宽 = 最长行字符数 × fontSize（≈1em/字符），高 = 行数 × fontSize × 1.16
 * - path：由 path 数据数值对的外接范围（left/top 即该范围原点，见 probePathPosition）
 */
export function objectBBox(obj: EditorObject): ObjectBBox {
    switch (obj.kind) {
        case 'shape':
        case 'image':
            return {
                left: obj.left,
                top: obj.top,
                width: obj.width * Math.abs(obj.scaleX),
                height: obj.height * Math.abs(obj.scaleY)
            };
        case 'mosaic': {
            const width = obj.width * Math.abs(obj.scaleX);
            const height = obj.height * Math.abs(obj.scaleY);
            return { left: obj.left - width / 2, top: obj.top - height / 2, width, height };
        }
        case 'text': {
            const lines = obj.text.split('\n');
            const maxLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
            return {
                left: obj.left,
                top: obj.top,
                width: maxLine * obj.fontSize * Math.abs(obj.scaleX),
                height: lines.length * obj.fontSize * 1.16 * Math.abs(obj.scaleY)
            };
        }
        case 'path': {
            const size = pathDataSize(obj.path);
            return {
                left: obj.left,
                top: obj.top,
                width: size.width * Math.abs(obj.scaleX),
                height: size.height * Math.abs(obj.scaleY)
            };
        }
    }
}
