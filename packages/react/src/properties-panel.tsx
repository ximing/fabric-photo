import type { JSX } from 'react';
import { DEFAULT_FILTERS, type Editor, type EditorObject, type FilterSettings, type ImageObject, type MosaicObject, type PathObject, type ShapeObject, type TextObject } from '@gmi/fp-core';
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
    disabled?: boolean; // locked 时几何类控件禁用
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
                disabled={props.disabled}
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

/**
 * 滤镜滑杆（私有）：domain [-1,1] 映射为 -100..100，[0,1] 映射为 0..100 显示。
 * onChange 直接透传归一化值（连续拖动由调用方配 mergeKey 合并历史）。
 */
function FilterSlider(props: {
    label: string;
    value: number; // 归一化（[-1,1] 或 [0,1]）
    min: number;   // 归一化域
    max: number;
    onChange: (value: number) => void;
}): JSX.Element {
    const display = Math.round(props.value * 100);
    return (
        <div className="fp-filter-field">
            <div className="fp-filter-field-row">
                <span className="fp-filter-field-label">{props.label}</span>
                <span className="fp-filter-field-value">{display}</span>
            </div>
            <input
                type="range"
                aria-label={props.label}
                min={props.min * 100}
                max={props.max * 100}
                step={1}
                value={display}
                onChange={(event) => props.onChange(Number(event.target.value) / 100)}
            />
        </div>
    );
}

/**
 * 滤镜调整组（私有）：亮度/对比度/饱和度/模糊滑杆 + 灰度/褐色/反色 toggle + 重置。
 * 零编辑逻辑：onPatch/onReset 由调用方绑定 core 的 set*Filters/reset*Filters（含 mergeKey）。
 */
function FilterAdjustGroup(props: {
    title: string;
    filters: FilterSettings | undefined;
    onPatch: (patch: Partial<FilterSettings>) => void;
    onReset: () => void;
}): JSX.Element {
    const effective = props.filters ?? DEFAULT_FILTERS;
    const toggles = [
        { key: 'grayscale', label: '灰度', active: effective.grayscale },
        { key: 'sepia', label: '褐色', active: effective.sepia },
        { key: 'invert', label: '反色', active: effective.invert }
    ] as const;
    return (
        <div className="fp-props-group">
            <span className="fp-props-group-label">{props.title}</span>
            <FilterSlider label="亮度" value={effective.brightness} min={-1} max={1} onChange={(brightness) => props.onPatch({ brightness })} />
            <FilterSlider label="对比度" value={effective.contrast} min={-1} max={1} onChange={(contrast) => props.onPatch({ contrast })} />
            <FilterSlider label="饱和度" value={effective.saturation} min={-1} max={1} onChange={(saturation) => props.onPatch({ saturation })} />
            <FilterSlider label="模糊" value={effective.blur} min={0} max={1} onChange={(blur) => props.onPatch({ blur })} />
            <div className="fp-props-style-toggles">
                {toggles.map((toggle) => (
                    <button
                        key={toggle.key}
                        type="button"
                        className={toggle.active ? 'fp-props-toggle fp-props-toggle-active' : 'fp-props-toggle'}
                        aria-pressed={toggle.active}
                        onClick={() => props.onPatch({ [toggle.key]: !toggle.active })}
                    >
                        {toggle.label}
                    </button>
                ))}
            </div>
            <button type="button" className="fp-props-toggle" onClick={() => props.onReset()}>
                重置
            </button>
        </div>
    );
}

/**
 * 不透明度滑杆（私有）：单选/多选共用，0..1 ↔ 0..100 显示；
 * 委托 editor.setObjectOpacity（作用于全部选中对象），mergeKey 按选中集区分，
 * 同一选中集连续拖动合并为一个 undo 条目。多选显示第一个选中对象的值。
 */
function OpacitySlider(props: { editor: Editor; objects: EditorObject[] }): JSX.Element {
    const { editor, objects } = props;
    const ids = objects.map((o) => o.id);
    return (
        <FilterSlider
            label="不透明度"
            value={objects[0].opacity ?? 1}
            min={0}
            max={1}
            onChange={(opacity) => editor.setObjectOpacity(ids, opacity, { mergeKey: `opacity:${ids.join('+')}` })}
        />
    );
}

