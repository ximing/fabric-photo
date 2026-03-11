/**
 * Shape drawing module
 * Provides shape drawing mode on canvas (rect, circle, triangle)
 */
import { fabric } from 'fabric';
import type { Canvas, Object as FabricObject } from '../types/fabric';
import ModuleBase from './base';
import consts from '../consts';
import util from '../lib/util';

import resizeHelper from '../lib/shape-resize-helper';

const { inArray, extend } = util;

const KEY_CODES = consts.keyCodes;
const DEFAULT_TYPE = 'rect';

/**
 * Default shape options
 */
const DEFAULT_OPTIONS = {
    strokeWidth: 1,
    stroke: '#000000',
    fill: '#ffffff',
    width: 1,
    height: 1,
    rx: 0,
    ry: 0,
    lockSkewingX: true,
    lockSkewingY: true,
    lockUniScaling: false,
    bringForward: true,
    isRegular: false
};

/**
 * Shape types
 */
const shapeType = ['rect', 'circle', 'triangle'];

/**
 * Shape options
 */
interface ShapeOptions {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    width?: number;
    height?: number;
    rx?: number;
    ry?: number;
    isRegular?: boolean;
    [key: string]: unknown;
}

/**
 * Event handlers for shape drawing
 */
interface ShapeHandlers {
    mousedown: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mousemove: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mouseup: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    keydown: (e: KeyboardEvent) => void;
    keyup: (e: KeyboardEvent) => void;
}

/**
 * Point interface
 */
interface Point {
    x: number;
    y: number;
}

export default class Shape extends ModuleBase {
    /**
     * Current shape object
     */
    _shapeObj: FabricObject | null = null;

    /**
     * Current shape type
     */
    _type: string = DEFAULT_TYPE;

    /**
     * Options to draw the shape
     */
    _options: Record<string, unknown> = { ...DEFAULT_OPTIONS };

    /**
     * Whether the shape object is selected or not
     */
    _isSelected: boolean = false;

    /**
     * Pointer for drawing shape (x, y)
     */
    _startPoint: Point = { x: 0, y: 0 };

    /**
     * Using shortcut on drawing shape
     */
    _withShiftKey: boolean = false;

    /**
     * Event handlers
     */
    _handlers: ShapeHandlers;

    /**
     * Creates a shape drawing module instance
     * @param parent - Parent module
     */
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.SHAPE;
        this._shapeObj = null;

        this._type = DEFAULT_TYPE;

        /**
         * Options to draw the shape
         */
        this._options = { ...DEFAULT_OPTIONS };

        /**
         * Whether the shape object is selected or not
         */
        this._isSelected = false;

        /**
         * Pointer for drawing shape (x, y)
         */
        this._startPoint = { x: 0, y: 0 };

        /**
         * Using shortcut on drawing shape
         */
        this._withShiftKey = false;

