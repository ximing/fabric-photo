import { describe, expect, it } from 'vitest';
import { Editor } from './editor';
import type { ShapeObject } from './model/doc';
import { AddObject } from './steps/object-steps';

// —— 无头 Editor：覆盖剪贴板（copy/paste/cut/duplicate）、z 序、翻转的完整 state 语义 ——

function makeShape(id: string, left = 0, top = 0): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType: 'rect',
        left,
        top,
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

/** 新建无头 Editor 并按序加入对象（每次 add 一笔历史）。 */
function setup(...objects: ShapeObject[]): Editor {
    const editor = new Editor();
    for (const obj of objects) {
        editor.dispatch(editor.newTransaction().addStep(new AddObject(obj)));
    }
    return editor;
}

/** 仅改选中（不进历史）。 */
function select(editor: Editor, ids: readonly string[]): void {
    editor.dispatch(editor.newTransaction().setSelection(ids));
}

function ids(editor: Editor): string[] {
    return editor.state.doc.objects.map((o) => o.id);
}

describe('剪贴板：copy / paste', () => {
    it('无选中 copyActiveObjects 返回 false；空剪贴板 paste 返回 false', () => {
        const editor = setup(makeShape('a'));
        expect(editor.copyActiveObjects()).toBe(false);
        expect(editor.paste()).toBe(false);
        editor.destroy();
    });

    it('copy + paste：粘贴对象有新 id、left/top +16、属性深拷贝、粘贴结果被选中', () => {
        const editor = setup(makeShape('a', 10, 20));
        select(editor, ['a']);

        expect(editor.copyActiveObjects()).toBe(true);
        expect(editor.paste()).toBe(true);

        const objects = editor.state.doc.objects;
        expect(objects).toHaveLength(2);
        const pasted = objects[1];
        expect(pasted.id).not.toBe('a');
        expect(pasted.left).toBe(26);
        expect(pasted.top).toBe(36);
        expect((pasted as ShapeObject).fill).toBe('#000');
        expect(editor.state.selection).toEqual([pasted.id]);
        editor.destroy();
    });

    it('同一轮连续 paste 级联偏移：第 n 次偏移 16*n', () => {
        const editor = setup(makeShape('a', 0, 0));
        select(editor, ['a']);
        editor.copyActiveObjects();

        editor.paste();
        editor.paste();
        editor.paste();

        const offsets = editor.state.doc.objects.map((o) => o.left);
        expect(offsets).toEqual([0, 16, 32, 48]);
        editor.destroy();
    });

    it('copy/cut 后级联偏移重置为 1', () => {
        const editor = setup(makeShape('a', 0, 0));
        select(editor, ['a']);
        editor.copyActiveObjects();
        editor.paste();
        editor.paste(); // +32
        expect(editor.state.doc.objects.map((o) => o.left)).toEqual([0, 16, 32]);

        editor.copyActiveObjects(); // 当前选中为 +32 的副本
        editor.paste();
        const last = editor.state.doc.objects[editor.state.doc.objects.length - 1];
        expect(last.left).toBe(48); // 32 + 16，而非 32 + 48
        editor.destroy();
    });

    it('多选 copy/paste：一笔事务多个 AddObject，保持相对位置，undo 一步撤销整笔', () => {
        const editor = setup(makeShape('a', 0, 0), makeShape('b', 100, 50));
        select(editor, ['a', 'b']);
        const undoSizeBefore = editor.history.undoSize;

        editor.copyActiveObjects();
        editor.paste();

        const objects = editor.state.doc.objects;
        expect(objects).toHaveLength(4);
        const [pa, pb] = objects.slice(2);
        expect([pa.left, pa.top]).toEqual([16, 16]);
        expect([pb.left, pb.top]).toEqual([116, 66]); // 相对位置保持（差 100/50）
        expect(editor.state.selection).toEqual([pa.id, pb.id]);
        expect(editor.history.undoSize).toBe(undoSizeBefore + 1); // 整笔一条历史

        editor.undo();
        expect(ids(editor)).toEqual(['a', 'b']);
        expect(editor.state.selection).toEqual(['a', 'b']); // before-selection 快照恢复

        editor.redo();
        expect(editor.state.doc.objects).toHaveLength(4);
        expect(editor.state.selection).toEqual([pa.id, pb.id]);
        editor.destroy();
    });

    it('剪贴板内容是深拷贝：复制后修改原对象不影响后续粘贴', () => {
        const editor = setup(makeShape('a', 0, 0));
        select(editor, ['a']);
        editor.copyActiveObjects();

        editor.dispatch(
            editor.newTransaction().addStep(new AddObject(makeShape('b'))).setSelection(['b'])
        );
        editor.changeShape({ fill: '#ffffff' });
        select(editor, ['a']);
        editor.changeShape({ fill: '#ff0000' }); // 修改原对象

        editor.paste();
        const pasted = editor.state.doc.objects[editor.state.doc.objects.length - 1] as ShapeObject;
        expect(pasted.fill).toBe('#000'); // 仍是 copy 时的值
        editor.destroy();
    });
});

