import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Editor } from '@gmi/fp-core';
import { useShortcuts, TOOL_SHORTCUTS } from './shortcuts';
import { DEFAULT_TOOL_SETTINGS } from './tool-settings';

// —— 真实无头 Editor（不触碰 fabric）：spy 直接打在实例方法上验证委托路径。 ——

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// vitest 未开 globals，testing-library 自动清理未注册；需手动清理
afterEach(() => {
    cleanup();
});

function pressKey(key: string, init: KeyboardEventInit = {}, target: Element | Document = document.documentElement): void {
    fireEvent.keyDown(target, { key, ...init });
}

describe('TOOL_SHORTCUTS', () => {
    it('单字母映射覆盖 10 个工具', () => {
        expect(TOOL_SHORTCUTS).toEqual({
            v: 'select',
            c: 'crop',
            r: 'rotate',
            a: 'arrow',
            p: 'freedraw',
            l: 'line',
            s: 'shape',
            t: 'text',
            m: 'mosaic',
            h: 'pan'
        });
    });
});

describe('useShortcuts', () => {
    it("按 'p' 激活 freedraw（透传 toolSettings.freedraw 样式）", () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('p');
        expect(editor.getCurrentState()).toBe('freedraw');
        expect(spy).toHaveBeenCalledWith(DEFAULT_TOOL_SETTINGS.freedraw);
        editor.destroy();
    });

    it("按 'v' 走 activateTool('select') → endAll", () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'endAll');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('v');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it('Escape → endAll', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'endAll');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('Escape');
        expect(spy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it("metaKey/ctrlKey/altKey + 'p' 不触发", () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('p', { metaKey: true });
        pressKey('p', { ctrlKey: true });
        pressKey('p', { altKey: true });
        expect(spy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it("target 为 input/textarea 时 'p' 不触发", () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        const input = document.createElement('input');
        const textarea = document.createElement('textarea');
        document.body.appendChild(input);
        document.body.appendChild(textarea);

        pressKey('p', {}, input);
        pressKey('p', {}, textarea);
        expect(spy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');

        input.remove();
        textarea.remove();
        editor.destroy();
    });

    it("文本编辑态（isTextEditing() === true）时 'p' 与 Escape 均不触发", () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startFreeDrawing');
        const endSpy = vi.spyOn(editor, 'endAll');
        vi.spyOn(editor, 'isTextEditing').mockReturnValue(true);
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('p');
        pressKey('Escape');
        expect(startSpy).not.toHaveBeenCalled();
        expect(endSpy).not.toHaveBeenCalled();
        editor.destroy();
    });

    it('getToolSettings 在按键时取最新值（settings 变更后透传新样式）', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        let settings = DEFAULT_TOOL_SETTINGS;
        const { rerender } = renderHook(() => useShortcuts(editor, () => settings));

        settings = { ...DEFAULT_TOOL_SETTINGS, freedraw: { width: 12, color: '#00ff00' } };
        rerender();
        pressKey('p');
        expect(spy).toHaveBeenCalledWith({ width: 12, color: '#00ff00' });
        editor.destroy();
    });

    it('unmount 后按键不触发', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        const { unmount } = renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        unmount();
        pressKey('p');
        expect(spy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });
});
