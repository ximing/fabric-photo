import { Emitter, type EditorEventMap } from './events';
import { History } from './plugins/history';
import { Keymap } from './plugins/keymap';
import type { Plugin } from './plugins/plugin';
import { FabricRenderer } from './render/fabric-renderer';
import type { Renderer } from './render/renderer';
import { EditorState, type EditorMode, type Viewport } from './state/editor-state';
import { Transaction } from './transform/transaction';

export interface EditorOptions {
    container?: HTMLElement; // 传入时自动创建 FabricRenderer；缺省 + renderer 缺省 = 无头模式（测试）
    cssMaxWidth?: number;
    cssMaxHeight?: number;
    plugins?: Plugin[]; // 追加插件（history/keymap 始终默认注册）
    renderer?: Renderer; // 显式注入优先；缺省且给了 container 时自动 new FabricRenderer
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameViewport(a: Viewport, b: Viewport): boolean {
    return a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;
}

/**
 * 编辑器主类：dispatch 流程 + 订阅 + 语义事件 + undo/redo 驱动 History。
 * dispatch 顺序固定：filter → apply → append → 置 state → history 收账 →
 * renderer 同步 → 事件 → 其余插件 onTransaction。
 */
export class Editor {
    private currentState: EditorState;
    private readonly emitter = new Emitter<EditorEventMap>();
    private readonly listeners = new Set<(state: EditorState, prev: EditorState) => void>();
    private readonly plugins: Plugin[];
    private readonly historyPlugin: History;
    private readonly renderer?: Renderer;

    constructor(options: EditorOptions = {}) {
        this.currentState = new EditorState();
        this.historyPlugin = new History((sizes) => this.emitter.emit('historyChange', sizes));
        this.renderer =
            options.renderer ??
            (options.container !== undefined
                ? new FabricRenderer({
                      container: options.container,
                      cssMaxWidth: options.cssMaxWidth,
                      cssMaxHeight: options.cssMaxHeight
                  })
                : undefined);
        this.plugins = [this.historyPlugin, new Keymap(this), ...(options.plugins ?? [])];
    }

    get state(): EditorState {
        return this.currentState;
    }

    get history(): History {
        return this.historyPlugin;
    }

    newTransaction(): Transaction {
        return new Transaction(this.currentState);
    }

    dispatch(tr: Transaction): void {
        const oldState = this.currentState;
        // ① filterTransaction：任一 false → 整体丢弃
        for (const plugin of this.plugins) {
            if (plugin.filterTransaction !== undefined && !plugin.filterTransaction(tr, oldState)) {
                return;
            }
        }
        // ② apply
        let newState = oldState.apply(tr);
        // ③ appendTransaction：返回值继续 apply
        for (const plugin of this.plugins) {
            const appended = plugin.appendTransaction?.(tr, oldState, newState);
            if (appended !== null && appended !== undefined) {
                newState = newState.apply(appended);
            }
        }
        // ④ 置 state
        this.currentState = newState;
        // ⑤ history 收账（undo/redo 事务 addToHistory=false 自动跳过）
        if (tr.addToHistory) {
            this.historyPlugin.onTransaction(tr, oldState, newState);
        }
        // ⑥ renderer 同步
        this.renderer?.syncState(newState, oldState);
        const modeChanged = newState.mode !== oldState.mode;
        if (modeChanged) {
            this.renderer?.setMode(newState.mode, oldState.mode);
        }
        // ⑦ 事件
        for (const listener of [...this.listeners]) {
            listener(newState, oldState);
        }
        this.emitter.emit('change', { state: newState, prev: oldState });
        if (modeChanged) {
            this.emitter.emit('change:mode', { mode: newState.mode, prevMode: oldState.mode });
        }
        if (!sameSelection(newState.selection, oldState.selection)) {
            this.emitter.emit('change:selection', { selection: newState.selection });
        }
        if (!sameViewport(newState.viewport, oldState.viewport)) {
            this.emitter.emit('change:viewport', { viewport: newState.viewport });
        }
        // ⑧ 其余插件 onTransaction
        for (const plugin of this.plugins) {
            if (plugin !== this.historyPlugin) {
                plugin.onTransaction?.(tr, oldState, newState);
            }
        }
    }

    subscribe(listener: (state: EditorState, prev: EditorState) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    on<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void {
        this.emitter.on(name, handler);
    }

    once<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void {
        this.emitter.once(name, handler);
    }

    off<K extends keyof EditorEventMap>(name: K, handler?: (payload: EditorEventMap[K]) => void): void {
        this.emitter.off(name, handler);
    }

    // —— undo/redo ——

    undo(): void {
        const entry = this.historyPlugin.popUndo();
        if (entry === null) {
            return;
        }
        this.dispatch(this.historyPlugin.makeTransaction(this.currentState, entry, 'undo'));
        this.historyPlugin.pushRedo(entry);
    }

    redo(): void {
        const entry = this.historyPlugin.popRedo();
        if (entry === null) {
            return;
        }
        this.dispatch(this.historyPlugin.makeTransaction(this.currentState, entry, 'redo'));
        this.historyPlugin.pushUndo(entry);
    }

    clearUndoStack(): void {
        this.historyPlugin.clearUndo();
    }

    clearRedoStack(): void {
        this.historyPlugin.clearRedo();
    }

    isEmptyUndoStack(): boolean {
        return this.historyPlugin.undoSize === 0;
    }

    isEmptyRedoStack(): boolean {
        return this.historyPlugin.redoSize === 0;
    }

    isEdited(): boolean {
        return this.historyPlugin.undoSize > 0;
    }

    // —— 便捷查询 ——

    getCurrentState(): EditorMode {
        return this.currentState.mode;
    }

    getImageName(): string {
        return this.currentState.doc.background?.name ?? '';
    }

    /** 结束当前进行中的交互（裁剪/绘制等），回到 normal 模式。 */
    endAll(): void {
        this.dispatch(this.newTransaction().setMode('normal'));
    }

    destroy(): void {
        this.renderer?.destroy();
        for (const plugin of this.plugins) {
            plugin.destroy?.();
        }
        this.listeners.clear();
        this.emitter.clear();
    }
}
