import type { JSX } from 'react';
import type { Editor, EditorObject, ImageObject, MosaicObject, PathObject, ShapeObject, TextObject } from '@gmi/fp-core';
import { ColorPalette } from './color-palette';
import { useEditor, useEditorState, useToolSettings } from './hooks';
import { applyColor, modeToTool } from './tool-settings';

/**
 * 颜色字段（私有）：字段名 + 行内 ColorPalette（7 色板 + 原生自定义取色 input）+ 当前值文本。
 * 面板空间足够，色板直接行内渲染（不做弹出）；自定义 input 的 aria-label 用字段名，
 * 保证同面板多个颜色字段可区分。
 */
function ColorField(props: { label: string; value: string; onChange: (color: string) => void }): JSX.Element {
    return (
        <div className="fp-color-field">
            <span className="fp-color-field-label">{props.label}</span>
            <ColorPalette value={props.value} onChange={props.onChange} inputLabel={props.label} />
            <span className="fp-color-field-value">{props.value}</span>
        </div>
    );
}

/**
 * 选中对象主色改色（shape fill / text fill / path color）：统一走 applyColor 路由，
 * 与工具选项条同一套「实时生效」语义；返回的回调直接绑到 ColorField.onChange。
 */
function useApplyObjectColor(object: EditorObject): (color: string) => void {
    const editor = useEditor();
    const { toolSettings, setToolSettings } = useToolSettings();
    const mode = useEditorState((state) => state.mode);
    return (color) => applyColor(editor, toolSettings, setToolSettings, modeToTool(mode), [object], color);
}

/** 数值字段（私有）：非数字输入忽略，不触发回调；min/max 对键盘输入做 clamp（min/max attribute 不拦截手输）。 */
function NumberField(props: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
}): JSX.Element {
    return (
        <label className="fp-number-field">
            <span className="fp-number-field-label">{props.label}</span>
            <input
                type="number"
                aria-label={props.label}
                value={props.value}
                min={props.min}
                max={props.max}
                onChange={(event) => {
                    // 清空输入框（''）与非数字输入都不触发回调，避免误写 0
                    if (event.target.value === '') {
                        return;
                    }
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                        const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, value));
                        props.onChange(clamped);
                    }
                }}
            />
        </label>
    );
}

/** 删除按钮：单选只读对象与多选共用，委托 editor.removeActiveObject()。 */
function DeleteButton(props: { editor: Editor }): JSX.Element {
    return (
        <button type="button" className="fp-props-delete" onClick={() => props.editor.removeActiveObject()}>
            删除
        </button>
    );
}

function ShapePanel(props: { editor: Editor; object: ShapeObject }): JSX.Element {
    const { editor, object } = props;
    const applyObjectColor = useApplyObjectColor(object);
    return (
        <>
            <ColorField label="填充" value={object.fill} onChange={applyObjectColor} />
            <ColorField label="描边" value={object.stroke} onChange={(stroke) => editor.changeShape({ stroke })} />
            <NumberField
                label="描边宽度"
                value={object.strokeWidth}
                min={1}
                max={20}
                onChange={(strokeWidth) => editor.changeShape({ strokeWidth })}
            />
        </>
    );
}

function TextPanel(props: { editor: Editor; object: TextObject }): JSX.Element {
    const { editor, object } = props;
    const applyObjectColor = useApplyObjectColor(object);
    // changeTextStyle 为 toggle 语义：按钮恒传目标值，active 态读对象当前值
    const toggles = [
        { label: '加粗', active: object.fontWeight === 'bold', apply: () => editor.changeTextStyle({ fontWeight: 'bold' }) },
        { label: '斜体', active: object.fontStyle === 'italic', apply: () => editor.changeTextStyle({ fontStyle: 'italic' }) },
        {
            label: '下划线',
            active: object.textDecoration === 'underline',
            apply: () => editor.changeTextStyle({ textDecoration: 'underline' })
        }
    ];
    return (
        <>
            <label className="fp-text-field">
                <span className="fp-text-field-label">文本内容</span>
                <textarea
                    aria-label="文本内容"
                    value={object.text}
                    onChange={(event) => editor.changeText(event.target.value)}
                />
            </label>
            <NumberField
                label="字号"
                value={object.fontSize}
                min={1}
                onChange={(fontSize) => editor.changeTextStyle({ fontSize })}
            />
            <ColorField label="填充" value={object.fill} onChange={applyObjectColor} />
            <div className="fp-props-style-toggles">
                {toggles.map((toggle) => (
                    <button
                        key={toggle.label}
                        type="button"
                        className={toggle.active ? 'fp-props-toggle fp-props-toggle-active' : 'fp-props-toggle'}
                        aria-pressed={toggle.active}
                        onClick={toggle.apply}
                    >
                        {toggle.label}
                    </button>
                ))}
            </div>
        </>
    );
}

