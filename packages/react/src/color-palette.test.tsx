import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    AddObject,
    Editor,
    createId,
    type PathObject,
    type ShapeObject,
    type TextObject
} from '@gmi/fp-core';
import { ColorPalette, PALETTE_COLORS } from './color-palette';
import { DEFAULT_TOOL_SETTINGS, applyColor, type ToolSettings } from './tool-settings';

// —— ColorPalette 是纯受控组件（不需要 Provider）；applyColor 用真实无头 Editor + spy 验证路由。 ——

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    cleanup();
});

function makeShape(id = createId()): ShapeObject {
    return {
        id,
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

function makePath(tool: PathObject['tool'], id = createId()): PathObject {
    return {
        id,
        kind: 'path',
        tool,
        path: 'M 0 0 L 10 10',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        stroke: '#ff0000',
        strokeWidth: 2,
        fill: '#ff0000'
    };
}

/** React setState 语义的简易 toolSettings holder（applyColor 单测不渲染组件）。 */
function makeSettingsState(initial: ToolSettings): {
    get: () => ToolSettings;
    setToolSettings: Dispatch<SetStateAction<ToolSettings>>;
} {
    let current = initial;
    return {
        get: () => current,
        setToolSettings: (action) => {
            current = typeof action === 'function' ? action(current) : action;
        }
    };
}

describe('ColorPalette', () => {
    it('渲染 7 个色板按钮 + 1 个自定义 input[type=color]', () => {
        const utils = render(<ColorPalette value="#ff0000" onChange={() => undefined} />);

        const swatches = utils.getAllByRole('button');
        expect(swatches).toHaveLength(PALETTE_COLORS.length);
        expect(PALETTE_COLORS).toHaveLength(7);

        const customInput = utils.getByLabelText('自定义颜色') as HTMLInputElement;
        expect(customInput.type).toBe('color');
    });

    it('当前值命中色板时对应按钮为 active（aria-pressed），其余不是', () => {
        const utils = render(<ColorPalette value="#00ff00" onChange={() => undefined} />);

        expect(utils.getByRole('button', { name: '色板 #00ff00' }).getAttribute('aria-pressed')).toBe('true');
        expect(utils.getByRole('button', { name: '色板 #ff0000' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('点击红色色板 → onChange(#ff0000)', () => {
        const onChange = vi.fn();
        const utils = render(<ColorPalette value="#000000" onChange={onChange} />);

        fireEvent.click(utils.getByRole('button', { name: '色板 #ff0000' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('#ff0000');
    });

    it('自定义 input change → onChange 收到值；非法当前值回退 #000000 显示', () => {
        const onChange = vi.fn();
        const utils = render(<ColorPalette value="transparent" onChange={onChange} />);

        const customInput = utils.getByLabelText('自定义颜色') as HTMLInputElement;
        // input[type=color] 只接受 #rrggbb，非十六进制值回退黑色避免控件异常
        expect(customInput.value).toBe('#000000');

        fireEvent.change(customInput, { target: { value: '#123456' } });
        expect(onChange).toHaveBeenCalledWith('#123456');
    });

    it('className 语义占位并可追加自定义 class', () => {
        const utils = render(<ColorPalette value="#ff0000" onChange={() => undefined} className="extra" />);

        const root = utils.container.querySelector('.fp-color-palette') as HTMLElement;
        expect(root).not.toBeNull();
        expect(root.className).toContain('extra');
    });
});

describe('applyColor 实时生效路由', () => {
    it('选中 shape → changeShape({fill})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeShape');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);
        const shape = makeShape();
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(shape)).setSelection([shape.id]));
        });

        applyColor(editor, settings.get(), settings.setToolSettings, 'select', [shape], '#00ff00');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ fill: '#00ff00' });
        editor.destroy();
    });

    it('选中 text → changeTextStyle({fill})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeTextStyle');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);
        const text = makeText();

        applyColor(editor, settings.get(), settings.setToolSettings, 'select', [text], '#00ff00');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ fill: '#00ff00' });
        editor.destroy();
    });

    it('选中 arrow path → changeArrowStyle({color})（fill 同步由 core 处理）', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeArrowStyle');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);
        const arrow = makePath('arrow');

        applyColor(editor, settings.get(), settings.setToolSettings, 'select', [arrow], '#00ff00');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ color: '#00ff00' });
        editor.destroy();
    });

    it('选中 freedraw path → changeFreeDrawingPathStyle({color})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeFreeDrawingPathStyle');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);
        const path = makePath('freedraw');

        applyColor(editor, settings.get(), settings.setToolSettings, 'select', [path], '#00ff00');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ color: '#00ff00' });
        editor.destroy();
    });

    it('无选中、激活 freedraw → setBrush({color}) + toolSettings.freedraw.color 更新', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setBrush');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);

        applyColor(editor, settings.get(), settings.setToolSettings, 'freedraw', [], '#0000ff');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ color: '#0000ff' });
        expect(settings.get().freedraw.color).toBe('#0000ff');
        // 其他工具预设不受影响
        expect(settings.get().line.color).toBe('#ff0000');
        editor.destroy();
    });

    it('无选中、激活 arrow → setBrush + toolSettings.arrow.color 更新', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setBrush');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);

        applyColor(editor, settings.get(), settings.setToolSettings, 'arrow', [], '#808080');
        expect(spy).toHaveBeenCalledWith({ color: '#808080' });
        expect(settings.get().arrow.color).toBe('#808080');
        editor.destroy();
    });

    it('无选中、激活 shape → toolSettings.shape.stroke 更新 + setDrawingShape 预设同步', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setDrawingShape');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);

        applyColor(editor, settings.get(), settings.setToolSettings, 'shape', [], '#0000ff');
        expect(settings.get().shape.stroke).toBe('#0000ff');
        expect(spy).toHaveBeenCalledWith('rect', { stroke: '#0000ff' });
        editor.destroy();
    });

    it('无选中、无激活绘制工具（select）→ 写 freedraw 预设，不触发任何 change*/setBrush', () => {
        const editor = new Editor();
        const brushSpy = vi.spyOn(editor, 'setBrush');
        const shapeSpy = vi.spyOn(editor, 'changeShape');
        const settings = makeSettingsState(DEFAULT_TOOL_SETTINGS);

        applyColor(editor, settings.get(), settings.setToolSettings, 'select', [], '#ffff00');
        expect(brushSpy).not.toHaveBeenCalled();
        expect(shapeSpy).not.toHaveBeenCalled();
        expect(settings.get().freedraw.color).toBe('#ffff00');
        editor.destroy();
    });
});
