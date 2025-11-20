import type { EditorMode, EditorState } from '../state/editor-state';

/**
 * 渲染层接口（Task 7 FabricRenderer 实现；测试可注入 fake）。
 * 不对外导出 —— 仅供内核与渲染层内部对接。
 */
export interface Renderer {
    syncState(state: EditorState, prev: EditorState): void;
    setMode(mode: EditorMode, prevMode: EditorMode): void;
    destroy(): void;
}
