/**
 * Mosaic module - uses MosaicShape with addMosicRectWithUpdate
 * Provides mosaic effect using MosaicShape custom shape
 */
import type { Canvas, Object as FabricObject } from '../types/fabric.js';
import ModuleBase from './base.js';
import consts from '../consts.js';
import MosaicShape from '../shape/mosaic.js';

/**
 * Mosaic setting
 */
interface MosaicSetting {
    dimensions?: number;
}

/**
 * Mosaic rectangle item
 */
interface MosaicRectItem {
    left: number;
    top: number;
    fill: string;
    dimensions: number;
}

/**
 * Mosaic module - MosaicShape method
 */
export default class Mosaic extends ModuleBase {
    /**
     * Mosaic dimensions
     */
    _dimensions: number = 20;

    /**
     * Event listeners
     */
    _listeners: {
        mousedown: (e: FabricObject) => void;
        mousemove: (e: FabricObject) => void;
        mouseup: (e: FabricObject) => void;
    };

    /**
     * Mosaic shape instance
     */
    _mosaicShape: InstanceType<typeof MosaicShape> | null = null;

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
        const pointer = canvas.getPointer(fEvent.e);
        this._mosaicShape = new MosaicShape({
            mosaicRects: [],
            selectable: false,
            left: pointer.x,
            top: pointer.y,
            originX: 'center',
            originY: 'center'
        }) as InstanceType<typeof MosaicShape>;
        canvas.add(this._mosaicShape);
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
        const mosaicRect: MosaicRectItem = {
            left: pointer.x,
            top: pointer.y,
            fill: `rgb(${parseInt(String(rgba[0] / length))},${parseInt(String(rgba[1] / length))},${parseInt(
                String(rgba[2] / length)
            )})`,
            dimensions
        };
        (this._mosaicShape as unknown as { addMosicRectWithUpdate: (rect: MosaicRectItem) => void }).addMosicRectWithUpdate(mosaicRect);
        canvas.renderAll();
    }

    /**
     * Handle fabric mouse up event
     */
    _onFabricMouseUp(): void {
        const canvas = this.getCanvas();
        this._mosaicShape = null;
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
