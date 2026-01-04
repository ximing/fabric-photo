import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { Editor, type EditorState } from '@gmi/fp-core';
import { CanvasView } from './canvas-view';
import { useEditor, useToolSettings } from './hooks';
import { EditorProvider } from './provider';
import { useShortcuts } from './shortcuts';
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
    children?: ReactNode; // 缺省 TopBar + ToolOptionBar + Toolbar + CanvasView + PropertiesPanel
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
 * 组合骨架：ref 回调拿容器 div（useState 持有）→ effect 创建 Editor →
 * src 存在时 loadImageFromURL → onReady(editor) → subscribe(onChange)；
 * cleanup 退订 + destroy。挂载容器始终渲染（自定义 children 时 Editor 仍需要 DOM）；
 * children 整体包在 EditorProvider 内（Toolbar/ToolOptionBar 等子组件经 context 取 editor
 * 与 toolSettings），缺省 children 为 TopBar + ToolOptionBar + Toolbar + CanvasView +
 * PropertiesPanel。布局（grid 骨架、grid-area 落位）全部由 styles.css 的
 * fp-editor / fp-topbar / fp-option-bar / fp-toolbar / fp-canvas-view / fp-canvas-mount /
 * fp-props-panel 承载，组件不含内联样式。
 */
export function FabricPhotoEditor(props: FabricPhotoEditorProps): JSX.Element {
    const { src, imageName = 'image', cssMaxWidth, cssMaxHeight, onReady, onChange, className, children } = props;
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    // latest-ref：回调身份变化不触发 Editor 重建
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (containerEl === null) {
            return;
        }
        const instance = new Editor({ container: containerEl, cssMaxWidth, cssMaxHeight });
        setEditor(instance);
        if (src !== undefined && src !== '') {
            // 加载失败在此静默：错误通道由 core 图片加载流程统一处理
            void instance.loadImageFromURL(src, imageName).catch(() => undefined);
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
    }, [containerEl, src, imageName, cssMaxWidth, cssMaxHeight]);

    const rootClassName = className === undefined ? 'fp-editor' : `fp-editor ${className}`;
    return (
        <div className={rootClassName}>
            {editor !== null ? (
                <EditorProvider editor={editor}>
                    <ShortcutsBridge />
                    {children ?? (
                        <>
                            <TopBar />
                            <ToolOptionBar />
                            <Toolbar />
                            <CanvasView editor={editor} />
                            <PropertiesPanel />
                        </>
                    )}
                </EditorProvider>
            ) : null}
            <div ref={setContainerEl} className="fp-canvas-mount" />
        </div>
    );
}
