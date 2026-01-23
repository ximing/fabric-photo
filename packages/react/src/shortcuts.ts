import { useEffect, useRef } from 'react';
import type { Editor, EditorMode } from '@gmi/fp-core';
import { activateTool, modeToTool, type ToolId, type ToolSettings } from './tool-settings';

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
 * 全局快捷键：监听 document.documentElement 的 keydown/keyup（与 core keymap 同层级；
 * core keymap 只管 Mod+Z/Mod+Shift+Z/Ctrl+Y/Delete/剪贴板/z 序/缩放，单字母工具、Esc、
 * 翻转与 Space 临时平移由本 hook 负责）。
 * - 单字母 → activateTool(editor, tool, getToolSettings())（settings 按键时取最新值）
 * - Escape → editor.endAll()
 * - Shift+H → 水平翻转选中（editor.flipActiveObjects('horizontal')）
 * - Shift+V → 垂直翻转选中（editor.flipActiveObjects('vertical')）
 * - Space（按住）→ 临时平移：keydown（非 repeat）记住当前 mode 并 startPan()，
 *   keyup 恢复原 mode（prevMode 'normal' 走 endPan()；其余经 activateTool(modeToTool(prevMode))
 *   按最新 settings 重启对应 start* —— core 无通用「按 mode 恢复」公开 API，这是与
 *   工具栏点击一致的恢复路径）。keyup 时若 mode 已不是 'pan'（如 Space 期间按过 Esc）则不再恢复。
 *   按住 Space 期间单字母工具键与 Shift 翻转组合被屏蔽（实现简单、行为可预期：松开 Space 必回到进入前 mode）；
 *   进入前已是 'pan'（H 键）时不挂临时状态，keyup 不退出。window blur 兜底恢复，防 Alt-Tab 卡 pan。
 * 守卫：metaKey/ctrlKey/altKey 跳过（留给系统与 core keymap）；shiftKey 仅放行
 * Shift+H/Shift+V 两个翻转组合，其余 shift 组合不触发单字母工具切换；target 为
 * input/textarea/contenteditable 跳过；editor.isTextEditing() 跳过。
 * Space 的 keydown preventDefault 防页面滚动；keyup 不做输入框守卫（焦点中途移入
 * 输入框也要收尾，否则卡在 pan 模式）。
 * cleanup 移除监听；node 环境（无 document）不挂监听。
 */
export function useShortcuts(editor: Editor, getToolSettings: () => ToolSettings): void {
    // latest-ref：渲染期同步赋值，稳定 handler 始终取最新 settings
    const getToolSettingsRef = useRef(getToolSettings);
    getToolSettingsRef.current = getToolSettings;
    // Space 临时平移状态：进入 Space 平移前的 mode；null = 未处于 Space 平移
    const spacePanRef = useRef<EditorMode | null>(null);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        /** 结束 Space 临时平移并恢复进入前 mode（keyup 与 window blur 共用）。 */
        const endSpacePan = (): void => {
            const prevMode = spacePanRef.current;
            if (prevMode === null) {
                return;
            }
            spacePanRef.current = null;
            // Space 期间 mode 已被其他路径（如 Esc → endAll）改走，不再恢复
            if (editor.getCurrentState() !== 'pan') {
                return;
            }
            if (prevMode === 'normal') {
                editor.endPan();
            } else {
                activateTool(editor, modeToTool(prevMode), getToolSettingsRef.current());
            }
        };
        const onKeydown = (event: KeyboardEvent): void => {
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }
            if (editor.isTextEditing()) {
                return;
            }
            if (event.key === ' ') {
                // 防页面滚动；repeat（系统自动重复）忽略，避免重复 startPan
                event.preventDefault();
                if (event.repeat || spacePanRef.current !== null) {
                    return;
                }
                const prevMode = editor.getCurrentState();
                if (prevMode === 'pan') {
                    return; // 已是 H 键常驻 pan：不挂临时状态，keyup 不退出
                }
                spacePanRef.current = prevMode;
                editor.startPan();
                return;
            }
            if (event.key === 'Escape') {
                editor.endAll();
                return;
            }
            if (spacePanRef.current !== null) {
                // Space 按住期间屏蔽单字母工具切换（松开必回到进入前 mode）
                return;
            }
            if (event.shiftKey) {
                // shift 组合仅开口子给翻转；event.key 已是大写（'H'/'V'）
                if (event.key === 'H') {
                    editor.flipActiveObjects('horizontal');
                } else if (event.key === 'V') {
                    editor.flipActiveObjects('vertical');
                }
                return;
            }
            const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
            if (tool !== undefined) {
                activateTool(editor, tool, getToolSettingsRef.current());
            }
        };
        const onKeyup = (event: KeyboardEvent): void => {
            if (event.key === ' ') {
                endSpacePan();
            }
        };
        document.documentElement.addEventListener('keydown', onKeydown);
        document.documentElement.addEventListener('keyup', onKeyup);
        window.addEventListener('blur', endSpacePan);
        return () => {
            document.documentElement.removeEventListener('keydown', onKeydown);
            document.documentElement.removeEventListener('keyup', onKeyup);
            window.removeEventListener('blur', endSpacePan);
        };
    }, [editor]);
}
