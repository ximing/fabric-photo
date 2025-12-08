import { describe, expect, it, vi } from 'vitest';
import { Editor } from './editor';
import { Keymap } from './plugins/keymap';
import { AddObject } from './steps/object-steps';
import { SetBackground } from './steps/doc-steps';
import type { Plugin } from './plugins/plugin';
import type { Renderer } from './render/renderer';
import type { ShapeObject } from './model/doc';
import { Transaction } from './transform/transaction';
import type { EditorState } from './state/editor-state';

function makeFakeRenderer() {
    return {
        syncState: vi.fn<Renderer['syncState']>(),
        setMode: vi.fn<Renderer['setMode']>(),
        destroy: vi.fn<Renderer['destroy']>()
    };
}

function makeObject(id: string): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType: 'rect',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 10,
        height: 10,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 1
    };
}

describe('Editor', () => {
    it('dispatch AddObject 更新 doc 并同步 renderer', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });
        const prev = editor.state;

        const tr = editor.newTransaction();
        tr.addStep(new AddObject(makeObject('a')));
        editor.dispatch(tr);

        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a']);
        expect(renderer.syncState).toHaveBeenCalledTimes(1);
        expect(renderer.syncState).toHaveBeenCalledWith(editor.state, prev);
        // mode 未变化时不调 setMode
        expect(renderer.setMode).not.toHaveBeenCalled();
    });

    it('subscribe 监听器在 dispatch 后被调，退订后不再调', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const listener = vi.fn();
        const unsubscribe = editor.subscribe(listener);

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        expect(listener).toHaveBeenCalledTimes(1);
        const [state, prev] = listener.mock.calls[0] as [EditorState, EditorState];
        expect(state).toBe(editor.state);
        expect(prev.doc.objects).toHaveLength(0);

        unsubscribe();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('b'))));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('mode 切换触发 change:mode 与 renderer.setMode；selection 变化触发 change:selection', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });
        const onMode = vi.fn();
        const onSelection = vi.fn();
        editor.on('change:mode', onMode);
        editor.on('change:selection', onSelection);

        editor.dispatch(editor.newTransaction().setMode('crop'));
        expect(onMode).toHaveBeenCalledWith({ mode: 'crop', prevMode: 'normal' });
        expect(renderer.setMode).toHaveBeenCalledWith('crop', 'normal');
        expect(onSelection).not.toHaveBeenCalled();

        editor.dispatch(editor.newTransaction().setSelection(['a', 'b']));
        expect(onSelection).toHaveBeenCalledWith({ selection: ['a', 'b'] });
        expect(onMode).toHaveBeenCalledTimes(1);

        // 相同 selection 再次设置不重复触发
        editor.dispatch(editor.newTransaction().setSelection(['a', 'b']));
        expect(onSelection).toHaveBeenCalledTimes(1);
    });

    it('filterTransaction 返回 false 的插件使 dispatch 整体无效', () => {
        const renderer = makeFakeRenderer();
        const blocker: Plugin = {
            name: 'blocker',
            filterTransaction: () => false
        };
        const editor = new Editor({ renderer, plugins: [blocker] });
        const prev = editor.state;

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));

        expect(editor.state).toBe(prev);
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(renderer.syncState).not.toHaveBeenCalled();
    });

    it('appendTransaction 返回的额外事务一并应用', () => {
        const renderer = makeFakeRenderer();
        const appender: Plugin = {
            name: 'appender',
            appendTransaction: (tr: Transaction, _old: EditorState, newState: EditorState) => {
                if (tr.getMeta('withExtra') !== true || newState.getObject('extra') !== undefined) {
                    return null;
                }
                const extra = new Transaction(newState);
                extra.addStep(new AddObject(makeObject('extra')));
                return extra;
            }
        };
        const editor = new Editor({ renderer, plugins: [appender] });

        const tr = editor.newTransaction();
        tr.addStep(new AddObject(makeObject('a')));
        tr.setMeta('withExtra', true);
        editor.dispatch(tr);

        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a', 'extra']);
    });

    it('undo/redo 端到端，historyChange 事件随之触发', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const onHistory = vi.fn();
        editor.on('historyChange', onHistory);

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        expect(editor.isEmptyUndoStack()).toBe(false);
        expect(editor.isEdited()).toBe(true);
        expect(onHistory).toHaveBeenLastCalledWith({ undoSize: 1, redoSize: 0 });

        editor.undo();
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(editor.isEmptyUndoStack()).toBe(true);
        expect(editor.isEmptyRedoStack()).toBe(false);
        expect(onHistory).toHaveBeenLastCalledWith({ undoSize: 0, redoSize: 1 });

        editor.redo();
        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a']);
        expect(editor.isEmptyRedoStack()).toBe(true);
        expect(onHistory).toHaveBeenLastCalledWith({ undoSize: 1, redoSize: 0 });

        // 空栈 undo/redo 为 no-op
        editor.clearUndoStack();
        editor.clearRedoStack();
        const state = editor.state;
        editor.undo();
        editor.redo();
        expect(editor.state).toBe(state);
    });

    it('endAll/isEdited/getCurrentState/getImageName/destroy 行为', () => {
        const renderer = makeFakeRenderer();
        const keymapDestroy = vi.spyOn(Keymap.prototype, 'destroy');
        const pluginDestroy = vi.fn();
        const editor = new Editor({
            renderer,
            plugins: [{ name: 'p', destroy: pluginDestroy }]
        });

        expect(editor.isEdited()).toBe(false);
        expect(editor.getCurrentState()).toBe('normal');
        expect(editor.getImageName()).toBe('');

        editor.dispatch(editor.newTransaction().setMode('crop'));
        expect(editor.getCurrentState()).toBe('crop');
        editor.endAll();
        expect(editor.getCurrentState()).toBe('normal');

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        expect(editor.isEdited()).toBe(true);

        editor.destroy();
        expect(renderer.destroy).toHaveBeenCalledTimes(1);
        expect(keymapDestroy).toHaveBeenCalled();
        expect(pluginDestroy).toHaveBeenCalledTimes(1);
        keymapDestroy.mockRestore();
    });

    it('背景从有到无时 fire clearImage（含 undo 加载）', () => {
        const editor = new Editor();
        const onClear = vi.fn();
        editor.on('clearImage', onClear);

        const bg = { src: 'data:,x', width: 10, height: 10, name: 'a', angle: 0 };
        editor.dispatch(editor.newTransaction().addStep(new SetBackground(bg)));
        expect(onClear).not.toHaveBeenCalled();

        // undo 加载 → 背景变 null → clearImage
        editor.undo();
        expect(onClear).toHaveBeenCalledTimes(1);

        // 无背景状态下再 dispatch 不重复 fire
        editor.dispatch(editor.newTransaction().setMode('normal'));
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('removeActiveObject 删除单个选中对象并 fire objectRemoved，可 undo', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const onRemoved = vi.fn();
        editor.on('objectRemoved', onRemoved);

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        editor.dispatch(editor.newTransaction().setSelection(['a']));
        const undoSizeBefore = editor.history.undoSize;

        editor.removeActiveObject();
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(editor.state.selection).toEqual([]);
        expect(onRemoved).toHaveBeenCalledTimes(1);
        expect(onRemoved).toHaveBeenCalledWith({ id: 'a' });
        expect(editor.history.undoSize).toBe(undoSizeBefore + 1);

        editor.undo();
        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a']);
    });

    it('removeActiveObject 多选逐个删除；空选中为 no-op', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const onRemoved = vi.fn();
        editor.on('objectRemoved', onRemoved);

        // 空选中 no-op
        editor.removeActiveObject();
        expect(onRemoved).not.toHaveBeenCalled();

        editor.dispatch(
            editor.newTransaction().addStep(new AddObject(makeObject('a'))).addStep(new AddObject(makeObject('b')))
        );
        editor.dispatch(editor.newTransaction().setSelection(['a', 'b']));
        const undoSizeBefore = editor.history.undoSize;

        editor.removeActiveObject();
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(editor.state.selection).toEqual([]);
        expect(onRemoved).toHaveBeenCalledTimes(2);
        // 同事务删除 → 只产生一条历史
        expect(editor.history.undoSize).toBe(undoSizeBefore + 1);

        editor.undo();
        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a', 'b']);
    });

    it('clearObjects 清空全部对象与选中，可 undo 恢复 z 序', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });

        // 空文档 no-op
        editor.clearObjects();
        expect(editor.history.undoSize).toBe(0);

        editor.dispatch(
            editor.newTransaction().addStep(new AddObject(makeObject('a'))).addStep(new AddObject(makeObject('b')))
        );
        editor.dispatch(editor.newTransaction().setSelection(['a']));

        editor.clearObjects();
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(editor.state.selection).toEqual([]);

        editor.undo();
        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['a', 'b']);
    });

    it('deactivateAll 清空选中且不进历史；空选中 no-op', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        editor.dispatch(editor.newTransaction().setSelection(['a']));
        const undoSizeBefore = editor.history.undoSize;

        editor.deactivateAll();
        expect(editor.state.selection).toEqual([]);
        expect(editor.history.undoSize).toBe(undoSizeBefore);

        // 空选中 no-op（不产生任何事务/事件）
        const state = editor.state;
        editor.deactivateAll();
        expect(editor.state).toBe(state);
    });

    it('loadImageFromURL 参数缺失时 reject 且 state 不变', async () => {
        const editor = new Editor();
        await expect(editor.loadImageFromURL('', 'a')).rejects.toThrow();
        await expect(editor.loadImageFromURL('u', '')).rejects.toThrow();
        expect(editor.state.doc.background).toBeNull();
    });

    it('addImageObject 无背景时 reject', async () => {
        const editor = new Editor();
        await expect(editor.addImageObject('data:,x')).rejects.toThrow('background');
        await expect(editor.addImageObject('')).rejects.toThrow();
    });

    it('setZoom 更新 viewport 并入历史，undo 复原；getZoom 返回当前值', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const onViewport = vi.fn();
        editor.on('change:viewport', onViewport);
        expect(editor.getZoom()).toBe(1);

        editor.setZoom(2);
        expect(editor.getZoom()).toBe(2);
        expect(editor.history.undoSize).toBe(1);
        expect(onViewport).toHaveBeenCalledWith({ viewport: { zoom: 2, panX: 0, panY: 0 } });

        editor.undo();
        expect(editor.getZoom()).toBe(1);
        editor.redo();
        expect(editor.getZoom()).toBe(2);
    });

    it('setZoom clamp 到 [0.05, 8]；同值 no-op（state 引用不变、无历史）', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });

        editor.setZoom(100);
        expect(editor.getZoom()).toBe(8);
        editor.setZoom(0);
        expect(editor.getZoom()).toBe(0.05);
        expect(editor.history.undoSize).toBe(2);

        const state = editor.state;
        editor.setZoom(0.05);
        editor.setZoom(-1); // clamp 后仍是 0.05
        expect(editor.state).toBe(state);
        expect(editor.history.undoSize).toBe(2);
    });

    it('startPan/endPan 切换 mode 并同步 renderer，不进历史；重复调用 no-op', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });
        const undoSizeBefore = editor.history.undoSize;

        editor.startPan();
        expect(editor.getCurrentState()).toBe('pan');
        expect(renderer.setMode).toHaveBeenCalledWith('pan', 'normal');
        expect(editor.history.undoSize).toBe(undoSizeBefore);

        editor.startPan(); // 重复 no-op
        expect(editor.getCurrentState()).toBe('pan');

        editor.endPan();
        expect(editor.getCurrentState()).toBe('normal');
        expect(renderer.setMode).toHaveBeenLastCalledWith('normal', 'pan');
        expect(editor.history.undoSize).toBe(undoSizeBefore);

        editor.endPan(); // 非 pan 模式 no-op
        expect(editor.getCurrentState()).toBe('normal');
    });

    it('pan 事务（addToHistory:false 的 viewport 更新）只改 state 不进历史', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor.newTransaction().setViewport({ panX: 30, panY: -12 }).setMeta('addToHistory', false)
        );
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 30, panY: -12 });
        expect(editor.history.undoSize).toBe(0);
    });

    it('adjustCanvasDimension 把 viewport 归位（refit）且不进历史；已归位时 no-op', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.setZoom(3);
        editor.dispatch(editor.newTransaction().setViewport({ panX: 10 }).setMeta('addToHistory', false));
        const undoSizeBefore = editor.history.undoSize;

        editor.adjustCanvasDimension();
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
        expect(editor.history.undoSize).toBe(undoSizeBefore);

        const state = editor.state;
        editor.adjustCanvasDimension();
        expect(editor.state).toBe(state);
    });

    it('resizeCanvasDimension 缺省 no-op；传 dimension 时 refit（无头模式跳过 DOM 部分）', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.setZoom(2);

        const state = editor.state;
        editor.resizeCanvasDimension();
        expect(editor.state).toBe(state);

        editor.resizeCanvasDimension({ width: 500, height: 300 });
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });
});
