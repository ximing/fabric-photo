/**
 * Mosaic module - uses canvas overlay method
 * Provides mosaic effect by overlaying cloned canvas
 */
import type { Canvas, Object as FabricObject } from '../types/fabric';
import ModuleBase from './base';
import consts from '../consts';
import MosaicShape from '../shape/mosaic';

/**
 * Mosaic rectangle item
 */
interface MosaicRect {
    left: number;
    top: number;
    fill: string;
    dimensions: number;
}

/**
 * Mosaic setting
 */
interface MosaicSetting {
    dimensions?: number;
}

/**
 * Mosaic module - canvas overlay method
 */
export default class Mosaic extends ModuleBase {
    /**
     * Mosaic dimensions
     */
    _dimensions: number = 8;

    /**
     * Event listeners
     */
    _listeners: {
        mousedown: (e: FabricObject) => void;
        mousemove: (e: FabricObject) => void;
        mouseup: (e: FabricObject) => void;
    };

    /**
     * Mosaic layer element
     */
    mosaicLayer: HTMLCanvasElement | null = null;

    /**
     * Mosaic rectangles array
     */
    mosaicArr: MosaicRect[] = [];

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
        this._dimensions = parseInt(String(setting.dimensions), 10) || this._dimensions;

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
     */
    _onFabricMouseDown(): void {
        const canvas = this.getCanvas();
        const lowerCanvas = canvas.getElement() as HTMLCanvasElement;
        const mosaicLayer = (this.mosaicLayer = lowerCanvas.cloneNode(true) as HTMLCanvasElement);
        mosaicLayer.classList.remove('lower-canvas');
        mosaicLayer.classList.add('mosaic-canvas');
        this.mosaicArr = [];
        lowerCanvas.insertAdjacentElement('afterend', mosaicLayer);
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
            parseInt(String(pointer.x), 10),
            parseInt(String(pointer.y), 10),
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
        const mosaicRect: MosaicRect = {
            left: pointer.x,
            top: pointer.y,
            fill: `rgb(${Number.parseInt(String(rgba[0] / length), 10)},${Number.parseInt(
                String(rgba[1] / length),
                10
            )},${Number.parseInt(String(rgba[2] / length), 10)})`,
            dimensions
        };
        this.mosaicArr.push(mosaicRect);
        const ctx = this.mosaicLayer!.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = mosaicRect.fill;
        ctx.fillRect(mosaicRect.left, mosaicRect.top, mosaicRect.dimensions, mosaicRect.dimensions);
    }

    /**
     * Handle fabric mouse up event
     */
    _onFabricMouseUp(): void {
        const canvas = this.getCanvas();
        if (this.mosaicArr && this.mosaicArr.length > 0) {
            const __mosaicShape = new MosaicShape({
                mosaicRects: this.mosaicArr,
                selectable: false,
                left: 0,
                top: 0,
                originX: 'center',
                originY: 'center'
            });
            canvas.add(__mosaicShape);
            canvas.renderAll();
        }
        if (this.mosaicLayer) {
            this.mosaicLayer.parentNode!.removeChild(this.mosaicLayer);
        }
        this.mosaicArr = [];
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
