import { describe, expect, it, vi } from 'vitest';
import type { TMat2D } from 'fabric';
import { Editor } from './editor';
import type { ShapeObject } from './model/doc';
import { SetBackground } from './steps/doc-steps';
import { AddObject } from './steps/object-steps';
import type { FabricRenderer } from './render/fabric-renderer';

/**
 * Editor 导出 API（toDataURL / toBlobData / getExportSize）：
 * - getExportSize 为纯 state 计算，无头可测
 * - toDataURL/toBlobData 的路由（整图 vs 仅选中、旧签名兼容）经注入假 FabricRenderer 断言
 */

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

interface FakeCall {
    options: Record<string, unknown>;
    hasBackground: boolean;
}

/** 最小假 FabricRenderer：记录 toDataURL 入参与调用瞬间的 backgroundImage 状态。 */
function injectFakeRenderer(editor: Editor, rects: Record<string, { left: number; top: number; width: number; height: number }>) {
    const calls: FakeCall[] = [];
    const objects = Object.fromEntries(
        Object.entries(rects).map(([id, rect]) => [
            id,
            { visible: true, rect, getBoundingRect() { return this.rect as typeof rect; } }
        ])
    );
    const canvas = {
        viewportTransform: [1, 0, 0, 1, 0, 0] as TMat2D,
        backgroundImage: { id: 'bg' } as unknown,
        setViewportTransform(vpt: TMat2D): void {
            this.viewportTransform = vpt;
        },
        getObjects(): unknown[] {
            return Object.values(objects);
        },
        toDataURL: vi.fn((options: Record<string, unknown>): string => {
            calls.push({ options, hasBackground: canvas.backgroundImage !== undefined });
            return 'data:fake';
        }),
        toBlob: vi.fn((options: Record<string, unknown>): Promise<Blob | null> => {
            calls.push({ options, hasBackground: canvas.backgroundImage !== undefined });
            return Promise.resolve(null);
        })
    };
    const renderer = {
        canvas,
        getObjectsByIds(ids: readonly string[]): unknown[] {
            return ids.map((id) => objects[id]).filter((o) => o !== undefined);
        }
    };
    (editor as unknown as { fabricRenderer: FabricRenderer }).fabricRenderer = renderer as unknown as FabricRenderer;
    return calls;
}

function editorWithBackground(width = 100, height = 80): Editor {
    const editor = new Editor();
    editor.dispatch(
        editor.newTransaction().addStep(new SetBackground({ src: 'data:image/png;base64,x', width, height, name: 'photo.png', angle: 0 }))
    );
    return editor;
}

describe('Editor.getExportSize（纯 state，无头可测）', () => {
    it('整图：背景尺寸 × multiplier（四舍五入）；无背景返回 null', () => {
        const editor = editorWithBackground(100, 80);
        expect(editor.getExportSize()).toEqual({ width: 100, height: 80 });
        expect(editor.getExportSize({ multiplier: 2 })).toEqual({ width: 200, height: 160 });
        expect(editor.getExportSize({ multiplier: 0 })).toEqual({ width: 100, height: 80 });
        editor.destroy();

        const empty = new Editor();
        expect(empty.getExportSize()).toBeNull();
        empty.destroy();
    });

    it('仅选中：选中对象 doc bbox 并集 × multiplier；空选中返回 null', () => {
        const editor = editorWithBackground();
        editor.dispatch(
            editor
                .newTransaction()
                .addStep(new AddObject(makeShape('a', 0, 0, 10, 10)))
                .addStep(new AddObject(makeShape('b', 50, 40, 20, 10)))
        );
        expect(editor.getExportSize({ selectionOnly: true })).toBeNull();

        editor.selectObjects(['a', 'b']);
        expect(editor.getExportSize({ selectionOnly: true })).toEqual({ width: 70, height: 50 });
        expect(editor.getExportSize({ selectionOnly: true, multiplier: 3 })).toEqual({ width: 210, height: 150 });
        editor.destroy();
    });
});

describe('Editor.toDataURL 路由', () => {
    it('无头模式抛错（无 FabricRenderer）', () => {
        const editor = editorWithBackground();
        expect(() => editor.toDataURL()).toThrow(/FabricRenderer/);
        editor.destroy();
    });

    it('向后兼容：裸 MIME 字符串 → 整图导出，format 映射 + 背景尺寸裁剪', () => {
        const editor = editorWithBackground(100, 80);
        const calls = injectFakeRenderer(editor, {});

        expect(editor.toDataURL('image/jpeg')).toBe('data:fake');
        expect(calls[0].options).toMatchObject({ format: 'jpeg', left: 0, top: 0, width: 100, height: 80 });
        expect(calls[0].hasBackground).toBe(true);
        editor.destroy();
    });

    it('选项对象：quality/multiplier 透传', () => {
        const editor = editorWithBackground();
        const calls = injectFakeRenderer(editor, {});

        editor.toDataURL({ type: 'image/webp', quality: 0.6, multiplier: 2 });
        expect(calls[0].options).toMatchObject({ format: 'webp', quality: 0.6, multiplier: 2 });
        editor.destroy();
    });

    it('selectionOnly：走仅选中导出（state 选中集 bbox 裁剪、导出期间无背景）', () => {
        const editor = editorWithBackground();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape('a', 10, 20, 30, 40))));
        editor.selectObjects(['a']);
        const calls = injectFakeRenderer(editor, { a: { left: 10, top: 20, width: 30, height: 40 } });

        editor.toDataURL({ selectionOnly: true });
        expect(calls[0].options).toMatchObject({ left: 10, top: 20, width: 30, height: 40 });
        expect(calls[0].hasBackground).toBe(false);
        editor.destroy();
    });

    it('selectionOnly 但空选中：抛错', () => {
        const editor = editorWithBackground();
        injectFakeRenderer(editor, {});
        expect(() => editor.toDataURL({ selectionOnly: true })).toThrow(/Selection export/);
        editor.destroy();
    });

    it('toBlobData 同路由：selectionOnly 时按选中 bbox 导出', async () => {
        const editor = editorWithBackground();
        editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape('a', 5, 5, 10, 10))));
        editor.selectObjects(['a']);
        const calls = injectFakeRenderer(editor, { a: { left: 5, top: 5, width: 10, height: 10 } });

        await editor.toBlobData({ selectionOnly: true, multiplier: 2 });
        expect(calls[0].options).toMatchObject({ left: 5, top: 5, width: 10, height: 10, multiplier: 2 });
        expect(calls[0].hasBackground).toBe(false);
        editor.destroy();
    });
});
