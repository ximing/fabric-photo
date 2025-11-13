import type { Doc } from '../model/doc';

export interface StepResult {
    doc?: Doc;
    failed?: string;
}

export abstract class Step {
    abstract apply(doc: Doc): StepResult;

    /**
     * 返回逆操作 Step。必须在 apply 成功之后调用：
     * apply 时捕获逆操作所需的数据（旧值、原下标等）。
     */
    abstract invert(): Step;
}

export function failure(message: string): StepResult {
    return { failed: message };
}

export function success(doc: Doc): StepResult {
    return { doc };
}
