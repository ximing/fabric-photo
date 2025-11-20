import type { EditorState } from '../state/editor-state';
import type { Transaction } from '../transform/transaction';

/**
 * 编辑器插件接口（ProseMirror 风格）。全部由 Editor 驱动调用：
 * - filterTransaction: 返回 false 则丢弃该事务
 * - appendTransaction: 在事务应用后追加修正事务（返回 null 表示无追加）
 * - onTransaction: 事务应用后的通知（收账、日志等副作用）
 */
export interface Plugin {
    readonly name: string;
    filterTransaction?(tr: Transaction, state: EditorState): boolean;
    appendTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): Transaction | null;
    onTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): void;
    destroy?(): void;
}
