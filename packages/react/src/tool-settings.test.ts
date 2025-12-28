import { describe, expect, it, vi } from 'vitest';
import { Editor, type EditorMode } from '@gmi/fp-core';
import {
    DEFAULT_TOOL_SETTINGS,
    activateTool,
    modeToTool,
    type ToolId,
    type ToolSettings
} from './tool-settings';

describe('DEFAULT_TOOL_SETTINGS', () => {
    it('逐字段断言默认值', () => {
        expect(DEFAULT_TOOL_SETTINGS.freedraw).toEqual({ width: 4, color: '#ff0000' });
        expect(DEFAULT_TOOL_SETTINGS.line).toEqual({ width: 4, color: '#ff0000' });
        expect(DEFAULT_TOOL_SETTINGS.arrow).toEqual({ width: 4, color: '#ff0000' });
        expect(DEFAULT_TOOL_SETTINGS.shape).toEqual({
            shapeType: 'rect',
            fill: 'transparent',
            stroke: '#ff0000',
            strokeWidth: 4
        });
        expect(DEFAULT_TOOL_SETTINGS.text).toEqual({ fill: '#ff0000', fontSize: 50 });
        expect(DEFAULT_TOOL_SETTINGS.mosaic).toEqual({ dimensions: 8 });
    });
});

describe('modeToTool', () => {
    it.each<[EditorMode, ToolId]>([
        ['normal', 'select'],
        ['crop', 'crop'],
        ['freedraw', 'freedraw'],
        ['line', 'line'],
        ['arrow', 'arrow'],
        ['mosaic', 'mosaic'],
        ['text', 'text'],
        ['shape', 'shape'],
        ['pan', 'pan']
    ])('mode %s → tool %s', (mode, tool) => {
        expect(modeToTool(mode)).toBe(tool);
    });
});

describe('activateTool', () => {
    function setup() {
        const editor = new Editor();
        const settings: ToolSettings = {
            freedraw: { width: 7, color: '#00ff00' },
            line: { width: 3, color: '#0000ff' },
            arrow: { width: 5, color: '#ff00ff' },
            shape: { shapeType: 'circle', fill: '#123456', stroke: '#654321', strokeWidth: 2 },
            text: { fill: '#abcdef', fontSize: 24 },
            mosaic: { dimensions: 12 }
        };
        return { editor, settings };
    }

    it('select → editor.endAll()', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'endAll');
        activateTool(editor, 'select', settings);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('crop → editor.startCropping()', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startCropping');
        activateTool(editor, 'crop', settings);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('rotate → editor.rotate(90)（动作而非模式）', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'rotate');
        activateTool(editor, 'rotate', settings);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(90);
    });

    it('arrow → editor.startArrowDrawing(settings.arrow)', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startArrowDrawing');
        activateTool(editor, 'arrow', settings);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(settings.arrow);
    });

    it('freedraw → editor.startFreeDrawing(settings.freedraw)', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startFreeDrawing');
        activateTool(editor, 'freedraw', settings);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(settings.freedraw);
    });

    it('line → editor.startLineDrawing(settings.line)', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startLineDrawing');
        activateTool(editor, 'line', settings);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(settings.line);
    });

    it('shape → 先 setDrawingShape(shapeType, 样式) 后 startDrawingShapeMode()', () => {
        const { editor, settings } = setup();
        const setSpy = vi.spyOn(editor, 'setDrawingShape');
        const modeSpy = vi.spyOn(editor, 'startDrawingShapeMode');
        activateTool(editor, 'shape', settings);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith('circle', {
            fill: '#123456',
            stroke: '#654321',
            strokeWidth: 2
        });
        expect(modeSpy).toHaveBeenCalledTimes(1);
        expect(setSpy.mock.invocationCallOrder[0]).toBeLessThan(modeSpy.mock.invocationCallOrder[0]);
    });

    it('text → editor.startTextMode()', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startTextMode');
        activateTool(editor, 'text', settings);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('mosaic → editor.startMosaicDrawing(settings.mosaic)', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startMosaicDrawing');
        activateTool(editor, 'mosaic', settings);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(settings.mosaic);
    });

    it('pan → editor.startPan()', () => {
        const { editor, settings } = setup();
        const spy = vi.spyOn(editor, 'startPan');
        activateTool(editor, 'pan', settings);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
