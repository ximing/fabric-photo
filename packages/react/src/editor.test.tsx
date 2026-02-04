import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '@gmi/fp-core';
import { CanvasView } from './canvas-view';
import { FabricPhotoEditor } from './editor';

// —— jsdom 无法构造 fabric Canvas（getContext 返回 null），FabricPhotoEditor 的
// 容器创建路径以 FakeEditor 替换 core 的 Editor 验证；真实 fabric 挂载留 Phase 3 浏览器验证。 ——

interface FakeEditorInstance {
    options: { container?: HTMLElement; cssMaxWidth?: number; cssMaxHeight?: number };
    loadImageFromURL: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    notifyResize: ReturnType<typeof vi.fn>;
    resizeCanvasDimension: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({ createdEditors: [] as unknown[] }));

vi.mock('@gmi/fp-core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@gmi/fp-core')>();
    class FakeEditor {
        readonly options: Record<string, unknown>;
        // 缺省 children 含 Toolbar（useEditorState 读 editor.state），FakeEditor 需给出最小 state
        readonly state = new actual.EditorState();
        loadImageFromURL = vi.fn(async () => undefined);
        subscribe = vi.fn(() => vi.fn());
        destroy = vi.fn();
        notifyResize = vi.fn();
        resizeCanvasDimension = vi.fn();
        // 缺省 children 含 TopBar：historyChange 订阅 + undo/redo 初值取栈空态
        on = vi.fn();
        off = vi.fn();
        isEmptyUndoStack = vi.fn(() => true);
        isEmptyRedoStack = vi.fn(() => true);
        constructor(options: Record<string, unknown> = {}) {
            this.options = options;
            mocks.createdEditors.push(this);
        }
    }
    return { ...actual, Editor: FakeEditor };
});

// CanvasView 用例用真实无头 Editor（不触碰 fabric），验证 notifyResize 真实委托路径
const { Editor: RealEditor } = await vi.importActual<typeof import('@gmi/fp-core')>('@gmi/fp-core');

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly callback: ResizeObserverCallback;
    readonly observe = vi.fn();
    readonly unobserve = vi.fn();
    readonly disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        FakeResizeObserver.instances.push(this);
    }
    trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
    }
}

function fakeEditorAt(index: number): FakeEditorInstance {
    return mocks.createdEditors[index] as FakeEditorInstance;
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    mocks.createdEditors.length = 0;
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
    // vitest 未开 globals，testing-library 自动清理未注册；新增用例经 getByRole 查 document.body，需手动清理
    cleanup();
    vi.unstubAllGlobals();
});

