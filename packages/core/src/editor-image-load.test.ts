import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from './editor';
import type { ShapeObject } from './model/doc';
import { preloadImage } from './render/object-factory';
import { SetBackground } from './steps/doc-steps';
import { AddObject } from './steps/object-steps';

vi.mock('./render/object-factory', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./render/object-factory')>();
    return {
        ...actual,
        preloadImage: vi.fn()
    };
});

const preloadImageMock = vi.mocked(preloadImage);

function fakeImage(width: number, height: number): HTMLImageElement {
    return { naturalWidth: width, width, naturalHeight: height, height } as HTMLImageElement;
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makeShape(id: string): ShapeObject {
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

describe('Editor 图像加载错误通道', () => {
    beforeEach(() => {
        preloadImageMock.mockReset();
    });

    it('loadImageFromURL preload 失败：reject、state 不变、fire loadImageError', async () => {
        const editor = new Editor();
        const onError = vi.fn();
        const onLoad = vi.fn();
        editor.on('loadImageError', onError);
        editor.on('loadImage', onLoad);
        const err = new Error('404');
        preloadImageMock.mockRejectedValue(err);

        await expect(editor.loadImageFromURL('https://example.com/missing.png', 'photo')).rejects.toBe(err);

        expect(editor.state.doc.background).toBeNull();
        expect(editor.isLoadingImage).toBe(false);
        expect(onLoad).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({ url: 'https://example.com/missing.png', error: err });
    });

    it('loadImageFromURL 参数缺失不 fire loadImageError', async () => {
        const editor = new Editor();
        const onError = vi.fn();
        editor.on('loadImageError', onError);

        await expect(editor.loadImageFromURL('', 'a')).rejects.toThrow();
        await expect(editor.loadImageFromURL('u', '')).rejects.toThrow();
        expect(preloadImageMock).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(editor.isLoadingImage).toBe(false);
    });

    it('loadImageFromURL 成功：fire loadImageStart 再 loadImage、不 fire loadImageError', async () => {
        const editor = new Editor();
        const onError = vi.fn();
        const onLoad = vi.fn();
        const onStart = vi.fn();
        editor.on('loadImageError', onError);
        editor.on('loadImage', onLoad);
        editor.on('loadImageStart', onStart);
        preloadImageMock.mockResolvedValue(fakeImage(12, 8));

        await editor.loadImageFromURL('https://example.com/ok.png', 'ok');

        expect(editor.state.doc.background).toMatchObject({
            src: 'https://example.com/ok.png',
            width: 12,
            height: 8,
            name: 'ok'
        });
        expect(onStart).toHaveBeenCalledWith({ url: 'https://example.com/ok.png', name: 'ok' });
        expect(onLoad).toHaveBeenCalledWith({ name: 'ok', width: 12, height: 8 });
        expect(onError).not.toHaveBeenCalled();
        expect(editor.isLoadingImage).toBe(false);
        expect(onStart.mock.invocationCallOrder[0]).toBeLessThan(onLoad.mock.invocationCallOrder[0]);
    });

    it('addImageObject preload 失败：reject、不落对象、fire loadImageError', async () => {
        const editor = new Editor();
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new SetBackground({ src: 'data:,bg', width: 100, height: 80, name: 'bg', angle: 0 }))
        );
        const onError = vi.fn();
        const onAdded = vi.fn();
        editor.on('loadImageError', onError);
        editor.on('objectAdded', onAdded);
        const err = new Error('CORS');
        preloadImageMock.mockRejectedValue(err);

        await expect(editor.addImageObject('https://evil.example/x.png')).rejects.toBe(err);

        expect(editor.state.doc.objects).toHaveLength(0);
        expect(onAdded).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({ url: 'https://evil.example/x.png', error: err });
    });

    it('addImageObject 无背景不 fire loadImageError', async () => {
        const editor = new Editor();
        const onError = vi.fn();
        editor.on('loadImageError', onError);

        await expect(editor.addImageObject('https://example.com/x.png')).rejects.toThrow('background');
        expect(preloadImageMock).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });
});

