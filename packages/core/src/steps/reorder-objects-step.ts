import { cloneDoc, type Doc } from '../model/doc';
import { failure, Step, success, type StepResult } from './step';

/** z 序调整动作：front 置顶 / back 置底 / forward 上移一层 / backward 下移一层。 */
export type ReorderAction = 'front' | 'back' | 'forward' | 'backward';

/**
 * 给定 doc + 选中 ids + action，算出重排后的完整 id 序：
 * - 多选保持相对顺序（被移动项之间先后不变）
 * - forward 从顶向下交换「选中项紧邻之上是非选中项」的对；backward 自底向上对称
 * - ids 不在 doc 中或重排后序不变（已在顶/底）返回 null（调用方应 no-op 不 dispatch）
 */
export function computeReorderedIds(doc: Doc, ids: readonly string[], action: ReorderAction): string[] | null {
    const before = doc.objects.map((o) => o.id);
    const selected = new Set(ids.filter((id) => before.includes(id)));
    if (selected.size === 0) {
        return null;
    }
    let after: string[];
    switch (action) {
        case 'front':
            after = [...before.filter((id) => !selected.has(id)), ...before.filter((id) => selected.has(id))];
            break;
        case 'back':
            after = [...before.filter((id) => selected.has(id)), ...before.filter((id) => !selected.has(id))];
            break;
        case 'forward': {
            after = [...before];
            // 自顶向下（不含顶位）：选中项上邻为非选中项则交换；扫描方向保证多选只整体前进一层
            for (let i = after.length - 2; i >= 0; i--) {
                if (selected.has(after[i]) && !selected.has(after[i + 1])) {
                    [after[i], after[i + 1]] = [after[i + 1], after[i]];
                }
            }
            break;
        }
        case 'backward': {
            after = [...before];
            for (let i = 1; i < after.length; i++) {
                if (selected.has(after[i]) && !selected.has(after[i - 1])) {
                    [after[i], after[i - 1]] = [after[i - 1], after[i]];
                }
            }
            break;
        }
    }
    return after.every((id, i) => id === before[i]) ? null : after;
}

/**
 * 按完整 id 序重排 doc.objects（z 序）。存储 before/after 两个完整 id 数组：
 * apply 按 after 重排，invert 按 before 恢复。order 与 doc 的 id 集不一致时 apply 失败。
 */
export class ReorderObjects extends Step {
    constructor(
        readonly before: readonly string[],
        readonly after: readonly string[]
    ) {
        super();
    }

    apply(doc: Doc): StepResult {
        const byId = new Map(doc.objects.map((o) => [o.id, o]));
        if (this.after.length !== doc.objects.length || !this.after.every((id) => byId.has(id))) {
            return failure('ReorderObjects: order does not match doc objects');
        }
        const next = cloneDoc(doc);
        next.objects = this.after.map((id) => structuredClone(byId.get(id)!));
        return success(next);
    }

    invert(): Step {
        return new ReorderObjects(this.after, this.before);
    }
}
