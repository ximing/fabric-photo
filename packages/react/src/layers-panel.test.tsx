import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AddObject, Editor, createId, type ShapeObject, type TextObject } from '@gmi/fp-core';
import { LayersPanel } from './layers-panel';
import { EditorProvider } from './provider';

// —— 真实无头 Editor（不触碰 fabric）：LayersPanel 通过 EditorProvider 注入，
// spy 直接打在实例方法上验证 core 公开 API 委托；doc 用 AddObject step 构造。 ——

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// vitest 未开 globals，testing-library 自动清理未注册；getBy* 绑定 document.body，需手动清理
afterEach(() => {
    cleanup();
});

function renderWithEditor(editor: Editor): ReturnType<typeof render> {
    return render(
        <EditorProvider editor={editor}>
            <LayersPanel />
        </EditorProvider>
    );
}

function makeShape(id = createId(), shapeType: ShapeObject['shapeType'] = 'rect'): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType,
        left: 10,
        top: 10,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 20,
        height: 20,
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 1
    };
}

function makeText(id = createId()): TextObject {
    return {
        id,
        kind: 'text',
        text: '你好',
        left: 10,
        top: 10,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        fontSize: 50,
        fontFamily: 'sans-serif',
        fill: '#000000',
        fontWeight: 'normal',
        fontStyle: '',
        textDecoration: '',
        textAlign: 'left'
    };
}

function addObjects(editor: Editor, objects: (ShapeObject | TextObject)[]): void {
    act(() => {
        const tr = editor.newTransaction();
        for (const obj of objects) {
            tr.addStep(new AddObject(obj));
        }
        editor.dispatch(tr);
    });
}

describe('LayersPanel', () => {
    it('空列表显示占位文案', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        expect(utils.getByText('暂无图层，使用左侧工具绘制')).not.toBeNull();
        expect(utils.getByText('图层')).not.toBeNull();
        editor.destroy();
    });

    it('顶层在前（doc 数组倒序）显示；名称为 kind 中文名 + 同类序号', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addObjects(editor, [makeShape('a'), makeText('b'), makeShape('c'), makeShape('d', 'circle')]);

        const items = utils.getAllByRole('listitem');
        // doc 序 a(矩形1) b(文本1) c(矩形2) d(圆形1) → 显示倒序
        expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
            '圆形 1',
            '矩形 2',
            '文本 1',
            '矩形 1'
        ]);
        editor.destroy();
    });

    it('选中项高亮（aria-selected 与选中类）', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addObjects(editor, [makeShape('a'), makeText('b')]);

        act(() => {
            editor.selectObjects(['a']);
        });

        const selected = utils.getByRole('listitem', { name: '矩形 1' });
        expect(selected.getAttribute('aria-selected')).toBe('true');
        expect(selected.className).toContain('fp-layer-item-selected');
        expect(utils.getByRole('listitem', { name: '文本 1' }).getAttribute('aria-selected')).toBe('false');
        editor.destroy();
    });

    it('点击项 → selectObjects([id])；Shift+点击 → 加选/减选', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'selectObjects');
        const utils = renderWithEditor(editor);
        addObjects(editor, [makeShape('a'), makeText('b'), makeShape('c')]);

        fireEvent.click(utils.getByRole('listitem', { name: '矩形 1' }));
        expect(spy).toHaveBeenLastCalledWith(['a']);

        // Shift 加选
        fireEvent.click(utils.getByRole('listitem', { name: '文本 1' }), { shiftKey: true });
        expect(spy).toHaveBeenLastCalledWith(['a', 'b']);

        // Shift 减选
        fireEvent.click(utils.getByRole('listitem', { name: '矩形 1' }), { shiftKey: true });
        expect(spy).toHaveBeenLastCalledWith(['b']);
        editor.destroy();
    });

    it('眼睛/锁按钮委托 toggleObjectHidden/toggleObjectLocked，且不触发选中', () => {
        const editor = new Editor();
        const hiddenSpy = vi.spyOn(editor, 'toggleObjectHidden');
        const lockedSpy = vi.spyOn(editor, 'toggleObjectLocked');
        const selectSpy = vi.spyOn(editor, 'selectObjects');
        const utils = renderWithEditor(editor);
        addObjects(editor, [makeShape('a')]);

        fireEvent.click(utils.getByRole('button', { name: '隐藏 矩形 1' }));
        expect(hiddenSpy).toHaveBeenCalledWith('a');
        expect(editor.state.getObject('a')?.hidden).toBe(true);
        expect(selectSpy).not.toHaveBeenCalled();

        // 隐藏后按钮文案切换为「显示」
        fireEvent.click(utils.getByRole('button', { name: '显示 矩形 1' }));
        expect(editor.state.getObject('a')?.hidden).toBe(false);

        fireEvent.click(utils.getByRole('button', { name: '锁定 矩形 1' }));
        expect(lockedSpy).toHaveBeenCalledWith('a');
        expect(editor.state.getObject('a')?.locked).toBe(true);
        expect(selectSpy).not.toHaveBeenCalled();
        editor.destroy();
    });

    it('拖拽排序：拖到目标项下半区 → moveObjectToIndex 落点为目标项之下（z 序）', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'moveObjectToIndex');
        const utils = renderWithEditor(editor);
        addObjects(editor, [makeShape('a'), makeText('b'), makeShape('c')]);

        const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
        // 显示序（顶在前）：矩形 2(c) / 文本 1(b) / 矩形 1(a)；把 c 拖到 a 的下半区（= z 序最低）
        fireEvent.dragStart(utils.getByRole('listitem', { name: '矩形 2' }), { dataTransfer });
        // jsdom getBoundingClientRect 全 0，clientY 0 不 < 0 → 下半区
        fireEvent.drop(utils.getByRole('listitem', { name: '矩形 1' }), { dataTransfer, clientY: 0 });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith('c', 0);
        expect(editor.state.doc.objects.map((o) => o.id)).toEqual(['c', 'a', 'b']);
        editor.destroy();
    });
});
