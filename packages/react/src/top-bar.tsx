import { useState, type JSX } from 'react';
import { Download, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { useEditor, useEditorEvent, useEditorState } from './hooks';

/** 单次点击的缩放步长（乘区以 0.2 为档）。 */
const ZOOM_STEP = 0.2;

// lucide-react 0.344 的类型基于 React 18 JSX 命名空间，与 @types/react 19
// 的 ReactNode 不兼容；运行时是标准 FC，渲染处收窄为 JSX.ElementType
const UndoIcon = Undo2 as unknown as JSX.ElementType;
const RedoIcon = Redo2 as unknown as JSX.ElementType;
const MinusIcon = Minus as unknown as JSX.ElementType;
const PlusIcon = Plus as unknown as JSX.ElementType;
const DownloadIcon = Download as unknown as JSX.ElementType;

/**
 * 顶栏（grid 行 1）：左图名 / 中 undo·redo / 右 zoom（-、百分比复位、+）与导出。
 * history 不在 EditorState 里：undo/redo 禁用态以 historyChange 事件驱动本地 state，
 * 初值取 editor.isEmptyUndoStack()/isEmptyRedoStack()。导出 = toDataURL('image/png')
 * → 创建 a[download=<图名>.png] 并点击。
 */
export function TopBar(props: { className?: string }): JSX.Element {
    const editor = useEditor();
    const imageName = useEditorState((state) => state.doc.background?.name ?? '');
    const zoomText = useEditorState((state) => `${Math.round(state.viewport.zoom * 100)}%`);
    const [undoDisabled, setUndoDisabled] = useState(() => editor.isEmptyUndoStack());
    const [redoDisabled, setRedoDisabled] = useState(() => editor.isEmptyRedoStack());
    useEditorEvent('historyChange', ({ undoSize, redoSize }) => {
        setUndoDisabled(undoSize === 0);
        setRedoDisabled(redoSize === 0);
    });

    const handleExport = (): void => {
        const dataURL = editor.toDataURL('image/png');
        // 图名可能来自 File.name（自带扩展名），剥掉再拼 .png 避免双扩展名
        const baseName = (editor.getImageName() || 'image').replace(/\.[a-z0-9]+$/i, '');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${baseName}.png`;
        link.click();
    };

    const rootClassName = props.className === undefined ? 'fp-topbar' : `fp-topbar ${props.className}`;
    return (
        <div className={rootClassName}>
            <span className="fp-topbar-name">{imageName}</span>
            <div className="fp-topbar-history">
                <button
                    type="button"
                    className="fp-topbar-btn"
                    title="撤销"
                    aria-label="撤销"
                    disabled={undoDisabled}
                    onClick={() => editor.undo()}
                >
                    <UndoIcon size={18} aria-hidden />
                </button>
                <button
                    type="button"
                    className="fp-topbar-btn"
                    title="重做"
                    aria-label="重做"
                    disabled={redoDisabled}
                    onClick={() => editor.redo()}
                >
                    <RedoIcon size={18} aria-hidden />
                </button>
            </div>
            <div className="fp-topbar-actions">
                <button
                    type="button"
                    className="fp-topbar-btn"
                    title="缩小"
                    aria-label="缩小"
                    onClick={() => editor.setZoom(editor.getZoom() - ZOOM_STEP)}
                >
                    <MinusIcon size={18} aria-hidden />
                </button>
                <button
                    type="button"
                    className="fp-topbar-zoom-value"
                    title="重置缩放"
                    aria-label="重置缩放"
                    onClick={() => editor.setZoom(1)}
                >
                    {zoomText}
                </button>
                <button
                    type="button"
                    className="fp-topbar-btn"
                    title="放大"
                    aria-label="放大"
                    onClick={() => editor.setZoom(editor.getZoom() + ZOOM_STEP)}
                >
                    <PlusIcon size={18} aria-hidden />
                </button>
                <span className="fp-topbar-separator" aria-hidden />
                <button
                    type="button"
                    className="fp-topbar-btn"
                    title="导出"
                    aria-label="导出"
                    onClick={handleExport}
                >
                    <DownloadIcon size={18} aria-hidden />
                </button>
            </div>
        </div>
    );
}
