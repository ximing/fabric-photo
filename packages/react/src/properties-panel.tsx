import type { CSSProperties, JSX } from 'react';
import type { Editor, ImageObject, MosaicObject, PathObject, ShapeObject, TextObject } from '@gmi/fp-core';
import { useEditor, useEditorState } from './hooks';

const AREA_STYLE = { gridArea: 'props' } satisfies CSSProperties;

/** input[type=color] 只接受 #rrggbb；对象上的颜色可能是命名色等，非法值回退黑色避免控件异常。 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function toColorInputValue(value: string): string {
    return HEX_COLOR.test(value) ? value : '#000000';
}

/**
 * 颜色字段（私有，T7 完整色板落地后替换调用点）：
 * 原生 input[type=color] + 当前值文本显示。aria-label 供无障碍与测试定位。
 */
function ColorField(props: { label: string; value: string; onChange: (color: string) => void }): JSX.Element {
    return (
        <label className="fp-color-field">
            <span className="fp-color-field-label">{props.label}</span>
            <input
                type="color"
                aria-label={props.label}
                value={toColorInputValue(props.value)}
                onChange={(event) => props.onChange(event.target.value)}
            />
            <span className="fp-color-field-value">{props.value}</span>
        </label>
    );
}

/** 数值字段（私有）：非数字输入忽略，不触发回调。 */
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
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                        props.onChange(value);
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
    return (
        <>
            <ColorField label="填充" value={object.fill} onChange={(fill) => editor.changeShape({ fill })} />
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
            <ColorField label="填充" value={object.fill} onChange={(fill) => editor.changeTextStyle({ fill })} />
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
    // arrow 走 changeArrowStyle（同步头部 fill）；其余（freedraw/line）走 changeFreeDrawingPathStyle
    const change = object.tool === 'arrow' ? editor.changeArrowStyle : editor.changeFreeDrawingPathStyle;
    return (
        <>
            <ColorField label="颜色" value={object.stroke} onChange={(color) => change.call(editor, { color })} />
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
        <div className={rootClassName} style={AREA_STYLE}>
            {content}
        </div>
    );
}
