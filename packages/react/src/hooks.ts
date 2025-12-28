import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { Editor, EditorEventMap, EditorState } from '@gmi/fp-core';
import { EditorContext, EditorUIContext, type EditorUIState } from './context';

/** 取 provider 注入的 Editor；无 provider 抛错。 */
export function useEditor(): Editor {
    const editor = useContext(EditorContext);
    if (editor === null) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return editor;
}

/**
 * 订阅 EditorState 切片。core 的 change 在内容相等时也可能产生新 state 身份，
 * 因此 getSnapshot 返回缓存的 selector 结果：仅当 state 身份或 selector 身份变化时
 * 重算，且 isEqual（默认 Object.is）判定相等时复用旧值抑制重渲染。
 * selector 用 ref 保存最新值，内联 selector 身份变化不会导致死循环。
 */
export function useEditorState<T>(
    selector: (state: EditorState) => T,
    isEqual: (a: T, b: T) => boolean = Object.is
): T {
    const editor = useEditor();
    // latest-ref：渲染期同步赋值，保证 getSnapshot 立即读到最新 selector（内联 selector 不死循环）
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    const isEqualRef = useRef(isEqual);
    isEqualRef.current = isEqual;
    const cacheRef = useRef<{
        state: EditorState;
        selector: (state: EditorState) => T;
        value: T;
    } | null>(null);

    const subscribe = useCallback(
        (onStoreChange: () => void) => editor.subscribe(() => onStoreChange()),
        [editor]
    );
    const getSnapshot = useCallback((): T => {
        const state = editor.state;
        const cache = cacheRef.current;
        if (cache !== null && cache.state === state && cache.selector === selectorRef.current) {
            return cache.value;
        }
        const value = selectorRef.current(state);
        if (cache !== null && isEqualRef.current(cache.value, value)) {
            // 内容相等：复用旧值身份，抑制重渲染（getSnapshot 返回值必须稳定）
            cacheRef.current = { state, selector: selectorRef.current, value: cache.value };
            return cache.value;
        }
        cacheRef.current = { state, selector: selectorRef.current, value };
        return value;
    }, [editor]);

    return useSyncExternalStore(subscribe, getSnapshot);
}

/** 订阅 core 语义事件；handler 存 ref，引用变化不解绑/重绑，unmount 自动 off。 */
export function useEditorEvent<K extends keyof EditorEventMap>(
    name: K,
    handler: (payload: EditorEventMap[K]) => void
): void {
    const editor = useEditor();
    // latest-ref：渲染期同步赋值，稳定包装始终调最新 handler
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        const stable = (payload: EditorEventMap[K]): void => {
            handlerRef.current(payload);
        };
        editor.on(name, stable);
        return () => {
            editor.off(name, stable);
        };
    }, [editor, name]);
}

/** 取 UI 层工具设置；无 provider 抛错。 */
export function useToolSettings(): EditorUIState {
    const uiState = useContext(EditorUIContext);
    if (uiState === null) {
        throw new Error('useToolSettings must be used within an EditorProvider');
    }
    return uiState;
}
