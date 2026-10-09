import type { JSX } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useEditor, useEditorState } from './hooks';

/** 单次点击的缩放步长（乘区以 0.2 为档）。 */
const ZOOM_STEP = 0.2;

// lucide-react 0.344 的类型基于 React 18 JSX 命名空间，与 @types/react 19
// 的 ReactNode 不兼容；运行时是标准 FC，渲染处收窄为 JSX.ElementType
const MinusIcon = Minus as unknown as JSX.ElementType;
const PlusIcon = Plus as unknown as JSX.ElementType;

/**
 * 缩放控件：− / 百分比复位 / ＋，步长 0.2，百分比点击 setZoom(1)。
 * 缺省壳把它放进顶条，组件自身不再绝对贴在画布底；要浮动的调用方用 className 覆写定位。
 * 不要改成「适配」，也不要调用 adjustCanvasDimension / resizeCanvasDimension。
 */
export function ZoomControls(props: { className?: string }): JSX.Element {
    const editor = useEditor();
    const zoomText = useEditorState((state) => `${Math.round(state.viewport.zoom * 100)}%`);

    const rootClassName =
        props.className === undefined ? 'fp-zoom-controls' : `fp-zoom-controls ${props.className}`;
    return (
        <div className={rootClassName}>
            <button
                type="button"
                className="fp-zoom-btn"
                title="缩小"
                aria-label="缩小"
                onClick={() => editor.setZoom(editor.getZoom() - ZOOM_STEP)}
            >
                <MinusIcon size={16} aria-hidden />
            </button>
            <button
                type="button"
                className="fp-zoom-value"
                title="重置缩放"
                aria-label="重置缩放"
                onClick={() => editor.setZoom(1)}
            >
                {zoomText}
            </button>
            <button
                type="button"
                className="fp-zoom-btn"
                title="放大"
                aria-label="放大"
                onClick={() => editor.setZoom(editor.getZoom() + ZOOM_STEP)}
            >
                <PlusIcon size={16} aria-hidden />
            </button>
        </div>
    );
}
