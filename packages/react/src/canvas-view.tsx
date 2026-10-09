import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import type { Editor } from '@gmi/fp-core';

export interface CanvasViewProps {
    editor: Editor;
    className?: string;
    children?: ReactNode; // 自定义布局可往画布区放内容；缺省壳不再塞 FloatingOptions / ZoomControls
}

/**
 * 画布区域容器（舞台底色）：绝对铺满编辑器。
 * ResizeObserver 监听容器尺寸变化（窗口缩放）→ editor.notifyResize()
 * 做无状态重排（zoom/pan 保持，按新容器尺寸重算居中）。这是「适配」的唯一路径，
 * 不要另接 adjustCanvasDimension。
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
    return (
        <div ref={ref} className={cls}>
            {props.children}
        </div>
    );
}
