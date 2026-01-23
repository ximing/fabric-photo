import { describe, expect, it } from 'vitest';
import { Editor } from './editor';
import type { ShapeObject } from './model/doc';
import { AddObject, UpdateObject } from './steps/object-steps';

// B4 对齐分布 Editor API：alignActiveObjects / distributeActiveObjects（无头 Editor 即可测全语义）

function makeShape(id: string, left: number, top: number, width = 10, height = 10): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType: 'rect',
        left,
        top,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width,
        height,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 1
    };
}

/** 建无头 Editor：加入对象并选中，清空历史（让被测调用成为唯一 undo 条目）。 */
function makeEditor(shapes: ShapeObject[], selected: string[]): Editor {
    const editor = new Editor();
    const tr = editor.newTransaction();
    for (const shape of shapes) {
        tr.addStep(new AddObject(shape));
    }
    editor.dispatch(tr);
    editor.selectObjects(selected);
    editor.clearUndoStack();
    return editor;
}

function geo(editor: Editor, id: string): { left: number; top: number } {
    const obj = editor.state.getObject(id);
    if (obj === undefined) {
        throw new Error(`missing object ${id}`);
    }
    return { left: obj.left, top: obj.top };
}

describe('alignActiveObjects', () => {
    // a: left 0..10, top 0..10；b: left 20..50（宽 30）, top 40..60（高 20）
    // 整体 bbox：left 0, right 50, centerX 25, top 0, bottom 60, centerY 30
    const shapes = () => [makeShape('a', 0, 0, 10, 10), makeShape('b', 20, 40, 30, 20)];

    it('left：全部对象左边对齐到整体 bbox 左边', () => {
        const editor = makeEditor(shapes(), ['a', 'b']);
        expect(editor.alignActiveObjects('left')).toBe(true);
        expect(geo(editor, 'a')).toEqual({ left: 0, top: 0 });
        expect(geo(editor, 'b')).toEqual({ left: 0, top: 40 });
        editor.destroy();
    });

    it('centerX：中心对齐到整体 bbox 水平中心（25）', () => {
        const editor = makeEditor(shapes(), ['a', 'b']);
        expect(editor.alignActiveObjects('centerX')).toBe(true);
        expect(geo(editor, 'a').left).toBe(20); // 25 - 10/2
        expect(geo(editor, 'b').left).toBe(10); // 25 - 30/2
        editor.destroy();
    });

    it('right：右边对齐到整体 bbox 右边（50）', () => {
        const editor = makeEditor(shapes(), ['a', 'b']);
        expect(editor.alignActiveObjects('right')).toBe(true);
        expect(geo(editor, 'a').left).toBe(40); // 50 - 10
        expect(geo(editor, 'b').left).toBe(20); // 已在位
        editor.destroy();
    });

    it('top / centerY / bottom：垂直三向对齐', () => {
        const topEditor = makeEditor(shapes(), ['a', 'b']);
        expect(topEditor.alignActiveObjects('top')).toBe(true);
        expect(geo(topEditor, 'b').top).toBe(0);
        topEditor.destroy();

        const centerEditor = makeEditor(shapes(), ['a', 'b']);
        expect(centerEditor.alignActiveObjects('centerY')).toBe(true);
        expect(geo(centerEditor, 'a').top).toBe(25); // 30 - 10/2
        expect(geo(centerEditor, 'b').top).toBe(20); // 30 - 20/2
        centerEditor.destroy();

        const bottomEditor = makeEditor(shapes(), ['a', 'b']);
        expect(bottomEditor.alignActiveObjects('bottom')).toBe(true);
        expect(geo(bottomEditor, 'a').top).toBe(50); // 60 - 10
        expect(geo(bottomEditor, 'b').top).toBe(40); // 已在位
        bottomEditor.destroy();
    });

    it('一笔事务：undo 一步全部回退', () => {
        const editor = makeEditor(shapes(), ['a', 'b']);
        editor.alignActiveObjects('left');
        expect(editor.isEmptyUndoStack()).toBe(false);
        editor.undo();
        expect(geo(editor, 'a')).toEqual({ left: 0, top: 0 });
        expect(geo(editor, 'b')).toEqual({ left: 20, top: 40 });
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('少于 2 个选中：返回 false 不产历史', () => {
        const editor = makeEditor(shapes(), ['a']);
        expect(editor.alignActiveObjects('left')).toBe(false);
        expect(geo(editor, 'a')).toEqual({ left: 0, top: 0 });
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('locked 对象不参与：过滤后不足 2 个返回 false', () => {
        const editor = makeEditor(shapes(), ['a', 'b']);
        editor.dispatch(editor.newTransaction().addStep(new UpdateObject('b', { locked: true })));
        editor.clearUndoStack();
        expect(editor.alignActiveObjects('left')).toBe(false);
        expect(geo(editor, 'a')).toEqual({ left: 0, top: 0 });
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('已全部对齐为 no-op：返回 false 不产历史', () => {
        const editor = makeEditor([makeShape('a', 5, 0), makeShape('b', 5, 40)], ['a', 'b']);
        expect(editor.alignActiveObjects('left')).toBe(false);
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('尺寸取 width×|scaleX|：缩放对象按缩放后 bbox 对齐', () => {
        const a = makeShape('a', 0, 0, 10, 10);
        const b = { ...makeShape('b', 100, 0, 10, 10), scaleX: 2 }; // bbox 宽 20
        const editor = makeEditor([a, b], ['a', 'b']);
        // 整体 right = 120；a 右边对齐 → left = 110
        expect(editor.alignActiveObjects('right')).toBe(true);
        expect(geo(editor, 'a').left).toBe(110);
        editor.destroy();
    });
});

describe('distributeActiveObjects', () => {
    it('horizontal：两端固定、中间均分间隙', () => {
        // a: 0..10，b: 30..40，c: 100..110（均宽 10）→ 跨度 110，总宽 30，gap = (110-30)/2 = 40
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 30, 5), makeShape('c', 100, 9)], [
            'a',
            'b',
            'c'
        ]);
        expect(editor.distributeActiveObjects('horizontal')).toBe(true);
        expect(geo(editor, 'a').left).toBe(0); // 端点不动
        expect(geo(editor, 'b').left).toBe(50); // 0 + 10 + 40
        expect(geo(editor, 'c').left).toBe(100); // 端点不动
        // top 不受影响
        expect(geo(editor, 'b').top).toBe(5);
        editor.destroy();
    });

    it('vertical：按 top 轴等间距分布', () => {
        // a: top 0..10，b: top 20..30，c: top 60..60+20（高 20）→ 跨度 80，总高 40，gap = 20
        const editor = makeEditor(
            [makeShape('a', 0, 0, 10, 10), makeShape('b', 0, 20, 10, 10), makeShape('c', 0, 60, 10, 20)],
            ['a', 'b', 'c']
        );
        expect(editor.distributeActiveObjects('vertical')).toBe(true);
        expect(geo(editor, 'a').top).toBe(0);
        expect(geo(editor, 'b').top).toBe(30); // 0 + 10 + 20
        expect(geo(editor, 'c').top).toBe(60);
        editor.destroy();
    });

    it('排序按轴心：乱序选中仍按几何顺序分布', () => {
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 30, 0), makeShape('c', 100, 0)], [
            'c',
            'a',
            'b'
        ]);
        expect(editor.distributeActiveObjects('horizontal')).toBe(true);
        expect(geo(editor, 'b').left).toBe(50);
        editor.destroy();
    });

    it('一笔事务：undo 一步全部回退', () => {
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 30, 0), makeShape('c', 100, 0)], [
            'a',
            'b',
            'c'
        ]);
        editor.distributeActiveObjects('horizontal');
        editor.undo();
        expect(geo(editor, 'b').left).toBe(30);
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('少于 3 个选中：返回 false 不产历史', () => {
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 30, 0)], ['a', 'b']);
        expect(editor.distributeActiveObjects('horizontal')).toBe(false);
        expect(editor.distributeActiveObjects('vertical')).toBe(false);
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('locked 对象不参与：过滤后不足 3 个返回 false', () => {
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 30, 0), makeShape('c', 100, 0)], [
            'a',
            'b',
            'c'
        ]);
        editor.dispatch(editor.newTransaction().addStep(new UpdateObject('c', { locked: true })));
        editor.clearUndoStack();
        expect(editor.distributeActiveObjects('horizontal')).toBe(false);
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });

    it('locked 被排除后参与对象照常分布（锁定对象不动）', () => {
        const editor = makeEditor(
            [makeShape('a', 0, 0), makeShape('b', 30, 0), makeShape('c', 100, 0), makeShape('d', 200, 0)],
            ['a', 'b', 'c', 'd']
        );
        editor.dispatch(editor.newTransaction().addStep(new UpdateObject('d', { locked: true })));
        editor.clearUndoStack();
        // d 锁定排除：a/b/c 三者分布（同上用例），d 保持原位
        expect(editor.distributeActiveObjects('horizontal')).toBe(true);
        expect(geo(editor, 'b').left).toBe(50);
        expect(geo(editor, 'd').left).toBe(200);
        editor.destroy();
    });

    // horizontal 间距用例覆盖：a:0..10, b:50..60, c:100..110 已等距（gap 40）
    it('已等距为 no-op：返回 false 不产历史', () => {
        const editor = makeEditor([makeShape('a', 0, 0), makeShape('b', 50, 0), makeShape('c', 100, 0)], [
            'a',
            'b',
            'c'
        ]);
        expect(editor.distributeActiveObjects('horizontal')).toBe(false);
        expect(editor.isEmptyUndoStack()).toBe(true);
        editor.destroy();
    });
});