describe('剪贴板：cut', () => {
    it('无选中 cutActiveObjects 返回 false', () => {
        const editor = setup(makeShape('a'));
        expect(editor.cutActiveObjects()).toBe(false);
        editor.destroy();
    });

    it('cut 移除选中对象并写入剪贴板；paste 可贴回；undo 恢复', () => {
        const editor = setup(makeShape('a', 5, 5), makeShape('b', 50, 50));
        select(editor, ['a', 'b']);

        expect(editor.cutActiveObjects()).toBe(true);
        expect(ids(editor)).toEqual([]);
        expect(editor.state.selection).toEqual([]);

        expect(editor.paste()).toBe(true); // 剪贴板有内容
        expect(editor.state.doc.objects).toHaveLength(2);
        expect(editor.state.doc.objects[0].left).toBe(21);

        editor.undo(); // 撤销 paste
        editor.undo(); // 撤销 cut
        expect(ids(editor)).toEqual(['a', 'b']);
        expect(editor.state.selection).toEqual(['a', 'b']);
        editor.destroy();
    });
});

describe('duplicateActiveObjects', () => {
    it('不读/不写剪贴板：先 copy A 再 duplicate B，paste 仍得 A', () => {
        const editor = setup(makeShape('a', 0, 0), makeShape('b', 200, 200));
        select(editor, ['a']);
        editor.copyActiveObjects();

        select(editor, ['b']);
        expect(editor.duplicateActiveObjects()).toBe(true);
        expect(editor.state.doc.objects).toHaveLength(3);
        const dup = editor.state.doc.objects[2];
        expect(dup.id).not.toBe('b');
        expect([dup.left, dup.top]).toEqual([216, 216]); // 偏移恒 +16

        editor.paste();
        const pasted = editor.state.doc.objects[editor.state.doc.objects.length - 1];
        expect([pasted.left, pasted.top]).toEqual([16, 16]); // 仍是 A 的副本
        editor.destroy();
    });

    it('无选中 duplicateActiveObjects 返回 false', () => {
        const editor = setup(makeShape('a'));
        expect(editor.duplicateActiveObjects()).toBe(false);
        editor.destroy();
    });
});

