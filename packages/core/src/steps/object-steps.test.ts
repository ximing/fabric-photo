import { describe, expect, it } from 'vitest';
import { createDoc, type Doc, type ShapeObject } from '../model/doc';
import { AddObject, ClearObjects, RemoveObject, RestoreObject, UpdateObject } from './object-steps';

function makeShape(id: string, left = 0, top = 0): ShapeObject {
    return {
        kind: 'shape', id, left, top, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

function docWith(...objects: ShapeObject[]): Doc {
    return { background: null, objects: [...objects] };
}

describe('AddObject', () => {
    it('appends the object to the end of objects (top of z-order)', () => {
        const doc = docWith(makeShape('a'));
        const result = new AddObject(makeShape('b')).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc).not.toBe(doc);
        expect(result.doc!.objects.map((o) => o.id)).toEqual(['a', 'b']);
        // 原 doc 不被修改
        expect(doc.objects).toHaveLength(1);
    });

    it('fails when the id already exists', () => {
        const doc = docWith(makeShape('a'));
        const result = new AddObject(makeShape('a')).apply(doc);
        expect(result.failed).toBeTruthy();
        expect(result.doc).toBeUndefined();
    });

    it('invert round-trips: add then remove returns the original doc', () => {
        const doc = docWith(makeShape('a'));
        const step = new AddObject(makeShape('b'));
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });
});

describe('RemoveObject', () => {
    it('removes the object by id', () => {
        const doc = docWith(makeShape('a'), makeShape('b'), makeShape('c'));
        const result = new RemoveObject('b').apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.objects.map((o) => o.id)).toEqual(['a', 'c']);
        expect(doc.objects).toHaveLength(3);
    });

    it('fails when the id does not exist', () => {
        const doc = docWith(makeShape('a'));
        const result = new RemoveObject('zzz').apply(doc);
        expect(result.failed).toBeTruthy();
        expect(result.doc).toBeUndefined();
    });

    it('invert restores the object at its original index', () => {
        const doc = docWith(makeShape('a'), makeShape('b', 1, 2), makeShape('c'));
        const step = new RemoveObject('b');
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });
});

describe('RestoreObject', () => {
    it('inserts the object at the given index', () => {
        const doc = docWith(makeShape('a'), makeShape('c'));
        const result = new RestoreObject(makeShape('b'), 1).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    });

    it('fails when the id already exists', () => {
        const doc = docWith(makeShape('a'));
        const result = new RestoreObject(makeShape('a'), 0).apply(doc);
        expect(result.failed).toBeTruthy();
    });

    it('invert removes the restored object', () => {
        const doc = docWith(makeShape('a'), makeShape('c'));
        const step = new RestoreObject(makeShape('b'), 1);
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });
});

describe('UpdateObject', () => {
    it('merges attrs into the object', () => {
        const doc = docWith(makeShape('a'));
        const result = new UpdateObject('a', { left: 42, fill: '#00ff00' }).apply(doc);
        expect(result.failed).toBeUndefined();
        const obj = result.doc!.objects[0] as ShapeObject;
        expect(obj.left).toBe(42);
        expect(obj.fill).toBe('#00ff00');
        expect(obj.stroke).toBe('#000000');
    });

    it('fails when the id does not exist', () => {
        const doc = docWith(makeShape('a'));
        const result = new UpdateObject('zzz', { left: 1 }).apply(doc);
        expect(result.failed).toBeTruthy();
        expect(result.doc).toBeUndefined();
    });

    it('filters id and kind out of attrs', () => {
        const doc = docWith(makeShape('a'));
        const result = new UpdateObject('a', { id: 'hacked', kind: 'text', left: 7 }).apply(doc);
        expect(result.failed).toBeUndefined();
        const obj = result.doc!.objects[0] as ShapeObject;
        expect(obj.id).toBe('a');
        expect(obj.kind).toBe('shape');
        expect(obj.left).toBe(7);
    });

    it('invert restores only the changed keys', () => {
        const doc = docWith(makeShape('a'));
        const step = new UpdateObject('a', { left: 42, fill: '#00ff00' });
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
        // 未涉及的 key 在 invert 里不存在
        expect((step.invert() as UpdateObject).attrs).toEqual({ left: 0, fill: '#ff0000' });
    });
});

describe('ClearObjects', () => {
    it('removes all objects', () => {
        const doc = docWith(makeShape('a'), makeShape('b'), makeShape('c'));
        const result = new ClearObjects().apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.objects).toEqual([]);
        expect(doc.objects).toHaveLength(3);
    });

    it('invert restores the original z-order', () => {
        const doc = docWith(makeShape('a'), makeShape('b', 1, 2), makeShape('c', 3, 4));
        const step = new ClearObjects();
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });

    it('works on an empty doc', () => {
        const doc = createDoc();
        const step = new ClearObjects();
        const applied = step.apply(doc).doc!;
        expect(applied.objects).toEqual([]);
        expect(step.invert().apply(applied).doc).toEqual(doc);
    });
});
