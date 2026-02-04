import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { Editor, type EditorState } from '@gmi/fp-core';
import { CanvasView } from './canvas-view';
import { useEditor, useToolSettings } from './hooks';
import { LayersPanel } from './layers-panel';
import { EditorProvider } from './provider';
import { useShortcuts } from './shortcuts';
import { useThemeState } from './theme';
import { PropertiesPanel } from './properties-panel';
import { Toolbar } from './toolbar';
import { ToolOptionBar } from './tool-option-bar';
import { TopBar } from './top-bar';

export interface FabricPhotoEditorProps {
    src?: string;
    imageName?: string; // 默认 'image'
    cssMaxWidth?: number; // 默认 700（core 缺省）
    cssMaxHeight?: number; // 默认 400（core 缺省）
    onReady?: (editor: Editor) => void;
    onChange?: (state: EditorState) => void;
    className?: string;
    children?: ReactNode; // 缺省 TopBar + ToolOptionBar + Toolbar + CanvasView + 右列（LayersPanel + PropertiesPanel）
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
 * 组合骨架：ref 回调拿容器 div（useState 持有）→ 创建效应（只依赖 containerEl）创建 Editor →
 * src 存在时 loadImageFromURL → onReady(editor) → subscribe(onChange)；cleanup 退订 + destroy。
 * cssMax/src 变化走独立效应的便宜路径（resizeCanvasDimension / 同实例 loadImageFromURL），
 * 不重建 Editor（保住撤销栈、onReady 只发一次）；已应用的创建时取值记录在 ref 中，
 * 后续效应据此判断「真的变了」才调用，避免挂载时重复执行。挂载容器始终渲染（自定义 children
 * 时 Editor 仍需要 DOM）；children 整体包在 EditorProvider 内（Toolbar/ToolOptionBar 等子组件经
 * context 取 editor 与 toolSettings），缺省 children 为 TopBar + ToolOptionBar + Toolbar +
 * CanvasView + 右列侧栏（fp-side-panel：LayersPanel 在上、PropertiesPanel 在下）。
 * 布局（grid 骨架、grid-area 落位）全部由 styles.css 的
 * fp-editor / fp-topbar / fp-option-bar / fp-toolbar / fp-canvas-view / fp-canvas-mount /
 * fp-side-panel / fp-layers-panel / fp-props-panel 承载，组件不含内联样式。
 */
export function FabricPhotoEditor(props: FabricPhotoEditorProps): JSX.Element {
    const { src, imageName = 'image', cssMaxWidth, cssMaxHeight, onReady, onChange, className, children } = props;
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const themeState = useThemeState();
    // latest-ref：回调身份变化不触发 Editor 重建
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
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
        if (src !== undefined && src !== '') {
            appliedSrcRef.current = { src, imageName };
            // 加载失败在此静默：错误通道由 core 图片加载流程统一处理
            void instance.loadImageFromURL(src, imageName).catch(() => undefined);
        } else {
            appliedSrcRef.current = null;
        }
        onReadyRef.current?.(instance);
        const unsubscribe = instance.subscribe((state) => {
            onChangeRef.current?.(state);
        });
        return () => {
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
        // 加载失败在此静默：错误通道由 core 图片加载流程统一处理
        void editor.loadImageFromURL(src, imageName).catch(() => undefined);
    }, [editor, src, imageName]);

    const rootClassName = className === undefined ? 'fp-editor' : `fp-editor ${className}`;
    return (
        <div className={rootClassName} data-theme={themeState.theme}>
            {editor !== null ? (
                <EditorProvider editor={editor} themeState={themeState}>
                    <ShortcutsBridge />
                    {children ?? (
                        <>
                            <TopBar />
                            <ToolOptionBar />
                            <Toolbar />
                            <CanvasView editor={editor} />
                            <div className="fp-side-panel">
                                <LayersPanel />
                                <PropertiesPanel />
                            </div>
                        </>
                    )}
                </EditorProvider>
            ) : null}
            <div ref={setContainerEl} className="fp-canvas-mount" />
        </div>
    );
}
