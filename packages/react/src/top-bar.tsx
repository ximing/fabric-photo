import { useEffect, useRef, useState, type JSX } from 'react';
import { Download, Moon, Redo2, Sun, Undo2 } from 'lucide-react';
import type { ExportImageOptions } from '@gmi/fp-core';
import { useEditor, useEditorEvent, useEditorState, useToolSettings } from './hooks';

/** 导出格式三选；MIME 为 `image/${format}`，扩展名与格式同名。 */
type ExportFormat = 'png' | 'jpeg' | 'webp';
/** 质量滑杆范围（仅 JPEG/WebP 显示）；默认值须落在 min + n×step 网格上（0.9 = 0.1 + 16×0.05）。 */
const QUALITY_MIN = 0.1;
const QUALITY_MAX = 1;
const QUALITY_STEP = 0.05;
const QUALITY_DEFAULT = 0.9;
const MULTIPLIERS = [1, 2, 3] as const;

// lucide-react 0.344 的类型基于 React 18 JSX 命名空间，与 @types/react 19
// 的 ReactNode 不兼容；运行时是标准 FC，渲染处收窄为 JSX.ElementType
const UndoIcon = Undo2 as unknown as JSX.ElementType;
const RedoIcon = Redo2 as unknown as JSX.ElementType;
const DownloadIcon = Download as unknown as JSX.ElementType;
const SunIcon = Sun as unknown as JSX.ElementType;
const MoonIcon = Moon as unknown as JSX.ElementType;

/**
 * 顶栏（grid 行 1）：左图名 / 中 undo·redo / 右主题切换与导出。
 * history 不在 EditorState 里：undo/redo 禁用态以 historyChange 事件驱动本地 state，
 * 初值取 editor.isEmptyUndoStack()/isEmptyRedoStack()。
 * 导出为弹层（绝对定位面板，Esc/点外部关闭）：格式 PNG/JPEG/WebP、质量滑杆（仅 JPEG/WebP，
 * 0.1..1 步进 0.05 默认 0.9）、倍率 1x/2x/3x、范围整图/仅选中（无选中禁用）；确认导出 →
 * core toDataURL → a[download=<图名>-<宽>x<高>@<倍率>x[-selection].<ext>] 并点击。
 */
export function TopBar(props: { className?: string }): JSX.Element {
    const editor = useEditor();
    const { theme, toggleTheme } = useToolSettings();
    const imageName = useEditorState((state) => state.doc.background?.name ?? '');
    const hasSelection = useEditorState((state) => state.selection.length > 0);
    const [undoDisabled, setUndoDisabled] = useState(() => editor.isEmptyUndoStack());
    const [redoDisabled, setRedoDisabled] = useState(() => editor.isEmptyRedoStack());
    useEditorEvent('historyChange', ({ undoSize, redoSize }) => {
        setUndoDisabled(undoSize === 0);
        setRedoDisabled(redoSize === 0);
    });

    const [exportOpen, setExportOpen] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('png');
    const [quality, setQuality] = useState(QUALITY_DEFAULT);
    const [multiplier, setMultiplier] = useState<(typeof MULTIPLIERS)[number]>(1);
    const [scope, setScope] = useState<'full' | 'selection'>('full');
    const exportRef = useRef<HTMLDivElement>(null);

    // 弹层开合：Esc / 点击面板（含触发按钮的 wrapper）外部关闭
    useEffect(() => {
        if (!exportOpen) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setExportOpen(false);
            }
        };
        const onMouseDown = (event: MouseEvent): void => {
            if (exportRef.current !== null && !exportRef.current.contains(event.target as Node)) {
                setExportOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [exportOpen]);

    // 选中集清空时「仅选中」失效：退回整图（弹层开着期间删光对象的兜底）
    useEffect(() => {
        if (!hasSelection && scope === 'selection') {
            setScope('full');
        }
    }, [hasSelection, scope]);

    const handleExport = (): void => {
        const selectionOnly = scope === 'selection' && hasSelection;
        const options: ExportImageOptions = { type: `image/${format}`, multiplier, selectionOnly };
        if (format !== 'png') {
            options.quality = quality;
        }
        const size = editor.getExportSize({ multiplier, selectionOnly });
        const dataURL = editor.toDataURL(options);
        // 图名可能来自 File.name（自带扩展名），剥掉再拼避免双扩展名；
        // size 为 null（无背景整图）时省略尺寸段
        const baseName = (editor.getImageName() || 'image').replace(/\.[a-z0-9]+$/i, '');
        const sizePart = size === null ? '' : `-${size.width}x${size.height}@${multiplier}x`;
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${baseName}${sizePart}${selectionOnly ? '-selection' : ''}.${format}`;
        link.click();
        setExportOpen(false);
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
                    title="切换主题"
                    aria-label="切换主题"
                    onClick={toggleTheme}
                >
                    {theme === 'dark' ? <SunIcon size={18} aria-hidden /> : <MoonIcon size={18} aria-hidden />}
                </button>
                <span className="fp-topbar-separator" aria-hidden />
                <div className="fp-topbar-export" ref={exportRef}>
                    <button
                        type="button"
                        className="fp-topbar-btn"
                        title="导出"
                        aria-label="导出"
                        aria-expanded={exportOpen}
                        onClick={() => setExportOpen((open) => !open)}
                    >
                        <DownloadIcon size={18} aria-hidden />
                    </button>
                    {exportOpen && (
                        <div className="fp-export-panel" role="dialog" aria-label="导出设置">
                            <div className="fp-export-row" role="radiogroup" aria-label="格式">
                                <span className="fp-export-label">格式</span>
                                {(['png', 'jpeg', 'webp'] as const).map((f) => (
                                    <label key={f} className="fp-export-choice">
                                        <input
                                            type="radio"
                                            name="fp-export-format"
                                            checked={format === f}
                                            onChange={() => setFormat(f)}
                                        />
                                        {f.toUpperCase()}
                                    </label>
                                ))}
                            </div>
                            {format !== 'png' && (
                                <div className="fp-export-row">
                                    <span className="fp-export-label">质量</span>
                                    <input
                                        type="range"
                                        aria-label="质量"
                                        min={QUALITY_MIN}
                                        max={QUALITY_MAX}
                                        step={QUALITY_STEP}
                                        value={quality}
                                        onChange={(event) => setQuality(Number(event.target.value))}
                                    />
                                    <span className="fp-export-value">{quality.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="fp-export-row" role="radiogroup" aria-label="倍率">
                                <span className="fp-export-label">倍率</span>
                                {MULTIPLIERS.map((m) => (
                                    <label key={m} className="fp-export-choice">
                                        <input
                                            type="radio"
                                            name="fp-export-multiplier"
                                            checked={multiplier === m}
                                            onChange={() => setMultiplier(m)}
                                        />
                                        {m}x
                                    </label>
                                ))}
                            </div>
                            <div className="fp-export-row" role="radiogroup" aria-label="范围">
                                <span className="fp-export-label">范围</span>
                                <label className="fp-export-choice">
                                    <input
                                        type="radio"
                                        name="fp-export-scope"
                                        checked={scope === 'full'}
                                        onChange={() => setScope('full')}
                                    />
                                    整图
                                </label>
                                <label className="fp-export-choice">
                                    <input
                                        type="radio"
                                        name="fp-export-scope"
                                        disabled={!hasSelection}
                                        checked={scope === 'selection'}
                                        onChange={() => setScope('selection')}
                                    />
                                    仅选中
                                </label>
                            </div>
                            <button type="button" className="fp-export-confirm" onClick={handleExport}>
                                确认导出
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
