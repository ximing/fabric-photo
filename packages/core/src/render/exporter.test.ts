import { describe, expect, it, vi } from 'vitest';
import type { TMat2D } from 'fabric';
import type { BackgroundImage } from '../model/doc';
import type { FabricRenderer } from './fabric-renderer';
import {
    exportDocBlob,
    exportDocDataURL,
    exportSelectionBlob,
    exportSelectionDataURL
} from './exporter';

/**
 * node 环境无真实 fabric Canvas：以最小假对象模拟 exporter 触碰的 Canvas/FabricRenderer 面
 * （viewportTransform / setViewportTransform / toDataURL / toBlob / getObjects / backgroundImage /
 * getObjectsByIds），断言 exporter 传给 fabric 的选项与导出期间画布状态的改/还原。
 */

interface CapturedCall {
    method: 'toDataURL' | 'toBlob';
    options: Record<string, unknown>;
    /** 调用瞬间的画布快照：vpt / 各对象 visible / backgroundImage / backgroundColor。 */
    vpt: TMat2D;
    visibles: boolean[];
    hasBackground: boolean;
    backgroundColor: string;
}

interface FakeObject {
    visible: boolean;
    rect: { left: number; top: number; width: number; height: number };
    getBoundingRect: () => { left: number; top: number; width: number; height: number };
}

function makeFakeObject(rect: FakeObject['rect'], visible = true): FakeObject {
    return {
        visible,
        rect,
        getBoundingRect() {
            return this.rect;
        }
    };
}

function makeRenderer(objects: Record<string, FakeObject> = {}, extraObjects: FakeObject[] = []) {
    const calls: CapturedCall[] = [];
    const allObjects = [...Object.values(objects), ...extraObjects];
    const canvas = {
        viewportTransform: [2, 0, 0, 2, 10, 20] as TMat2D,
        backgroundImage: { id: 'bg' } as unknown,
        // fabric StaticCanvas 的 backgroundColor 缺省为空字符串（无底色）
        backgroundColor: '' as string,
        setViewportTransform(vpt: TMat2D): void {
            this.viewportTransform = vpt;
        },
        getObjects(): FakeObject[] {
            return allObjects;
        },
        toDataURL: vi.fn((options: Record<string, unknown>): string => {
            calls.push({
                method: 'toDataURL',
                options,
                vpt: [...canvas.viewportTransform] as TMat2D,
                visibles: allObjects.map((o) => o.visible),
                hasBackground: canvas.backgroundImage !== undefined,
                backgroundColor: canvas.backgroundColor
            });
            return 'data:image/png;base64,fake';
        }),
        toBlob: vi.fn((options: Record<string, unknown>): Promise<Blob | null> => {
            calls.push({
                method: 'toBlob',
                options,
                vpt: [...canvas.viewportTransform] as TMat2D,
                visibles: allObjects.map((o) => o.visible),
                hasBackground: canvas.backgroundImage !== undefined,
                backgroundColor: canvas.backgroundColor
            });
            return Promise.resolve(null);
        })
    };
    const renderer = {
        canvas,
        getObjectsByIds(ids: readonly string[]): FakeObject[] {
            const result: FakeObject[] = [];
            for (const id of ids) {
                const obj = objects[id];
                if (obj !== undefined) {
                    result.push(obj);
                }
            }
            return result;
        }
    };
    return { renderer: renderer as unknown as FabricRenderer, canvas, calls };
}

const BG: BackgroundImage = { src: 'data:image/png;base64,x', width: 100, height: 80, name: 'photo.png', angle: 0 };