function PathPanel(props: { editor: Editor; object: PathObject }): JSX.Element {
    const { editor, object } = props;
    const applyObjectColor = useApplyObjectColor(object);
    // arrow 走 changeArrowStyle（同步头部 fill）；其余（freedraw/line）走 changeFreeDrawingPathStyle
    const change = object.tool === 'arrow' ? editor.changeArrowStyle : editor.changeFreeDrawingPathStyle;
    return (
        <>
            <ColorField label="颜色" value={object.stroke} onChange={applyObjectColor} />
            <NumberField
                label="线宽"
                value={object.strokeWidth}
                min={1}
                max={20}
                onChange={(width) => change.call(editor, { width })}
            />
        </>
    );
}

function MosaicPanel(props: { editor: Editor; object: MosaicObject }): JSX.Element {
    return (
        <>
            <div className="fp-props-readonly">
                <span className="fp-props-readonly-label">马赛克块数</span>
                <span className="fp-props-readonly-value">{props.object.rects.length}</span>
            </div>
            <DeleteButton editor={props.editor} />
        </>
    );
}

function ImagePanel(props: { editor: Editor; object: ImageObject }): JSX.Element {
    const { object } = props;
    return (
        <>
            <div className="fp-props-readonly">
                <span className="fp-props-readonly-label">尺寸</span>
                <span className="fp-props-readonly-value">
                    {object.width} × {object.height}
                </span>
            </div>
            <DeleteButton editor={props.editor} />
        </>
    );
}

/**
 * 属性面板（grid 右列，gridArea 'props'）：由选中驱动表单。
 * 无选中 → 画布属性（缩放只读、背景尺寸/「未加载图片」、对象数）；
 * 单选按 kind 分派 shape/text/path/mosaic/image 表单（change* API 均可撤销）；
 * 多选 → 数量 + 删除。
 */
export function PropertiesPanel(props: { className?: string }): JSX.Element {
    const editor = useEditor();
    const selection = useEditorState((state) => state.selection);
    const objects = useEditorState((state) => state.doc.objects);
    const background = useEditorState((state) => state.doc.background);
    const zoomText = useEditorState((state) => `${Math.round(state.viewport.zoom * 100)}%`);
    const selected = objects.filter((object) => selection.includes(object.id));

    let content: JSX.Element;
    if (selected.length === 0) {
        content = (
            <div className="fp-props-canvas">
                <div className="fp-props-readonly">
                    <span className="fp-props-readonly-label">缩放</span>
                    <span className="fp-props-readonly-value">{zoomText}</span>
                </div>
                <div className="fp-props-readonly">
                    <span className="fp-props-readonly-label">背景</span>
                    <span className="fp-props-readonly-value">
                        {background !== null ? `${background.width} × ${background.height}` : '未加载图片'}
                    </span>
                </div>
                <div className="fp-props-readonly">
                    <span className="fp-props-readonly-label">对象数</span>
                    <span className="fp-props-canvas-count">{objects.length}</span>
                </div>
            </div>
        );
    } else if (selected.length > 1) {
        content = (
            <div className="fp-props-multi">
                <span className="fp-props-multi-count">已选 {selected.length} 个对象</span>
                <DeleteButton editor={editor} />
            </div>
        );
    } else {
        const object = selected[0];
        let form: JSX.Element;
        switch (object.kind) {
            case 'shape':
                form = <ShapePanel editor={editor} object={object} />;
                break;
            case 'text':
                form = <TextPanel editor={editor} object={object} />;
                break;
            case 'path':
                form = <PathPanel editor={editor} object={object} />;
                break;
            case 'mosaic':
                form = <MosaicPanel editor={editor} object={object} />;
                break;
            case 'image':
                form = <ImagePanel editor={editor} object={object} />;
                break;
        }
        content = <div className={`fp-props-object fp-props-object-${object.kind}`}>{form}</div>;
    }

    const rootClassName = props.className === undefined ? 'fp-props-panel' : `fp-props-panel ${props.className}`;
    return (
        <div className={rootClassName}>
            {content}
        </div>
    );
}
