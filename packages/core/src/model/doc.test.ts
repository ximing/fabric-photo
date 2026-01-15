import { describe, expect, it } from 'vitest';
import {
    cloneDoc,
    createDoc,
    docFromJSON,
    docToJSON,
    type BackgroundImage,
    type Doc,
    type ImageObject,
    type MosaicObject,
    type PathObject,
    type ShapeObject,
    type TextObject
} from './doc';
import { createId } from './id';

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

function makeText(id: string): TextObject {
    return {
        kind: 'text', id, left: 10, top: 20, angle: 0, scaleX: 1, scaleY: 1,
        text: 'hello', fontSize: 50, fontFamily: 'sans-serif', fill: '#000',
        fontWeight: 'normal', fontStyle: '', textDecoration: '', textAlign: 'left'
    };
}

function makePath(id: string): PathObject {
    return {
        kind: 'path', id, left: 5, top: 6, angle: 15, scaleX: 1, scaleY: 1,
        tool: 'freedraw', path: 'M 0 0 L 10 10', stroke: '#00ff00', strokeWidth: 3, fill: ''
    };
}

function makeMosaic(id: string): MosaicObject {
    return {
        kind: 'mosaic', id, left: 30, top: 40, angle: 0, scaleX: 1, scaleY: 1,
        width: 200, height: 100,
        rects: [{ x: 0, y: 0, size: 10, color: '#123456' }]
    };
}

function makeImage(id: string): ImageObject {
    return {
        kind: 'image', id, left: 50, top: 60, angle: 0, scaleX: 1, scaleY: 1,
        src: 'data:image/png;base64,xxxx', width: 300, height: 200
    };
}

function makeBackground(): BackgroundImage {
    return {
        src: 'data:image/png;base64,bg', width: 800, height: 600, name: 'bg.png', angle: 0
    };
}

describe('createDoc', () => {
    it('默认返回 {background: null, objects: []}', () => {
        expect(createDoc()).toEqual({ background: null, objects: [] });
    });

    it('接受 background 参数', () => {
        const bg = makeBackground();
        const doc = createDoc(bg);
        expect(doc.background).toEqual(bg);
        expect(doc.objects).toEqual([]);
    });
});

describe('docToJSON / docFromJSON', () => {
    it('往返相等（含 background + 每种 kind 的对象）', () => {
        const doc: Doc = {
            background: makeBackground(),
            objects: [makeShape('s1'), makeText('t1'), makePath('p1'), makeMosaic('m1'), makeImage('i1')]
        };
        const json = docToJSON(doc);
        expect(docFromJSON(json)).toEqual(doc);
    });

    it('空 doc 往返相等', () => {
        expect(docFromJSON(docToJSON(createDoc()))).toEqual(createDoc());
    });

    it('docFromJSON(\'{}\') 抛错（缺 objects 数组）', () => {
        expect(() => docFromJSON('{}')).toThrow('invalid doc JSON');
    });

    it('objects 不是数组时抛错', () => {
        expect(() => docFromJSON('{"background":null,"objects":{}}')).toThrow('invalid doc JSON');
    });

    it('objects 中缺 id 的项抛错', () => {
        const bad = { kind: 'text', left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1 };
        expect(() => docFromJSON(JSON.stringify({ background: null, objects: [bad] }))).toThrow('invalid doc JSON');
    });

    it('objects 中缺 kind 的项抛错', () => {
        const bad = { id: 'x', left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1 };
        expect(() => docFromJSON(JSON.stringify({ background: null, objects: [bad] }))).toThrow('invalid doc JSON');
    });

    it('objects 中 kind 非法的项抛错', () => {
        const bad = { id: 'x', kind: 'unknown' };
        expect(() => docFromJSON(JSON.stringify({ background: null, objects: [bad] }))).toThrow('invalid doc JSON');
    });

    it('background 缺字段时抛错', () => {
        const bad = { src: 'data:...', width: 100 };
        expect(() => docFromJSON(JSON.stringify({ background: bad, objects: [] }))).toThrow('invalid doc JSON');
    });

    it('非 JSON 字符串抛错', () => {
        expect(() => docFromJSON('not json')).toThrow();
    });

    it('旧数据兼容：background 与对象均无 filters 字段可正常加载', () => {
        const json = JSON.stringify({ background: makeBackground(), objects: [makeImage('i1')] });
        const doc = docFromJSON(json);
        expect(doc.background?.filters).toBeUndefined();
        expect((doc.objects[0] as ImageObject).filters).toBeUndefined();
    });

    it('带合法 filters 的 background / image 往返相等', () => {
        const filters = { brightness: 0.5, contrast: -1, saturation: 1, blur: 0.25, grayscale: true, sepia: false, invert: true };
        const doc: Doc = {
            background: { ...makeBackground(), filters },
            objects: [{ ...makeImage('i1'), filters: { ...filters, invert: false } }, makeShape('s1')]
        };
        expect(docFromJSON(docToJSON(doc))).toEqual(doc);
    });

    it('background.filters 数值越界 / 字段非法时抛错', () => {
        const base = { ...makeBackground() };
        const cases: unknown[] = [
            { brightness: 2, contrast: 0, saturation: 0, blur: 0, grayscale: false, sepia: false, invert: false },
            { brightness: 0, contrast: 0, saturation: 0, blur: -0.1, grayscale: false, sepia: false, invert: false },
            { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 'yes', sepia: false, invert: false },
            { brightness: 0 }, // 字段不全
            'not-an-object'
        ];
        for (const filters of cases) {
            expect(() => docFromJSON(JSON.stringify({ background: { ...base, filters }, objects: [] }))).toThrow(
                'invalid doc JSON'
            );
        }
    });

    it('对象 filters 数值越界 / 字段非法时抛错', () => {
        const bad = { brightness: 0, contrast: 0, saturation: -1.5, blur: 0, grayscale: false, sepia: false, invert: false };
        expect(() =>
            docFromJSON(JSON.stringify({ background: null, objects: [{ ...makeImage('i1'), filters: bad }] }))
        ).toThrow('invalid doc JSON');
        expect(() =>
            docFromJSON(JSON.stringify({ background: null, objects: [{ ...makeShape('s1'), filters: 42 }] }))
        ).toThrow('invalid doc JSON');
    });
});

describe('cloneDoc', () => {
    it('深拷贝：改副本不影响原 doc', () => {
        const doc: Doc = {
            background: makeBackground(),
            objects: [makeMosaic('m1')]
        };
        const copy = cloneDoc(doc);
        expect(copy).toEqual(doc);
        expect(copy).not.toBe(doc);

        copy.background!.width = 1;
        (copy.objects[0] as MosaicObject).rects[0].size = 999;
        copy.objects.push(makeText('t-new'));

        expect(doc.background!.width).toBe(800);
        expect((doc.objects[0] as MosaicObject).rects[0].size).toBe(10);
        expect(doc.objects).toHaveLength(1);
    });
});

describe('createId', () => {
    it('两次调用不相等', () => {
        expect(createId()).not.toBe(createId());
    });

    it('返回 fp_ 前缀字符串', () => {
        expect(createId()).toMatch(/^fp_/);
    });
});
