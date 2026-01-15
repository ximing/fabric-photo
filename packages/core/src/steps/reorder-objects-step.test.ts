import { describe, expect, it } from 'vitest';
import { createDoc, type Doc, type ShapeObject } from '../model/doc';
import { ReorderObjects, computeReorderedIds } from './reorder-objects-step';

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape',
        id,
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        shapeType: 'rect',
        width: 100,
        height: 80,
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 2
    };
}

function docWith(...ids: string[]): Doc {
    return { background: null, objects: ids.map(makeShape) };
}

function ids(doc: Doc): string[] {
    return doc.objects.map((o) => o.id);
}

describe('computeReorderedIds', () => {
    it('front：选中项移到末尾（z 序顶），多选保持相对顺序', () => {
        const doc = docWith('a', 'b', 'c', 'd');
        expect(computeReorderedIds(doc, ['a'], 'front')).toEqual(['b', 'c', 'd', 'a']);
        expect(computeReorderedIds(doc, ['d', 'b'], 'front')).toEqual(['a', 'c', 'b', 'd']);
    });

    it('back：选中项移到开头（z 序底），多选保持相对顺序', () => {
        const doc = docWith('a', 'b', 'c', 'd');
        expect(computeReorderedIds(doc, ['c'], 'back')).toEqual(['c', 'a', 'b', 'd']);
        expect(computeReorderedIds(doc, ['d', 'b'], 'back')).toEqual(['b', 'd', 'a', 'c']);
    });

    it('forward：选中项整体上移一层；相邻多选只前进一层', () => {
        const doc = docWith('a', 'b', 'c', 'd');
        expect(computeReorderedIds(doc, ['b'], 'forward')).toEqual(['a', 'c', 'b', 'd']);
        expect(computeReorderedIds(doc, ['b', 'c'], 'forward')).toEqual(['a', 'd', 'b', 'c']);
        expect(computeReorderedIds(doc, ['a', 'c'], 'forward')).toEqual(['b', 'a', 'd', 'c']);
    });

    it('backward：选中项整体下移一层；相邻多选只后退一层', () => {
        const doc = docWith('a', 'b', 'c', 'd');
        expect(computeReorderedIds(doc, ['c'], 'backward')).toEqual(['a', 'c', 'b', 'd']);
        expect(computeReorderedIds(doc, ['b', 'c'], 'backward')).toEqual(['b', 'c', 'a', 'd']);
        expect(computeReorderedIds(doc, ['b', 'd'], 'backward')).toEqual(['b', 'a', 'd', 'c']);
    });

    it('已在顶/底（含多选紧邻边界）返回 null（调用方 no-op）', () => {
        const doc = docWith('a', 'b', 'c');
        expect(computeReorderedIds(doc, ['c'], 'front')).toBeNull();
        expect(computeReorderedIds(doc, ['b', 'c'], 'front')).toBeNull();
        expect(computeReorderedIds(doc, ['c'], 'forward')).toBeNull();
        expect(computeReorderedIds(doc, ['a'], 'back')).toBeNull();
        expect(computeReorderedIds(doc, ['a', 'b'], 'back')).toBeNull();
        expect(computeReorderedIds(doc, ['a'], 'backward')).toBeNull();
    });

    it('ids 不在 doc 中或为空返回 null；部分有效时按有效子集计算', () => {
        const doc = docWith('a', 'b');
        expect(computeReorderedIds(doc, [], 'front')).toBeNull();
        expect(computeReorderedIds(doc, ['zzz'], 'front')).toBeNull();
        expect(computeReorderedIds(doc, ['zzz', 'a'], 'front')).toEqual(['b', 'a']);
    });
});

describe('ReorderObjects', () => {
    it('apply 按 after 重排 doc.objects（对象内容随之移动，原 doc 不变）', () => {
        const doc = docWith('a', 'b', 'c');
        const step = new ReorderObjects(['a', 'b', 'c'], ['c', 'a', 'b']);
        const result = step.apply(doc);
        expect(result.failed).toBeUndefined();
        expect(ids(result.doc!)).toEqual(['c', 'a', 'b']);
        expect(result.doc!.objects[0]).toEqual(makeShape('c'));
        expect(ids(doc)).toEqual(['a', 'b', 'c']);
    });

    it('apply/invert 成对：重排后 invert 恢复原序', () => {
        const doc = docWith('a', 'b', 'c', 'd');
        const step = new ReorderObjects(ids(doc), ['b', 'd', 'a', 'c']);
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });

    it('order 与 doc 的 id 集不一致时 apply 失败', () => {
        const doc = docWith('a', 'b');
        expect(new ReorderObjects(['a', 'b'], ['a', 'b', 'c']).apply(doc).failed).toBeTruthy();
        expect(new ReorderObjects(['a', 'b'], ['a', 'zzz']).apply(doc).failed).toBeTruthy();
    });
});

describe('createDoc 空文档边界', () => {
    it('空 doc 上任何 action 返回 null', () => {
        const doc = createDoc();
        expect(computeReorderedIds(doc, ['a'], 'front')).toBeNull();
    });
});
