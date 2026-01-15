import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '../state/editor-state';
import { AddObject } from '../steps/object-steps';
import type { ShapeObject } from '../model/doc';
import { Transaction } from '../transform/transaction';
import { History, type HistoryEntry, type HistorySizes } from './history';

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

function makeHistory(): { history: History; sizes: HistorySizes[] } {
    const sizes: HistorySizes[] = [];
    const history = new History((s) => sizes.push(s));
    return { history, sizes };
}

/** 模拟 Editor 驱动：apply 事务后通知 history 收账，返回新 state。 */
function dispatch(history: History, state: EditorState, tr: Transaction): EditorState {
    const next = state.apply(tr);
    history.onTransaction(tr, state, next);
    return next;
}

/** 模拟 Editor.undo() / Editor.redo()。 */
function revert(history: History, state: EditorState, direction: 'undo' | 'redo'): EditorState {
    const entry = direction === 'undo' ? history.popUndo() : history.popRedo();
    expect(entry).not.toBeNull();
    const tr = history.makeTransaction(state, entry as HistoryEntry, direction);
    const next = state.apply(tr);
    if (direction === 'undo') {
        history.pushRedo(entry as HistoryEntry);
    } else {
        history.pushUndo(entry as HistoryEntry);
    }
    return next;
}

