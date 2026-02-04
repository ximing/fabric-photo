import type { JSX, ReactNode } from 'react';
import type { EditorMode, EditorObject, ShapeObject } from '@gmi/fp-core';
import { ColorPalette } from './color-palette';
import { useEditor, useEditorState, useToolSettings } from './hooks';
import { applyColor, modeToTool } from './tool-settings';

const WIDTH_OPTIONS = [2, 4, 8, 12] as const;
const MOSAIC_DIMENSIONS = [4, 8, 16] as const;
const SHAPE_TYPES: { type: ShapeObject['shapeType']; label: string }[] = [
    { type: 'rect', label: '矩形' },
    { type: 'circle', label: '圆形' },
    { type: 'triangle', label: '三角' }
];

/** 线宽选项适用的绘制 mode（与 ToolSettings 的键同名）。 */
type BrushMode = Extract<EditorMode, 'freedraw' | 'line' | 'arrow'>;

function isBrushMode(mode: EditorMode): mode is BrushMode {
    return mode === 'freedraw' || mode === 'line' || mode === 'arrow';
}

/**
 * 色板高亮值：选中优先——applyColor 是「选中优先」路由（core setMode 不清 selection，
 * brush/shape 模式下可存在残留选中），点色板改的是选中对象，故 value 必须取首个选中对象
 * 的主色且与该色板经 applyColor 实际作用的字段一致（shape→fill、text→fill、path→stroke）；
 * mosaic/image 无颜色字段（applyColor no-op），回退工具预设色。
 */
function paletteValue(objects: readonly EditorObject[], preset: string): string {
    const target = objects[0];
    if (target === undefined) {
        return preset;
    }
    switch (target.kind) {
        case 'shape':
            return target.fill;
        case 'text':
            return target.fill;
        case 'path':
            return target.stroke;
        default:
            return preset;
    }
}

/**
 * 浮动工具选项条：定位在画布区顶部居中（.fp-floating-options 绝对定位，由 styles.css 承载），
 * 仅 crop/brush/shape/mosaic 渲染内容，其余 mode（text/normal/pan）返回 null——不占布局、不留空壳。
 * crop → Apply/Cancel；freedraw/line/arrow → 线宽（写 toolSettings + setBrush 实时生效）+ 色板；
 * shape → 形状类型（写 toolSettings + setDrawingShape）+ 色板（描边色）；mosaic → 粒度
 * （仅写 toolSettings，不重启模式，下次 startMosaicDrawing 生效）。
 * 色板改色统一走 applyColor 路由（选中对象优先改对象，否则写工具预设并实时同步 editor）。
 */
export function FloatingOptions(props: { className?: string }): JSX.Element | null {
    const editor = useEditor();
    const { toolSettings, setToolSettings } = useToolSettings();
    const mode = useEditorState((state) => state.mode);
    const selection = useEditorState((state) => state.selection);
    const objects = useEditorState((state) => state.doc.objects);
    const selectedObjects = objects.filter((object) => selection.includes(object.id));

    const onColor = (color: string): void => {
        applyColor(editor, toolSettings, setToolSettings, modeToTool(mode), selectedObjects, color);
    };

    let content: ReactNode = null;
    if (mode === 'crop') {
        content = (
            <>
                <button type="button" className="fp-option-btn" onClick={() => editor.endCropping(true)}>
                    Apply
                </button>
                <button type="button" className="fp-option-btn" onClick={() => editor.endCropping(false)}>
                    Cancel
                </button>
            </>
        );
    } else if (isBrushMode(mode)) {
        const brushMode = mode;
        const setWidth = (width: number): void => {
            setToolSettings((prev) => ({ ...prev, [brushMode]: { ...prev[brushMode], width } }));
            editor.setBrush({ width });
        };
        content = (
            <>
                {WIDTH_OPTIONS.map((width) => {
                    const isActive = toolSettings[brushMode].width === width;
                    return (
                        <button
                            key={width}
                            type="button"
                            className={isActive ? 'fp-option-btn fp-option-btn-active' : 'fp-option-btn'}
                            aria-pressed={isActive}
                            onClick={() => setWidth(width)}
                        >
                            {width}
                        </button>
                    );
                })}
                <ColorPalette value={paletteValue(selectedObjects, toolSettings[brushMode].color)} onChange={onColor} />
            </>
        );
    } else if (mode === 'shape') {
        const setShapeType = (shapeType: ShapeObject['shapeType']): void => {
            setToolSettings((prev) => ({ ...prev, shape: { ...prev.shape, shapeType } }));
            editor.setDrawingShape(shapeType);
        };
        content = (
            <>
                {SHAPE_TYPES.map(({ type, label }) => {
                    const isActive = toolSettings.shape.shapeType === type;
                    return (
                        <button
                            key={type}
                            type="button"
                            className={isActive ? 'fp-option-btn fp-option-btn-active' : 'fp-option-btn'}
                            aria-pressed={isActive}
                            onClick={() => setShapeType(type)}
                        >
                            {label}
                        </button>
                    );
                })}
                <ColorPalette value={paletteValue(selectedObjects, toolSettings.shape.stroke)} onChange={onColor} />
            </>
        );
    } else if (mode === 'mosaic') {
        // 不允许重启模式：dimensions 只在下次 startMosaicDrawing 生效
        const setDimensions = (dimensions: number): void => {
            setToolSettings((prev) => ({ ...prev, mosaic: { dimensions } }));
        };
        content = (
            <span className="fp-option-group" title="粒度在下次进入马赛克模式时生效">
                {MOSAIC_DIMENSIONS.map((dimensions) => {
                    const isActive = toolSettings.mosaic.dimensions === dimensions;
                    return (
                        <button
                            key={dimensions}
                            type="button"
                            className={isActive ? 'fp-option-btn fp-option-btn-active' : 'fp-option-btn'}
                            aria-pressed={isActive}
                            onClick={() => setDimensions(dimensions)}
                        >
                            {dimensions}
                        </button>
                    );
                })}
            </span>
        );
    }

    if (content === null) {
        return null;
    }
    const rootClassName =
        props.className === undefined ? 'fp-floating-options' : `fp-floating-options ${props.className}`;
    return <div className={rootClassName}>{content}</div>;
}
