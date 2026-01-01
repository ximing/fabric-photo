import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import { Editor, type EditorState } from '@gmi/fp-core';
import { CanvasView } from './canvas-view';

export interface FabricPhotoEditorProps {
    src?: string;
    imageName?: string; // 默认 'image'
    cssMaxWidth?: number; // 默认 700（core 缺省）
    cssMaxHeight?: number; // 默认 400（core 缺省）
    onReady?: (editor: Editor) => void;
    onChange?: (state: EditorState) => void;
    className?: string;
    children?: ReactNode; // 缺省 <CanvasView editor={editor}/>（TopBar/Toolbar/PropertiesPanel 后续任务插入）
}

/** Figma 骨架：上顶栏 / 左工具栏 / 中画布 / 右属性面板（选项条行在 T4 插入）。 */
const GRID_STYLE = {
    display: 'grid',
    gridTemplateAreas: '"top top top" "tools canvas props"',
    gridTemplateRows: '48px 1fr',
    gridTemplateColumns: '48px 1fr 240px',
    width: '100%',
    height: '100%'
} satisfies CSSProperties;

/** canvas 挂载容器（Editor 的 DOM 依赖，先于 Editor 存在）；透明叠加在灰底 CanvasView 之上。 */
const MOUNT_STYLE = {
    gridArea: 'canvas',
    position: 'relative',
    overflow: 'hidden'
} satisfies CSSProperties;

/**
 * 组合骨架：ref 回调拿容器 div（useState 持有）→ effect 创建 Editor →
 * src 存在时 loadImageFromURL → onReady(editor) → subscribe(onChange)；
 * cleanup 退订 + destroy。挂载容器始终渲染（自定义 children 时 Editor 仍需要 DOM）；
 * 缺省 children 只有 CanvasView（灰底 + ResizeObserver），TopBar/Toolbar/PropertiesPanel
 * 由 T4-T6 各自带 gridArea 样式插入。
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
        <div className={rootClassName} style={GRID_STYLE}>
            {editor !== null ? (children ?? <CanvasView editor={editor} />) : null}
            <div ref={setContainerEl} className="fp-canvas-mount" style={MOUNT_STYLE} />
        </div>
    );
}
