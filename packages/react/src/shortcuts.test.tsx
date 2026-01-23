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

    it("Shift+H / Shift+V 触发水平/垂直翻转，且不触发 'h'/'v' 的工具切换", () => {
        const editor = new Editor();
        const flipSpy = vi.spyOn(editor, 'flipActiveObjects');
        const panSpy = vi.spyOn(editor, 'startPan');
        const endAllSpy = vi.spyOn(editor, 'endAll');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('H', { shiftKey: true });
        expect(flipSpy).toHaveBeenCalledWith('horizontal');
        expect(panSpy).not.toHaveBeenCalled(); // 'h' = pan 工具不被触发

        pressKey('V', { shiftKey: true });
        expect(flipSpy).toHaveBeenCalledWith('vertical');
        expect(endAllSpy).not.toHaveBeenCalled(); // 'v' = select 工具不被触发
        editor.destroy();
    });

    it("shift + 无映射字母（如 Shift+P）不触发工具切换", () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('P', { shiftKey: true });
        expect(spy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it("Shift+H 在修饰键（Mod）同按时不触发", () => {
        const editor = new Editor();
        const flipSpy = vi.spyOn(editor, 'flipActiveObjects');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('H', { shiftKey: true, metaKey: true });
        pressKey('H', { shiftKey: true, ctrlKey: true });
        expect(flipSpy).not.toHaveBeenCalled();
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

describe('useShortcuts — Space 临时平移', () => {
    function releaseKey(key: string, init: KeyboardEventInit = {}, target: Element | Document = document.documentElement): void {
        fireEvent.keyUp(target, { key, ...init });
    }

    it('keydown Space 进入 pan，keyup 恢复 normal（endPan 路径）', () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startPan');
        const endSpy = vi.spyOn(editor, 'endPan');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey(' ');
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(editor.getCurrentState()).toBe('pan');

        releaseKey(' ');
        expect(endSpy).toHaveBeenCalledTimes(1);
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it('从非 normal 模式（freedraw）进入，keyup 经 activateTool 恢复原 mode', () => {
        const editor = new Editor();
        const freeDrawSpy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('p'); // freedraw
        expect(editor.getCurrentState()).toBe('freedraw');

        pressKey(' ');
        expect(editor.getCurrentState()).toBe('pan');

        releaseKey(' ');
        expect(editor.getCurrentState()).toBe('freedraw');
        // 第一次 'p' + Space 松开恢复，各透传一次 settings
        expect(freeDrawSpy).toHaveBeenCalledTimes(2);
        expect(freeDrawSpy).toHaveBeenLastCalledWith(DEFAULT_TOOL_SETTINGS.freedraw);
        editor.destroy();
    });

    it('repeat 的 keydown Space 被忽略（不重复 startPan）', () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startPan');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey(' ');
        pressKey(' ', { repeat: true });
        pressKey(' ', { repeat: true });
        expect(startSpy).toHaveBeenCalledTimes(1);

        releaseKey(' ');
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it('输入框 target 不触发 Space 平移', () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startPan');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        const input = document.createElement('input');
        document.body.appendChild(input);
        pressKey(' ', {}, input);
        expect(startSpy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');
        input.remove();
        editor.destroy();
    });

    it('文本编辑态不触发 Space 平移', () => {
        const editor = new Editor();
        const startSpy = vi.spyOn(editor, 'startPan');
        vi.spyOn(editor, 'isTextEditing').mockReturnValue(true);
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey(' ');
        expect(startSpy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });

    it('Space 按住期间单字母工具快捷键被屏蔽，松开后回到进入前 mode', () => {
        const editor = new Editor();
        const freeDrawSpy = vi.spyOn(editor, 'startFreeDrawing');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey(' ');
        pressKey('p'); // 被屏蔽
        expect(editor.getCurrentState()).toBe('pan');
        expect(freeDrawSpy).not.toHaveBeenCalled();

        releaseKey(' ');
        expect(editor.getCurrentState()).toBe('normal');
        expect(freeDrawSpy).not.toHaveBeenCalled();
        editor.destroy();
    });

    it('进入前已是 H 键常驻 pan：Space 不挂临时状态，keyup 不退出 pan', () => {
        const editor = new Editor();
        const endSpy = vi.spyOn(editor, 'endPan');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('h');
        expect(editor.getCurrentState()).toBe('pan');

        pressKey(' ');
        releaseKey(' ');
        expect(endSpy).not.toHaveBeenCalled();
        expect(editor.getCurrentState()).toBe('pan');
        editor.destroy();
    });

    it('Space 期间按 Escape 退出后，keyup 不再恢复旧 mode', () => {
        const editor = new Editor();
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey('p'); // freedraw
        pressKey(' '); // pan
        pressKey('Escape'); // endAll → normal
        expect(editor.getCurrentState()).toBe('normal');

        releaseKey(' ');
        expect(editor.getCurrentState()).toBe('normal'); // 不弹回 freedraw
        editor.destroy();
    });

    it('window blur 兜底结束 Space 平移并恢复 mode', () => {
        const editor = new Editor();
        const endSpy = vi.spyOn(editor, 'endPan');
        renderHook(() => useShortcuts(editor, () => DEFAULT_TOOL_SETTINGS));

        pressKey(' ');
        expect(editor.getCurrentState()).toBe('pan');

        fireEvent(window, new Event('blur'));
        expect(endSpy).toHaveBeenCalledTimes(1);
        expect(editor.getCurrentState()).toBe('normal');

        releaseKey(' '); // blur 已收尾，keyup 幂等
        expect(editor.getCurrentState()).toBe('normal');
        editor.destroy();
    });
});
