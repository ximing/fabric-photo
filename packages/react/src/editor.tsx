import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react';
import { Layers, SlidersHorizontal } from 'lucide-react';
import { Editor, type EditorEventMap, type EditorState } from '@gmi/fp-core';
import { CanvasView } from './canvas-view';
import { useEditor, useEditorState, useToolSettings } from './hooks';
import { LayersPanel } from './layers-panel';
import { EditorProvider } from './provider';
import { useShortcuts } from './shortcuts';
import { useThemeState } from './theme';
import { PropertiesPanel } from './properties-panel';
import { Toolbar } from './toolbar';
import { FloatingOptions } from './floating-options';
import { TopBar } from './top-bar';

// lucide-react 0.344 的类型基于 React 18 JSX 命名空间，与 @types/react 19
// 的 ReactNode 不兼容；运行时是标准 FC，渲染处收窄为 JSX.ElementType
const AdjustIcon = SlidersHorizontal as unknown as JSX.ElementType;
const LayersIcon = Layers as unknown as JSX.ElementType;

export interface FabricPhotoEditorProps {
    src?: string;
    imageName?: string; // 默认 'image'
    cssMaxWidth?: number; // 默认 700（core 缺省）
    cssMaxHeight?: number; // 默认 400（core 缺省）
    onReady?: (editor: Editor) => void;
    onChange?: (state: EditorState) => void;
    /** 图像加载失败（src / loadImageFromURL / addImageObject / 渲染投影）。core `loadImageError` 的 React 出口。 */
    onError?: (payload: EditorEventMap['loadImageError']) => void;
    className?: string;
    children?: ReactNode; // 缺省 TopBar + CanvasView + DefaultChrome（坞 / 浮层 / 属性卡）；自定义时不挂 DefaultChrome
}

/**
 * 快捷键桥：必须在 EditorProvider 内（取 context 的 editor 与 toolSettings），
 * 不渲染任何 DOM；getToolSettings 传内联闭包由 useShortcuts 的 latest-ref 取最新值。
 */
function ShortcutsBridge(): null {
    const editor = useEditor();
    const { toolSettings } = useToolSettings();
    useShortcuts(editor, () => toolSettings);
    return null;
}

/**
 * 关掉浮层：焦点还在浮层里才回到触发按钮。
 * Esc / 点外部都不 stopPropagation——useShortcuts 仍要收到 Esc 并 endAll，
 * 同一次 mousedown 也要能落到工具按钮上。
 */
function closePopover(
    popRef: RefObject<HTMLElement | null>,
    triggerRef: RefObject<HTMLButtonElement | null>,
    setOpen: (open: boolean) => void
): void {
    const pop = popRef.current;
    const active = document.activeElement;
    const restore = pop !== null && active !== null && pop.contains(active);
    setOpen(false);
    if (restore) {
        triggerRef.current?.focus({ preventScroll: true });
    }
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
    if (target instanceof Element) {
        return target;
    }
    if (target instanceof Node) {
        return target.parentElement;
    }
    return null;
}

/**
 * 调整/图层各自一条 document 监听，只关自己。
 * 点在任一 .fp-popover / .fp-props-card / .fp-dock-aux-btn 内不关，三个浮层才能共存；
 * 也避免点自己的触发按钮时 mousedown 先关掉、click 再打开。
 */
function usePopoverDismiss(
    open: boolean,
    popRef: RefObject<HTMLElement | null>,
    triggerRef: RefObject<HTMLButtonElement | null>,
    setOpen: (open: boolean) => void
): void {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape') {
                return;
            }
            closePopover(popRef, triggerRef, setOpen);
        };
        const onMouseDown = (event: MouseEvent): void => {
            const el = elementFromEventTarget(event.target);
            if (el?.closest('.fp-popover, .fp-props-card, .fp-dock-aux-btn') != null) {
                return;
            }
            closePopover(popRef, triggerRef, setOpen);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [open, popRef, triggerRef, setOpen]);
}

/**
 * 缺省壳的坞、调整/图层浮层与属性卡。两个开合 state 不持久化，初始都关。
 * 浮层必须是 .fp-dock 的兄弟：坞有 translateX(-50%)，会变成包含块。
 * 浮层 bottom 固定 136px 让开坞和选项条，不另挂 ResizeObserver
 * （editor 测试会替换全局 ResizeObserver）。
 */
