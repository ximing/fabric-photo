import { createDoc, type BackgroundImage, type Doc, type EditorObject } from '../model/doc';
import type { Transaction } from '../transform/transaction';

export type EditorMode = 'normal' | 'crop' | 'freedraw' | 'line' | 'arrow' | 'mosaic' | 'text' | 'shape' | 'pan';

export interface Viewport {
    zoom: number;
    panX: number;
    panY: number;
}

export interface EditorStateConfig {
    doc?: Doc;
    selection?: readonly string[];
    mode?: EditorMode;
    viewport?: Viewport;
}

/** Step.apply 返回 failed 时由 EditorState.apply 抛出。 */
export class StepError extends Error {}

const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/** 不可变编辑器状态；所有变更通过 apply(Transaction) 产出新实例。 */
export class EditorState {
    readonly doc: Doc;
    readonly selection: readonly string[];
    readonly mode: EditorMode;
    readonly viewport: Viewport;

    constructor(config: EditorStateConfig = {}) {
        this.doc = config.doc ?? createDoc();
        this.selection = config.selection ?? [];
        this.mode = config.mode ?? 'normal';
        this.viewport = config.viewport ?? { ...DEFAULT_VIEWPORT };
    }

    /**
     * 依次执行 transaction 的 steps；任一步 failed 即抛 StepError。
     * 之后按 transaction 的 set 标记合成新 state：
     * selection/mode 整体替换，viewport 浅合并。
     */
    apply(tr: Transaction): EditorState {
        let doc = this.doc;
        for (const step of tr.steps) {
            const result = step.apply(doc);
            if (result.failed !== undefined || result.doc === undefined) {
                throw new StepError(result.failed ?? 'step failed');
            }
            doc = result.doc;
        }
        const selection = tr.selectionValue ?? this.selection;
        const mode = tr.modeValue ?? this.mode;
        const viewport = tr.viewportSet ? { ...this.viewport, ...tr.viewportValue } : this.viewport;
        return new EditorState({ doc, selection, mode, viewport });
    }

    /** doc.background 便捷访问。 */
    get backgroundImage(): BackgroundImage | null {
        return this.doc.background;
    }

    getObject(id: string): EditorObject | undefined {
        return this.doc.objects.find((o) => o.id === id);
    }
}
