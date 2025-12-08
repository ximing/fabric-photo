import type { Canvas } from 'fabric';
import type { EditorEventMap } from '../../events';
import type { EditorMode, EditorState } from '../../state/editor-state';
import type { Transaction } from '../../transform/transaction';

/**
 * Controller 运行上下文：由 Editor 在接管 FabricRenderer 时注入。
 * 内部实现，不从 index.ts 导出。
 */
export interface ControllerContext {
    canvas: Canvas;
    getState(): EditorState;
    dispatch(tr: Transaction): void;
    fire<K extends keyof EditorEventMap>(name: K, payload: EditorEventMap[K]): void;
}

/** 绘制类 controller 共用的笔刷配置（width 线宽、color 颜色）。 */
export interface BrushSetting {
    width?: number;
    color?: string;
}

/**
 * 交互控制器：每个 EditorMode 对应一个（mode 'normal' 为 select controller）。
 * renderer.setMode 时 deactivate 旧 controller、activate 新 controller；
 * activate 幂等（重复调用不重复挂监听）。
 */
export interface Controller {
    readonly mode: EditorMode;
    activate(ctx: ControllerContext): void;
    deactivate(): void;
}
