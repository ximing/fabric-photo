import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AddObject, Editor, createId, type PathObject, type ShapeObject } from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { useToolSettings } from './hooks';
import type { EditorUIState } from './context';
import { Toolbar } from './toolbar';
import { FloatingOptions } from './floating-options';

// —— 真实无头 Editor（不触碰 fabric）：Toolbar/FloatingOptions 通过 EditorProvider 注入，
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
            <FloatingOptions />
            <Probe />
        </EditorProvider>
    );
    return { ...utils, readSettings: read };
}

function toolButton(utils: ReturnType<typeof render>, label: string): HTMLElement {
    return utils.getByText(label).closest('button') as HTMLElement;
}

describe('FloatingOptions', () => {
    it('normal/text/pan 模式渲染 null（无空容器）；切到 freedraw 出现浮动条', () => {
        const editor = new Editor();
        const utils = render(
            <EditorProvider editor={editor}>
                <FloatingOptions />
            </EditorProvider>
        );
        expect(utils.container.querySelector('.fp-floating-options')).toBeNull();

        act(() => {
            editor.startFreeDrawing({ width: 4, color: '#ff0000' });
        });
        expect(utils.container.querySelector('.fp-floating-options')).not.toBeNull();

        act(() => {
            editor.endAll();
        });
        expect(utils.container.querySelector('.fp-floating-options')).toBeNull();
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

    // —— 色板 value「选中优先」：core setMode 不清 selection，brush/shape 模式下残留选中时
    // 点色板改的是选中对象（applyColor 路由），高亮必须落在选中对象主色而非工具预设。 ——

    function makePath(stroke: string): PathObject {
        return {
            id: createId(),
            kind: 'path',
            tool: 'freedraw',
            path: 'M 0 0 L 10 10',
            left: 0,
            top: 0,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            stroke,
            strokeWidth: 2,
            fill: stroke
        };
    }

    function makeShape(fill: string, stroke: string): ShapeObject {
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
            fill,
            stroke,
            strokeWidth: 4
        };
    }

    it('freedraw 模式残留选中 path：色板高亮选中对象 stroke 而非工具预设色', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        // 先造残留选中，再进模式（setMode 不清 selection）
        const path = makePath('#0000ff');
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(path)).setSelection([path.id]));
        });
        fireEvent.click(toolButton(utils, '画笔'));
        expect(editor.getCurrentState()).toBe('freedraw');

        // 预设色 #ff0000 不高亮；选中对象 stroke #0000ff 高亮
        expect(utils.getByRole('button', { name: '色板 #ff0000' }).getAttribute('aria-pressed')).toBe('false');
        expect(utils.getByRole('button', { name: '色板 #0000ff' }).getAttribute('aria-pressed')).toBe('true');
        editor.destroy();
    });

    it('shape 模式残留选中 shape：色板高亮选中对象 fill（与 applyColor 作用字段一致）而非 stroke/预设', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        const shape = makeShape('#00ff00', '#0000ff');
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(shape)).setSelection([shape.id]));
        });
        fireEvent.click(toolButton(utils, '形状'));
        expect(editor.getCurrentState()).toBe('shape');

        expect(utils.getByRole('button', { name: '色板 #00ff00' }).getAttribute('aria-pressed')).toBe('true');
        expect(utils.getByRole('button', { name: '色板 #0000ff' }).getAttribute('aria-pressed')).toBe('false');
        expect(utils.getByRole('button', { name: '色板 #ff0000' }).getAttribute('aria-pressed')).toBe('false');
        editor.destroy();
    });
});
