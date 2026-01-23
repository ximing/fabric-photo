import type { Editor } from '../editor';
import { ZOOM_MAX, ZOOM_MIN } from '../state/editor-state';
import type { Plugin } from './plugin';

/** 快捷键缩放步长（与 react 顶栏 +/- 按钮一致）。 */
export const ZOOM_STEP = 0.2;

/** 步进缩放纯函数：current + delta 后 clamp 到 [ZOOM_MIN, ZOOM_MAX]（供 keymap 与单测复用）。 */
export function stepZoom(current: number, delta: number): number {
    return Math.min(Math.max(current + delta, ZOOM_MIN), ZOOM_MAX);
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
        return false;
    }
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/**
 * 全局快捷键插件：监听 document.documentElement 的 keydown。
 * - Mod+Z（metaKey||ctrlKey）→ undo；Mod+Shift+Z / Ctrl+Y → redo
 * - Delete/Backspace → editor.removeActiveObject()
 * - Mod+C / Mod+V / Mod+X / Mod+D → copy / paste / cut / duplicate
 * - `]` / `[` → bringForward / sendBackward；Mod+`]` / Mod+`[` → bringToFront / sendToBack
 * - Mod+= / Mod++ → 放大一档（+ZOOM_STEP）；Mod+- → 缩小一档；Mod+0 → 重置为 1
 *   （preventDefault 防浏览器缩放；clamp 走 stepZoom [ZOOM_MIN, ZOOM_MAX]）
 * 守卫：目标为 input/textarea/contenteditable 或编辑器处于文本编辑态时不触发。
 * node 环境（无 document）下不挂监听，destroy 安全。
 */
export class Keymap implements Plugin {
    readonly name = 'keymap';

    private readonly handler: (event: KeyboardEvent) => void;
    private attached = false;

    constructor(private readonly editor: Editor) {
        this.handler = (event) => this.onKeydown(event);
        if (typeof document !== 'undefined') {
            document.documentElement.addEventListener('keydown', this.handler);
            this.attached = true;
        }
    }

    private onKeydown(event: KeyboardEvent): void {
        if (isEditableTarget(event.target)) {
            return;
        }
        const editor = this.editor as unknown as { isTextEditing?: () => boolean };
        if (typeof editor.isTextEditing === 'function' && editor.isTextEditing()) {
            return;
        }

        const key = event.key.toLowerCase();
        const mod = event.metaKey || event.ctrlKey;

        if (mod && key === 'z') {
            event.preventDefault();
            if (event.shiftKey) {
                this.editor.redo();
            } else {
                this.editor.undo();
            }
            return;
        }
        if (event.ctrlKey && key === 'y') {
            event.preventDefault();
            this.editor.redo();
            return;
        }
        if (mod && key === 'c') {
            event.preventDefault();
            this.editor.copyActiveObjects();
            return;
        }
        if (mod && key === 'v') {
            event.preventDefault();
            this.editor.paste();
            return;
        }
        if (mod && key === 'x') {
            event.preventDefault();
            this.editor.cutActiveObjects();
            return;
        }
        if (mod && key === 'd') {
            event.preventDefault();
            this.editor.duplicateActiveObjects();
            return;
        }
        if (mod && (key === '=' || key === '+')) {
            // US 布局 Mod+Shift+= 的 key 是 '+'，'='/'+' 均视为放大
            event.preventDefault();
            this.editor.setZoom(stepZoom(this.editor.getZoom(), ZOOM_STEP));
            return;
        }
        if (mod && key === '-') {
            event.preventDefault();
            this.editor.setZoom(stepZoom(this.editor.getZoom(), -ZOOM_STEP));
            return;
        }
        if (mod && key === '0') {
            event.preventDefault();
            this.editor.setZoom(1);
            return;
        }
        if (key === ']' || key === '[') {
            event.preventDefault();
            if (mod) {
                if (key === ']') {
                    this.editor.bringToFront();
                } else {
                    this.editor.sendToBack();
                }
            } else if (key === ']') {
                this.editor.bringForward();
            } else {
                this.editor.sendBackward();
            }
            return;
        }
        if (key === 'delete' || key === 'backspace') {
            event.preventDefault();
            this.editor.removeActiveObject();
        }
    }

    destroy(): void {
        if (this.attached) {
            document.documentElement.removeEventListener('keydown', this.handler);
            this.attached = false;
        }
    }
}
