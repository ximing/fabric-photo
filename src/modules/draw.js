import { fabric } from 'fabric';
import Base from './base.js';
import consts from '../consts';

export default class FreeDrawing extends Base {
    constructor(parent) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.FREE_DRAWING;
        this.width = 12;
        this.oColor = new fabric.Color('rgba(0, 0, 0, 0.5)');
    }

    /**
     * Start free drawing mode
     * @param {{width: ?number, color: ?string}} [setting] - Brush width & color
     */
    start(setting) {
        const canvas = this.getCanvas();
        canvas.isDrawingMode = true;
        this.setBrush(setting);
    }

    /**
     * Set brush
     * @param {{width: ?number, color: ?string}} [setting] - Brush width & color
     */
    setBrush(setting) {
        let brush = this.getCanvas().freeDrawingBrush;
        setting = setting || {};
        this.width = setting.width || this.width;
        if (setting.color) {
            this.oColor = new fabric.Color(setting.color);
        }
        brush.width = this.width;
        brush.color = this.oColor.toRgba();
    }

    /**
     * Set obj style
     * @param {object} activeObj - Current selected text object
     * @param {object} styleObj - Initial styles
     */
    setStyle(activeObj, styleObj) {
        activeObj.set(styleObj);
        this.getCanvas().renderAll();
    }

    /**
     * End free drawing mode
     */
    end() {
        const canvas = this.getCanvas();
        canvas.isDrawingMode = false;
    }
}
