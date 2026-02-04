import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Editor } from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { ZoomControls } from './zoom-controls';

// —— 真实无头 Editor（不触碰 fabric）：ZoomControls 通过 EditorProvider 注入，
// spy 直接打在实例方法上验证委托路径。 ——

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
            <ZoomControls />
        </EditorProvider>
    );
}

function button(utils: ReturnType<typeof render>, name: string): HTMLButtonElement {
    return utils.getByRole('button', { name }) as HTMLButtonElement;
}

describe('ZoomControls', () => {
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
});
