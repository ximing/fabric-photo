import { describe, expect, it, vi } from 'vitest';
import { Editor } from './editor';
import type { ShapeObject } from './model/doc';
import { AddObject } from './steps/object-steps';

// B3 图层面板配套 Editor API：selectObjects / moveObjectToIndex /
// setObjectOpacity / toggleObjectLocked / toggleObjectHidden（无头 Editor 即可测全语义）

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

function makeEditor(ids: string[]): Editor {
    const editor = new Editor();
    const tr = editor.newTransaction();
    for (const id of ids) {
        tr.addStep(new AddObject(makeObject(id)));
    }
    editor.dispatch(tr);
    editor.clearUndoStack();
    return editor;
}

function order(editor: Editor): string[] {
    return editor.state.doc.objects.map((o) => o.id);
}

describe('selectObjects', () => {
    it('设置选中集并触发 change:selection，不产生历史', () => {
        const editor = makeEditor(['a', 'b', 'c']);
        const onSelection = vi.fn();
        editor.on('change:selection', onSelection);

        editor.selectObjects(['a', 'c']);

        expect(editor.state.selection).toEqual(['a', 'c']);
        expect(onSelection).toHaveBeenCalledTimes(1);
        expect(onSelection).toHaveBeenCalledWith({ selection: ['a', 'c'] });
        expect(editor.isEmptyUndoStack()).toBe(true);
    });

    it('过滤无效 id 并去重', () => {
        const editor = makeEditor(['a', 'b']);
        editor.selectObjects(['a', 'nope', 'a', 'b']);
        expect(editor.state.selection).toEqual(['a', 'b']);
    });

    it('与现选中集相同为 no-op（不触发事件）', () => {
        const editor = makeEditor(['a', 'b']);
        editor.selectObjects(['a']);
        const onSelection = vi.fn();
        editor.on('change:selection', onSelection);

        editor.selectObjects(['a']);
        expect(onSelection).not.toHaveBeenCalled();
        expect(editor.isEmptyUndoStack()).toBe(true);
    });
});

describe('moveObjectToIndex', () => {
    it('移动到数组各位置（顶/中/底）', () => {
        const editor = makeEditor(['a', 'b', 'c', 'd']);

        editor.moveObjectToIndex('a', 3);
        expect(order(editor)).toEqual(['b', 'c', 'd', 'a']);

        editor.moveObjectToIndex('a', 1);
        expect(order(editor)).toEqual(['b', 'a', 'c', 'd']);

        editor.moveObjectToIndex('d', 0);
        expect(order(editor)).toEqual(['d', 'b', 'a', 'c']);
    });

    it('toIndex 越界 clamp 到两端', () => {
        const editor = makeEditor(['a', 'b', 'c']);

        editor.moveObjectToIndex('a', 99);
        expect(order(editor)).toEqual(['b', 'c', 'a']);

        editor.moveObjectToIndex('a', -5);
        expect(order(editor)).toEqual(['a', 'b', 'c']);
    });

    it('原位移动与非法 id 为 no-op（不产历史）', () => {
        const editor = makeEditor(['a', 'b', 'c']);

        editor.moveObjectToIndex('b', 1);
        editor.moveObjectToIndex('nope', 0);

        expect(order(editor)).toEqual(['a', 'b', 'c']);
        expect(editor.isEmptyUndoStack()).toBe(true);
    });

    it('undo/redo 恢复原顺序', () => {
        const editor = makeEditor(['a', 'b', 'c']);

        editor.moveObjectToIndex('a', 2);
        expect(order(editor)).toEqual(['b', 'c', 'a']);
        expect(editor.history.undoSize).toBe(1);

        editor.undo();
        expect(order(editor)).toEqual(['a', 'b', 'c']);

        editor.redo();
        expect(order(editor)).toEqual(['b', 'c', 'a']);
    });
});

describe('setObjectOpacity', () => {
    it('设置不透明度并 clamp 到 [0,1]', () => {
        const editor = makeEditor(['a', 'b']);

        editor.setObjectOpacity(['a'], 0.5);
        expect(editor.state.getObject('a')?.opacity).toBe(0.5);

        editor.setObjectOpacity(['a'], 1.7);
        expect(editor.state.getObject('a')?.opacity).toBe(1);

        editor.setObjectOpacity(['a', 'b'], -0.2);
        expect(editor.state.getObject('a')?.opacity).toBe(0);
        expect(editor.state.getObject('b')?.opacity).toBe(0);
    });

    it('已是目标值（含缺省 1）为 no-op；非法 id 跳过', () => {
        const editor = makeEditor(['a', 'b']);

        editor.setObjectOpacity(['a', 'nope'], 1);
        expect(editor.isEmptyUndoStack()).toBe(true);

        editor.setObjectOpacity(['a'], 0.3);
        editor.clearUndoStack();
        editor.setObjectOpacity(['a'], 0.3);
        expect(editor.isEmptyUndoStack()).toBe(true);
    });

    it('mergeKey 连续调用合并为一个 undo 条目，undo 回到最初值', () => {
        const editor = makeEditor(['a']);

        editor.setObjectOpacity(['a'], 0.8, { mergeKey: 'op' });
        editor.setObjectOpacity(['a'], 0.6, { mergeKey: 'op' });
        editor.setObjectOpacity(['a'], 0.4, { mergeKey: 'op' });

        expect(editor.state.getObject('a')?.opacity).toBe(0.4);
        expect(editor.history.undoSize).toBe(1);

        editor.undo();
        expect(editor.state.getObject('a')?.opacity).toBeUndefined(); // 最初缺省（= 1）
    });

    it('undo/redo 恢复不透明度', () => {
        const editor = makeEditor(['a']);

        editor.setObjectOpacity(['a'], 0.2);
        editor.undo();
        expect(editor.state.getObject('a')?.opacity).toBeUndefined();
        editor.redo();
        expect(editor.state.getObject('a')?.opacity).toBe(0.2);
    });
});

describe('toggleObjectLocked / toggleObjectHidden', () => {
    it('toggle locked：往返切换，undo/redo 成对', () => {
        const editor = makeEditor(['a']);

        editor.toggleObjectLocked('a');
        expect(editor.state.getObject('a')?.locked).toBe(true);

        editor.toggleObjectLocked('a');
        expect(editor.state.getObject('a')?.locked).toBe(false);

        editor.undo();
        expect(editor.state.getObject('a')?.locked).toBe(true);
        editor.undo();
        expect(editor.state.getObject('a')?.locked).toBeUndefined();
        editor.redo();
        expect(editor.state.getObject('a')?.locked).toBe(true);
    });

    it('toggle hidden：往返切换，undo 恢复', () => {
        const editor = makeEditor(['a']);

        editor.toggleObjectHidden('a');
        expect(editor.state.getObject('a')?.hidden).toBe(true);

        editor.toggleObjectHidden('a');
        expect(editor.state.getObject('a')?.hidden).toBe(false);

        editor.undo();
        expect(editor.state.getObject('a')?.hidden).toBe(true);
    });

    it('非法 id 为 no-op（不产历史）', () => {
        const editor = makeEditor(['a']);

        editor.toggleObjectLocked('nope');
        editor.toggleObjectHidden('nope');

        expect(editor.isEmptyUndoStack()).toBe(true);
    });
});
