import Base from './base';
import consts from '../consts';
import $ from 'jquery';

export default class Pan extends Base {
    constructor(parent) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.PAN;
        this._listeners = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this)
        };
    }

    start() {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'move';
        canvas.selection = false;

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

    /**
     * Mousedown event handler in fabric canvas
     * @param {{target: fabric.Object, e: MouseEvent}} fEvent - Fabric event object
     * @private
     */
    _onFabricMouseDown(fEvent) {
        const canvas = this.getCanvas();
        this.pointer = canvas.getPointer(fEvent.e);
        this.$lower = $(canvas.lowerCanvasEl);
        this.$upper = $(canvas.upperCanvasEl);
        this.$wrapper = $(canvas.wrapperEl);
        this.deltaX = parseInt(this.$lower.css('left'), 10);
        this.deltaY = parseInt(this.$lower.css('top'), 10);
        this.deltaWidth = this.$upper.width() - this.$wrapper.width();
        this.deltaHeight = this.$upper.height() - this.$wrapper.height();
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param {{target: fabric.Object, e: MouseEvent}} fEvent - Fabric event object
     * @private
     */
    _onFabricMouseMove(fEvent) {
        // go out of use because of transform opver
        // var delta = new fabric.Point(fEvent.e.movementX, fEvent.e.movementY);
        // canvas.relativePan(delta);

        //safari9 not work for movement event
        // let deltaX = this.deltaX + fEvent.e.movementX;
        // let deltaY = this.deltaY + fEvent.e.movementY;
        const canvas = this.getCanvas();
        const movePointer = canvas.getPointer(fEvent.e);

        let deltaX = this.deltaX + movePointer.x-this.pointer.x;
        let deltaY = this.deltaY + movePointer.y - this.pointer.y;

        if (this.deltaWidth > Math.abs(deltaX) && deltaX < 0) {
            this.$lower.css('left', deltaX);
            this.$upper.css('left', deltaX);
            this.deltaX = deltaX;
        }
        if (this.deltaHeight > Math.abs(deltaY) && deltaY < 0) {
            this.$lower.css('top', deltaY);
            this.$upper.css('top', deltaY);
            this.deltaY = deltaY;
        }
    }

    /**
     * Mouseup event handler in fabric canvas
     * @param {{target: fabric.Object, e: MouseEvent}} fEvent - Fabric event object
     * @private
     */
    _onFabricMouseUp() {
        const canvas = this.getCanvas();
        this.pointer = null;
        this.$lower = null;
        this.$upper = null;
        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }
}