describe('FabricPhotoEditor', () => {
    it('渲染 grid 骨架容器，ref 回调拿到的容器 div 用于创建 Editor，onReady 拿到实例', () => {
        const onReady = vi.fn();
        const { container } = render(
            <FabricPhotoEditor cssMaxWidth={500} cssMaxHeight={300} onReady={onReady} className="custom" />
        );

        expect(mocks.createdEditors).toHaveLength(1);
        const ed = fakeEditorAt(0);
        expect(ed.options.cssMaxWidth).toBe(500);
        expect(ed.options.cssMaxHeight).toBe(300);

        // 容器 div 在渲染树中（canvas 挂载点）
        const mount = container.querySelector('.fp-canvas-mount');
        expect(mount).not.toBeNull();
        expect(ed.options.container).toBe(mount);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onReady).toHaveBeenCalledWith(ed);

        // grid 骨架：布局由 styles.css 的 .fp-editor 承载（jsdom 不加载 CSS，
        // 这里只验证语义 class 与无内联样式）
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('fp-editor');
        expect(root.className).toContain('custom');
        expect(root.getAttribute('style')).toBeNull();
    });

    it('缺省 children 渲染 TopBar + ToolOptionBar + Toolbar + CanvasView（灰底容器）', () => {
        const { container } = render(<FabricPhotoEditor />);
        expect(container.querySelector('.fp-canvas-view')).not.toBeNull();
        expect(container.querySelector('.fp-topbar')).not.toBeNull();
        expect(container.querySelector('.fp-toolbar')).not.toBeNull();
        expect(container.querySelector('.fp-option-bar')).not.toBeNull();
        // Toolbar 10 个工具按钮经 EditorProvider context 渲染
        expect(container.querySelectorAll('.fp-toolbar .fp-tool-btn')).toHaveLength(10);
    });

    it('src 存在时 loadImageFromURL(src, imageName 缺省 image)；显式 imageName 透传', () => {
        render(<FabricPhotoEditor src="https://example.com/a.png" />);
        expect(fakeEditorAt(0).loadImageFromURL).toHaveBeenCalledWith('https://example.com/a.png', 'image');

        mocks.createdEditors.length = 0;
        render(<FabricPhotoEditor src="https://example.com/b.png" imageName="photo" />);
        expect(fakeEditorAt(0).loadImageFromURL).toHaveBeenCalledWith('https://example.com/b.png', 'photo');
    });

    it('未传 src 时不调 loadImageFromURL', () => {
        render(<FabricPhotoEditor />);
        expect(fakeEditorAt(0).loadImageFromURL).not.toHaveBeenCalled();
    });

    it('onChange 订阅 editor 的 state 变化', () => {
        const onChange = vi.fn();
        render(<FabricPhotoEditor onChange={onChange} />);
        const ed = fakeEditorAt(0);
        // 首个订阅是 FabricPhotoEditor 的 onChange（创建 Editor 的 effect 先行）；
        // 缺省 children 的 Toolbar/ToolOptionBar 经 useEditorState 追加订阅
        const listener = ed.subscribe.mock.calls[0][0] as (state: EditorState, prev: EditorState) => void;
        const fakeState = {} as EditorState;
        act(() => {
            listener(fakeState, fakeState);
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(fakeState);
    });

    it('children 自定义时渲染 children 而非缺省 CanvasView', () => {
        const { container, queryByTestId } = render(
            <FabricPhotoEditor>
                <div data-testid="custom-child" />
            </FabricPhotoEditor>
        );
        expect(queryByTestId('custom-child')).not.toBeNull();
        expect(container.querySelector('.fp-canvas-view')).toBeNull();
        expect(container.querySelector('.fp-toolbar')).toBeNull();
        // 挂载容器始终存在（Editor 的 DOM 依赖）
        expect(container.querySelector('.fp-canvas-mount')).not.toBeNull();
    });

    it('cssMax 变化不重建 Editor：走 resizeCanvasDimension 便宜路径，onReady 只发一次', () => {
        const onReady = vi.fn();
        const { rerender } = render(<FabricPhotoEditor cssMaxWidth={500} cssMaxHeight={300} onReady={onReady} />);
        const ed = fakeEditorAt(0);

        rerender(<FabricPhotoEditor cssMaxWidth={600} cssMaxHeight={300} onReady={onReady} />);
        expect(mocks.createdEditors).toHaveLength(1);
        expect(ed.destroy).not.toHaveBeenCalled();
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(ed.resizeCanvasDimension).toHaveBeenCalledTimes(1);
        expect(ed.resizeCanvasDimension).toHaveBeenCalledWith({ width: 600, height: 300 });

        // 值未实际变化时不重复调用
        rerender(<FabricPhotoEditor cssMaxWidth={600} cssMaxHeight={300} onReady={onReady} />);
        expect(ed.resizeCanvasDimension).toHaveBeenCalledTimes(1);
    });

    it('src 变化不重建 Editor：同一实例 loadImageFromURL 新地址（透传最新 imageName）', () => {
        const { rerender } = render(<FabricPhotoEditor src="https://example.com/a.png" />);
        const ed = fakeEditorAt(0);

        rerender(<FabricPhotoEditor src="https://example.com/b.png" imageName="photo" />);
        expect(mocks.createdEditors).toHaveLength(1);
        expect(ed.destroy).not.toHaveBeenCalled();
        expect(ed.loadImageFromURL).toHaveBeenCalledTimes(2);
        expect(ed.loadImageFromURL).toHaveBeenLastCalledWith('https://example.com/b.png', 'photo');

        // src 未实际变化时不重复加载
        rerender(<FabricPhotoEditor src="https://example.com/b.png" imageName="photo" />);
        expect(ed.loadImageFromURL).toHaveBeenCalledTimes(2);
    });

    it('根 div 带 data-theme；点 TopBar 切换主题后 data-theme 与 localStorage 同步', () => {
        const utils = render(<FabricPhotoEditor />);
        const root = utils.container.querySelector('.fp-editor') as HTMLElement;
        expect(root.dataset.theme).toBe('light');

        act(() => {
            fireEvent.click(utils.getByRole('button', { name: '切换主题' }));
        });
        expect(root.dataset.theme).toBe('dark');
        expect(localStorage.getItem('fp-theme')).toBe('dark');
        localStorage.clear();
    });

    it('unmount 时退订并 destroy editor', () => {
        const { unmount } = render(<FabricPhotoEditor />);
        const ed = fakeEditorAt(0);
        const unsubscribe = ed.subscribe.mock.results[0].value as ReturnType<typeof vi.fn>;

        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(ed.destroy).toHaveBeenCalledTimes(1);
    });
});

describe('CanvasView', () => {
    it('渲染灰底容器并合并 className', () => {
        const editor = new RealEditor();
        const { container } = render(<CanvasView editor={editor} className="extra" />);
        const el = container.querySelector('.fp-canvas-view') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.className).toContain('extra');
        // 灰底（#e5e5e5）由 styles.css 的 .fp-canvas-view 承载，组件无内联样式
        expect(el.getAttribute('style')).toBeNull();
        editor.destroy();
    });

    it('ResizeObserver 触发时调用 editor.notifyResize（真实无头 Editor 委托路径）', () => {
        const editor = new RealEditor();
        const spy = vi.spyOn(editor, 'notifyResize');
        render(<CanvasView editor={editor} />);

        expect(FakeResizeObserver.instances).toHaveLength(1);
        const observer = FakeResizeObserver.instances[0];
        expect(observer.observe).toHaveBeenCalledTimes(1);

        act(() => {
            observer.trigger();
        });
        expect(spy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it('unmount 时 disconnect ResizeObserver', () => {
        const editor = new RealEditor();
        const { unmount } = render(<CanvasView editor={editor} />);
        const observer = FakeResizeObserver.instances[0];

        unmount();
        expect(observer.disconnect).toHaveBeenCalledTimes(1);
        editor.destroy();
    });
});
