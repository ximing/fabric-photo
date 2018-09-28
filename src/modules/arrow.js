import Base from './base';
import consts from '../consts';
// import util from '../lib/util';

const abs = Math.abs;
// const resetStyles = {
//     fill: '#000000',
//     width: 5
// };
export default class Arrow extends Base {
    constructor(parent) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.ARROW;
        this._width = 5;
        this._radius = 3;
        this._dimension = {
            height:20,
            width:20
        };
        this._oColor = new fabric.Color('rgba(0, 0, 0, 0.5)');
        this._listeners = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this)
        };
    }

    /**
     * Start drawing arrow mode
     * @param {{width: ?number, color: ?string,radius:?number,dimension:?object} [setting] - Brush width & color
     */
    start(setting) {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        canvas.forEachObject(obj => {
            obj.set({
                evented: false
            });
        });
        this.setBrush(setting);
        canvas.on({
            'mouse:down': this._listeners.mousedown
        });

    }

    /**
     * Set brush
     * @param {{width: ?number, color: ?string,radius:?number,dimension:?object} [setting] - Brush width & color
     */
    setBrush(setting) {
        const brush = this.getCanvas().freeDrawingBrush;

        setting = setting || {};
        this._width = setting.width || this._width;
        this._radius = setting.radius || this._radius;
        this._dimension = Object.assign(this._dimension,setting.dimension);

        if (setting.color) {
            this._oColor = new fabric.Color(setting.color);
        }
        brush.width = this._width;
        brush.color = this._oColor.toRgba();
    }

    /**
     * Set obj style
     * @param {object} activeObj - Current selected text object
     * @param {object} styleObj - Initial styles
     */
    setStyle(activeObj,styleObj) {
        activeObj.set(styleObj);
        this.getCanvas().renderAll();
    }

    /**
     * End drawing line mode
     */
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
        // if(fEvent.target && fEvent.target.customType === 'arrow') {
        //     canvas.trigger('object:selected', {target: fEvent.target});
        //     return;
        // }
        const pointer = this.startPointer = canvas.getPointer(fEvent.e);
        //this.drawArrow(pointer,pointer);
        let group = this.group = new fabric.Group([/*this.line, this.arrow, this.circle*/], {
            left: pointer.x,
            top: pointer.y
            // originX: 'center',
            // originY: 'center',
            // selection:true,
            // transparentCorners: true,
            //  hasControls :true,
            //  hasBorders :true
        });
        this.group.set(consts.fObjectOptions.SELECTION_STYLE);
        // this.group.set('selectable', true);
        group.customType = 'arrow';
        canvas.add(group);
        canvas.renderAll();
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    drawArrow(startPointer,endPointer) {
        const points = [startPointer.x, startPointer.y, endPointer.x, endPointer.y];
        const line = this.line = new fabric.Line(points, {
            stroke: this._oColor.toRgba(),
            strokeWidth: this._width,
            padding: 5,
            originX: 'center',
            originY: 'center'
        });

        let centerX = (line.x1 + line.x2) / 2,
            centerY = (line.y1 + line.y2) / 2;
        let deltaX = line.left - centerX,
            deltaY = line.top - centerY;

        const arrow = this.arrow = new fabric.Triangle({
            left: line.get('x1') + deltaX,
            top: line.get('y1') + deltaY,
            originX: 'center',
            originY: 'center',
            pointType: 'arrow_start',
            angle: startPointer.x === endPointer.x && startPointer.y === endPointer.y ? -45 :
            this.calcArrowAngle(startPointer.x, startPointer.y, endPointer.x, endPointer.y) - 90,
            width: this._dimension.width,
            height: this._dimension.height,
            fill: this._oColor.toRgba()
        });
        const circle = this.circle = new fabric.Circle({
            left: line.get('x2') + deltaX,
            top: line.get('y2') + deltaY,
            radius: this._radius,
            stroke: this._oColor.toRgba(),
            strokeWidth: this._width,
            originX: 'center',
            originY: 'center',
            pointType: 'arrow_end',
            fill: this._oColor.toRgba()
        });
        line.customType = arrow.customType = circle.customType = 'arrow';
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param {{target: fabric.Object, e: MouseEvent}} fEvent - Fabric event object
     * @private
     */
    _onFabricMouseMove(fEvent) {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const x = pointer.x;
        const y = pointer.y;
        if (abs(x - this.startPointer.x) + abs(y - this.startPointer.y) > 5) {
            this.group.remove(this.line,this.arrow,this.circle);
            this.drawArrow(pointer,this.startPointer);
            this.group.addWithUpdate(this.arrow);
            this.group.addWithUpdate(this.line);
            this.group.addWithUpdate(this.circle);
            canvas.renderAll();
        }
    }

    /**
     * Mouseup event handler in fabric canvas
     * @param {{target: fabric.Object, e: MouseEvent}} fEvent - Fabric event object
     * @private
     */
    _onFabricMouseUp() {
        const canvas = this.getCanvas();

        this.line = null;
        // canvas.setActiveObject(this.group);

        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }


    calcArrowAngle(x1, y1, x2, y2) {
        var angle = 0,
            x, y;
        x = (x2 - x1);
        y = (y2 - y1);
        if (x === 0) {
            angle = (y === 0) ? 0 : (y > 0) ? Math.PI / 2 : Math.PI * 3 / 2;
        }
        else if (y === 0) {
            angle = (x > 0) ? 0 : Math.PI;
        }
        else {
            angle = (x < 0) ? Math.atan(y / x) + Math.PI : (y < 0) ? Math.atan(y / x) + (2 * Math.PI) : Math.atan(y / x);
        }
        return (angle * 180 / Math.PI);
    }
}