/** 锁定提示（私有）：locked 单选时显示；几何类控件（NumberField）由调用方按 locked 禁用。 */
function LockedHint(): JSX.Element {
    return <div className="fp-props-locked-hint">已锁定：几何类控件不可用，解锁后可编辑</div>;
}

/** 删除按钮：单选只读对象与多选共用，委托 editor.removeActiveObject()。 */
function DeleteButton(props: { editor: Editor }): JSX.Element {
    return (
        <button type="button" className="fp-props-delete" onClick={() => props.editor.removeActiveObject()}>
            删除
        </button>
    );
}

/**
 * 图层顺序 + 翻转按钮组：单选与多选共用，全部委托 core 公开 API
 * （z 序多选保持相对顺序、已在顶/底 no-op；翻转对每个选中对象取负 scale）。
 */
function ArrangeGroups(props: { editor: Editor }): JSX.Element {
    const { editor } = props;
    return (
        <>
            <div className="fp-props-group">
                <span className="fp-props-group-label">图层顺序</span>
                <div className="fp-props-style-toggles">
                    <button type="button" className="fp-props-toggle" onClick={() => editor.bringToFront()}>
                        置顶
                    </button>
                    <button type="button" className="fp-props-toggle" onClick={() => editor.bringForward()}>
                        上移
                    </button>
                    <button type="button" className="fp-props-toggle" onClick={() => editor.sendBackward()}>
                        下移
                    </button>
                    <button type="button" className="fp-props-toggle" onClick={() => editor.sendToBack()}>
                        置底
                    </button>
                </div>
            </div>
            <div className="fp-props-group">
                <span className="fp-props-group-label">翻转</span>
                <div className="fp-props-style-toggles">
                    <button
                        type="button"
                        className="fp-props-toggle"
                        onClick={() => editor.flipActiveObjects('horizontal')}
                    >
                        水平翻转
                    </button>
                    <button type="button" className="fp-props-toggle" onClick={() => editor.flipActiveObjects('vertical')}>
                        垂直翻转
                    </button>
                </div>
            </div>
        </>
    );
}

/**
 * 对齐分布按钮组（多选专属，私有）：6 对齐 + 2 分布，全部委托 core 公开 API
 * （alignActiveObjects/distributeActiveObjects，一笔事务可撤销）；
 * 分布需 ≥3 选中才启用（core 侧 locked 过滤后不足亦 no-op 返回 false）。
 */
