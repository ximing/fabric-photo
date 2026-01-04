import { describe, expect, it, vi } from 'vitest';
import { Editor } from './editor';
import { Keymap } from './plugins/keymap';
import { AddObject } from './steps/object-steps';
import { SetBackground } from './steps/doc-steps';
import type { Plugin } from './plugins/plugin';
import type { Renderer } from './render/renderer';
import type { PathObject, ShapeObject, TextObject } from './model/doc';
import { Transaction } from './transform/transaction';
import type { EditorState } from './state/editor-state';

function makeFakeRenderer() {
    return {
        syncState: vi.fn<Renderer['syncState']>(),
        setMode: vi.fn<Renderer['setMode']>(),
        notifyResize: vi.fn<Renderer['notifyResize']>(),
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

    it('adjustCanvasDimension 把 viewport 归位（refit）且不进历史', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.setZoom(3);
        editor.dispatch(editor.newTransaction().setViewport({ panX: 10 }).setMeta('addToHistory', false));
        const undoSizeBefore = editor.history.undoSize;

        editor.adjustCanvasDimension();
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
        expect(editor.history.undoSize).toBe(undoSizeBefore);
    });

    it('refit 在 viewport 已归位时仍 dispatch 触发 renderer 重算（cssMax/尺寸变更后视觉需刷新）', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });
        const onViewport = vi.fn();
        editor.on('change:viewport', onViewport);

        editor.adjustCanvasDimension();
        expect(renderer.syncState).toHaveBeenCalledTimes(1);
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
        // viewport 内容未变：不发 change:viewport、不进历史
        expect(onViewport).not.toHaveBeenCalled();
        expect(editor.history.undoSize).toBe(0);

        editor.resizeCanvasDimension({ width: 500 });
        expect(renderer.syncState).toHaveBeenCalledTimes(2);
        expect(editor.history.undoSize).toBe(0);
    });

    it('setZoom 带 pan 时按 zoom 比例补偿 pan（支点为容器中心），undo 一并回滚', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(editor.newTransaction().setViewport({ panX: 40, panY: -20 }).setMeta('addToHistory', false));

        editor.setZoom(2);
        expect(editor.state.viewport).toEqual({ zoom: 2, panX: 80, panY: -40 });

        editor.setZoom(0.5);
        expect(editor.state.viewport).toEqual({ zoom: 0.5, panX: 20, panY: -10 });

        editor.undo();
        expect(editor.state.viewport).toEqual({ zoom: 2, panX: 80, panY: -40 });
        editor.undo();
        expect(editor.state.viewport).toEqual({ zoom: 1, panX: 40, panY: -20 });
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

    function makePath(id: string, tool: 'freedraw' | 'line' | 'arrow'): PathObject {
        return {
            id,
            kind: 'path',
            tool,
            path: 'M 0 0 L 10 10',
            left: 0,
            top: 0,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            stroke: 'red',
            strokeWidth: 4,
            fill: ''
        };
    }

    it('startFreeDrawing/startLineDrawing/startArrowDrawing 切 mode，对应 end 回 normal；endAll 通吃', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });

        editor.startFreeDrawing({ width: 4, color: 'red' });
        expect(editor.getCurrentState()).toBe('freedraw');
        editor.startFreeDrawing(); // 重复进入 no-op
        expect(editor.getCurrentState()).toBe('freedraw');
        editor.endFreeDrawing();
        expect(editor.getCurrentState()).toBe('normal');

        editor.startLineDrawing();
        expect(editor.getCurrentState()).toBe('line');
        editor.endLineDrawing();
        expect(editor.getCurrentState()).toBe('normal');

        editor.startArrowDrawing();
        expect(editor.getCurrentState()).toBe('arrow');
        editor.endAll();
        expect(editor.getCurrentState()).toBe('normal');

        editor.endArrowDrawing(); // 已 normal，no-op
        expect(editor.getCurrentState()).toBe('normal');
    });

    it('setBrush 无头模式按 mode 路由，不抛错', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.setBrush({ width: 8 }); // normal 模式 no-op
        editor.startFreeDrawing();
        editor.setBrush({ width: 8, color: '#00f' });
        expect(editor.getCurrentState()).toBe('freedraw');
    });

    it('changeFreeDrawingPathStyle 只改选中且 tool=freedraw 的 path，undo 可回滚', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makePath('p1', 'freedraw')))
                .addStep(new AddObject(makePath('p2', 'arrow')))
                .setSelection(['p1', 'p2'])
        );

        editor.changeFreeDrawingPathStyle({ color: '#00f', width: 9 });
        const p1 = editor.state.getObject('p1') as PathObject;
        const p2 = editor.state.getObject('p2') as PathObject;
        expect(p1.stroke).toBe('#00f');
        expect(p1.strokeWidth).toBe(9);
        expect(p2.stroke).toBe('red'); // tool 不匹配不动

        editor.undo();
        expect((editor.state.getObject('p1') as PathObject).stroke).toBe('red');
    });

    it('changeFreeDrawingPathStyle 覆盖选中且 tool=line 的 path，undo 可回滚', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makePath('p1', 'line')))
                .addStep(new AddObject(makePath('p2', 'arrow')))
                .setSelection(['p1', 'p2'])
        );
        const before = editor.history.undoSize;

        editor.changeFreeDrawingPathStyle({ color: '#00f', width: 9 });
        expect(editor.history.undoSize).toBe(before + 1);
        const p1 = editor.state.getObject('p1') as PathObject;
        const p2 = editor.state.getObject('p2') as PathObject;
        expect(p1.stroke).toBe('#00f');
        expect(p1.strokeWidth).toBe(9);
        expect(p2.stroke).toBe('red'); // tool=arrow 不动

        editor.undo();
        expect((editor.state.getObject('p1') as PathObject).stroke).toBe('red');
    });

    it('changeArrowStyle 只改选中且 tool=arrow 的 path；无匹配对象不产生历史', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makePath('p1', 'freedraw')))
                .addStep(new AddObject(makePath('p2', 'arrow')))
                .setSelection(['p1', 'p2'])
        );
        const before = editor.history.undoSize;

        editor.changeArrowStyle({ color: '#0f0' });
        expect((editor.state.getObject('p2') as PathObject).stroke).toBe('#0f0');
        expect((editor.state.getObject('p1') as PathObject).stroke).toBe('red');

        editor.changeFreeDrawingPathStyle(); // 缺省 no-op
        editor.changeArrowStyle({}); // 空 attrs no-op
        expect(editor.history.undoSize).toBe(before + 1);
    });

    it('startDrawingShapeMode/endDrawingShapeMode 切 mode；重复调用 no-op；endAll 通吃', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });

        editor.startDrawingShapeMode();
        expect(editor.getCurrentState()).toBe('shape');
        editor.startDrawingShapeMode(); // 重复进入 no-op
        expect(editor.getCurrentState()).toBe('shape');
        editor.endDrawingShapeMode();
        expect(editor.getCurrentState()).toBe('normal');

        editor.startDrawingShapeMode();
        editor.endAll();
        expect(editor.getCurrentState()).toBe('normal');

        editor.endDrawingShapeMode(); // 已 normal，no-op
        expect(editor.getCurrentState()).toBe('normal');
    });

    it('setDrawingShape 无头模式不抛错', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.setDrawingShape('circle', { fill: 'red', stroke: 'blue', strokeWidth: 3 });
        editor.startDrawingShapeMode();
        editor.setDrawingShape('triangle');
        expect(editor.getCurrentState()).toBe('shape');
    });

    it('addShape 显式 left/top 落 ShapeObject 并 fire objectAdded，可 undo；缺省 left/top 无头落 0,0', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const added: ShapeObject[] = [];
        editor.on('objectAdded', ({ object }) => {
            added.push(object as ShapeObject);
        });

        editor.addShape('rect', { left: 10, top: 20, width: 30, height: 40, fill: 'red', stroke: 'blue', strokeWidth: 2 });
        const obj = editor.state.doc.objects[0] as ShapeObject;
        expect(obj).toMatchObject({
            kind: 'shape',
            shapeType: 'rect',
            left: 10,
            top: 20,
            width: 30,
            height: 40,
            fill: 'red',
            stroke: 'blue',
            strokeWidth: 2,
            scaleX: 1,
            scaleY: 1
        });
        expect(added).toHaveLength(1);
        expect(added[0].id).toBe(obj.id);

        editor.addShape('circle'); // 缺省：无头 viewport info 全 0 → left/top = 0，宽高 100
        const circle = editor.state.doc.objects[1] as ShapeObject;
        expect(circle).toMatchObject({ shapeType: 'circle', left: 0, top: 0, width: 100, height: 100 });

        editor.undo();
        editor.undo();
        expect(editor.state.doc.objects).toHaveLength(0);
        editor.redo();
        editor.redo();
        expect(editor.state.doc.objects).toHaveLength(2);
    });

    it('changeShape 只改选中且 kind=shape 的对象，undo 可回滚；无匹配/空配置不产生历史', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makeObject('s1')))
                .addStep(new AddObject(makePath('p1', 'freedraw')))
                .setSelection(['s1', 'p1'])
        );
        const before = editor.history.undoSize;

        editor.changeShape({ fill: '#0f0', strokeWidth: 5 });
        const s1 = editor.state.getObject('s1') as ShapeObject;
        expect(s1.fill).toBe('#0f0');
        expect(s1.strokeWidth).toBe(5);
        expect(s1.stroke).toBe('#000'); // 未指定不动
        expect((editor.state.getObject('p1') as PathObject).fill).toBe(''); // 非 shape 不动

        editor.undo();
        expect((editor.state.getObject('s1') as ShapeObject).fill).toBe('#000');

        editor.changeShape({}); // 空 attrs no-op
        editor.dispatch(editor.newTransaction().setSelection([]));
        editor.changeShape({ fill: '#f00' }); // 无选中 no-op
        // 第一次 changeShape 已 undo（undoSize 回落），后续均为 no-op；setSelection 不入历史
        expect(editor.history.undoSize).toBe(before);
    });

    function makeText(id: string, overrides: Partial<TextObject> = {}): TextObject {
        return {
            id,
            kind: 'text',
            text: 'hello',
            left: 0,
            top: 0,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            fontSize: 50,
            fontFamily: 'sans-serif',
            fill: '#000000',
            fontWeight: 'normal',
            fontStyle: '',
            textDecoration: '',
            textAlign: 'left',
            ...overrides
        };
    }

    it('startTextMode/endTextMode 切 mode；重复调用 no-op；endAll 通吃', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });

        editor.startTextMode();
        expect(editor.getCurrentState()).toBe('text');
        editor.startTextMode(); // 重复进入 no-op
        expect(editor.getCurrentState()).toBe('text');
        editor.endTextMode();
        expect(editor.getCurrentState()).toBe('normal');

        editor.startTextMode();
        editor.endAll();
        expect(editor.getCurrentState()).toBe('normal');

        editor.endTextMode(); // 已 normal，no-op
        expect(editor.getCurrentState()).toBe('normal');
    });

    it('addText 落 TextObject（默认文案/样式/位置），fire objectAdded，可 undo；无头 defaultEdit 不抛错', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        const added: TextObject[] = [];
        editor.on('objectAdded', ({ object }) => {
            added.push(object as TextObject);
        });

        editor.addText('hi', { styles: { fontWeight: 'bold', fontSize: 30 }, position: { x: 10, y: 20 } }, true);
        const obj = editor.state.doc.objects[0] as TextObject;
        expect(obj).toMatchObject({
            kind: 'text',
            text: 'hi',
            left: 10,
            top: 20,
            fontWeight: 'bold',
            fontSize: 30,
            fill: '#000000',
            fontFamily: 'sans-serif',
            fontStyle: '',
            textDecoration: '',
            textAlign: 'left'
        });
        expect(added).toHaveLength(1);
        expect(added[0].id).toBe(obj.id);
        // 对齐旧 addText：非 text 模式调用时顺带切到 text 模式
        expect(editor.getCurrentState()).toBe('text');
        expect(editor.isTextEditing()).toBe(false); // 无头模式无 controller，defaultEdit 为 no-op

        editor.addText(); // 缺省：默认文案「双击编辑」，无头 viewport info 全 0 → left/top = 0
        const def = editor.state.doc.objects[1] as TextObject;
        expect(def).toMatchObject({ text: '双击编辑', left: 0, top: 0, fontSize: 50 });

        editor.undo();
        editor.undo();
        expect(editor.state.doc.objects).toHaveLength(0);
        editor.redo();
        editor.redo();
        expect(editor.state.doc.objects).toHaveLength(2);
    });

    it('changeText 只改选中且 kind=text 的对象，undo 可回滚；无目标 no-op', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makeText('t1')))
                .addStep(new AddObject(makeObject('s1')))
                .setSelection(['t1', 's1'])
        );
        const before = editor.history.undoSize;

        editor.changeText('改后');
        expect((editor.state.getObject('t1') as TextObject).text).toBe('改后');
        expect(editor.state.getObject('s1')).toMatchObject({ kind: 'shape' }); // 非 text 不动

        editor.undo();
        expect((editor.state.getObject('t1') as TextObject).text).toBe('hello');

        editor.changeText('hello'); // 与当前值相同 → no-op
        editor.dispatch(editor.newTransaction().setSelection([]));
        editor.changeText('x'); // 无选中 no-op
        expect(editor.history.undoSize).toBe(before);
    });

    it('changeTextStyle toggle：异值设置、同值重置默认；多字段混合；undo 可回滚', () => {
        const editor = new Editor({ renderer: makeFakeRenderer() });
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makeText('t1', { fontWeight: 'bold', fontSize: 80 })))
                .addStep(new AddObject(makeText('t2')))
                .setSelection(['t1', 't2'])
        );

        // t1.fontWeight 已是 bold → toggle 重置 'normal'；t2 不是 → 设为 bold
        editor.changeTextStyle({ fontWeight: 'bold' });
        expect((editor.state.getObject('t1') as TextObject).fontWeight).toBe('normal');
        expect((editor.state.getObject('t2') as TextObject).fontWeight).toBe('bold');

        // fontSize：t1 当前 80 → 重置默认 50；t2 当前 50 → 设为 80
        editor.changeTextStyle({ fontSize: 80 });
        expect((editor.state.getObject('t1') as TextObject).fontSize).toBe(50);
        expect((editor.state.getObject('t2') as TextObject).fontSize).toBe(80);

        // 多字段混合 + 未涉及字段不动
        editor.changeTextStyle({ fontStyle: 'italic', fill: '#000000' });
        const t2 = editor.state.getObject('t2') as TextObject;
        expect(t2.fontStyle).toBe('italic'); // '' → italic
        expect(t2.fill).toBe('#000000'); // 已是 '#000000' → toggle 重置仍是 '#000000'
        expect(t2.fontFamily).toBe('sans-serif');

        editor.undo();
        editor.undo();
        editor.undo();
        expect((editor.state.getObject('t1') as TextObject).fontWeight).toBe('bold');
        expect((editor.state.getObject('t1') as TextObject).fontSize).toBe(80);

        const before = editor.history.undoSize;
        editor.changeTextStyle(); // 缺省 no-op
        editor.changeTextStyle({}); // 空配置 no-op
        editor.dispatch(editor.newTransaction().setSelection([]));
        editor.changeTextStyle({ fontWeight: 'bold' }); // 无选中 no-op
        expect(editor.history.undoSize).toBe(before);
    });

    it('getAngle 无背景返回 0；setAngle/rotate 无背景为 no-op', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });
        expect(editor.getAngle()).toBe(0);

        editor.setAngle(90);
        editor.rotate(90);
        expect(editor.getAngle()).toBe(0);
        expect(editor.history.undoSize).toBe(0);
        expect(renderer.syncState).not.toHaveBeenCalled();
    });

    it('setAngle 绝对角度 %360：背景 angle + 外接框宽高 + 对象随转，可 undo', () => {
        const editor = new Editor();
        editor.dispatch(
            editor.newTransaction().addStep(new SetBackground({ src: 'data:,x', width: 200, height: 100, name: 'a', angle: 0 }))
        );
        editor.dispatch(
            editor.newTransaction().addStep(new AddObject({ ...makeObject('a'), left: 200, top: 100 }))
        );
        const undoSizeBefore = editor.history.undoSize;

        editor.setAngle(90);
        const bg = editor.state.doc.background!;
        expect(editor.getAngle()).toBe(90);
        expect(bg.width).toBeCloseTo(100);
        expect(bg.height).toBeCloseTo(200);
        const obj = editor.state.getObject('a')!;
        // (200,100) 绕旧中心 (100,50) 转 90° → (50,150)；中心差 (-50,+50) 平移 → (0,200)
        expect(obj.left).toBeCloseTo(0);
        expect(obj.top).toBeCloseTo(200);
        expect(obj.angle).toBe(90);
        expect(editor.history.undoSize).toBe(undoSizeBefore + 1);

        editor.undo();
        expect(editor.getAngle()).toBe(0);
        expect(editor.state.doc.background!.width).toBe(200);
        expect(editor.state.doc.background!.height).toBe(100);
        expect(editor.state.getObject('a')!.angle).toBe(0);
    });

    it('setAngle 归一化：450 → 90；-90 → 270；角度未变 no-op', () => {
        const editor = new Editor();
        editor.dispatch(
            editor.newTransaction().addStep(new SetBackground({ src: 'data:,x', width: 200, height: 100, name: 'a', angle: 0 }))
        );

        editor.setAngle(450);
        expect(editor.getAngle()).toBe(90);

        editor.setAngle(-90);
        expect(editor.getAngle()).toBe(270);

        const undoSizeBefore = editor.history.undoSize;
        editor.setAngle(270); // 未变
        editor.setAngle(630); // 630 % 360 = 270 未变
        expect(editor.getAngle()).toBe(270);
        expect(editor.history.undoSize).toBe(undoSizeBefore);
    });

    it('notifyResize：有 renderer 时委托调用一次', () => {
        const renderer = makeFakeRenderer();
        const editor = new Editor({ renderer });

        editor.notifyResize();
        expect(renderer.notifyResize).toHaveBeenCalledTimes(1);

        editor.notifyResize();
        expect(renderer.notifyResize).toHaveBeenCalledTimes(2);
    });

    it('notifyResize：无 renderer（无头模式）为 no-op 不抛错', () => {
        const editor = new Editor();
        expect(() => editor.notifyResize()).not.toThrow();
    });

    it('rotate 相对累加；连续 4 次 rotate(90) 回到原状（宽高复原）', () => {
        const editor = new Editor();
        editor.dispatch(
            editor.newTransaction().addStep(new SetBackground({ src: 'data:,x', width: 200, height: 100, name: 'a', angle: 0 }))
        );

        editor.rotate(90);
        expect(editor.getAngle()).toBe(90);
        editor.rotate(90);
        expect(editor.getAngle()).toBe(180);
        editor.rotate(90);
        expect(editor.getAngle()).toBe(270);
        editor.rotate(90);
        expect(editor.getAngle()).toBe(0);
        expect(editor.state.doc.background!.width).toBeCloseTo(200);
        expect(editor.state.doc.background!.height).toBeCloseTo(100);
    });
});
