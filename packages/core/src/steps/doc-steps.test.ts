import { describe, expect, it } from 'vitest';
import { createDoc, type BackgroundImage, type Doc, type ShapeObject } from '../model/doc';
import { rotatePointAround, RestoreDoc, SetBackground, TransformDoc } from './doc-steps';

function makeBg(overrides: Partial<BackgroundImage> = {}): BackgroundImage {
    return { src: 'data:image/png;base64,x', width: 100, height: 200, name: 'bg.png', angle: 0, ...overrides };
}

function makeShape(id: string, left = 0, top = 0, angle = 0): ShapeObject {
    return {
        kind: 'shape', id, left, top, angle, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 10, height: 8, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

describe('rotatePointAround', () => {
    it('rotates a point 90° around a center', () => {
        // (1, 0) 绕原点转 90° → (0, 1)
        const p = rotatePointAround({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
        expect(p.x).toBeCloseTo(0);
        expect(p.y).toBeCloseTo(1);
    });

    it('keeps the center fixed', () => {
        const p = rotatePointAround({ x: 5, y: 7 }, { x: 5, y: 7 }, 1.234);
        expect(p.x).toBeCloseTo(5);
        expect(p.y).toBeCloseTo(7);
    });
});

describe('SetBackground', () => {
    it('sets the background and clears objects (matches crop/swap behavior)', () => {
        const doc: Doc = { background: makeBg(), objects: [makeShape('a')] };
        const newBg = makeBg({ src: 'data:image/png;base64,y', width: 300, height: 400 });
        const result = new SetBackground(newBg).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.background).toEqual(newBg);
        expect(result.doc!.objects).toEqual([]);
        // 原 doc 不被修改
        expect(doc.objects).toHaveLength(1);
    });

    it('supports clearing the background with null', () => {
        const doc: Doc = { background: makeBg(), objects: [makeShape('a')] };
        const result = new SetBackground(null).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.background).toBeNull();
        expect(result.doc!.objects).toEqual([]);
    });

    it('invert restores the full previous doc (background + objects)', () => {
        const doc: Doc = { background: makeBg(), objects: [makeShape('a', 1, 2), makeShape('b', 3, 4)] };
        const step = new SetBackground(makeBg({ width: 300, height: 400 }));
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });
});

describe('RestoreDoc', () => {
    it('replaces the whole doc', () => {
        const doc: Doc = { background: makeBg(), objects: [makeShape('a')] };
        const target = createDoc();
        const result = new RestoreDoc(target).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc).toEqual(target);
    });

    it('invert round-trips', () => {
        const doc: Doc = { background: makeBg(), objects: [makeShape('a')] };
        const target: Doc = { background: null, objects: [] };
        const step = new RestoreDoc(target);
        const applied = step.apply(doc).doc!;
        expect(step.invert().apply(applied).doc).toEqual(doc);
    });
});

describe('TransformDoc', () => {
    it('fails when there is no background', () => {
        const doc = createDoc();
        const result = new TransformDoc(90).apply(doc);
        expect(result.failed).toBeTruthy();
        expect(result.doc).toBeUndefined();
    });

    it('fails when the target angle equals the current angle', () => {
        const doc: Doc = { background: makeBg({ angle: 90 }), objects: [] };
        expect(new TransformDoc(90).apply(doc).failed).toBeTruthy();
        expect(new TransformDoc(450).apply(doc).failed).toBeTruthy(); // 450 % 360 === 90
    });

    it('swaps width/height on a 90° rotation', () => {
        const doc: Doc = { background: makeBg({ width: 100, height: 200 }), objects: [] };
        const result = new TransformDoc(90).apply(doc);
        expect(result.failed).toBeUndefined();
        const bg = result.doc!.background!;
        expect(bg.width).toBeCloseTo(200);
        expect(bg.height).toBeCloseTo(100);
        expect(bg.angle).toBe(90);
    });

    it('maps object positions through the rotation formula (100x200, +90°)', () => {
        // rad = π/2, oldCenter = (50, 100), newCenter = (100, 50)
        // (100, 100) → rotate → (50, 150) → 平移 (+50, -50) → (100, 100)
        // (10, 20)   → rotate → (130, 60) → 平移 (+50, -50) → (180, 10)
        const doc: Doc = {
            background: makeBg({ width: 100, height: 200 }),
            objects: [makeShape('a', 100, 100, 30), makeShape('b', 10, 20, 0)]
        };
        const result = new TransformDoc(90).apply(doc);
        expect(result.failed).toBeUndefined();
        const [a, b] = result.doc!.objects as ShapeObject[];
        expect(a.left).toBeCloseTo(100);
        expect(a.top).toBeCloseTo(100);
        expect(a.angle).toBe(120);
        expect(b.left).toBeCloseTo(180);
        expect(b.top).toBeCloseTo(10);
        expect(b.angle).toBe(90);
        // 原 doc 不被修改
        expect(doc.objects[0].left).toBe(100);
        expect(doc.objects[0].angle).toBe(30);
    });

    it('normalizes negative deltas and object angles', () => {
        const doc: Doc = {
            background: makeBg({ width: 100, height: 200, angle: 0 }),
            objects: [makeShape('a', 100, 100, 30)]
        };
        const result = new TransformDoc(-90).apply(doc);
        expect(result.failed).toBeUndefined();
        expect(result.doc!.background!.angle).toBe(270);
        // delta = 270, obj.angle = (30 + 270) % 360 = 300
        expect((result.doc!.objects[0] as ShapeObject).angle).toBe(300);
        expect(result.doc!.background!.width).toBeCloseTo(200);
        expect(result.doc!.background!.height).toBeCloseTo(100);
    });

    it('invert restores the full previous doc', () => {
        const doc: Doc = {
            background: makeBg({ width: 100, height: 200 }),
            objects: [makeShape('a', 100, 100, 30), makeShape('b', 10, 20)]
        };
        const step = new TransformDoc(90);
        const applied = step.apply(doc).doc!;
        const restored = step.invert().apply(applied).doc!;
        expect(restored).toEqual(doc);
    });

    it('double rotation round-trips through 180°', () => {
        const doc: Doc = {
            background: makeBg({ width: 100, height: 200 }),
            objects: [makeShape('a', 25, 40)]
        };
        const once = new TransformDoc(90).apply(doc).doc!;
        const twice = new TransformDoc(180).apply(once).doc!;
        expect(twice.background!.width).toBeCloseTo(100);
        expect(twice.background!.height).toBeCloseTo(200);
        // (25, 40) 转 180° → 绕中心对称 → (100 - 25, 200 - 40)
        const obj = twice.objects[0] as ShapeObject;
        expect(obj.left).toBeCloseTo(75);
        expect(obj.top).toBeCloseTo(160);
    });
});
