import { cloneDoc, type EditorObject } from '../model/doc';
import { failure, Step, success, type StepResult } from './step';
import type { Doc } from '../model/doc';

/** 对象属性更新包；运行期会过滤 'id'/'kind'，防止身份字段被改写 */
export type ObjectAttrs = Record<string, unknown>;

function sanitizeAttrs(attrs: ObjectAttrs): ObjectAttrs {
    const result: ObjectAttrs = {};
    for (const key of Object.keys(attrs)) {
        if (key !== 'id' && key !== 'kind') {
            result[key] = attrs[key];
        }
    }
    return result;
}

/** 追加对象到 objects 末尾（z 序顶）。id 冲突则失败。 */
export class AddObject extends Step {
    constructor(readonly object: EditorObject) {
        super();
    }

    apply(doc: Doc): StepResult {
        if (doc.objects.some((o) => o.id === this.object.id)) {
            return failure(`duplicate object id: ${this.object.id}`);
        }
        const next = cloneDoc(doc);
        next.objects.push(structuredClone(this.object));
        return success(next);
    }

    invert(): Step {
        return new RemoveObject(this.object.id);
    }
}

/** 按 id 删除对象；apply 时捕获被删对象与原下标用于 invert。 */
export class RemoveObject extends Step {
    private removed?: { object: EditorObject; index: number };

    constructor(readonly id: string) {
        super();
    }

    apply(doc: Doc): StepResult {
        const index = doc.objects.findIndex((o) => o.id === this.id);
        if (index < 0) {
            return failure(`object not found: ${this.id}`);
        }
        this.removed = { object: structuredClone(doc.objects[index]), index };
        const next = cloneDoc(doc);
        next.objects.splice(index, 1);
        return success(next);
    }

    invert(): Step {
        if (!this.removed) {
            throw new Error('RemoveObject.invert() called before apply()');
        }
        return new RestoreObject(this.removed.object, this.removed.index);
    }
}

/** 在指定下标插入对象（RemoveObject 的逆操作）。 */
export class RestoreObject extends Step {
    constructor(
        readonly object: EditorObject,
        readonly index: number
    ) {
        super();
    }

    apply(doc: Doc): StepResult {
        if (doc.objects.some((o) => o.id === this.object.id)) {
            return failure(`duplicate object id: ${this.object.id}`);
        }
        const next = cloneDoc(doc);
        const index = Math.max(0, Math.min(this.index, next.objects.length));
        next.objects.splice(index, 0, structuredClone(this.object));
        return success(next);
    }

    invert(): Step {
        return new RemoveObject(this.object.id);
    }
}

/** 合并属性到对象；apply 时先捕获涉及 key 的旧值用于 invert。 */
export class UpdateObject extends Step {
    private before?: ObjectAttrs;

    constructor(
        readonly id: string,
        readonly attrs: ObjectAttrs
    ) {
        super();
    }

    apply(doc: Doc): StepResult {
        const index = doc.objects.findIndex((o) => o.id === this.id);
        if (index < 0) {
            return failure(`object not found: ${this.id}`);
        }
        const attrs = sanitizeAttrs(this.attrs);
        const before: ObjectAttrs = {};
        const current = doc.objects[index] as unknown as Record<string, unknown>;
        for (const key of Object.keys(attrs)) {
            before[key] = structuredClone(current[key]);
        }
        this.before = before;
        const next = cloneDoc(doc);
        Object.assign(next.objects[index] as unknown as Record<string, unknown>, structuredClone(attrs));
        return success(next);
    }

    invert(): Step {
        if (!this.before) {
            throw new Error('UpdateObject.invert() called before apply()');
        }
        return new UpdateObject(this.id, this.before);
    }
}

/** 清空全部对象；apply 时捕获完整对象列表，invert 恢复原 z 序。 */
export class ClearObjects extends Step {
    private cleared?: EditorObject[];

    apply(doc: Doc): StepResult {
        this.cleared = structuredClone(doc.objects);
        const next = cloneDoc(doc);
        next.objects = [];
        return success(next);
    }

    invert(): Step {
        if (!this.cleared) {
            throw new Error('ClearObjects.invert() called before apply()');
        }
        const cleared = this.cleared;
        return new (class extends Step {
            apply(doc: Doc): StepResult {
                const next = cloneDoc(doc);
                next.objects = structuredClone(cleared);
                return success(next);
            }

            invert(): Step {
                return new ClearObjects();
            }
        })();
    }
}
