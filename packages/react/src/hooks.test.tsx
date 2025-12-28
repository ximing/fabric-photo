import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AddObject, Editor, SetBackground, type ShapeObject } from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { useEditor, useEditorEvent, useEditorState, useToolSettings } from './hooks';

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function makeObject(id: string): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType: 'rect',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 10,
        height: 10,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 1
    };
}

function makeWrapper(editor: Editor) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return <EditorProvider editor={editor}>{children}</EditorProvider>;
    };
}

describe('useEditor', () => {
    it('provider 内返回注入的 editor 实例', () => {
        const editor = new Editor();
        const { result } = renderHook(() => useEditor(), { wrapper: makeWrapper(editor) });
        expect(result.current).toBe(editor);
    });

    it('无 provider 时抛错', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => renderHook(() => useEditor())).toThrow(/EditorProvider/);
        consoleSpy.mockRestore();
    });
});

describe('useEditorState', () => {
    it('初始返回 selector(state)，dispatch AddObject 后重渲染拿到新值', () => {
        const editor = new Editor();
        const { result } = renderHook(() => useEditorState((state) => state.doc.objects.length), {
            wrapper: makeWrapper(editor)
        });
        expect(result.current).toBe(0);
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(makeObject('a'))));
        });
        expect(result.current).toBe(1);
    });

    it('selector 结果相同（内容相等的新 state 身份）时不重渲染', () => {
        const editor = new Editor();
        let renderCount = 0;
        function Comp() {
            renderCount += 1;
            const count = useEditorState((state) => state.doc.objects.length);
            return <div data-testid="count">{count}</div>;
        }
        const Wrapper = makeWrapper(editor);
        render(
            <Wrapper>
                <Comp />
            </Wrapper>
        );
        expect(renderCount).toBe(1);
        // setMode 产生新 state 身份，但不影响 selector 结果（objects.length 仍为 0）
        act(() => {
            editor.dispatch(editor.newTransaction().setMode('pan'));
        });
        expect(editor.state.mode).toBe('pan');
        expect(renderCount).toBe(1);
    });

    it('内联 selector 身份变化不死循环，且 selector 变更后用新 selector 重算', () => {
        const editor = new Editor();
        const { result, rerender } = renderHook(
            ({ mode }: { mode: 'length' | 'mode' }) =>
                // 每次渲染都是新 selector 函数身份
                useEditorState((state) => (mode === 'length' ? state.doc.objects.length : state.mode)),
            { wrapper: makeWrapper(editor), initialProps: { mode: 'length' as 'length' | 'mode' } }
        );
        expect(result.current).toBe(0);
        rerender({ mode: 'mode' });
        expect(result.current).toBe('normal');
    });
});

describe('useEditorEvent', () => {
    it('事件触发时 handler 被调用（dispatch 事务 fire change 事件）', () => {
        const editor = new Editor();
        const handler = vi.fn();
        renderHook(() => useEditorEvent('change', handler), { wrapper: makeWrapper(editor) });
        expect(handler).not.toHaveBeenCalled();
        act(() => {
            editor.dispatch(
                editor
                    .newTransaction()
                    .addStep(new SetBackground({ src: 'data:x', width: 100, height: 100, name: 'a.png', angle: 0 }))
            );
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].state.doc.background?.name).toBe('a.png');
    });

    it('change:mode 事件载荷正确', () => {
        const editor = new Editor();
        const handler = vi.fn();
        renderHook(() => useEditorEvent('change:mode', handler), { wrapper: makeWrapper(editor) });
        act(() => {
            editor.dispatch(editor.newTransaction().setMode('pan'));
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ mode: 'pan', prevMode: 'normal' });
    });

    it('handler 引用变化不重复订阅：解绑旧 handler、重绑新 handler', () => {
        const editor = new Editor();
        const onSpy = vi.spyOn(editor, 'on');
        const offSpy = vi.spyOn(editor, 'off');
        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const { rerender } = renderHook(({ handler }) => useEditorEvent('change:mode', handler), {
            wrapper: makeWrapper(editor),
            initialProps: { handler: handler1 }
        });
        expect(onSpy).toHaveBeenCalledTimes(1);
        rerender({ handler: handler2 });
        // handler 引用变化不触发解绑/重绑（稳定包装 + ref 取最新）
        expect(onSpy).toHaveBeenCalledTimes(1);
        expect(offSpy).not.toHaveBeenCalled();
        act(() => {
            editor.dispatch(editor.newTransaction().setMode('pan'));
        });
        // 只有最新 handler 生效，且仅被调一次（无重复订阅）
        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('unmount 时解绑', () => {
        const editor = new Editor();
        const handler = vi.fn();
        const { unmount } = renderHook(() => useEditorEvent('change:mode', handler), {
            wrapper: makeWrapper(editor)
        });
        unmount();
        act(() => {
            editor.dispatch(editor.newTransaction().setMode('pan'));
        });
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('useToolSettings', () => {
    it('返回默认设置；setToolSettings 更新后 context 值变化', () => {
        const editor = new Editor();
        const { result } = renderHook(() => useToolSettings(), { wrapper: makeWrapper(editor) });
        expect(result.current.toolSettings.mosaic.dimensions).toBe(8);
        expect(result.current.toolSettings.freedraw).toEqual({ width: 4, color: '#ff0000' });
        act(() => {
            result.current.setToolSettings((prev) => ({
                ...prev,
                mosaic: { dimensions: 16 }
            }));
        });
        expect(result.current.toolSettings.mosaic.dimensions).toBe(16);
        // 其余字段不受影响
        expect(result.current.toolSettings.freedraw).toEqual({ width: 4, color: '#ff0000' });
    });

    it('无 provider 时抛错', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => renderHook(() => useToolSettings())).toThrow(/EditorProvider/);
        consoleSpy.mockRestore();
    });
});
