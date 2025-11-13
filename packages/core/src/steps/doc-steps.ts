import { cloneDoc, type BackgroundImage, type Doc } from '../model/doc';
import { failure, Step, success, type StepResult } from './step';

/**
 * 设置背景图；对齐旧编辑器现状：换图/裁剪会清空全部对象。
 * apply 时捕获完整旧 doc，invert → RestoreDoc(旧doc)。
 */
export class SetBackground extends Step {
    private prevDoc?: Doc;

    constructor(readonly background: BackgroundImage | null) {
        super();
    }

    apply(doc: Doc): StepResult {
        this.prevDoc = cloneDoc(doc);
        return success({
            background: this.background ? structuredClone(this.background) : null,
            objects: []
        });
    }

    invert(): Step {
        if (!this.prevDoc) {
            throw new Error('SetBackground.invert() called before apply()');
        }
        return new RestoreDoc(this.prevDoc);
    }
}

/** 整体替换 doc（通用逆操作载体）。 */
export class RestoreDoc extends Step {
    private prevDoc?: Doc;

    constructor(readonly doc: Doc) {
        super();
    }

    apply(doc: Doc): StepResult {
        this.prevDoc = cloneDoc(doc);
        return success(cloneDoc(this.doc));
    }

    invert(): Step {
        if (!this.prevDoc) {
            throw new Error('RestoreDoc.invert() called before apply()');
        }
        return new RestoreDoc(this.prevDoc);
    }
}

/**
 * 旋转整个文档到绝对角度 targetAngle（%360）。
 * 数学移植自旧代码 src/modules/rotation.ts 的 _rotateForEachObject：
 * 对象坐标系 = 背景图片像素坐标系，背景旋转后其外接框尺寸互换/扩大，
 * 每个对象先绕旧中心旋转，再平移新旧中心差，angle 累加 delta。
 */
export class TransformDoc extends Step {
    private prevDoc?: Doc;

    constructor(readonly targetAngle: number) {
        super();
    }

    apply(doc: Doc): StepResult {
        const bg = doc.background;
        if (!bg) {
            return failure('no background to transform');
        }
        const target = ((this.targetAngle % 360) + 360) % 360;
        const delta = ((target - bg.angle) % 360 + 360) % 360;
        if (delta === 0) {
            return failure('angle unchanged');
        }
        this.prevDoc = cloneDoc(doc);

        const rad = (delta * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // 旋转后外接框尺寸
        const newW = Math.abs(bg.width * cos) + Math.abs(bg.height * sin);
        const newH = Math.abs(bg.width * sin) + Math.abs(bg.height * cos);
        const oldCenter = { x: bg.width / 2, y: bg.height / 2 };
        const newCenter = { x: newW / 2, y: newH / 2 };

        const next = cloneDoc(doc);
        next.background = { ...next.background!, angle: target, width: newW, height: newH };
        for (const obj of next.objects) {
            const p = rotatePointAround({ x: obj.left, y: obj.top }, oldCenter, rad);
            obj.left = p.x + (newCenter.x - oldCenter.x);
            obj.top = p.y + (newCenter.y - oldCenter.y);
            obj.angle = (obj.angle + delta) % 360;
        }
        return success(next);
    }

    invert(): Step {
        if (!this.prevDoc) {
            throw new Error('TransformDoc.invert() called before apply()');
        }
        return new RestoreDoc(this.prevDoc);
    }
}

/** 点 p 绕 center 旋转 radians（弧度，逆时针为正，y 轴向下坐标系下同公式）。 */
export function rotatePointAround(
    p: { x: number; y: number },
    center: { x: number; y: number },
    radians: number
): { x: number; y: number } {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos
    };
}
