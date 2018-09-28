import Base from './base.js';
import consts from '../consts';
import Cropzone from '../shape/cropzone';
import util from '../lib/util';

const MOUSE_MOVE_THRESHOLD = consts.MOUSE_MOVE_THRESHOLD;
const abs = Math.abs;
const clamp = util.clamp;
const keyCodes = consts.keyCodes;
const bind = util.bind;


export default class Cropper extends Base {
    constructor(parent) {
        super();

        this.setParent(parent);

        this.name = consts.moduleNames.CROPPER;

        this._cropzone = null;

        this._startX = null;

        this._startY = null;

        this._withShiftKey = false;

        this._listeners = {
            keydown: bind(this._onKeyDown, this),
            keyup: bind(this._onKeyUp, this),
            mousedown: bind(this._onFabricMouseDown, this),
            mousemove: bind(this._onFabricMouseMove, this),
            mouseup: bind(this._onFabricMouseUp, this)
        };
    }


    start() {
        if (this._cropzone) {
            return;
        }
        const canvas = this.getCanvas();
        canvas.forEachObject(obj => { // {@link http://fabricjs.com/docs/fabric.Object.html#evented}
            obj.evented = false;
        });
        let canvasCssWidth = parseInt(canvas.wrapperEl.style['width'], 10),
            canvasCssHeight = parseInt(canvas.wrapperEl.style['height'], 10),
            canvasWidth = canvas.upperCanvasEl.width;
        let radio = canvasCssWidth / canvasWidth;
        let marginLeft = canvasCssWidth * 0.1 / radio;
        let marginTop = canvasCssHeight * 0.1 / radio;
        let width = canvasCssWidth * 0.8 / radio;
        let height = canvasCssHeight * 0.8 / radio;

        this._cropzone = new Cropzone({
            left: marginLeft,
            top: marginTop,
            width: width,
            height: height,
            strokeWidth: 0, // {@link https://github.com/kangax/fabric.js/issues/2860}
            cornerStyle:'circle',
            cornerColor: '#FFFFFF',
            cornerStrokeColor:'#118BFB',
            cornerSize: 15,
            fill: 'transparent',
            hasRotatingPoint: false,
            hasBorders: false,
            lockScalingFlip: true,
            lockRotation: true
        });
        canvas.deactivateAll();
        canvas.add(this._cropzone);
        canvas.on('mouse:down', this._listeners.mousedown);
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        canvas.setActiveObject(this._cropzone);

        fabric.util.addListener(document, 'keydown', this._listeners.keydown);
        fabric.util.addListener(document, 'keyup', this._listeners.keyup);
    }

    /**
     * End cropping
     * @param {boolean} isApplying - Is applying or not
     * @returns {?{imageName: string, url: string}} cropped Image data
     */
    end(isApplying) {
        const canvas = this.getCanvas();
        const cropzone = this._cropzone;
        let data;
        canvas.off('mouse:down', this._listeners.mousedown);
        fabric.util.removeListener(document, 'keydown', this._listeners.keydown);
        fabric.util.removeListener(document, 'keyup', this._listeners.keyup);
        if (!cropzone) {
            return null;
        }
        cropzone.remove();
        canvas.selection = false;
        canvas.defaultCursor = 'default';
        canvas.forEachObject(obj => {
            obj.evented = true;
        });
        if (isApplying) {
            data = this._getCroppedImageData();
        }
        this._cropzone = null;



        return data;
    }


    _onFabricMouseDown(fEvent) {
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


    _onFabricMouseMove(fEvent) {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const x = pointer.x;
        const y = pointer.y;
        const cropzone = this._cropzone;

        if (abs(x - this._startX) + abs(y - this._startY) > MOUSE_MOVE_THRESHOLD) {
            cropzone.remove();
            cropzone.set(this._calcRectDimensionFromPoint(x, y));

            canvas.add(cropzone);
        }
    }

    /**
     * Get rect dimension setting from Canvas-Mouse-Position(x, y)
     * @param {number} x - Canvas-Mouse-Position x
     * @param {number} y - Canvas-Mouse-Position Y
     * @returns {{left: number, top: number, width: number, height: number}}
     * @private
     */
    _calcRectDimensionFromPoint(x, y) {
        const canvas = this.getCanvas();
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        const startX = this._startX;
        const startY = this._startY;
        let left = clamp(x, 0, startX);
        let top = clamp(y, 0, startY);
        let width = clamp(x, startX, canvasWidth) - left; // (startX <= x(mouse) <= canvasWidth) - left
        let height = clamp(y, startY, canvasHeight) - top; // (startY <= y(mouse) <= canvasHeight) - top

        if (this._withShiftKey) { // make fixed ratio cropzone
            if (width > height) {
                height = width;
            }
            else if (height > width) {
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


    _onFabricMouseUp() {
        const cropzone = this._cropzone;
        const listeners = this._listeners;
        const canvas = this.getCanvas();

        canvas.setActiveObject(cropzone);
        canvas.off({
            'mouse:move': listeners.mousemove,
            'mouse:up': listeners.mouseup
        });
    }


    _getCroppedImageData() {
        const cropzone = this._cropzone;

        if (!cropzone.isValid()) {
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


    _onKeyDown(e) {
        if (e.keyCode === keyCodes.SHIFT) {
            this._withShiftKey = true;
        }
    }

    _onKeyUp(e) {
        if (e.keyCode === keyCodes.SHIFT) {
            this._withShiftKey = false;
        }
    }
}