describe('Editor 图像加载竞态与加载中过滤', () => {
    beforeEach(() => {
        preloadImageMock.mockReset();
    });

    it('loadImageFromURL 进行中：isLoadingImage、fire loadImageStart；dispatch(AddObject) 被 filter；完成后 objects 为空', async () => {
        const editor = new Editor();
        const pending = deferred<HTMLImageElement>();
        preloadImageMock.mockReturnValue(pending.promise);
        const onStart = vi.fn();
        editor.on('loadImageStart', onStart);

        const loading = editor.loadImageFromURL('https://example.com/bg.png', 'bg');
        expect(editor.isLoadingImage).toBe(true);
        expect(onStart).toHaveBeenCalledWith({ url: 'https://example.com/bg.png', name: 'bg' });

        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape('drawn'))));
        expect(editor.state.doc.objects).toHaveLength(0);

        pending.resolve(fakeImage(40, 20));
        await loading;

        expect(editor.isLoadingImage).toBe(false);
        expect(editor.state.doc.objects).toHaveLength(0);
        expect(editor.state.doc.background).toMatchObject({
            src: 'https://example.com/bg.png',
            width: 40,
            height: 20,
            name: 'bg'
        });
    });

    it('加载中放行 viewport / selection / mode-only 事务', async () => {
        const editor = new Editor();
        const pending = deferred<HTMLImageElement>();
        preloadImageMock.mockReturnValue(pending.promise);

        const loading = editor.loadImageFromURL('https://example.com/bg.png', 'bg');
        editor.dispatch(editor.newTransaction().setMode('freedraw'));
        editor.dispatch(editor.newTransaction().setViewport({ zoom: 2 }));
        editor.dispatch(editor.newTransaction().setSelection(['ghost']));

        expect(editor.state.mode).toBe('freedraw');
        expect(editor.state.viewport.zoom).toBe(2);
        expect(editor.state.selection).toEqual(['ghost']);
        expect(editor.state.doc.background).toBeNull();

        pending.resolve(fakeImage(10, 8));
        await loading;
        expect(editor.state.doc.background?.src).toBe('https://example.com/bg.png');
        expect(editor.state.mode).toBe('freedraw');
    });

    it('重叠加载：先慢后快，最终 background.src 是后一次请求的 url', async () => {
        const editor = new Editor();
        const slow = deferred<HTMLImageElement>();
        const fast = deferred<HTMLImageElement>();
        preloadImageMock.mockImplementation((url: string) => {
            if (url.includes('slow')) {
                return slow.promise;
            }
            return fast.promise;
        });

        const first = editor.loadImageFromURL('https://example.com/slow.png', 'slow');
        const second = editor.loadImageFromURL('https://example.com/fast.png', 'fast');
        expect(editor.isLoadingImage).toBe(true);

        fast.resolve(fakeImage(20, 10));
        await second;
        expect(editor.state.doc.background?.src).toBe('https://example.com/fast.png');
        expect(editor.isLoadingImage).toBe(false);

        slow.resolve(fakeImage(80, 40));
        await first;
        expect(editor.state.doc.background?.src).toBe('https://example.com/fast.png');
        expect(editor.state.doc.background?.width).toBe(20);
        expect(editor.isLoadingImage).toBe(false);
    });

    it('destroy() 于 await 期间调用：回来不 dispatch、不抛未捕获，isLoadingImage === false', async () => {
        const editor = new Editor();
        const pending = deferred<HTMLImageElement>();
        preloadImageMock.mockReturnValue(pending.promise);

        const loading = editor.loadImageFromURL('https://example.com/bg.png', 'bg');
        expect(editor.isLoadingImage).toBe(true);
        editor.destroy();
        expect(editor.isLoadingImage).toBe(false);

        pending.resolve(fakeImage(12, 8));
        await expect(loading).resolves.toBeUndefined();
        expect(editor.state.doc.background).toBeNull();
    });

    it('destroy() 于 await 期间且 preload 失败：不抛未捕获、不 fire（emitter 已清）', async () => {
        const editor = new Editor();
        const pending = deferred<HTMLImageElement>();
        preloadImageMock.mockReturnValue(pending.promise);
        const onError = vi.fn();
        editor.on('loadImageError', onError);

        const loading = editor.loadImageFromURL('https://example.com/bg.png', 'bg');
        editor.destroy();
        pending.reject(new Error('aborted'));
        await expect(loading).resolves.toBeUndefined();
        expect(onError).not.toHaveBeenCalled();
        expect(editor.isLoadingImage).toBe(false);
    });

    it('重叠加载中先发请求失败：仍 reject、后发请求继续、isLoadingImage 保持 true 直至后者完成', async () => {
        const editor = new Editor();
        const slow = deferred<HTMLImageElement>();
        const fast = deferred<HTMLImageElement>();
        preloadImageMock.mockImplementation((url: string) => {
            if (url.includes('slow')) {
                return slow.promise;
            }
            return fast.promise;
        });
        const onError = vi.fn();
        editor.on('loadImageError', onError);

        const first = editor.loadImageFromURL('https://example.com/slow.png', 'slow');
        const second = editor.loadImageFromURL('https://example.com/fast.png', 'fast');
        const err = new Error('slow-fail');
        slow.reject(err);
        await expect(first).rejects.toBe(err);
        expect(onError).toHaveBeenCalledWith({ url: 'https://example.com/slow.png', error: err });
        expect(editor.isLoadingImage).toBe(true);
        expect(editor.state.doc.background).toBeNull();

        fast.resolve(fakeImage(16, 9));
        await second;
        expect(editor.state.doc.background?.src).toBe('https://example.com/fast.png');
        expect(editor.isLoadingImage).toBe(false);
    });

    it('addImageObject：destroy 于 await 期间回来不落对象、不抛未捕获', async () => {
        const editor = new Editor();
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new SetBackground({ src: 'data:,bg', width: 100, height: 80, name: 'bg', angle: 0 }))
        );
        const pending = deferred<HTMLImageElement>();
        preloadImageMock.mockReturnValue(pending.promise);

        const adding = editor.addImageObject('https://example.com/sticker.png');
        editor.destroy();
        pending.resolve(fakeImage(10, 10));
        await expect(adding).resolves.toBeUndefined();
        expect(editor.state.doc.objects).toHaveLength(0);
    });

    it('addImageObject 进行中换背景：贴图不落到新图坐标系', async () => {
        const editor = new Editor();
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new SetBackground({ src: 'data:,old', width: 100, height: 80, name: 'old', angle: 0 }))
        );
        const sticker = deferred<HTMLImageElement>();
        const bg = deferred<HTMLImageElement>();
        preloadImageMock.mockImplementation((url: string) => {
            if (url.includes('sticker')) {
                return sticker.promise;
            }
            return bg.promise;
        });

        const adding = editor.addImageObject('https://example.com/sticker.png');
        const loading = editor.loadImageFromURL('https://example.com/new-bg.png', 'new');
        bg.resolve(fakeImage(200, 100));
        await loading;
        sticker.resolve(fakeImage(12, 12));
        await adding;

        expect(editor.state.doc.background?.src).toBe('https://example.com/new-bg.png');
        expect(editor.state.doc.objects).toHaveLength(0);
    });

    it('重叠 addImageObject：后发请求赢', async () => {
        const editor = new Editor();
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new SetBackground({ src: 'data:,bg', width: 100, height: 80, name: 'bg', angle: 0 }))
        );
        const first = deferred<HTMLImageElement>();
        const second = deferred<HTMLImageElement>();
        preloadImageMock.mockImplementation((url: string) => {
            if (url.includes('a.png')) {
                return first.promise;
            }
            return second.promise;
        });

        const p1 = editor.addImageObject('https://example.com/a.png');
        const p2 = editor.addImageObject('https://example.com/b.png');
        second.resolve(fakeImage(8, 8));
        await p2;
        first.resolve(fakeImage(9, 9));
        await p1;

        expect(editor.state.doc.objects).toHaveLength(1);
        expect(editor.state.doc.objects[0]).toMatchObject({ kind: 'image', src: 'https://example.com/b.png', width: 8, height: 8 });
    });
});
