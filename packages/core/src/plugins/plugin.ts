import type { EditorState } from '../state/editor-state';
import type { Transaction } from '../transform/transaction';

/**
 * 编辑器插件接口（ProseMirror 风格）。全部由 Editor 驱动调用：
 * - filterTransaction: 返回 false 则丢弃该事务
 * - appendTransaction: 在事务应用后追加修正事务（返回 null 表示无追加）。
 *   v1：返回值在本次 dispatch 内直接 apply，不重入 filter/dispatch、不独立进历史；
 *   只应用于必须与原事务捆绑的语义（如 selection 跟随），不能用于用户可能想单独撤销的改动。
 * - onTransaction: 事务应用后的通知（收账、日志等副作用）
 */
export interface Plugin {
    readonly name: string;
    filterTransaction?(tr: Transaction, state: EditorState): boolean;
    appendTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): Transaction | null;
    onTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): void;
    destroy?(): void;
}