describe('exportDocDataURL（整图）', () => {
    it('有背景：identity vpt + 背景尺寸裁剪，导出后恢复原 vpt', () => {
        const { renderer, canvas, calls } = makeRenderer();
        exportDocDataURL(renderer, BG);

        expect(calls).toHaveLength(1);
        const call = calls[0];
        expect(call.options).toMatchObject({ format: 'png', multiplier: 1, left: 0, top: 0, width: 100, height: 80 });
        expect(call.vpt).toEqual([1, 0, 0, 1, 0, 0]);
        expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    });

    it('无背景：不裁剪、不动 vpt（导出当前画布现状）', () => {
        const { renderer, canvas, calls } = makeRenderer();
        exportDocDataURL(renderer, null);

        expect(calls[0].options).toMatchObject({ format: 'png', multiplier: 1 });
        expect(calls[0].options).not.toHaveProperty('left');
        expect(calls[0].vpt).toEqual([2, 0, 0, 2, 10, 20]);
        expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    });

    it('参数归一化：裸 MIME 字符串（向后兼容）与选项对象等价；未识别 type 回退 png', () => {
        const { renderer, calls } = makeRenderer();
        exportDocDataURL(renderer, BG, 'image/jpeg');
        exportDocDataURL(renderer, BG, { type: 'image/jpeg' });
        exportDocDataURL(renderer, BG, { type: 'image/webp' });
        exportDocDataURL(renderer, BG, 'image/tiff');
        exportDocDataURL(renderer, BG);

        expect(calls.map((c) => c.options.format)).toEqual(['jpeg', 'jpeg', 'webp', 'png', 'png']);
    });

    it('quality 透传；multiplier 透传，非正数按 1 处理', () => {
        const { renderer, calls } = makeRenderer();
        exportDocDataURL(renderer, BG, { type: 'image/jpeg', quality: 0.5, multiplier: 2 });
        exportDocDataURL(renderer, BG, { multiplier: 0 });
        exportDocDataURL(renderer, BG, { multiplier: -3 });

        expect(calls[0].options).toMatchObject({ format: 'jpeg', quality: 0.5, multiplier: 2 });
        expect(calls[1].options.multiplier).toBe(1);
        expect(calls[2].options.multiplier).toBe(1);
    });
});

describe('exportDocBlob', () => {
    it('进制同 dataURL：选项一致透传，返回 canvas.toBlob 的 Promise', async () => {
        const { renderer, canvas, calls } = makeRenderer();
        const result = await exportDocBlob(renderer, BG, { type: 'image/webp', quality: 0.8, multiplier: 3 });

        expect(result).toBeNull();
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('toBlob');
        expect(calls[0].options).toMatchObject({ format: 'webp', quality: 0.8, multiplier: 3, width: 100, height: 80 });
        expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    });
});

