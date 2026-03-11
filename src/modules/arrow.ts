/**
 * Arrow drawing module - uses Line, Triangle, and Circle
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject } from '../types/fabric';
import Base from './base';
import consts from '../consts';

/**
 * Arrow setting interface
 */
interface ArrowSetting {
    width?: number;
    color?: string;
    radius?: number;
    dimension?: {
        height: number;
        width: number;
    };
}

/**
 * Point interface for coordinates
 */
interface Point {
    x: number;
    y: number;
}

/**
 * Arrow listeners interface
 */
interface ArrowListeners {
    mousedown: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mousemove: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mouseup: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
}

export default class Arrow extends Base {
    /**
     * Arrow name
     */
    name: string = '';

    /**
     * Brush width
     */
    _width: number = 5;

    /**
     * Circle radius
     */
    _radius: number = 3;

    /**
     * Arrow dimension
     */
    _dimension: { height: number; width: number } = {
        height: 20,
        width: 20
    };

    /**
     * Arrow color
     */
    _oColor: fabric.Color = new fabric.Color('rgba(0, 0, 0, 0.5)');

    /**
     * Event listeners
     */
    _listeners: ArrowListeners = {
        mousedown: () => {},
        mousemove: () => {},
        mouseup: () => {}
    };

    /**
     * Start pointer for drawing
     */
    startPointer: Point = { x: 0, y: 0 };

    /**
     * Current group being drawn
     */
    group: fabric.Group | null = null;

    /**
     * Current line
     */
    line: fabric.Line | null = null;

    /**
     * Current arrow (triangle)
     */
    arrow: fabric.Triangle | null = null;

    /**
     * Current circle
     */
    circle: fabric.Circle | null = null;

    constructor(parent: Base | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.ARROW;
        this._width = 5;
        this._radius = 3;
        this._dimension = {
            height: 20,
            width: 20
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
     * @param setting - Brush width & color
     */
    start(setting?: ArrowSetting): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        canvas.forEachObject((obj: FabricObject) => {
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
     * @param setting - Brush width & color
     */
    setBrush(setting?: ArrowSetting): void {
        const brush = this.getCanvas().freeDrawingBrush;

        setting = setting || {};
        this._width = setting.width || this._width;
        this._radius = setting.radius || this._radius;
        this._dimension = Object.assign(this._dimension, setting.dimension);

        if (setting.color) {
            this._oColor = new fabric.Color(setting.color);
        }
        brush.width = this._width;
        brush.color = this._oColor.toRgba();
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
     * End drawing line mode
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
     * Mousedown event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseDown(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = (this.startPointer = canvas.getPointer(fEvent.e));
        let group = (this.group = new fabric.Group(
            [
                /*this.line, this.arrow, this.circle*/
            ],
            {
                left: pointer.x,
                top: pointer.y
            }
        ));
        this.group.set(consts.fObjectOptions.SELECTION_STYLE as unknown as Record<string, unknown>);
        (group as unknown as { customType: string }).customType = 'arrow';
        canvas.add(group);
        canvas.renderAll();
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Draw arrow with start and end points
     * @param startPointer - Start point
     * @param endPointer - End point
     */
    drawArrow(startPointer: Point, endPointer: Point): void {
        const points = [startPointer.x, startPointer.y, endPointer.x, endPointer.y];
        const line = (this.line = new fabric.Line(points, {
            stroke: this._oColor.toRgba(),
            strokeWidth: this._width,
            padding: 5,
            originX: 'center',
            originY: 'center'
        } as fabric.ILineOptions));

        const x1 = line.x1 || 0;
        const y1 = line.y1 || 0;
        const x2 = line.x2 || 0;
        const y2 = line.y2 || 0;

        let centerX = (x1 + x2) / 2,
            centerY = (y1 + y2) / 2;
        let deltaX = (line.left || 0) - centerX,
            deltaY = (line.top || 0) - centerY;

        const arrow = (this.arrow = new fabric.Triangle({
            left: x1 + deltaX,
            top: y1 + deltaY,
            originX: 'center',
            originY: 'center',
            angle:
                startPointer.x === endPointer.x && startPointer.y === endPointer.y
                    ? -45
                    : this.calcArrowAngle(
                          startPointer.x,
                          startPointer.y,
                          endPointer.x,
                          endPointer.y
                      ) - 90,
            width: this._dimension.width,
            height: this._dimension.height,
            fill: this._oColor.toRgba()
        } as fabric.ITriangleOptions));
        const circle = (this.circle = new fabric.Circle({
            left: x2 + deltaX,
            top: y2 + deltaY,
            radius: this._radius,
            stroke: this._oColor.toRgba(),
            strokeWidth: this._width,
            originX: 'center',
            originY: 'center',
            fill: this._oColor.toRgba()
        } as fabric.ICircleOptions));

        (line as unknown as { customType: string }).customType = 'arrow';
        (arrow as unknown as { customType: string }).customType = 'arrow';
        (circle as unknown as { customType: string }).customType = 'arrow';
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseMove(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const x = pointer.x;
        const y = pointer.y;
        if (Math.abs(x - this.startPointer.x) + Math.abs(y - this.startPointer.y) > 5) {
            this.group!.remove(this.line!, this.arrow!, this.circle!);
            this.drawArrow(pointer, this.startPointer);
            this.group!.addWithUpdate(this.arrow!);
            this.group!.addWithUpdate(this.line!);
            this.group!.addWithUpdate(this.circle!);
            canvas.renderAll();
        }
    }

    /**
     * Mouseup event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseUp(fEvent?: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();

        this.line = null;
        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Calculate arrow angle
     * @param x1 - Start X
     * @param y1 - Start Y
     * @param x2 - End X
     * @param y2 - End Y
     * @returns Angle in degrees
     */
    calcArrowAngle(x1: number, y1: number, x2: number, y2: number): number {
        let angle = 0,
            x,
            y;
        x = x2 - x1;
        y = y2 - y1;
        if (x === 0) {
            angle = y === 0 ? 0 : y > 0 ? Math.PI / 2 : (Math.PI * 3) / 2;
        } else if (y === 0) {
            angle = x > 0 ? 0 : Math.PI;
        } else {
            angle =
                x < 0
                    ? Math.atan(y / x) + Math.PI
                    : y < 0
                    ? Math.atan(y / x) + 2 * Math.PI
                    : Math.atan(y / x);
        }
        return (angle * 180) / Math.PI;
    }
}
