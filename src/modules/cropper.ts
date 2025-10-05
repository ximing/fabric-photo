/**
 * Cropper module
 * Provides cropping functionality on canvas
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject } from '../types/fabric.js';
import ModuleBase from './base.js';
import consts from '../consts';
import Cropzone from '../shape/cropzone.js';
import util from '../lib/util.js';

const { MOUSE_MOVE_THRESHOLD } = consts;
const { clamp } = util;
const { keyCodes } = consts;

interface CropListeners {
    keydown: (e: KeyboardEvent) => void;
    keyup: (e: KeyboardEvent) => void;
    mousedown: (fEvent: { target: FabricObject | null; e: MouseEvent }) => void;
    mousemove: (fEvent: { e: MouseEvent }) => void;
    mouseup: (fEvent: { e: MouseEvent }) => void;
}

interface CroppedImageData {
    imageName: string;
    url: string;
}

export default class Cropper extends ModuleBase {
    private _cropzone: InstanceType<typeof Cropzone> | null = null;

    private _startX: number | null = null;

    private _startY: number | null = null;

    private _withShiftKey: boolean = false;

    private _listeners: CropListeners = {
        keydown: this._onKeyDown.bind(this),
        keyup: this._onKeyUp.bind(this),
        mousedown: this._onFabricMouseDown.bind(this),
        mousemove: this._onFabricMouseMove.bind(this),
        mouseup: this._onFabricMouseUp.bind(this)
    };

    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.CROPPER;
    }

    start(): void {
        if (this._cropzone) {
            return;
        }
        const canvas = this.getCanvas();
        canvas.forEachObject((obj: FabricObject) => {
            obj.evented = false;
        });
        let canvasCssWidth = parseInt(canvas.wrapperEl.style['width'] as string, 10);
        let canvasCssHeight = parseInt(canvas.wrapperEl.style['height'] as string, 10);
        let canvasWidth = canvas.upperCanvasEl.width;
        let radio = canvasCssWidth / canvasWidth;
        let marginLeft = (canvasCssWidth * 0.1) / radio;
        let marginTop = (canvasCssHeight * 0.1) / radio;
        let width = (canvasCssWidth * 0.8) / radio;
        let height = (canvasCssHeight * 0.8) / radio;

        this._cropzone = new Cropzone({
            left: marginLeft,
            top: marginTop,
            width,
            height,
            strokeWidth: 0,
            cornerStyle: 'circle',
            cornerColor: '#FFFFFF',
            cornerStrokeColor: '#118BFB',
            cornerSize: 15,
            fill: 'transparent',
            hasRotatingPoint: false,
            hasBorders: false,
            lockScalingFlip: true,
            lockRotation: true
        } as any);
        canvas.deactivateAll();
        canvas.add(this._cropzone);
        canvas.on('mouse:down', this._listeners.mousedown);
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        canvas.setActiveObject(this._cropzone);

        fabric.util.addListener(document as unknown as HTMLElement, 'keydown', this._listeners.keydown);
        fabric.util.addListener(document as unknown as HTMLElement, 'keyup', this._listeners.keyup);
    }

    /**
     * End cropping
     * @param isApplying - Is applying or not
     * @returns cropped Image data
     */
    end(isApplying: boolean): CroppedImageData | null {
        const canvas = this.getCanvas();
        const cropzone = this._cropzone;
        let data: CroppedImageData | null = null;
        canvas.off('mouse:down', this._listeners.mousedown);
        fabric.util.removeListener(document as unknown as HTMLElement, 'keydown', this._listeners.keydown);
        fabric.util.removeListener(document as unknown as HTMLElement, 'keyup', this._listeners.keyup);
        if (!cropzone) {
            return null;
        }
        cropzone.remove();
        canvas.selection = false;
        canvas.defaultCursor = 'default';
        canvas.forEachObject((obj: FabricObject) => {
            obj.evented = true;
        });
        if (isApplying) {
            data = this._getCroppedImageData();
        }
        this._cropzone = null;

        return data;
    }

    _onFabricMouseDown(fEvent: { target: FabricObject | null; e: MouseEvent }): void {
        const canvas = this.getCanvas();

        if (fEvent.target) {
            return;
        }

        canvas.selection = false;
        const coord = canvas.getPointer(fEvent.e);

        this._startX = coord.x;
        this._startY = coord.y;

        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    _onFabricMouseMove(fEvent: { e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const x = pointer.x;
        const y = pointer.y;
        const cropzone = this._cropzone;

        if (!cropzone) {
            return;
        }

        if (Math.abs(x - (this._startX ?? 0)) + Math.abs(y - (this._startY ?? 0)) > MOUSE_MOVE_THRESHOLD) {
            cropzone.remove();
            cropzone.set(this._calcRectDimensionFromPoint(x, y) as any);

            canvas.add(cropzone);
        }
    }

    /**
     * Get rect dimension setting from Canvas-Mouse-Position(x, y)
     * @param x - Canvas-Mouse-Position x
     * @param y - Canvas-Mouse-Position Y
     * @returns Rect dimension
     * @private
     */
    _calcRectDimensionFromPoint(x: number, y: number): { left: number; top: number; width: number; height: number } {
        const canvas = this.getCanvas();
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        const startX = this._startX ?? 0;
        const startY = this._startY ?? 0;
        let left = clamp(x, 0, startX);
        let top = clamp(y, 0, startY);
        let width = clamp(x, startX, canvasWidth) - left;
        let height = clamp(y, startY, canvasHeight) - top;

        if (this._withShiftKey) {
            if (width > height) {
                height = width;
            } else if (height > width) {
                width = height;
            }

            if (startX >= x) {
                left = startX - width;
            }

            if (startY >= y) {
                top = startY - height;
            }
        }

        return {
            left,
            top,
            width,
            height
        };
    }

    _onFabricMouseUp(): void {
        const cropzone = this._cropzone;
        const listeners = this._listeners;
        const canvas = this.getCanvas();

        if (!cropzone) {
            return;
        }

        canvas.setActiveObject(cropzone);
        canvas.off({
            'mouse:move': listeners.mousemove,
            'mouse:up': listeners.mouseup
        });
    }

    _getCroppedImageData(): CroppedImageData | null {
        const cropzone = this._cropzone;

        if (!cropzone || !cropzone.isValid()) {
            return null;
        }

        const cropInfo = {
            left: cropzone.getLeft(),
            top: cropzone.getTop(),
            width: cropzone.getWidth(),
            height: cropzone.getHeight()
        };

        return {
            imageName: this.getImageName(),
            url: this.getCanvas().toDataURL(cropInfo)
        };
    }

    _onKeyDown(e: KeyboardEvent): void {
        if (e.keyCode === keyCodes.SHIFT) {
            this._withShiftKey = true;
        }
    }

    _onKeyUp(e: KeyboardEvent): void {
        if (e.keyCode === keyCodes.SHIFT) {
            this._withShiftKey = false;
        }
    }
}
