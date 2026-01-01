import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Editor } from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { useToolSettings } from './hooks';
import type { EditorUIState } from './context';
import { Toolbar, TOOLS } from './toolbar';
import { ToolOptionBar } from './tool-option-bar';

// —— 真实无头 Editor（不触碰 fabric）：Toolbar/ToolOptionBar 通过 EditorProvider 注入，
// spy 直接打在实例原型方法上验证委托路径。 ——

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// vitest 未开 globals，testing-library 自动清理未注册；getBy* 绑定 document.body，需手动清理
afterEach(() => {
    cleanup();
});

/** 探针：把 UI 层 toolSettings 暴露给断言。 */
function makeSettingsProbe(): { Probe: () => null; read: () => EditorUIState } {
    let current: EditorUIState | null = null;
    function Probe(): null {
        current = useToolSettings();
        return null;
    }
    return {
        Probe,
        read: () => {
            if (current === null) {
                throw new Error('probe not mounted');
            }
            return current;
        }
    };
}

function renderWithEditor(editor: Editor): ReturnType<typeof render> & { readSettings: () => EditorUIState } {
    const { Probe, read } = makeSettingsProbe();
    const utils = render(
        <EditorProvider editor={editor}>
            <Toolbar />
            <ToolOptionBar />
            <Probe />
        </EditorProvider>
    );
    return { ...utils, readSettings: read };
}

function toolButton(utils: ReturnType<typeof render>, label: string): HTMLElement {
    return utils.getByText(label).closest('button') as HTMLElement;
}

describe('Toolbar', () => {
    it('按 TOOLS 顺序渲染 10 个工具按钮（label 文本可寻），初始 select active', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        const buttons = utils.container.querySelectorAll('.fp-toolbar .fp-tool-btn');
        expect(buttons).toHaveLength(10);
        const labels = Array.from(buttons).map((btn) => btn.textContent);
        expect(labels).toEqual(TOOLS.map((t) => t.label));
        expect(labels).toEqual(['选择', '裁剪', '旋转', '箭头', '画笔', '直线', '形状', '文字', '马赛克', '平移']);

        expect(toolButton(utils, '选择').className).toContain('fp-tool-btn-active');
        editor.destroy();
    });

    it('点击「画笔」进入 freedraw 且按钮 active；再点回 normal（endAll）', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '画笔'));
        expect(editor.getCurrentState()).toBe('freedraw');
        expect(toolButton(utils, '画笔').className).toContain('fp-tool-btn-active');
        expect(toolButton(utils, '选择').className).not.toContain('fp-tool-btn-active');

        fireEvent.click(toolButton(utils, '画笔'));
        expect(editor.getCurrentState()).toBe('normal');
        expect(toolButton(utils, '画笔').className).not.toContain('fp-tool-btn-active');
        expect(toolButton(utils, '选择').className).toContain('fp-tool-btn-active');
        editor.destroy();
    });

    it('点击「旋转」调 rotate(90)（动作按钮，无 active 态残留）', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'rotate');
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '旋转'));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(90);
        expect(editor.getCurrentState()).toBe('normal');
        expect(toolButton(utils, '旋转').className).not.toContain('fp-tool-btn-active');
        expect(toolButton(utils, '选择').className).toContain('fp-tool-btn-active');
        editor.destroy();
    });
});

describe('ToolOptionBar', () => {
    it('normal 模式容器占位但不渲染选项按钮', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        const bar = utils.container.querySelector('.fp-option-bar') as HTMLElement;
        expect(bar).not.toBeNull();
        expect(bar.querySelectorAll('button')).toHaveLength(0);
        editor.destroy();
    });

    it('crop 模式出现 Apply/Cancel；Apply → endCropping(true)，Cancel → endCropping(false)', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'endCropping');
        const utils = renderWithEditor(editor);

        act(() => {
            editor.startCropping();
        });
        expect(editor.getCurrentState()).toBe('crop');

        fireEvent.click(utils.getByText('Apply'));
        expect(spy).toHaveBeenLastCalledWith(true);
        expect(editor.getCurrentState()).toBe('normal');

        // 重新进入 crop 后选项条按钮是新节点，需重新查询
        act(() => {
            editor.startCropping();
        });
        fireEvent.click(utils.getByText('Cancel'));
        expect(spy).toHaveBeenLastCalledWith(false);
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it('shape 模式出现三形状按钮；切 circle → toolSettings 更新且 setDrawingShape 被调', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setDrawingShape');
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '形状'));
        expect(editor.getCurrentState()).toBe('shape');
        utils.getByText('矩形');
        utils.getByText('三角');

        fireEvent.click(utils.getByText('圆形'));
        expect(utils.readSettings().toolSettings.shape.shapeType).toBe('circle');
        expect(spy).toHaveBeenLastCalledWith('circle');
        editor.destroy();
    });

    it('freedraw 模式出现线宽选项；点 8 → toolSettings.freedraw.width=8 且 setBrush({width:8})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setBrush');
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '画笔'));
        expect(editor.getCurrentState()).toBe('freedraw');

        fireEvent.click(utils.getByText('8'));
        expect(utils.readSettings().toolSettings.freedraw.width).toBe(8);
        expect(spy).toHaveBeenCalledWith({ width: 8 });
        editor.destroy();
    });

    it('line/arrow 模式共享线宽选项条并写各自 toolSettings', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setBrush');
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '直线'));
        fireEvent.click(utils.getByText('12'));
        expect(utils.readSettings().toolSettings.line.width).toBe(12);
        expect(spy).toHaveBeenLastCalledWith({ width: 12 });

        fireEvent.click(toolButton(utils, '箭头'));
        fireEvent.click(utils.getByText('2'));
        expect(utils.readSettings().toolSettings.arrow.width).toBe(2);
        expect(spy).toHaveBeenLastCalledWith({ width: 2 });
        editor.destroy();
    });

    it('mosaic 模式出现粒度选项；点 16 → toolSettings.mosaic.dimensions=16 且不重启模式', () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startMosaicDrawing');
        const utils = renderWithEditor(editor);

        fireEvent.click(toolButton(utils, '马赛克'));
        expect(editor.getCurrentState()).toBe('mosaic');
        const callsAfterStart = startSpy.mock.calls.length;

        fireEvent.click(utils.getByText('16'));
        expect(utils.readSettings().toolSettings.mosaic.dimensions).toBe(16);
        // 不允许重启模式：粒度只在下次 start 生效
        expect(startSpy.mock.calls.length).toBe(callsAfterStart);
        expect(editor.getCurrentState()).toBe('mosaic');
        editor.destroy();
    });
});