function DefaultChrome(): JSX.Element {
    const objectCount = useEditorState((state) => state.doc.objects.length);
    const hasSelection = useEditorState((state) => state.selection.length > 0);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [layersOpen, setLayersOpen] = useState(false);
    const adjustBtnRef = useRef<HTMLButtonElement>(null);
    const layersBtnRef = useRef<HTMLButtonElement>(null);
    const adjustPopRef = useRef<HTMLDivElement>(null);
    const layersPopRef = useRef<HTMLDivElement>(null);

    usePopoverDismiss(adjustOpen, adjustPopRef, adjustBtnRef, setAdjustOpen);
    usePopoverDismiss(layersOpen, layersPopRef, layersBtnRef, setLayersOpen);

    useEffect(() => {
        if (adjustOpen) {
            adjustPopRef.current?.focus({ preventScroll: true });
        }
    }, [adjustOpen]);
    useEffect(() => {
        if (layersOpen) {
            layersPopRef.current?.focus({ preventScroll: true });
        }
    }, [layersOpen]);

    return (
        <>
            <div className="fp-dock">
                <FloatingOptions />
                <div className="fp-dock-bar">
                    <Toolbar />
                    <span className="fp-tool-sep fp-tool-sep-aux" aria-hidden="true" />
                    <div className="fp-dock-aux">
                        <button
                            ref={adjustBtnRef}
                            type="button"
                            className="fp-dock-aux-btn"
                            aria-label="调整"
                            aria-expanded={adjustOpen}
                            aria-controls="fp-adjust-popover"
                            onClick={() => setAdjustOpen((open) => !open)}
                        >
                            <AdjustIcon size={16} aria-hidden />
                            <span>调整</span>
                        </button>
                        <button
                            ref={layersBtnRef}
                            type="button"
                            className="fp-dock-aux-btn"
                            aria-label="图层"
                            aria-expanded={layersOpen}
                            aria-controls="fp-layers-popover"
                            onClick={() => setLayersOpen((open) => !open)}
                        >
                            <LayersIcon size={16} aria-hidden />
                            <span>图层</span>
                            <span
                                className={objectCount === 0 ? 'fp-dock-count fp-dock-count-zero' : 'fp-dock-count'}
                                aria-hidden="true"
                            >
                                {objectCount}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {adjustOpen ? (
                <div
                    id="fp-adjust-popover"
                    ref={adjustPopRef}
                    className="fp-popover fp-popover-adjust"
                    role="dialog"
                    aria-label="调整"
                    tabIndex={-1}
                >
                    <PropertiesPanel section="filters" />
                </div>
            ) : null}

            {layersOpen ? (
                <div
                    id="fp-layers-popover"
                    ref={layersPopRef}
                    className="fp-popover fp-popover-layers"
                    role="dialog"
                    aria-label="图层"
                    tabIndex={-1}
                >
                    <LayersPanel />
                </div>
            ) : null}

            {hasSelection ? (
                <aside className="fp-props-card" aria-label="对象属性">
                    <div className="fp-props-card-title">属性</div>
                    <PropertiesPanel section="object" />
                </aside>
            ) : null}
        </>
    );
}

/**
 * 组合骨架：ref 回调拿容器 div（useState 持有）→ 创建效应（只依赖 containerEl）创建 Editor →
 * src 存在时先订阅 loadImageError（onError）再 loadImageFromURL → onReady(editor) → subscribe(onChange)；cleanup 退订 + destroy。
 * cssMax/src 变化走独立效应的便宜路径（resizeCanvasDimension / 同实例 loadImageFromURL），
 * 不重建 Editor（保住撤销栈、onReady 只发一次）；已应用的创建时取值记录在 ref 中，
 * 后续效应据此判断「真的变了」才调用，避免挂载时重复执行。挂载容器始终渲染（自定义 children
 * 时 Editor 仍需要 DOM）；children 整体包在 EditorProvider 内（子组件经 context 取 editor 与 toolSettings）。
 * 缺省 children 为 TopBar + CanvasView + DefaultChrome。`.fp-canvas-mount` 渲染在 children 之后，不要挪进 CanvasView。
 * 布局全部由 styles.css 承载（画布铺满，顶条/坞/浮层绝对叠在上面），组件不含内联样式。
 * 背景图加载中（`editor.isLoadingImage`）：根节点加 `fp-editor-loading`，画布区渲染
 * `fp-canvas-loading` overlay；工具栏/快捷键另行订阅同一信号禁用。调整/图层按钮加载中仍可用。
 */
