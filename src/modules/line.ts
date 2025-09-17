/**
 * Line drawing module
 * Provides straight line drawing mode on canvas
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject, Line as FabricLine } from '../types/fabric.js';
import ModuleBase from './base.js';
import consts from '../consts';

/**
 * Brush settings for line drawing
 */
interface BrushSettings {
    width?: number;
    color?: string;
}

/**
 * Event listeners for line drawing
 */
interface LineListeners {
    mousedown: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mousemove: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mouseup: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
}

export default class Line extends ModuleBase {
    /**
     * Brush width
     */
    _width: number = 12;

    /**
     * Brush color
     */
    _oColor: fabric.Color = new fabric.Color('rgba(0, 0, 0, 0.5)');

    /**
     * Event listeners
     */
    _listeners: LineListeners;

    /**
     * Currently drawing line
     */
    _line: FabricLine | null = null;

    /**
     * Creates a line drawing module instance
     * @param parent - Parent module
     */
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.LINE;
        this._width = 12;
        this._oColor = new fabric.Color('rgba(0, 0, 0, 0.5)');

        this._listeners = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this)
        };
    }

    /**
     * Start drawing line mode
     * @param setting - Brush width & color
     */
    start(setting?: BrushSettings): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        this.setBrush(setting);

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
     * Set brush
     * @param setting - Brush width & color
     */
    setBrush(setting?: BrushSettings): void {
        const canvas = this.getCanvas();
        const brush = canvas.freeDrawingBrush;

        const actualSetting = setting || {};
        this._width = actualSetting.width || this._width;

        if (actualSetting.color) {
            this._oColor = new fabric.Color(actualSetting.color);
        }
        brush.width = this._width;
        brush.color = this._oColor.toRgba();
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
     */
    _onFabricMouseDown(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const points = [pointer.x, pointer.y, pointer.x, pointer.y];

        this._line = new fabric.Line(points, {
            stroke: this._oColor.toRgba(),
            strokeWidth: this._width,
            evented: false
        } as fabric.ILineOptions);

        this._line.set(consts.fObjectOptions.SELECTION_STYLE);

        canvas.add(this._line);

        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param fEvent - Fabric event object
     */
    _onFabricMouseMove(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);

        if (this._line) {
            this._line.set({
                x2: pointer.x,
                y2: pointer.y
            });

            this._line.setCoords();

            canvas.renderAll();
        }
    }

    /**
     * Mouseup event handler in fabric canvas
     * @param _fEvent - Fabric event object
     */
    _onFabricMouseUp(_fEvent?: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();

        this._line = null;

        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }
}
