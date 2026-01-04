import { useEffect, useRef } from 'react';
import type { Editor } from '@gmi/fp-core';
import { activateTool, type ToolId, type ToolSettings } from './tool-settings';

/** 单字母 → 工具映射（Figma 风格）。 */
export const TOOL_SHORTCUTS: Record<string, ToolId> = {
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
};

function isEditableTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
        return false;
    }
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/**
 * 全局快捷键：监听 document.documentElement 的 keydown（与 core keymap 同层级；
 * core keymap 只管 Mod+Z/Mod+Shift+Z/Ctrl+Y/Delete，单字母工具与 Esc 由本 hook 负责）。
 * - 单字母 → activateTool(editor, tool, getToolSettings())（settings 按键时取最新值）
 * - Escape → editor.endAll()
 * 守卫：metaKey/ctrlKey/altKey 跳过（留给系统与 core keymap）；target 为
 * input/textarea/contenteditable 跳过；editor.isTextEditing() 跳过。
 * cleanup 移除监听；node 环境（无 document）不挂监听。
 */
export function useShortcuts(editor: Editor, getToolSettings: () => ToolSettings): void {
    // latest-ref：渲染期同步赋值，稳定 handler 始终取最新 settings
    const getToolSettingsRef = useRef(getToolSettings);
    getToolSettingsRef.current = getToolSettings;

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        const handler = (event: KeyboardEvent): void => {
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }
            if (editor.isTextEditing()) {
                return;
            }
            if (event.key === 'Escape') {
                editor.endAll();
                return;
            }
            const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
            if (tool !== undefined) {
                activateTool(editor, tool, getToolSettingsRef.current());
            }
        };
        document.documentElement.addEventListener('keydown', handler);
        return () => {
            document.documentElement.removeEventListener('keydown', handler);
        };
    }, [editor]);
}
