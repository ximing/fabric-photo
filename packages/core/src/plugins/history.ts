import type { EditorState, Viewport } from '../state/editor-state';
import type { Step } from '../steps/step';
import { Transaction } from '../transform/transaction';
import type { Plugin } from './plugin';

export interface HistorySizes {
    undoSize: number;
    redoSize: number;
}

/** 一笔历史记录：逆序 invert step 组 + 原 step 组 + selection/viewport 的 before/after 快照。 */
export interface HistoryEntry {
    inverse: Step[]; // tr.steps 逆序的 invert()
    redo: Step[]; // 原 step 实例
    selectionBefore: readonly string[];
    selectionAfter: readonly string[];
    viewportBefore: Viewport;
    viewportAfter: Viewport;
}

/**
 * undo/redo 历史插件。只负责收账与栈维护；
 * 栈迁移（popUndo → dispatch undo 事务 → pushRedo）由 Editor 驱动。
 * 每次栈操作后触发 onSizesChange。
 */
export class History implements Plugin {
    readonly name = 'history';

    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];

    constructor(private readonly onSizesChange: (sizes: HistorySizes) => void) {}

    /** 收账入 undoStack 并清 redoStack；tr.addToHistory === false 时跳过（不清 redoStack）。 */
    onTransaction(tr: Transaction, oldState: EditorState, newState: EditorState): void {
        if (!tr.addToHistory) {
            return;
        }
        this.undoStack.push({
            inverse: [...tr.steps].reverse().map((s) => s.invert()),
            redo: [...tr.steps],
            selectionBefore: oldState.selection,
            selectionAfter: newState.selection,
            viewportBefore: { ...oldState.viewport },
            viewportAfter: { ...newState.viewport }
        });
        this.redoStack = [];
        this.emitSizes();
    }

    popUndo(): HistoryEntry | null {
        const entry = this.undoStack.pop() ?? null;
        if (entry !== null) {
            this.emitSizes();
        }
        return entry;
    }

    pushUndo(entry: HistoryEntry): void {
        this.undoStack.push(entry);
        this.emitSizes();
    }

    popRedo(): HistoryEntry | null {
        const entry = this.redoStack.pop() ?? null;
        if (entry !== null) {
            this.emitSizes();
        }
        return entry;
    }

    pushRedo(entry: HistoryEntry): void {
        this.redoStack.push(entry);
        this.emitSizes();
    }

    /**
     * 用 entry 构造 undo/redo 事务：
     * undo 应用 inverse steps 并恢复 selection/viewport 的 before 值；redo 对称。
     * 事务标记 addToHistory:false（不再入栈）与 history:'undo'|'redo'。
     */
    makeTransaction(state: EditorState, entry: HistoryEntry, direction: 'undo' | 'redo'): Transaction {
        const tr = new Transaction(state);
        const undoing = direction === 'undo';
        for (const step of undoing ? entry.inverse : entry.redo) {
            tr.addStep(step);
        }
        tr.setSelection(undoing ? entry.selectionBefore : entry.selectionAfter);
        tr.setViewport(undoing ? entry.viewportBefore : entry.viewportAfter);
        tr.setMeta('addToHistory', false);
        tr.setMeta('history', direction);
        return tr;
    }

    /** 清两栈（clearUndoStack/clearRedoStack 用）。 */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.emitSizes();
    }

    clearUndo(): void {
        this.undoStack = [];
        this.emitSizes();
    }

    clearRedo(): void {
        this.redoStack = [];
        this.emitSizes();
    }

    get undoSize(): number {
        return this.undoStack.length;
    }

    get redoSize(): number {
        return this.redoStack.length;
    }

    private emitSizes(): void {
        this.onSizesChange({ undoSize: this.undoSize, redoSize: this.redoSize });
    }
}