        this._handlers = {
            mousedown: this._onFabricMouseDown.bind(this),
            mousemove: this._onFabricMouseMove.bind(this),
            mouseup: this._onFabricMouseUp.bind(this),
            keydown: this._onKeyDown.bind(this),
            keyup: this._onKeyUp.bind(this)
        };
    }

    /**
     * Start to draw the shape on canvas
     */
    startDrawingMode(): void {
        const canvas = this.getCanvas();

        this._isSelected = false;

        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        canvas.uniScaleTransform = true;
        canvas.on({
            'mouse:down': this._handlers.mousedown
        });

        fabric.util.addListener(document as unknown as HTMLElement, 'keydown', this._handlers.keydown);
        fabric.util.addListener(document as unknown as HTMLElement, 'keyup', this._handlers.keyup);
    }

    /**
     * End to draw the shape on canvas
     */
    endDrawingMode(): void {
        const canvas = this.getCanvas();

        this._isSelected = false;

        canvas.defaultCursor = 'default';
        canvas.selection = false;
        canvas.uniScaleTransform = false;
        canvas.off({
            'mouse:down': this._handlers.mousedown
        });

        fabric.util.removeListener(document as unknown as HTMLElement, 'keydown', this._handlers.keydown);
        fabric.util.removeListener(document as unknown as HTMLElement, 'keyup', this._handlers.keyup);
    }

    /**
     * Set states of the current drawing shape
     * @param type - Shape type (ex: 'rect', 'circle')
     * @param options - Shape options
     */
    setStates(type: string, options?: ShapeOptions): void {
        this._type = type;

        if (options) {
            this._options = { ...this._options, ...options };
        }
    }

    /**
     * Add the shape
     * @param type - Shape type (ex: 'rect', 'circle')
     * @param options - Shape options
     */
    add(type: string, options?: ShapeOptions): void {
        const canvas = this.getCanvas();
        const resolvedOptions = this._createOptions(options);
        const shapeObj = this._createInstance(type, resolvedOptions);

        this._bindEventOnShape(shapeObj);

        canvas.add(shapeObj);
    }

    /**
     * Change the shape
     * @param shapeObj - Selected shape object on canvas
     * @param options - Shape options
     */
    change(shapeObj: FabricObject, options: ShapeOptions): void {
        if (!inArray(shapeObj.get('type'), shapeType)) {
            return;
        }

        shapeObj.set(options);
        this.getCanvas().renderAll();
    }

    /**
     * Create the instance of shape
     * @param type - Shape type
     * @param options - Options to create the shape
     * @returns Shape instance
     */
    _createInstance(type: string, options: Record<string, unknown>): FabricObject {
        let instance: FabricObject;

        switch (type) {
            case 'rect':
                instance = new fabric.Rect(options as fabric.IRectOptions);
                break;
            case 'circle':
                instance = new fabric.Ellipse(
                    extend(
                        {
                            type: 'circle'
                        },
                        options
                    ) as Record<string, unknown>
                );
                break;
            case 'triangle':
                instance = new fabric.Triangle(options as fabric.ITriangleOptions);
                break;
            default:
                instance = {} as FabricObject;
        }

        return instance;
    }

    /**
     * Get the options to create the shape
     * @param options - Options to create the shape
     * @returns Shape options
     */
    _createOptions(options?: ShapeOptions): Record<string, unknown> {
        const selectionStyles = consts.fObjectOptions.SELECTION_STYLE;

        const resolvedOptions = { ...DEFAULT_OPTIONS, ...selectionStyles, ...options };

        if (resolvedOptions.isRegular) {
            (resolvedOptions as Record<string, unknown>).lockUniScaling = true;
        }

        return resolvedOptions as Record<string, unknown>;
    }

    /**
     * Bind fabric events on the creating shape object
     * @param shapeObj - Shape object
     */
    _bindEventOnShape(shapeObj: FabricObject): void {
        const self = this;
        const canvas = this.getCanvas();

        shapeObj.on({
            added() {
                self._shapeObj = this as FabricObject;
                resizeHelper.setOrigins(self._shapeObj);
            },
            selected() {
                self._isSelected = true;
                self._shapeObj = this as FabricObject;
                canvas.uniScaleTransform = true;
                canvas.defaultCursor = 'default';
                resizeHelper.setOrigins(self._shapeObj);
            },
            deselected() {
                self._isSelected = false;
                self._shapeObj = null;
                canvas.defaultCursor = 'crosshair';
                canvas.uniScaleTransform = false;
            },
            modified() {
                const currentObj = self._shapeObj;
                if (currentObj) {
                    resizeHelper.adjustOriginToCenter(currentObj);
                    resizeHelper.setOrigins(currentObj);
                }
            },
            scaling(fEvent: { e: MouseEvent }) {
                const pointer = canvas.getPointer(fEvent.e);
                const currentObj = self._shapeObj;

                if (currentObj) {
                    canvas.setCursor('crosshair');
                    resizeHelper.resize(currentObj, pointer, true);
                }
            }
        });
    }

    /**
     * MouseDown event handler on canvas
     * @param fEvent - Fabric event object
     */
    _onFabricMouseDown(fEvent: { target: FabricObject; e: MouseEvent }): void {
        if (!this._isSelected && !this._shapeObj) {
            const canvas = this.getCanvas();
            this._startPoint = canvas.getPointer(fEvent.e) as Point;

            canvas.on({
                'mouse:move': this._handlers.mousemove,
                'mouse:up': this._handlers.mouseup
            });
        }
    }

    /**
     * MouseMove event handler on canvas
     * @param fEvent - Fabric event object
     */
    _onFabricMouseMove(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const pointer = canvas.getPointer(fEvent.e);
        const startPointX = this._startPoint.x;
        const startPointY = this._startPoint.y;
        const width = startPointX - pointer.x;
        const height = startPointY - pointer.y;
        const shape = this._shapeObj;

        if (!shape) {
            this.add(this._type, {
                left: startPointX,
                top: startPointY,
                width,
                height
            });
        } else {
            this._shapeObj.set({
                isRegular: this._withShiftKey
            });
            resizeHelper.resize(this._shapeObj, pointer, false);
            canvas.renderAll();
        }
    }

    /**
     * MouseUp event handler on canvas
     */
    _onFabricMouseUp(): void {
        const canvas = this.getCanvas();
        const shape = this._shapeObj;

        if (shape) {
            resizeHelper.adjustOriginToCenter(shape);
        }

        this._shapeObj = null;

        canvas.off({
            'mouse:move': this._handlers.mousemove,
            'mouse:up': this._handlers.mouseup
        });
    }

    /**
     * Keydown event handler on document
     * @param e - Event object
     */
    _onKeyDown(e: KeyboardEvent): void {
        if (e.keyCode === KEY_CODES.SHIFT) {
            this._withShiftKey = true;

            if (this._shapeObj) {
                this._shapeObj.isRegular = true;
            }
        }
    }

    /**
     * Keyup event handler on document
     * @param e - Event object
     */
    _onKeyUp(e: KeyboardEvent): void {
        if (e.keyCode === KEY_CODES.SHIFT) {
            this._withShiftKey = false;

            if (this._shapeObj) {
                this._shapeObj.isRegular = false;
            }
        }
    }
}
