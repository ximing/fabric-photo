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

    it('点击导出 → toDataURL(image/png) 并触发 a[download=<图名>.png] 点击', () => {
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

        expect(dataSpy).toHaveBeenCalledTimes(1);
        expect(dataSpy).toHaveBeenCalledWith('image/png');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
        expect(anchor.download).toBe('photo.png');
        expect(anchor.href).toBe('data:image/png;base64,xxx');
        clickSpy.mockRestore();
        editor.destroy();
    });

    it('gridArea=top，className 语义占位并可追加自定义 class', () => {
        const editor = new Editor();
        const utils = render(
            <EditorProvider editor={editor}>
                <TopBar className="extra" />
            </EditorProvider>
        );

        const bar = utils.container.querySelector('.fp-topbar') as HTMLElement;
        expect(bar).not.toBeNull();
        expect(bar.className).toContain('extra');
        expect(bar.style.gridArea).toBe('top');
        editor.destroy();
    });
});