function AlignDistributeGroup(props: { editor: Editor; selectedCount: number }): JSX.Element {
    const { editor, selectedCount } = props;
    const aligns = [
        { edge: 'left', label: '左对齐' },
        { edge: 'centerX', label: '水平居中' },
        { edge: 'right', label: '右对齐' },
        { edge: 'top', label: '顶对齐' },
        { edge: 'centerY', label: '垂直居中' },
        { edge: 'bottom', label: '底对齐' }
    ] as const;
    const distributes = [
        { axis: 'horizontal', label: '水平分布' },
        { axis: 'vertical', label: '垂直分布' }
    ] as const;
    return (
        <div className="fp-props-group">
            <span className="fp-props-group-label">对齐分布</span>
            <div className="fp-props-align-grid">
                {aligns.map((item) => (
                    <button
                        key={item.edge}
                        type="button"
                        className="fp-props-toggle"
                        onClick={() => editor.alignActiveObjects(item.edge)}
                    >
                        {item.label}
                    </button>
                ))}
                {distributes.map((item) => (
                    <button
                        key={item.axis}
                        type="button"
                        className="fp-props-toggle"
                        disabled={selectedCount < 3}
                        onClick={() => editor.distributeActiveObjects(item.axis)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ShapePanel(props: { editor: Editor; object: ShapeObject; locked: boolean }): JSX.Element {
    const { editor, object, locked } = props;
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
                disabled={locked}
                onChange={(strokeWidth) => editor.changeShape({ strokeWidth })}
            />
        </>
    );
}

function TextPanel(props: { editor: Editor; object: TextObject; locked: boolean }): JSX.Element {
    const { editor, object, locked } = props;
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
                disabled={locked}
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

function PathPanel(props: { editor: Editor; object: PathObject; locked: boolean }): JSX.Element {
    const { editor, object, locked } = props;
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
                disabled={locked}
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
    const { editor, object } = props;
    return (
        <>
            <div className="fp-props-readonly">
                <span className="fp-props-readonly-label">尺寸</span>
                <span className="fp-props-readonly-value">
                    {object.width} × {object.height}
                </span>
            </div>
            <FilterAdjustGroup
                title="图像调整"
                filters={object.filters}
                onPatch={(patch) => editor.setImageFilters(object.id, patch, { mergeKey: `img-filters-${object.id}` })}
                onReset={() => editor.resetImageFilters(object.id)}
            />
            <DeleteButton editor={editor} />
        </>
    );
}

/**
 * 属性面板（grid 右列，gridArea 'props'）：由选中驱动表单。
 * 无选中 → 画布属性（缩放只读、背景尺寸/「未加载图片」、对象数）+「背景调整」滤镜组
 * （已加载背景时，mergeKey 'bg-filters'，连续拖动一个 undo 条目）；
 * 单选按 kind 分派 shape/text/path/mosaic/image 表单（change* API 均可撤销），
 * image 表单带「图像调整」滤镜组（mergeKey `img-filters-${id}`）；
 * 多选 → 数量 + 删除 +「对齐分布」按钮组（6 对齐 + 2 分布，≥3 选中才启用分布，
 * 委托 alignActiveObjects/distributeActiveObjects）。单选与多选均有「不透明度」滑杆（0..100 ↔ 0..1，
 * setObjectOpacity + mergeKey 连续拖动一个 undo 条目）、「图层顺序」
 * （置顶/上移/下移/置底）与「翻转」（水平/垂直）按钮组，委托 core 公开 API。
 * 单选 locked 对象时显示「已锁定」提示并禁用几何类控件（描边宽度/字号/线宽）。
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
                {background !== null && (
                    <FilterAdjustGroup
                        title="背景调整"
                        filters={background.filters}
                        onPatch={(patch) => editor.setBackgroundFilters(patch, { mergeKey: 'bg-filters' })}
                        onReset={() => editor.resetBackgroundFilters()}
                    />
                )}
            </div>
        );
    } else if (selected.length > 1) {
        content = (
            <div className="fp-props-multi">
                <span className="fp-props-multi-count">已选 {selected.length} 个对象</span>
                <OpacitySlider editor={editor} objects={selected} />
                <AlignDistributeGroup editor={editor} selectedCount={selected.length} />
                <ArrangeGroups editor={editor} />
                <DeleteButton editor={editor} />
            </div>
        );
    } else {
        const object = selected[0];
        const locked = object.locked === true;
        let form: JSX.Element;
        switch (object.kind) {
            case 'shape':
                form = <ShapePanel editor={editor} object={object} locked={locked} />;
                break;
            case 'text':
                form = <TextPanel editor={editor} object={object} locked={locked} />;
                break;
            case 'path':
                form = <PathPanel editor={editor} object={object} locked={locked} />;
                break;
            case 'mosaic':
                form = <MosaicPanel editor={editor} object={object} />;
                break;
            case 'image':
                form = <ImagePanel editor={editor} object={object} />;
                break;
        }
        content = (
            <div className={`fp-props-object fp-props-object-${object.kind}`}>
                {locked && <LockedHint />}
                {form}
                <OpacitySlider editor={editor} objects={selected} />
                <ArrangeGroups editor={editor} />
            </div>
        );
    }

    const rootClassName = props.className === undefined ? 'fp-props-panel' : `fp-props-panel ${props.className}`;
    return (
        <div className={rootClassName}>
            {content}
        </div>
    );
}
