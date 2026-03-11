/**
 * Mosaic module - uses individual rects method
 * Provides mosaic effect by adding individual rectangles to canvas
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject, Group, Rect } from '../types/fabric.js';
import ModuleBase from './base.js';
import consts from '../consts.js';

/**
 * Mosaic setting
 */
interface MosaicSetting {
    dimensions?: number;
}

/**
 * Mosaic module - individual rects method
 */
export default class Mosaic extends ModuleBase {
    /**
     * Mosaic dimensions
     */
    _dimensions: number = 16;

    /**
     * Event listeners
     */
    _listeners: {
        mousedown: (e: FabricObject) => void;
        mousemove: (e: FabricObject) => void;
        mouseup: (e: FabricObject) => void;
    };

    /**
     * Mosaic group
     */
    _mosaicGroup: Group | null = null;

    /**
     * Pointer position
     */
    pointer: { x: number; y: number } | null = null;

    /**
     * Creates a mosaic module instance
     * @param parent - Parent module
     */
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);

        this.name = consts.moduleNames.MOSAIC;

        this._listeners = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this)
        };
    }

    /**
     * Start mosaic mode
     * @param setting - Mosaic settings
     */
    start(setting?: MosaicSetting): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        setting = setting || {};
        this._dimensions = parseInt(String(setting.dimensions)) || this._dimensions;

        canvas.forEachObject((obj: FabricObject) => {
            obj.set({
                evented: false
            });
        });

        canvas.on({
            'mouse:down': this._listeners.mousedown
        });
    }

    /**
     * End mosaic mode
     */
    end(): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'default';
        canvas.selection = false;

        canvas.forEachObject((obj: FabricObject) => {
            obj.set({
                evented: true
            });
        });

        canvas.off('mouse:down', this._listeners.mousedown);
    }

    /**
     * Handle fabric mouse down event
     * @param fEvent - Fabric event
     */
    _onFabricMouseDown(fEvent: FabricObject): void {
        const canvas = this.getCanvas();
        const pointer = (this.pointer = canvas.getPointer(fEvent.e));
        this._mosaicGroup = new fabric.Group([], {
            left: pointer.x,
            top: pointer.y,
            originX: 'center',
            originY: 'center'
        });
        canvas.add(this._mosaicGroup);
        this._mosaicGroup.set('selectable', false);
        canvas.renderAll();
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Handle fabric mouse move event
     * @param fEvent - Fabric event
     */
    _onFabricMouseMove(fEvent: FabricObject): void {
        let ratio = this.getCanvasRatio();
        ratio = Math.ceil(ratio);
        const dimensions = this._dimensions * ratio;
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const imageData = canvas.contextContainer.getImageData(
            parseInt(String(pointer.x)),
            parseInt(String(pointer.y)),
            dimensions,
            dimensions
        );
        const rgba = [0, 0, 0, 0];
        const length = imageData.data.length / 4;
        for (let i = 0; i < length; i++) {
            rgba[0] += imageData.data[i * 4];
            rgba[1] += imageData.data[i * 4 + 1];
            rgba[2] += imageData.data[i * 4 + 2];
            rgba[3] += imageData.data[i * 4 + 3];
        }
        const mosaicRect = new fabric.Rect({
            fill: `rgb(${parseInt(String(rgba[0] / length))},${parseInt(String(rgba[1] / length))},${parseInt(
                String(rgba[2] / length)
            )})`,
            height: dimensions,
            width: dimensions,
            left: pointer.x,
            top: pointer.y
        });
        canvas.add(mosaicRect);
        canvas.renderAll();
    }

    /**
     * Handle fabric mouse up event
     */
    _onFabricMouseUp(): void {
        const canvas = this.getCanvas();
        this._mosaicGroup = null;
        this.pointer = null;
        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Get ratio value of canvas
     * @returns Ratio value
     */
    getCanvasRatio(): number {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;
        return ratio;
    }
}