describe('exportSelectionDataURL（仅选中：bbox 裁剪、不含背景、透明底）', () => {
    it('单选：按对象 getBoundingRect 裁剪；导出期间摘背景，结束后恢复', () => {
        const a = makeFakeObject({ left: 10, top: 20, width: 30, height: 40 });
        const { renderer, canvas, calls } = makeRenderer({ a });

        exportSelectionDataURL(renderer, ['a'], { multiplier: 2 });

        expect(calls[0].options).toMatchObject({ left: 10, top: 20, width: 30, height: 40, multiplier: 2 });
        expect(calls[0].hasBackground).toBe(false);
        expect(canvas.backgroundImage).toEqual({ id: 'bg' });
        expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    });

    it('多选：bbox 取并集；未选中对象导出期间隐藏、结束后恢复（含异常路径）', () => {
        const a = makeFakeObject({ left: 0, top: 0, width: 10, height: 10 });
        const b = makeFakeObject({ left: 50, top: 40, width: 20, height: 10 });
        const other = makeFakeObject({ left: 200, top: 200, width: 5, height: 5 });
        const { renderer, calls } = makeRenderer({ a, b }, [other]);

        exportSelectionDataURL(renderer, ['a', 'b']);

        expect(calls[0].options).toMatchObject({ left: 0, top: 0, width: 70, height: 50 });
        expect(calls[0].visibles).toEqual([true, true, false]);
        expect(other.visible).toBe(true);

        // 异常路径：toDataURL 抛错也要恢复 visible/backgroundImage
        const a2 = makeFakeObject({ left: 0, top: 0, width: 10, height: 10 });
        const other2 = makeFakeObject({ left: 1, top: 1, width: 1, height: 1 });
        const failing = makeRenderer({ a: a2 }, [other2]);
        failing.canvas.toDataURL.mockImplementation(() => {
            throw new Error('boom');
        });
        expect(() => exportSelectionDataURL(failing.renderer, ['a'])).toThrow('boom');
        expect(other2.visible).toBe(true);
        expect(failing.canvas.backgroundImage).toEqual({ id: 'bg' });
        expect(failing.canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    });

    it('选中对象本身 hidden 时不改动其 visible（与画布一致）', () => {
        const hidden = makeFakeObject({ left: 0, top: 0, width: 10, height: 10 }, false);
        const { renderer, calls } = makeRenderer({ hidden });

        exportSelectionDataURL(renderer, ['hidden']);

        expect(calls[0].visibles).toEqual([false]);
        expect(hidden.visible).toBe(false);
    });

    it('空选中（或 id 无对应 fabric 对象）抛错', () => {
        const { renderer } = makeRenderer({ a: makeFakeObject({ left: 0, top: 0, width: 1, height: 1 }) });

        expect(() => exportSelectionDataURL(renderer, [])).toThrow(/Selection export/);
        expect(() => exportSelectionDataURL(renderer, ['missing'])).toThrow(/Selection export/);
    });
});

describe('exportSelectionBlob', () => {
    it('进制同 dataURL：bbox 裁剪 + 选项透传', async () => {
        const a = makeFakeObject({ left: 5, top: 5, width: 10, height: 10 });
        const { renderer, calls } = makeRenderer({ a });

        await exportSelectionBlob(renderer, ['a'], { type: 'image/jpeg', quality: 0.7 });

        expect(calls[0].method).toBe('toBlob');
        expect(calls[0].options).toMatchObject({ format: 'jpeg', quality: 0.7, left: 5, top: 5, width: 10, height: 10 });
        expect(calls[0].hasBackground).toBe(false);
    });
});

describe('jpeg 白色打底（jpeg 无 alpha，透明区商业惯例白底合成）', () => {
    it('整图 jpeg：导出期间 backgroundColor 置白，结束后恢复；png/webp 不打底', () => {
        const { renderer, canvas, calls } = makeRenderer();
        exportDocDataURL(renderer, BG, { type: 'image/jpeg' });
        exportDocDataURL(renderer, BG, { type: 'image/png' });
        exportDocDataURL(renderer, BG, { type: 'image/webp' });
        exportDocDataURL(renderer, BG, 'image/jpeg');

        expect(calls.map((c) => c.backgroundColor)).toEqual(['#ffffff', '', '', '#ffffff']);
        expect(canvas.backgroundColor).toBe('');
    });

    it('无背景整图 jpeg 同样打底', () => {
        const { renderer, canvas, calls } = makeRenderer();
        exportDocDataURL(renderer, null, { type: 'image/jpeg' });

        expect(calls[0].backgroundColor).toBe('#ffffff');
        expect(canvas.backgroundColor).toBe('');
    });

    it('仅选中 jpeg：摘背景与白底并存，结束后均恢复', () => {
        const a = makeFakeObject({ left: 0, top: 0, width: 10, height: 10 });
        const { renderer, canvas, calls } = makeRenderer({ a });

        exportSelectionDataURL(renderer, ['a'], { type: 'image/jpeg' });

        expect(calls[0].backgroundColor).toBe('#ffffff');
        expect(calls[0].hasBackground).toBe(false);
        expect(canvas.backgroundColor).toBe('');
        expect(canvas.backgroundImage).toEqual({ id: 'bg' });
    });

    it('blob 路径同样打底', async () => {
        const { renderer, canvas, calls } = makeRenderer();
        const a = makeFakeObject({ left: 0, top: 0, width: 10, height: 10 });
        const sel = makeRenderer({ a });

        await exportDocBlob(renderer, BG, { type: 'image/jpeg' });
        await exportSelectionBlob(sel.renderer, ['a'], { type: 'image/jpeg' });

        expect(calls[0].backgroundColor).toBe('#ffffff');
        expect(sel.calls[0].backgroundColor).toBe('#ffffff');
        expect(canvas.backgroundColor).toBe('');
        expect(sel.canvas.backgroundColor).toBe('');
    });
});
