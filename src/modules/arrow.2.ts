/**
 * Arrow drawing module - uses Path for arrow shape
 */
import { fabric } from 'fabric';
import type { Object as FabricObject } from '../types/fabric.js';
import Base from './base.js';
import consts from '../consts.js';

const abs = Math.abs;
const arrowPath =
    'M3.9603906,29.711582 C3.94156309,29.8708042 3.79272845,29.9999998 3.63155855,29.9999998 C3.482237,30.0001621 3.33535003,29.8737257 3.31603561,29.7117443 L2.24238114,5.11020599 C2.2384858,5.02109998 2.16642191,4.9706228 2.08072432,4.99789021 L0.0900407177,5.63039686 C0.00466773962,5.65750197 -0.0253588782,5.61871082 0.0233329345,5.5427516 L3.54894478,0.0568073759 C3.59747429,-0.0186649336 3.6757058,-0.0191518517 3.72455992,0.0566450699 L7.24725025,5.54047931 C7.29577976,5.61595162 7.26624006,5.65539199 7.18070478,5.62812457 L5.19034578,4.99691638 C5.10513511,4.96981127 5.03290892,5.01899 5.02901358,5.10923216 L3.9603906,29.711582 Z';

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
     * Current arrow path
     */
    arrow: fabric.Path | null = null;

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
        if (fEvent.target && (fEvent.target as unknown as { customType: string }).customType === 'arrow') {
            canvas.trigger('object:selected', { target: fEvent.target });
            return;
        }
        this.startPointer = canvas.getPointer(fEvent.e);
        let arrow = (this.arrow = new fabric.Path(arrowPath));
        this.arrow.set(consts.fObjectOptions.SELECTION_STYLE as unknown as Record<string, unknown>);
        this.arrow.set({
            left: this.startPointer.x,
            top: this.startPointer.y
        });
        (this.arrow as unknown as { originX: string }).originX = 'center';
        (this.arrow as unknown as { originY: string }).originY = 'bottom';
        (arrow as unknown as { customType: string }).customType = 'arrow';
        canvas.add(arrow);
        canvas.renderAll();
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Calculate angle between two points
     * @param x1 - Start X
     * @param y1 - Start Y
     * @param x2 - End X
     * @param y2 - End Y
     * @returns Angle in degrees
     */
    getAngle(x1: number, y1: number, x2: number, y2: number): number {
        let x = Math.abs(x1 - x2),
            y = Math.abs(y1 - y2),
            z = Math.sqrt(x * x + y * y),
            rotat = Math.round((Math.asin(y / z) / Math.PI) * 180);
        // First quadrant
        if (x2 >= x1 && y2 <= y1) {
            rotat = 90 - rotat;
        }
        // Second quadrant
        else if (x2 <= x1 && y2 <= y1) {
            rotat = rotat - 90;
        }
        // Third quadrant
        else if (x2 <= x1 && y2 >= y1) {
            rotat = 270 - rotat;
        }
        // Fourth quadrant
        else if (x2 >= x1 && y2 >= y1) {
            rotat = 90 + rotat;
        }
        return rotat;
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseMove(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const sx = this.startPointer.x;
        const sy = this.startPointer.y;
        const x = pointer.x;
        const y = pointer.y;
        if (abs(x - sx) + abs(y - sy) > 5) {
            const arrowObj = this.arrow as unknown as { originX: string; originY: string };
            if (x === sx && y > sy) {
                arrowObj.originX = 'center';
                arrowObj.originY = 'bottom';
            } else if (x < sx && y > sy) {
                arrowObj.originX = 'right';
                arrowObj.originY = 'bottom';
            } else if (x < sx && y === sy) {
                arrowObj.originX = 'right';
                arrowObj.originY = 'bottom';
            } else if (x < sx && y < sy) {
                arrowObj.originX = 'right';
                arrowObj.originY = 'top';
            } else if (x === sx && y === sy) {
                arrowObj.originX = 'center';
                arrowObj.originY = 'center';
            } else if (x > sx && y < sy) {
                arrowObj.originX = 'left';
                arrowObj.originY = 'top';
            } else if (x > sx && y === sy) {
                arrowObj.originX = 'center';
                arrowObj.originY = 'left';
            } else if (x > sx && y > sy) {
                arrowObj.originX = 'left';
                arrowObj.originY = 'bottom';
            } else if (x === sx && y < sy) {
                arrowObj.originX = 'center';
                arrowObj.originY = 'top';
            }
            let scale = Math.max(
                (abs(x - this.startPointer.x) / 8) * this.getRoot().getZoom(),
                (abs(y - this.startPointer.y) / 30) * this.getRoot().getZoom()
            );
            this.arrow!.scale(scale);
            let angle = this.getAngle(this.startPointer.x, this.startPointer.y, x, y);
            this.arrow!.setAngle(angle);
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

        this.arrow = null;

        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }
}
