import { describe, expect, it } from 'vitest';
import { Editor } from '../editor';
import { DEFAULT_FILTERS, createDoc, type FilterSettings, type ImageObject, type ShapeObject } from '../model/doc';
import { SetBackground } from './doc-steps';
import { SetFilters } from './filter-steps';
import { AddObject } from './object-steps';

function makeFilters(overrides: Partial<FilterSettings> = {}): FilterSettings {
    return { ...DEFAULT_FILTERS, ...overrides };
}

function makeImage(id: string): ImageObject {
    return {
        kind: 'image', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        src: 'data:image/png;base64,x', width: 64, height: 32
    };
}

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

function makeEditorWithBackground(): Editor {
    const editor = new Editor();
    editor.dispatch(
        editor.newTransaction().addStep(new SetBackground({ src: 'data:image/png;base64,bg', width: 800, height: 600, name: 'bg.png', angle: 0 }))
    );
    return editor;
}

describe('SetFilters step', () => {
    it('apply 写 after 到背景；invert 恢复 before（undefined = 移除字段）', () => {
        const doc = createDoc({ src: 'a', width: 10, height: 10, name: 'a', angle: 0 });
        const after = makeFilters({ brightness: 0.5 });
        const step = new SetFilters('background', undefined, after);

        const applied = step.apply(doc);
        expect(applied.failed).toBeUndefined();
        expect(applied.doc?.background?.filters).toEqual(after);
        expect(doc.background?.filters).toBeUndefined(); // 原 doc 不可变

        const inverted = step.invert().apply(applied.doc!);
        expect(inverted.failed).toBeUndefined();
        expect(inverted.doc?.background?.filters).toBeUndefined();
        expect('filters' in (inverted.doc?.background ?? {})).toBe(false);
    });

    it('apply 写 after 到 image 对象；invert 恢复 before', () => {
        const before = makeFilters({ contrast: 0.3 });
        const after = makeFilters({ contrast: -0.5, sepia: true });
        const doc = createDoc(null);
        doc.objects.push({ ...makeImage('i1'), filters: before });

        const step = new SetFilters('i1', before, after);
        const applied = step.apply(doc);
        expect(applied.failed).toBeUndefined();
        const obj = applied.doc?.objects[0] as ImageObject;
        expect(obj.filters).toEqual(after);

        const inverted = step.invert().apply(applied.doc!);
        expect((inverted.doc?.objects[0] as ImageObject).filters).toEqual(before);
    });

    it('无背景时 target background 失败', () => {
        const result = new SetFilters('background', undefined, makeFilters()).apply(createDoc(null));
        expect(result.failed).toBeDefined();
    });

    it('目标对象不存在时失败', () => {
        const result = new SetFilters('nope', undefined, makeFilters()).apply(createDoc(null));
        expect(result.failed).toBeDefined();
    });

    it('目标为非 image 对象（shape）时失败', () => {
        const doc = createDoc(null);
        doc.objects.push(makeShape('s1'));
        const result = new SetFilters('s1', undefined, makeFilters()).apply(doc);
        expect(result.failed).toBeDefined();
    });
});

