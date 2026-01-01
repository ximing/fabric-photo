import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import type { Editor } from '@gmi/fp-core';

export interface CanvasViewProps {
    editor: Editor;
    className?: string;
}

const CANVAS_AREA_STYLE = {
    gridArea: 'canvas',
    backgroundColor: '#e5e5e5'
} satisfies CSSProperties;

/**
 * 画布区域容器（灰底）：渲染在 FabricPhotoEditor grid 的 'canvas' 区。
 * ResizeObserver 监听容器尺寸变化（窗口缩放/面板开合）→ editor.notifyResize()
 * 做无状态重排（zoom/pan 保持，按新容器尺寸重算居中）。
 * jsdom 等无 ResizeObserver 环境下跳过监听（真实 fabric 挂载路径在浏览器验证）。
 */
export function CanvasView(props: CanvasViewProps): JSX.Element {
    const { editor, className } = props;
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (el === null || typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(() => {
            editor.notifyResize();
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
        };
    }, [editor]);

    const cls = className === undefined ? 'fp-canvas-view' : `fp-canvas-view ${className}`;
    return <div ref={ref} className={cls} style={CANVAS_AREA_STYLE} />;
}
