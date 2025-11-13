import type { Step } from '../steps/step';
import type { EditorMode, EditorState, Viewport } from '../state/editor-state';

/**
 * 一次状态变更的载体：有序 step 序列 + selection/mode/viewport 变更 + meta。
 * 所有 set 方法链式返回 this。apply 语义见 EditorState.apply。
 */
export class Transaction {
    readonly steps: Step[] = [];

    private selection: readonly string[] | undefined;
    private mode: EditorMode | undefined;
    private viewport: Partial<Viewport> | undefined;
    private meta = new Map<string, unknown>();

    constructor(readonly state: EditorState) {}

    addStep(step: Step): this {
        this.steps.push(step);
        return this;
    }

    setSelection(ids: readonly string[]): this {
        this.selection = ids;
        return this;
    }

    setMode(mode: EditorMode): this {
        this.mode = mode;
        return this;
    }

    setViewport(partial: Partial<Viewport>): this {
        this.viewport = { ...this.viewport, ...partial };
        return this;
    }

    setMeta(key: string, value: unknown): this {
        this.meta.set(key, value);
        return this;
    }

    getMeta(key: string): unknown {
        return this.meta.get(key);
    }

    get docChanged(): boolean {
        return this.steps.length > 0;
    }

    get selectionSet(): boolean {
        return this.selection !== undefined;
    }

    get modeSet(): boolean {
        return this.mode !== undefined;
    }

    get viewportSet(): boolean {
        return this.viewport !== undefined;
    }

    get selectionValue(): readonly string[] | undefined {
        return this.selection;
    }

    get modeValue(): EditorMode | undefined {
        return this.mode;
    }

    get viewportValue(): Partial<Viewport> | undefined {
        return this.viewport;
    }

    /** pan 事务会 setMeta('addToHistory', false)；zoom 事务（仅 viewport）默认进历史。 */
    get addToHistory(): boolean {
        return this.getMeta('addToHistory') !== false && (this.docChanged || this.viewportSet);
    }
}