describe('Editor 滤镜 API（无头）', () => {
    it('setBackgroundFilters：与现有 filters 合并（patch 语义），可 undo/redo', () => {
        const editor = makeEditorWithBackground();
        editor.setBackgroundFilters({ brightness: 0.4 });
        editor.setBackgroundFilters({ grayscale: true });

        const filters = editor.state.doc.background?.filters;
        expect(filters).toEqual(makeFilters({ brightness: 0.4, grayscale: true }));

        editor.undo();
        expect(editor.state.doc.background?.filters).toEqual(makeFilters({ brightness: 0.4 }));
        editor.undo();
        expect(editor.state.doc.background?.filters).toBeUndefined();
        editor.redo();
        editor.redo();
        expect(editor.state.doc.background?.filters).toEqual(makeFilters({ brightness: 0.4, grayscale: true }));
        editor.destroy();
    });

    it('setBackgroundFilters：无背景 no-op；全默认 patch 在无滤镜时 no-op（不产生历史）', () => {
        const empty = new Editor();
        empty.setBackgroundFilters({ brightness: 0.5 });
        expect(empty.isEdited()).toBe(false);
        empty.destroy();

        const editor = makeEditorWithBackground();
        editor.clearUndoStack();
        editor.setBackgroundFilters({ brightness: 0 });
        expect(editor.isEdited()).toBe(false);
        expect(editor.state.doc.background?.filters).toBeUndefined();
        editor.destroy();
    });

    it('mergeKey：连续多次 dispatch 合并为一个 undo 条目，一次 undo 回到起点', () => {
        const editor = makeEditorWithBackground();
        editor.clearUndoStack();
        // 模拟滑杆连续拖动
        for (const brightness of [0.1, 0.2, 0.3, 0.4, 0.5]) {
            editor.setBackgroundFilters({ brightness }, { mergeKey: 'bg-filters' });
        }
        expect(editor.state.doc.background?.filters?.brightness).toBe(0.5);
        expect(editor.history.undoSize).toBe(1);

        editor.undo();
        expect(editor.state.doc.background?.filters).toBeUndefined();
        editor.redo();
        expect(editor.state.doc.background?.filters?.brightness).toBe(0.5);
        editor.destroy();
    });

    it('mergeKey 不同则各自成条目；无 mergeKey 的调用打断合并链', () => {
        const editor = makeEditorWithBackground();
        editor.clearUndoStack();
        editor.setBackgroundFilters({ brightness: 0.1 }, { mergeKey: 'a' });
        editor.setBackgroundFilters({ brightness: 0.2 }, { mergeKey: 'b' });
        editor.setBackgroundFilters({ brightness: 0.3 }, { mergeKey: 'a' }); // 栈顶是 b，不合并
        expect(editor.history.undoSize).toBe(3);
        editor.setBackgroundFilters({ brightness: 0.4 }, { mergeKey: 'a' }); // 栈顶是 a，合并
        expect(editor.history.undoSize).toBe(3);
        editor.undo();
        expect(editor.state.doc.background?.filters?.brightness).toBe(0.2);
        editor.destroy();
    });

    it('setImageFilters：作用于指定 image 对象；非 image / 不存在 id no-op', () => {
        const editor = makeEditorWithBackground();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeImage('i1'))).addStep(new AddObject(makeShape('s1'))));
        editor.setImageFilters('i1', { saturation: -0.6, invert: true });
        expect((editor.state.getObject('i1') as ImageObject).filters).toEqual(makeFilters({ saturation: -0.6, invert: true }));

        editor.setImageFilters('s1', { brightness: 1 });
        editor.setImageFilters('missing', { brightness: 1 });
        expect((editor.state.getObject('s1') as ShapeObject & { filters?: unknown }).filters).toBeUndefined();
        editor.destroy();
    });

    it('setImageFilters mergeKey：同一对象连续拖动一个 undo 条目（img-filters-${id}）', () => {
        const editor = makeEditorWithBackground();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeImage('i1'))));
        editor.clearUndoStack();
        for (const blur of [0.2, 0.4, 0.6]) {
            editor.setImageFilters('i1', { blur }, { mergeKey: 'img-filters-i1' });
        }
        expect(editor.history.undoSize).toBe(1);
        editor.undo();
        expect((editor.state.getObject('i1') as ImageObject).filters).toBeUndefined();
        editor.destroy();
    });

    it('resetBackgroundFilters：移除 filters 字段，可 undo 恢复', () => {
        const editor = makeEditorWithBackground();
        editor.setBackgroundFilters({ sepia: true, brightness: -0.2 });
        const before = editor.state.doc.background?.filters;
        editor.resetBackgroundFilters();
        expect(editor.state.doc.background?.filters).toBeUndefined();
        editor.undo();
        expect(editor.state.doc.background?.filters).toEqual(before);
        editor.destroy();
    });

    it('resetBackgroundFilters：已无滤镜时 no-op', () => {
        const editor = makeEditorWithBackground();
        editor.clearUndoStack();
        editor.resetBackgroundFilters();
        expect(editor.isEdited()).toBe(false);
        editor.destroy();
    });

    it('resetImageFilters：移除对象滤镜并可 undo；无滤镜对象与不存在 id 为 no-op', () => {
        const editor = makeEditorWithBackground();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeImage('i1'))));
        editor.setImageFilters('i1', { contrast: 0.8 });
        editor.resetImageFilters('i1');
        expect((editor.state.getObject('i1') as ImageObject).filters).toBeUndefined();
        editor.undo();
        expect((editor.state.getObject('i1') as ImageObject).filters).toEqual(makeFilters({ contrast: 0.8 }));
        editor.redo();
        expect((editor.state.getObject('i1') as ImageObject).filters).toBeUndefined();

        // 当前已无滤镜：reset 为 no-op，不产生历史
        editor.clearUndoStack();
        editor.resetImageFilters('i1');
        editor.resetImageFilters('missing');
        expect(editor.isEdited()).toBe(false);
        editor.destroy();
    });
});