describe('History', () => {
    it('records an AddObject transaction: undoSize 1 / redoSize 0, onSizesChange fires', () => {
        const { history, sizes } = makeHistory();
        let state = new EditorState();
        const tr = new Transaction(state).addStep(new AddObject(makeShape('a')));
        state = dispatch(history, state, tr);

        expect(history.undoSize).toBe(1);
        expect(history.redoSize).toBe(0);
        expect(sizes).toEqual([{ undoSize: 1, redoSize: 0 }]);
    });

    it('undo transaction removes the object and restores selection/viewport to before', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        const tr = new Transaction(state)
            .addStep(new AddObject(makeShape('a')))
            .setSelection(['a'])
            .setViewport({ zoom: 3 });
        state = dispatch(history, state, tr);
        expect(state.getObject('a')).toBeDefined();
        expect(state.selection).toEqual(['a']);
        expect(state.viewport.zoom).toBe(3);

        const entry = history.popUndo();
        expect(entry).not.toBeNull();
        expect(entry?.selectionBefore).toEqual([]);
        expect(entry?.selectionAfter).toEqual(['a']);
        expect(entry?.viewportBefore).toEqual({ zoom: 1, panX: 0, panY: 0 });
        expect(entry?.viewportAfter.zoom).toBe(3);

        const undoTr = history.makeTransaction(state, entry as HistoryEntry, 'undo');
        expect(undoTr.getMeta('addToHistory')).toBe(false);
        expect(undoTr.getMeta('history')).toBe('undo');
        const undone = state.apply(undoTr);
        history.pushRedo(entry as HistoryEntry);

        expect(undone.getObject('a')).toBeUndefined();
        expect(undone.selection).toEqual([]);
        expect(undone.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
        expect(history.undoSize).toBe(0);
        expect(history.redoSize).toBe(1);
    });

    it('recording a new transaction after undo clears the redo stack', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))));
        state = revert(history, state, 'undo');
        expect(history.redoSize).toBe(1);

        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('b'))));
        expect(history.redoSize).toBe(0);
        expect(history.undoSize).toBe(1);
        expect(state.getObject('b')).toBeDefined();
    });

    it('two transactions undone twice restore in reverse order (second first)', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))));
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('b'))));
        expect(history.undoSize).toBe(2);

        state = revert(history, state, 'undo');
        expect(state.getObject('b')).toBeUndefined();
        expect(state.getObject('a')).toBeDefined();

        state = revert(history, state, 'undo');
        expect(state.getObject('a')).toBeUndefined();
        expect(state.doc.objects).toHaveLength(0);

        // redo 两笔，先 redo 第一笔
        state = revert(history, state, 'redo');
        expect(state.getObject('a')).toBeDefined();
        expect(state.getObject('b')).toBeUndefined();
        state = revert(history, state, 'redo');
        expect(state.getObject('b')).toBeDefined();
        expect(history.undoSize).toBe(2);
        expect(history.redoSize).toBe(0);
    });

    it('addToHistory:false viewport transaction (pan) is not recorded and keeps redo stack', () => {
        const { history, sizes } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))));
        state = revert(history, state, 'undo');
        expect(history.redoSize).toBe(1);
        const callsBefore = sizes.length;

        const panTr = new Transaction(state)
            .setViewport({ panX: 10, panY: 20 })
            .setMeta('addToHistory', false);
        state = dispatch(history, state, panTr);

        expect(state.viewport.panX).toBe(10);
        expect(history.undoSize).toBe(0);
        expect(history.redoSize).toBe(1);
        expect(sizes.length).toBe(callsBefore);
    });

    it('zoom transaction is recorded; undo restores zoom to 1', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).setViewport({ zoom: 2 }));
        expect(history.undoSize).toBe(1);
        expect(state.viewport.zoom).toBe(2);

        state = revert(history, state, 'undo');
        expect(state.viewport.zoom).toBe(1);
    });

    it('clear / clearUndo / clearRedo clear the respective stacks', () => {
        const { history, sizes } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))));
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('b'))));
        state = revert(history, state, 'undo');
        expect(history.undoSize).toBe(1);
        expect(history.redoSize).toBe(1);

        history.clearUndo();
        expect(history.undoSize).toBe(0);
        expect(history.redoSize).toBe(1);
        expect(sizes[sizes.length - 1]).toEqual({ undoSize: 0, redoSize: 1 });

        history.pushUndo({} as HistoryEntry);
        history.clear();
        expect(history.undoSize).toBe(0);
        expect(history.redoSize).toBe(0);
        expect(sizes[sizes.length - 1]).toEqual({ undoSize: 0, redoSize: 0 });

        history.pushUndo({} as HistoryEntry);
        history.pushRedo({} as HistoryEntry);
        history.clearRedo();
        expect(history.undoSize).toBe(1);
        expect(history.redoSize).toBe(0);
    });

    it('popUndo / popRedo return null when stacks are empty', () => {
        const onSizesChange = vi.fn();
        const history = new History(onSizesChange);
        expect(history.popUndo()).toBeNull();
        expect(history.popRedo()).toBeNull();
    });

    it('mergeKey：连续同 key 事务合并进栈顶条目（undoSize 恒 1），一次 undo 回到起点', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        for (const fill of ['#111111', '#222222', '#333333']) {
            state = dispatch(
                history,
                state,
                new Transaction(state)
                    .addStep(new AddObject({ ...makeShape(fill), id: fill }))
                    .setMeta('mergeKey', 'drag')
            );
        }
        expect(history.undoSize).toBe(1);
        expect(state.doc.objects).toHaveLength(3);

        state = revert(history, state, 'undo');
        expect(state.doc.objects).toHaveLength(0);

        state = revert(history, state, 'redo');
        expect(state.doc.objects).toHaveLength(3);
        expect(history.undoSize).toBe(1);
    });

    it('mergeKey：栈顶 key 不同则不合并；合并打断 redo（清 redoStack）', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))).setMeta('mergeKey', 'k1'));
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('b'))).setMeta('mergeKey', 'k2'));
        expect(history.undoSize).toBe(2);
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('c'))).setMeta('mergeKey', 'k2'));
        expect(history.undoSize).toBe(2); // 与栈顶 k2 合并

        state = revert(history, state, 'undo'); // 合并条目一次 undo 撤掉 b+c
        expect(state.getObject('b')).toBeUndefined();
        expect(state.getObject('c')).toBeUndefined();
        expect(state.getObject('a')).toBeDefined();
        expect(history.redoSize).toBe(1);

        // 合并收账同样清 redoStack
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('d'))).setMeta('mergeKey', 'k1'));
        expect(history.redoSize).toBe(0);
        expect(history.undoSize).toBe(1); // 与栈顶 k1 合并
    });

    it('mergeKey：合并条目保持最初 before 快照、更新 after 快照', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(
            history,
            state,
            new Transaction(state).addStep(new AddObject(makeShape('a'))).setSelection(['a']).setMeta('mergeKey', 'sel')
        );
        state = dispatch(
            history,
            state,
            new Transaction(state).setSelection([]).setMeta('mergeKey', 'sel')
        );
        // 第二笔无 step：docChanged=false 且 viewport 未设 → addToHistory false，不收账
        expect(history.undoSize).toBe(1);

        state = dispatch(
            history,
            state,
            new Transaction(state).addStep(new AddObject(makeShape('b'))).setSelection(['b']).setMeta('mergeKey', 'sel')
        );
        expect(history.undoSize).toBe(1);

        const entry = history.popUndo();
        expect(entry?.selectionBefore).toEqual([]);
        expect(entry?.selectionAfter).toEqual(['b']);
        expect(entry?.mergeKey).toBe('sel');
        history.pushUndo(entry as HistoryEntry);

        state = revert(history, state, 'undo');
        expect(state.doc.objects).toHaveLength(0);
        expect(state.selection).toEqual([]);
    });

    it('无 mergeKey 的行为不变：相邻事务各自成条目', () => {
        const { history } = makeHistory();
        let state = new EditorState();
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('a'))));
        state = dispatch(history, state, new Transaction(state).addStep(new AddObject(makeShape('b'))));
        expect(history.undoSize).toBe(2);
    });
});
