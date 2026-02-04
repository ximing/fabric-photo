import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AddObject, Editor, SetBackground, createId, type ShapeObject } from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { TopBar } from './top-bar';

// —— 真实无头 Editor（不触碰 fabric）：TopBar 通过 EditorProvider 注入，
// spy 直接打在实例方法上验证委托路径；toDataURL 无头会抛（无 FabricRenderer），导出用例打 mock。 ——

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
            <TopBar />
        </EditorProvider>
    );
}

function makeShape(): ShapeObject {
    return {
        id: createId(),
        kind: 'shape',
        shapeType: 'rect',
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

function button(utils: ReturnType<typeof render>, name: string): HTMLButtonElement {
    return utils.getByRole('button', { name }) as HTMLButtonElement;
}

describe('TopBar', () => {
    it('初始 undo/redo 均 disabled；dispatch 一笔 AddObject 后 undo 可用、redo 仍 disabled', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        expect(button(utils, '撤销').disabled).toBe(true);
        expect(button(utils, '重做').disabled).toBe(true);

        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape())));
        });

        expect(button(utils, '撤销').disabled).toBe(false);
        expect(button(utils, '重做').disabled).toBe(true);
        editor.destroy();
    });

    it('undo 后再无 undo 入账时 redo 变为可用', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape())));
        });
        act(() => {
            editor.undo();
        });

        expect(button(utils, '撤销').disabled).toBe(true);
        expect(button(utils, '重做').disabled).toBe(false);
        editor.destroy();
    });

    it('点击撤销按钮委托 editor.undo；点击重做按钮委托 editor.redo', () => {
        const editor = new Editor();
        const undoSpy = vi.spyOn(editor, 'undo');
        const redoSpy = vi.spyOn(editor, 'redo');
        const utils = renderWithEditor(editor);

        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(makeShape())));
        });
        fireEvent.click(button(utils, '撤销'));
        expect(undoSpy).toHaveBeenCalledTimes(1);

        fireEvent.click(button(utils, '重做'));
        expect(redoSpy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it('点击放大 → setZoom 收到约 1.2（初始 1 + 0.2），百分比文案更新为 120%', () => {
        const editor = new Editor();
        const zoomSpy = vi.spyOn(editor, 'setZoom');
        const utils = renderWithEditor(editor);

        expect(button(utils, '重置缩放').textContent).toBe('100%');
        fireEvent.click(button(utils, '放大'));
        expect(zoomSpy).toHaveBeenCalledTimes(1);
        expect(zoomSpy.mock.calls[0][0]).toBeCloseTo(1.2);
        expect(button(utils, '重置缩放').textContent).toBe('120%');
        editor.destroy();
    });

    it('点击缩小 → setZoom 收到约 0.8（初始 1 - 0.2）', () => {
        const editor = new Editor();
        const zoomSpy = vi.spyOn(editor, 'setZoom');
        const utils = renderWithEditor(editor);

        fireEvent.click(button(utils, '缩小'));
        expect(zoomSpy).toHaveBeenCalledTimes(1);
        expect(zoomSpy.mock.calls[0][0]).toBeCloseTo(0.8);
        editor.destroy();
    });

    it('点击百分比复位：setZoom(1)', () => {
        const editor = new Editor();
        const zoomSpy = vi.spyOn(editor, 'setZoom');
        const utils = renderWithEditor(editor);

        fireEvent.click(button(utils, '重置缩放'));
        expect(zoomSpy).toHaveBeenCalledTimes(1);
        expect(zoomSpy).toHaveBeenCalledWith(1);
        editor.destroy();
    });

    it('无图时图名为空；dispatch SetBackground（带 name）后显示该 name', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        const nameEl = utils.container.querySelector('.fp-topbar-name') as HTMLElement;
        expect(nameEl).not.toBeNull();
        expect(nameEl.textContent).toBe('');

        act(() => {
            editor.dispatch(
                editor
                    .newTransaction()
                    .addStep(new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'photo.png', angle: 0 }))
            );
        });
        expect(nameEl.textContent).toBe('photo.png');
        editor.destroy();
    });

    it('点击导出打开弹层；再点导出 / Esc / 点外部关闭', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        expect(utils.queryByRole('dialog', { name: '导出设置' })).toBeNull();

        fireEvent.click(button(utils, '导出'));
        expect(utils.getByRole('dialog', { name: '导出设置' })).not.toBeNull();

        // 再点触发按钮关闭
        fireEvent.click(button(utils, '导出'));
        expect(utils.queryByRole('dialog', { name: '导出设置' })).toBeNull();

        // Esc 关闭
        fireEvent.click(button(utils, '导出'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(utils.queryByRole('dialog', { name: '导出设置' })).toBeNull();

        // 点外部关闭；点面板内部不关闭
        fireEvent.click(button(utils, '导出'));
        fireEvent.mouseDown(utils.getByRole('dialog', { name: '导出设置' }));
        expect(utils.queryByRole('dialog', { name: '导出设置' })).not.toBeNull();
        fireEvent.mouseDown(document.body);
        expect(utils.queryByRole('dialog', { name: '导出设置' })).toBeNull();
        editor.destroy();
    });

    it('格式切 JPEG/WebP 显示质量滑杆（默认 0.9），切回 PNG 隐藏', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        fireEvent.click(button(utils, '导出'));
        expect(utils.queryByRole('slider', { name: '质量' })).toBeNull();

        fireEvent.click(utils.getByRole('radio', { name: 'JPEG' }));
        const slider = utils.getByRole('slider', { name: '质量' }) as HTMLInputElement;
        expect(slider.value).toBe('0.9');
        expect(slider.min).toBe('0.1');
        expect(slider.max).toBe('1');
        expect(slider.step).toBe('0.05');

        fireEvent.click(utils.getByRole('radio', { name: 'WEBP' }));
        expect(utils.queryByRole('slider', { name: '质量' })).not.toBeNull();

        fireEvent.click(utils.getByRole('radio', { name: 'PNG' }));
        expect(utils.queryByRole('slider', { name: '质量' })).toBeNull();
        editor.destroy();
    });

    it('无选中时「仅选中」禁用；有选中后可用', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        fireEvent.click(button(utils, '导出'));
        const scopeRadio = (): HTMLInputElement => utils.getByRole('radio', { name: '仅选中' }) as HTMLInputElement;
        expect(scopeRadio().disabled).toBe(true);

        const shape = makeShape();
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(shape)));
        });
        act(() => {
            editor.selectObjects([shape.id]);
        });
        expect(scopeRadio().disabled).toBe(false);
        editor.destroy();
    });

    it('默认参数确认导出 → toDataURL 收 PNG/1x/整图，a[download=<图名>-100x80@1x.png]', () => {
        const editor = new Editor();
        const dataSpy = vi.spyOn(editor, 'toDataURL').mockReturnValue('data:image/png;base64,xxx');
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const utils = renderWithEditor(editor);

        act(() => {
            editor.dispatch(
                editor
                    .newTransaction()
                    .addStep(new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'photo.png', angle: 0 }))
            );
        });
        fireEvent.click(button(utils, '导出'));
        fireEvent.click(button(utils, '确认导出'));

        expect(dataSpy).toHaveBeenCalledTimes(1);
        expect(dataSpy).toHaveBeenCalledWith({ type: 'image/png', multiplier: 1, selectionOnly: false });
        expect(clickSpy).toHaveBeenCalledTimes(1);
        const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
        expect(anchor.download).toBe('photo-100x80@1x.png');
        expect(anchor.href).toBe('data:image/png;base64,xxx');
        // 导出后弹层关闭
        expect(utils.queryByRole('dialog', { name: '导出设置' })).toBeNull();
        clickSpy.mockRestore();
        editor.destroy();
    });

    it('JPEG + 改质量 + 2x + 仅选中 → toDataURL 收 quality/multiplier/selectionOnly，文件名带 -selection', () => {
        const editor = new Editor();
        const dataSpy = vi.spyOn(editor, 'toDataURL').mockReturnValue('data:image/jpeg;base64,yyy');
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const utils = renderWithEditor(editor);

        let shapeId = '';
        act(() => {
            const shape = makeShape();
            shapeId = shape.id;
            editor.dispatch(
                editor
                    .newTransaction()
                    .addStep(new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'photo.png', angle: 0 }))
                    .addStep(new AddObject(shape))
            );
        });
        act(() => {
            editor.selectObjects([shapeId]);
        });

        fireEvent.click(button(utils, '导出'));
        fireEvent.click(utils.getByRole('radio', { name: 'JPEG' }));
        fireEvent.change(utils.getByRole('slider', { name: '质量' }), { target: { value: '0.5' } });
        fireEvent.click(utils.getByRole('radio', { name: '2x' }));
        fireEvent.click(utils.getByRole('radio', { name: '仅选中' }));
        fireEvent.click(button(utils, '确认导出'));

        expect(dataSpy).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.5, multiplier: 2, selectionOnly: true });
        const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
        // makeShape：left/top 10、width/height 20 → bbox 20x20，×2 = 40x40
        expect(anchor.download).toBe('photo-40x40@2x-selection.jpeg');
        clickSpy.mockRestore();
        editor.destroy();
    });

    it('点击「切换主题」：toggleTheme 被调（经 context），按钮图标随 theme 变化', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        const toggle = button(utils, '切换主题');
        // 初值 light（jsdom 无 matchMedia）→ 显示 Moon（切到暗色）
        expect(toggle.querySelector('svg')).not.toBeNull();
        act(() => {
            fireEvent.click(toggle);
        });
        expect(localStorage.getItem('fp-theme')).toBe('dark');
        editor.destroy();
        localStorage.clear();
    });

    it('className 语义占位（fp-topbar，grid 落位在 styles.css）并可追加自定义 class', () => {
        const editor = new Editor();
        const utils = render(
            <EditorProvider editor={editor}>
                <TopBar className="extra" />
            </EditorProvider>
        );

        const bar = utils.container.querySelector('.fp-topbar') as HTMLElement;
        expect(bar).not.toBeNull();
        expect(bar.className).toContain('extra');
        expect(bar.getAttribute('style')).toBeNull();
        editor.destroy();
    });
});
