import type { Editor, EditorMode } from '@gmi/fp-core';

export type ToolId = 'select' | 'crop' | 'rotate' | 'arrow' | 'freedraw' | 'line' | 'shape' | 'text' | 'mosaic' | 'pan';

/**
 * React 层持有的工具设置（core 不存这份 state；drawing 类工具激活时把对应样式
 * 透传给 editor 的 start* API，shape 额外走 setDrawingShape 预设）。
 */
export interface ToolSettings {
    freedraw: { width: number; color: string };
    line: { width: number; color: string };
    arrow: { width: number; color: string };
    shape: { shapeType: 'rect' | 'circle' | 'triangle'; fill: string; stroke: string; strokeWidth: number };
    text: { fill: string; fontSize: number };
    mosaic: { dimensions: number };
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
    freedraw: { width: 4, color: '#ff0000' },
    line: { width: 4, color: '#ff0000' },
    arrow: { width: 4, color: '#ff0000' },
    shape: { shapeType: 'rect', fill: 'transparent', stroke: '#ff0000', strokeWidth: 4 },
    text: { fill: '#ff0000', fontSize: 50 },
    mosaic: { dimensions: 8 }
};

/** core 的 mode → 工具栏 ToolId 映射（rotate 是动作不是 mode，不在此表）。 */
export function modeToTool(mode: EditorMode): ToolId {
    switch (mode) {
        case 'normal':
            return 'select';
        case 'crop':
            return 'crop';
        case 'freedraw':
            return 'freedraw';
        case 'line':
            return 'line';
        case 'arrow':
            return 'arrow';
        case 'mosaic':
            return 'mosaic';
        case 'text':
            return 'text';
        case 'shape':
            return 'shape';
        case 'pan':
            return 'pan';
    }
}

/** 激活工具：drawing 类工具把 settings 中对应样式透传给 editor；shape 先预设样式再切模式。 */
export function activateTool(editor: Editor, tool: ToolId, settings: ToolSettings): void {
    switch (tool) {
        case 'select':
            editor.endAll();
            break;
        case 'crop':
            editor.startCropping();
            break;
        case 'rotate':
            // 旋转是动作（rotate 90°），不是模式
            editor.rotate(90);
            break;
        case 'arrow':
            editor.startArrowDrawing(settings.arrow);
            break;
        case 'freedraw':
            editor.startFreeDrawing(settings.freedraw);
            break;
        case 'line':
            editor.startLineDrawing(settings.line);
            break;
        case 'shape': {
            const { shapeType, ...style } = settings.shape;
            editor.setDrawingShape(shapeType, style);
            editor.startDrawingShapeMode();
            break;
        }
        case 'text':
            editor.startTextMode();
            break;
        case 'mosaic':
            editor.startMosaicDrawing(settings.mosaic);
            break;
        case 'pan':
            editor.startPan();
            break;
    }
}