export function FabricPhotoEditor(props: FabricPhotoEditorProps): JSX.Element {
    const { src, imageName = 'image', cssMaxWidth, cssMaxHeight, onReady, onChange, onError, className, children } =
        props;
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [imageLoading, setImageLoading] = useState(false);
    const themeState = useThemeState();
    // latest-ref：回调身份变化不触发 Editor 重建
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    // 创建效应实际应用的 cssMax/src，供后续效应比对（仅在真的变化时走便宜路径）
    const appliedCssMaxRef = useRef<{ width?: number; height?: number }>({});
    const appliedSrcRef = useRef<{ src: string; imageName: string } | null>(null);

    useEffect(() => {
        if (containerEl === null) {
            return;
        }
        const instance = new Editor({ container: containerEl, cssMaxWidth, cssMaxHeight });
        appliedCssMaxRef.current = { width: cssMaxWidth, height: cssMaxHeight };
        setEditor(instance);
        const onLoadError = (payload: EditorEventMap['loadImageError']): void => {
            onErrorRef.current?.(payload);
        };
        instance.on('loadImageError', onLoadError);
        if (src !== undefined && src !== '') {
            appliedSrcRef.current = { src, imageName };
            // catch 只防未处理 rejection；失败经 core loadImageError → onError
            void instance.loadImageFromURL(src, imageName).catch(() => undefined);
        } else {
            appliedSrcRef.current = null;
        }
        onReadyRef.current?.(instance);
        const unsubscribe = instance.subscribe((state) => {
            onChangeRef.current?.(state);
        });
        return () => {
            instance.off('loadImageError', onLoadError);
            unsubscribe();
            instance.destroy();
            setEditor(null);
        };
        // 只随容器重建：cssMax/src 变化由下方独立效应处理（创建时的取值为挂载快照）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerEl]);

    // cssMax 变化：core 便宜路径 refit（setCssMaxDimension + refitViewport），不进历史、不重建 Editor
    useEffect(() => {
        if (editor === null) {
            return;
        }
        const prev = appliedCssMaxRef.current;
        if (prev.width === cssMaxWidth && prev.height === cssMaxHeight) {
            return;
        }
        appliedCssMaxRef.current = { width: cssMaxWidth, height: cssMaxHeight };
        editor.resizeCanvasDimension({ width: cssMaxWidth, height: cssMaxHeight });
    }, [editor, cssMaxWidth, cssMaxHeight]);

    // src 变化：同一 Editor 实例上 loadImageFromURL（撤销栈随之由 core 的图片加载流程处理）
    useEffect(() => {
        if (editor === null || src === undefined || src === '') {
            return;
        }
        const prev = appliedSrcRef.current;
        if (prev !== null && prev.src === src && prev.imageName === imageName) {
            return;
        }
        appliedSrcRef.current = { src, imageName };
        // catch 只防未处理 rejection；失败经 core loadImageError → onError
        void editor.loadImageFromURL(src, imageName).catch(() => undefined);
    }, [editor, src, imageName]);

    // 只信 React state，render 时不再读 isLoadingImage。
    // 否则会遇到：提交时 flag 仍为 true，遮罩画上了；被动 effect 订阅之前 loadImage
    // 已经发出。完成事件被错过，随后 setState(false) 与当前 state 相同被跳过，遮罩不再卸下。
    // useLayoutEffect 在绘制前订阅并同步，加载中的遮罩仍能出现在首帧。
    useLayoutEffect(() => {
        if (editor === null) {
            setImageLoading(false);
            return;
        }
        const sync = (): void => {
            setImageLoading(editor.isLoadingImage);
        };
        editor.on('loadImageStart', sync);
        editor.on('loadImage', sync);
        editor.on('loadImageError', sync);
        sync();
        return () => {
            editor.off('loadImageStart', sync);
            editor.off('loadImage', sync);
            editor.off('loadImageError', sync);
        };
    }, [editor]);

    const showLoading = imageLoading;
    const rootClassName = [
        'fp-editor',
        className,
        showLoading ? 'fp-editor-loading' : undefined
    ]
        .filter((part): part is string => part !== undefined && part !== '')
        .join(' ');
    return (
        <div className={rootClassName} data-theme={themeState.theme}>
            {editor !== null ? (
                <EditorProvider editor={editor} themeState={themeState}>
                    <ShortcutsBridge />
                    {children ?? (
                        <>
                            <TopBar />
                            <CanvasView editor={editor} />
                            <DefaultChrome />
                        </>
                    )}
                </EditorProvider>
            ) : null}
            <div ref={setContainerEl} className="fp-canvas-mount" />
            {showLoading ? <div className="fp-canvas-loading" aria-busy="true" /> : null}
        </div>
    );
}
