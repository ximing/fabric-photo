import { cloneDoc, type Doc, type FilterSettings } from '../model/doc';
import { failure, Step, success, type StepResult } from './step';

/**
 * 设置背景图或某个 image 对象的滤镜（before/after 均在构造时给出，
 * invert 无需 apply 捕获，直接交换两者）。
 * after === undefined 表示移除 filters 字段（恢复默认）；apply 只作用于
 * BackgroundImage 与 ImageObject，其他目标失败。
 */
export class SetFilters extends Step {
    constructor(
        readonly target: 'background' | string,
        readonly before: FilterSettings | undefined,
        readonly after: FilterSettings | undefined
    ) {
        super();
    }

    apply(doc: Doc): StepResult {
        const next = cloneDoc(doc);
        if (this.target === 'background') {
            if (next.background === null) {
                return failure('no background to set filters');
            }
            setFiltersOn(next.background, this.after);
            return success(next);
        }
        const obj = next.objects.find((o) => o.id === this.target);
        if (obj === undefined) {
            return failure(`object not found: ${this.target}`);
        }
        if (obj.kind !== 'image') {
            return failure(`SetFilters only applies to image objects: ${this.target}`);
        }
        setFiltersOn(obj, this.after);
        return success(next);
    }

    invert(): Step {
        return new SetFilters(this.target, this.after, this.before);
    }
}

function setFiltersOn(target: { filters?: FilterSettings }, filters: FilterSettings | undefined): void {
    if (filters === undefined) {
        delete target.filters;
    } else {
        target.filters = structuredClone(filters);
    }
}

/** 两个 FilterSettings 全字段相等（Editor 便捷 API 的 no-op 判定用）。 */
export function sameFilters(a: FilterSettings | undefined, b: FilterSettings | undefined): boolean {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    return (
        a.brightness === b.brightness &&
        a.contrast === b.contrast &&
        a.saturation === b.saturation &&
        a.blur === b.blur &&
        a.grayscale === b.grayscale &&
        a.sepia === b.sepia &&
        a.invert === b.invert
    );
}
