import Base from './base.js';
import consts from '../consts';

export default class Mosaic extends Base {
    constructor(parent) {
        super();
        this.setParent(parent);

        this.name = consts.moduleNames.MOSAIC;

        this._dimensions = 16;

        this._listeners = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this)
        };
    }

    /**
     * @param {{dimensions: ?number}} [setting] - Mosaic width
     */
    start(setting) {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        setting = setting || {};
        this._dimensions = parseInt(setting.dimensions) || this._dimensions;

        canvas.forEachObject(obj => {
            obj.set({
                evented: false
            });
        });

        canvas.on({
            'mouse:down': this._listeners.mousedown
        });
    }

    end() {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'default';
        canvas.selection = false;

        canvas.forEachObject(obj => {
            obj.set({
                evented: true
            });
        });

        canvas.off('mouse:down', this._listeners.mousedown);
    }

    _onFabricMouseDown(fEvent) {
        const canvas = this.getCanvas();
        const pointer = this.pointer = canvas.getPointer(fEvent.e);
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
    _onFabricMouseMove(fEvent) {
        let ratio = this.getCanvasRatio();
        ratio = Math.ceil(ratio);
        let dimensions = this._dimensions * ratio;
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        let imageData = canvas.contextContainer.getImageData(parseInt(pointer.x), parseInt(pointer.y), dimensions, dimensions);
        // let imageData = canvas.getContext().getImageData(parseInt(pointer.x), parseInt(pointer.y), this._dimensions, this._dimensions);
        let rgba = [0, 0, 0, 0];
        let length = imageData.data.length / 4;
        for (let i = 0; i < length; i++) {
            rgba[0] += imageData.data[i * 4];
            rgba[1] += imageData.data[i * 4 + 1];
            rgba[2] += imageData.data[i * 4 + 2];
            rgba[3] += imageData.data[i * 4 + 3];
        }
        let mosaicRect = new fabric.Rect({
            fill: `rgb(${parseInt(rgba[0] / length)},${parseInt(rgba[1] / length)},${parseInt(rgba[2] / length)})`,
            height: dimensions,
            width: dimensions,
            left: pointer.x,
            top: pointer.y
        });
        //this._mosaicGroup.addWithUpdate(mosaicRect);
        canvas.add(mosaicRect);
        canvas.renderAll();
    }

    _onFabricMouseUp() {
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
     * @returns {number} Ratio value
     */
    getCanvasRatio() {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;
        return ratio;
    }
}
