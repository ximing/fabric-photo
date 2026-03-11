/**
 * Free drawing module
 * Provides free drawing mode on canvas
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject } from '../types/fabric';
import ModuleBase from './base';
import consts from '../consts';

/**
 * Brush settings for free drawing
 */
interface BrushSettings {
    width?: number;
    color?: string;
}

export default class FreeDrawing extends ModuleBase {
    /**
     * Brush width
     */
    width: number = 12;

    /**
     * Brush color
     */
    oColor: fabric.Color = new fabric.Color('rgba(0, 0, 0, 0.5)');

    /**
     * Creates a free drawing module instance
     * @param parent - Parent module
     */
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.FREE_DRAWING;
        this.width = 12;
        this.oColor = new fabric.Color('rgba(0, 0, 0, 0.5)');
    }

    /**
     * Start free drawing mode
     * @param setting - Brush width & color
     */
    start(setting?: BrushSettings): void {
        const canvas = this.getCanvas();
        canvas.isDrawingMode = true;
        this.setBrush(setting);
    }

    /**
     * Set brush
     * @param setting - Brush width & color
     */
    setBrush(setting?: BrushSettings): void {
        const canvas = this.getCanvas();
        const brush = canvas.freeDrawingBrush;
        const actualSetting = setting || {};
        this.width = actualSetting.width || this.width;
        if (actualSetting.color) {
            this.oColor = new fabric.Color(actualSetting.color);
        }
        brush.width = this.width;
        brush.color = this.oColor.toRgba();
    }

    /**
     * Set obj style
     * @param activeObj - Current selected text object
     * @param styleObj - Initial styles
     */
    setStyle(activeObj: FabricObject, styleObj: Record<string, unknown>): void {
        activeObj.set(styleObj);
        this.getCanvas().renderAll();
    }

    /**
     * End free drawing mode
     */
    end(): void {
        const canvas = this.getCanvas();
        canvas.isDrawingMode = false;
    }
}
