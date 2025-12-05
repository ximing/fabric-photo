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
});