describe('z 序', () => {
    it('bringToFront / sendToBack：单选移到顶/底', () => {
        const editor = setup(makeShape('a'), makeShape('b'), makeShape('c'));
        select(editor, ['a']);
        editor.bringToFront();
        expect(ids(editor)).toEqual(['b', 'c', 'a']);

        editor.sendToBack();
        expect(ids(editor)).toEqual(['a', 'b', 'c']);
        editor.destroy();
    });

    it('多选 bringToFront 保持相对顺序；undo/redo 恢复', () => {
        const editor = setup(makeShape('a'), makeShape('b'), makeShape('c'), makeShape('d'));
        select(editor, ['d', 'b']); // 选中顺序乱序，按 doc 序移动
        editor.bringToFront();
        expect(ids(editor)).toEqual(['a', 'c', 'b', 'd']);
        expect(editor.state.selection).toEqual(['d', 'b']); // 选中集不变

        editor.undo();
        expect(ids(editor)).toEqual(['a', 'b', 'c', 'd']);
        editor.redo();
        expect(ids(editor)).toEqual(['a', 'c', 'b', 'd']);
        editor.destroy();
    });

    it('bringForward / sendBackward：单选与相邻多选每次移动一层', () => {
        const editor = setup(makeShape('a'), makeShape('b'), makeShape('c'), makeShape('d'));

        select(editor, ['b']);
        editor.bringForward();
        expect(ids(editor)).toEqual(['a', 'c', 'b', 'd']);

        select(editor, ['c', 'b']);
        editor.bringForward(); // 相邻多选整体前进一层
        expect(ids(editor)).toEqual(['a', 'd', 'c', 'b']);

        editor.sendBackward();
        expect(ids(editor)).toEqual(['a', 'c', 'b', 'd']);

        select(editor, ['a']);
        editor.sendBackward();
        expect(ids(editor)).toEqual(['a', 'c', 'b', 'd']); // 已在底，no-op
        editor.destroy();
    });

    it('已在顶/底或无选中时 no-op：不 dispatch、不产生历史条目', () => {
        const editor = setup(makeShape('a'), makeShape('b'));
        const undoSize = editor.history.undoSize;

        editor.bringToFront(); // 无选中
        select(editor, ['b']);
        editor.bringToFront(); // 已在顶
        editor.bringForward(); // 已在顶
        select(editor, ['a']);
        editor.sendToBack(); // 已在底
        editor.sendBackward(); // 已在底

        expect(ids(editor)).toEqual(['a', 'b']);
        expect(editor.history.undoSize).toBe(undoSize);
        editor.destroy();
    });
});

describe('flipActiveObjects', () => {
    it('无选中返回 false', () => {
        const editor = setup(makeShape('a'));
        expect(editor.flipActiveObjects('horizontal')).toBe(false);
        expect(editor.flipActiveObjects('vertical')).toBe(false);
        editor.destroy();
    });

    it('horizontal 取负 scaleX、vertical 取负 scaleY，互不影响', () => {
        const editor = setup(makeShape('a'));
        select(editor, ['a']);

        expect(editor.flipActiveObjects('horizontal')).toBe(true);
        expect(editor.state.doc.objects[0].scaleX).toBe(-1);
        expect(editor.state.doc.objects[0].scaleY).toBe(1);

        expect(editor.flipActiveObjects('vertical')).toBe(true);
        expect(editor.state.doc.objects[0].scaleX).toBe(-1);
        expect(editor.state.doc.objects[0].scaleY).toBe(-1);

        editor.flipActiveObjects('horizontal'); // 再翻一次恢复
        expect(editor.state.doc.objects[0].scaleX).toBe(1);
        editor.destroy();
    });

    it('多选一笔事务：undo 一步恢复全部，redo 重做', () => {
        const a = makeShape('a');
        const b = makeShape('b');
        b.scaleX = 2;
        const editor = setup(a, b);
        select(editor, ['a', 'b']);
        const undoSizeBefore = editor.history.undoSize;

        editor.flipActiveObjects('horizontal');
        expect(editor.state.doc.objects.map((o) => o.scaleX)).toEqual([-1, -2]);
        expect(editor.history.undoSize).toBe(undoSizeBefore + 1);

        editor.undo();
        expect(editor.state.doc.objects.map((o) => o.scaleX)).toEqual([1, 2]);
        editor.redo();
        expect(editor.state.doc.objects.map((o) => o.scaleX)).toEqual([-1, -2]);
        editor.destroy();
    });
});
