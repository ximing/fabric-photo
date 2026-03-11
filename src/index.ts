/**
 * FabricPhoto - Main entry point for the image editor
 */
import type { Canvas, Object as FabricObject, Image as FabricImage, Group } from './types/fabric';
import { fabric } from 'fabric';

type FabricPoint = { x: number; y: number };

import Module from './module';
import commandFactory from './command';
import consts from './consts';
import util from './lib/util';
import CustomEvents from './lib/custom-event';

const events = consts.eventNames;
const modules = consts.moduleNames;
const commands = consts.commandNames;
const { states, keyCodes, fObjectOptions } = consts;
const { isUndefined, forEach, hasStamp } = util;

let DomURL = window.URL || window.webkitURL || window;

/**
 * FabricPhoto constructor options
 */
interface FabricPhotoOptions {
    cssMaxWidth?: number;
    cssMaxHeight?: number;
    selectionStyle?: Record<string, unknown>;
}

/**
 * Handlers map for event binding
 */
interface Handlers {
    keydown: (e: KeyboardEvent) => void;
    mousedown: (fEvent: { e: MouseEvent }) => void;
    addedObject: (fEvent: { target: FabricObject }) => void;
    removedObject: (fEvent: { target: FabricObject }) => void;
    selectedObject: (fEvent: { target: FabricObject }) => void;
    movingObject: (fEvent: { target: FabricObject }) => void;
    scalingObject: (fEvent: { target: FabricObject }) => void;
    createdPath: (obj: { path: FabricObject }) => void;
}

/**
 * Main FabricPhoto class
 */
class FabricPhoto {
    private _module: Module;

    private _canvas: Canvas | null;

    private _state: string;

    private _handlers: Handlers;

    constructor(element: string | HTMLElement | null, option: FabricPhotoOptions = {}) {
        this._module = new Module();
        this._canvas = null;
        this._state = states.NORMAL;
        this._handlers = {
            keydown: this._onKeyDown.bind(this),
            mousedown: this._onMouseDown.bind(this),
            addedObject: this._onAddedObject.bind(this),
            removedObject: this._onRemovedObject.bind(this),
            selectedObject: this._onSelectedObject.bind(this),
            movingObject: this._onMovingObject.bind(this),
            scalingObject: this._onScalingObject.bind(this),
            createdPath: this._onCreatedPath.bind(this)
        };

        this._setCanvas(element, option.cssMaxWidth, option.cssMaxHeight);
        this._attachModuleEvents();
        this._attachCanvasEvents();
        this._attachDomEvents();

        if (option.selectionStyle) {
            this._setSelectionStyle(option.selectionStyle);
        }
    }

    _setSelectionStyle(styles: Record<string, unknown>) {
        Object.assign(fObjectOptions.SELECTION_STYLE, styles);
    }

    _attachModuleEvents() {
        const { PUSH_UNDO_STACK, PUSH_REDO_STACK, EMPTY_UNDO_STACK, EMPTY_REDO_STACK } = events;

        /**
         * @event fabricPhoto#pushUndoStack
         */
        this._module.on(PUSH_UNDO_STACK, this.fire.bind(this, PUSH_UNDO_STACK));
        /**
         * @event fabricPhoto#pushRedoStack
         */
        this._module.on(PUSH_REDO_STACK, this.fire.bind(this, PUSH_REDO_STACK));
        /**
         * @event fabricPhoto#emptyUndoStack
         */
        this._module.on(EMPTY_UNDO_STACK, this.fire.bind(this, EMPTY_UNDO_STACK));
        /**
         * @event fabricPhoto#emptyRedoStack
         */
        this._module.on(EMPTY_REDO_STACK, this.fire.bind(this, EMPTY_REDO_STACK));
    }

    _attachCanvasEvents() {
        if (!this._canvas) return;

        this._canvas.on({
            'mouse:down': this._handlers.mousedown,
            'object:added': this._handlers.addedObject,
            'object:removed': this._handlers.removedObject,
            'object:moving': this._handlers.movingObject,
            'object:scaling': this._handlers.scalingObject,
            'object:selected': this._handlers.selectedObject,
            'path:created': this._handlers.createdPath
        });
    }

    _attachDomEvents() {
        fabric.util.addListener(document.documentElement, 'keydown', this._handlers.keydown);
    }

    _detachDomEvents() {
        fabric.util.removeListener(document.documentElement, 'keydown', this._handlers.keydown);
    }

    _onKeyDown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.keyCode === keyCodes.Z) {
            this.undo();
        }

        if ((e.ctrlKey || e.metaKey) && e.keyCode === keyCodes.Y) {
            this.redo();
        }

        if (
            (e.keyCode === keyCodes.BACKSPACE || e.keyCode === keyCodes.DEL) &&
            this._canvas &&
            this._canvas.getActiveObject()
        ) {
            e.preventDefault();
            this.removeActiveObject();
        }
    }

    _onMouseDown(fEvent: { e: MouseEvent }) {
        if (!this._canvas) return;

        const originPointer = this._canvas.getPointer(fEvent.e);

        this.fire(events.MOUSE_DOWN, {
            e: fEvent.e,
            originPointer
        });
    }

    /**
     * "object:added" canvas event handler
     * @param fEvent - Fabric event
     * @private
     */
    _onAddedObject(fEvent: { target: FabricObject }) {
        const obj = fEvent.target;

        if (!obj) return;

        if (obj.isType('cropzone') || obj.isType('text')) {
            return;
        }

        if (!hasStamp(obj)) {
            const command = commandFactory.create(commands.ADD_OBJECT, obj);
            this._module.pushUndoStack(command);
            this._module.clearRedoStack();
        }
        /**
         * @event fabricPhoto#addObject
         * @param {fabric.Object} obj - http://fabricjs.com/docs/fabric.Object.html
         * @example
         * fabricPhoto.on('addObject', function(obj) {
         *     console.log(obj);
         * });
         */
        this.fire(events.ADD_OBJECT, obj);
    }

    /**
     * "object:removed" canvas event handler
     * @param fEvent - Fabric event
     * @private
     */
    _onRemovedObject(fEvent: { target: FabricObject }) {
        /**
         * @event fabricPhoto#removeObject
         * @param {fabric.Object} obj - http://fabricjs.com/docs/fabric.Object.html
         * @example
         * fabricPhoto.on('removeObject', function(obj) {
         *     console.log(obj);
         * });
         */
        this.fire(events.REMOVE_OBJECT, fEvent.target);
    }

    /**
     * "object:selected" canvas event handler
     * @param fEvent - Fabric event
     * @private
     */
    _onSelectedObject(fEvent: { target: FabricObject }) {
        /**
         * @event fabricPhoto#selectObject
         * @param {fabric.Object} obj - http://fabricjs.com/docs/fabric.Object.html
         * @example
         * fabricPhoto.on('selectObject', function(obj) {
         *     console.log(obj);
         *     console.log(obj.type);
         * });
         */
        this.fire(events.SELECT_OBJECT, fEvent.target);
    }

    /**
     * "object:moving" canvas event handler
     * @param fEvent - Fabric event
     * @private
     */
    _onMovingObject(fEvent: { target: FabricObject }) {
        /**
         * @event fabricPhoto#adjustObject
         * @param {fabric.Object} obj - http://fabricjs.com/docs/fabric.Object.html
         * @param {string} Action type (move / scale)
         * @example
         * fabricPhoto.on('adjustObject', function(obj, type) {
         *     console.log(obj);
         *     console.log(type);
         * });
         */
        this.fire(events.ADJUST_OBJECT, fEvent.target, 'move');
    }

    /**
     * "object:scaling" canvas event handler
     * @param fEvent - Fabric event
     * @private
     */
    _onScalingObject(fEvent: { target: FabricObject }) {
        /**
         * @ignore
         * @event fabricPhoto#adjustObject
         * @param {fabric.Object} obj - http://fabricjs.com/docs/fabric.Object.html
         * @param {string} Action type (move / scale)
         * @example
         * fabricPhoto.on('adjustObject', function(obj, type) {
         *     console.log(obj);
         *     console.log(type);
         * });
         */
        this.fire(events.ADJUST_OBJECT, fEvent.target, 'scale');
    }

    /**
     * EventListener - "path:created"
     *  - Events:: "object:added" -> "path:created"
     * @param obj - Path object
     * @private
     */
    _onCreatedPath(obj: { path: FabricObject }) {
        if (obj.path) {
            obj.path.customType = 'freedraw';
            obj.path.set(consts.fObjectOptions.SELECTION_STYLE);
        }
    }

    /**
     * onSelectClear handler in fabric canvas
     * @param fEvent - Fabric event
     * @private
     */
    _onFabricSelectClear(fEvent: { target: FabricObject | null }) {
        const textComp = this._getModule(modules.TEXT) as unknown as { isPrevEditing: boolean; getSelectedObj: () => FabricObject; setSelectedInfo: (obj: FabricObject | null, selected: boolean) => void };

        if (!textComp) return;

        const obj = textComp.getSelectedObj();

        textComp.isPrevEditing = true;

        textComp.setSelectedInfo(fEvent.target as FabricObject, false);

        if (obj.text === '') {
            obj.remove();
        } else if (!hasStamp(obj)) {
            const command = commandFactory.create(commands.ADD_OBJECT, obj);
            this._module.pushUndoStack(command);
            this._module.clearRedoStack();
        }
    }

    /**
     * onSelect handler in fabric canvas
     * @param fEvent - Fabric event
     * @private
     */
    _onFabricSelect(fEvent: { target: FabricObject | null }) {
        const textComp = this._getModule(modules.TEXT) as unknown as { isPrevEditing: boolean; getSelectedObj: () => FabricObject; setSelectedInfo: (obj: FabricObject | null, selected: boolean) => void; isSelected: () => boolean };

        if (!textComp) return;

        const obj = textComp.getSelectedObj();

        textComp.isPrevEditing = true;

        if (obj.text === '') {
            obj.remove();
        } else if (!hasStamp(obj) && textComp.isSelected()) {
            const command = commandFactory.create(commands.ADD_OBJECT, obj);
            this._module.pushUndoStack(command);
            this._module.clearRedoStack();
        }

        textComp.setSelectedInfo(fEvent.target as FabricObject, true);
    }

    /**
     * Set canvas element
     * @param element - Wrapper or canvas element or selector
     * @param cssMaxWidth - Canvas css max width
     * @param cssMaxHeight - Canvas css max height
     * @private
     */
    _setCanvas(element: string | HTMLElement | null, cssMaxWidth?: number, cssMaxHeight?: number) {
        const mainModule = this._getMainModule();
        mainModule.setCanvasElement(element);
        mainModule.setCssMaxDimension({
            width: cssMaxWidth,
            height: cssMaxHeight
        });
        this._canvas = mainModule.getCanvas();
    }

    /**
     * Returns main module
     * @returns Main module
     * @private
     */
    _getMainModule() {
        return this._getModule(modules.MAIN) as unknown as {
            setCanvasElement: (element: string | HTMLElement | null) => void;
            setCssMaxDimension: (dimension: { width?: number; height?: number }) => void;
            getCanvas: () => Canvas;
            toDataURL: (type?: string) => string;
            toBlob: (type?: string) => Blob | false;
            getImageName: () => string;
            adjustCanvasDimension: () => void;
            getViewPortInfo: () => { width: number; height: number };
            getViewPortImage: () => FabricImage;
            getZoom: () => number;
            setZoom: (zoom: number) => void;
            getCanvasElement: () => HTMLCanvasElement;
            getCanvasImage: () => FabricImage;
            getCenter: () => { left: number; top: number };
        };
    }

    /**
     * Get module
     * @param name - Module name
     * @returns Module
     * @private
     */
    _getModule(name: string): { getName(): string } | undefined {
        return this._module.getModule(name);
    }

    getCurrentState() {
        return this._state;
    }

    /**
     * Clear all objects
     * @example
     * fabricPhoto.clearObjects();
     */
    clearObjects() {
        const command = commandFactory.create(commands.CLEAR_OBJECTS);
        const callback = this.fire.bind(this, events.CLEAR_OBJECTS);

        /**
         * @event fabricPhoto#clearObjects
         */
        (command as { setExecuteCallback: (cb: () => void) => typeof command }).setExecuteCallback(callback);
        this.execute(command as unknown as { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void });
    }

    /**
     * Check whether the image is edited
     * @example
     * fabricPhoto.isEditor();
     */
    isEdited() {
        return this._canvas ? this._canvas.getObjects().length > 0 : false;
    }

    /**
     * End current action & Deactivate
     * @example
     * fabricPhoto.startFreeDrawing();
     * fabricPhoto.endAll(); // === fabricPhoto.endFreeDrawing();
     *
     * fabricPhoto.startCropping();
     * fabricPhoto.endAll(); // === fabricPhoto.endCropping();
     */
    endAll() {
        this.endCropping();
        this.endTextMode();
        this.endFreeDrawing();
        this.endLineDrawing();
        this.endArrowDrawing();
        this.endMosaicDrawing();
        this.endDrawingShapeMode();
        this.endCropByBoundInfo();
        this.endPan();
        this.deactivateAll();
        this._state = states.NORMAL;
    }

    /**
     * Deactivate all objects
     * @example
     * fabricPhoto.deactivateAll();
     */
    deactivateAll() {
        if (this._canvas) {
            this._canvas.deactivateAll();
            this._canvas.renderAll();
        }
    }

    /**
     * Invoke command
     * @param command - Command
     * @ignore
     */
    execute(command: { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void }) {
        this.endAll();
        this._module.invoke(command);
    }

    /**
     * Undo
     * @example
     * fabricPhoto.undo();
     */
    undo() {
        this.endAll();
        this._module.undo();
    }

    /**
     * Redo
     * @example
     * fabricPhoto.redo();
     */
    redo() {
        this.endAll();
        this._module.redo();
    }

    /**
     * Load image from file
     * @param imgFile - Image file
     * @param imageName - imageName
     * @example
     * fabricPhoto.loadImageFromFile(file);
     */
    loadImageFromFile(imgFile: File, imageName?: string) {
        if (!imgFile) {
            return;
        }

        this.loadImageFromURL(DomURL.createObjectURL(imgFile), imageName || imgFile.name);
    }

    /**
     * Load image from url
     * @param url - File url
     * @param imageName - imageName
     * @example
     * fabricPhoto.loadImageFromURL('http://url/testImage.png', 'lena')
     */
    loadImageFromURL(url: string, imageName: string) {
        if (!imageName || !url) {
            return;
        }

        const callback = this._callbackAfterImageLoading.bind(this);
        const command = commandFactory.create(commands.LOAD_IMAGE, imageName, url);
        command.setExecuteCallback = (command as { setExecuteCallback?: (cb: () => void) => typeof command }).setExecuteCallback?.bind(command);
        command.setUndoCallback = (command as { setUndoCallback?: (cb: (obj: unknown) => void) => typeof command }).setUndoCallback?.bind(command);

        (command as { setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (oImage: FabricImage) => void) => void }).setExecuteCallback?.(() => callback);
        (command as { setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (oImage: FabricImage) => void) => void }).setUndoCallback?.((oImage: FabricImage) => {
            if (oImage) {
                callback(oImage);
            } else {
                this.fire(events.CLEAR_IMAGE);
            }
        });
        this.execute(command as unknown as { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void });
    }

    /**
     * Callback after image loading
     * @param oImage - Image instance
     * @private
     */
    _callbackAfterImageLoading(oImage: FabricImage) {
        const mainModule = this._getMainModule();
        const canvasElement = mainModule.getCanvasElement();
        const { width, height } = canvasElement.getBoundingClientRect();

        /**
         * @event fabricPhoto#loadImage
         * @param {object} dimension
         *  @param {number} dimension.originalWidth - original image width
         *  @param {number} dimension.originalHeight - original image height
         *  @param {number} dimension.currentWidth - current width (css)
         *  @param {number} dimension.current - current height (css)
         * @example
         * fabricPhoto.on('loadImage', function(dimension) {
         *     console.log(dimension.originalWidth);
         *     console.log(dimension.originalHeight);
         *     console.log(dimension.currentWidth);
         *     console.log(dimension.currentHeight);
         * });
         */

        this.fire(events.LOAD_IMAGE, {
            originalWidth: oImage.width,
            originalHeight: oImage.height,
            currentWidth: width,
            currentHeight: height
        });
    }

    /**
     * Add image object on canvas
     * @param imgUrl - Image url to make object
     * @example
     * fabricPhoto.addImageObject('path/fileName.jpg');
     */
    addImageObject(imgUrl: string) {
        if (!imgUrl) {
            return;
        }

        fabric.Image.fromURL(imgUrl, this._callbackAfterLoadingImageObject.bind(this), {
            crossOrigin: 'Anonymous'
        });
    }

    /**
     * Callback function after loading image
     * @param obj - Fabric image object
     * @private
     */
    _callbackAfterLoadingImageObject(obj: FabricImage) {
        const mainModule = this._getMainModule();
        const canvasImage = mainModule.getCanvasImage();
        const centerPos = canvasImage.getCenterPoint();

        obj.set(consts.fObjectOptions.SELECTION_STYLE);
        obj.set({
            left: centerPos.x,
            top: centerPos.y,
            crossOrigin: 'anonymous'
        });

        this._canvas?.add(obj).setActiveObject(obj);
    }

    /**
     * Start cropping
     * @example
     * fabricPhoto.startCropping();
     */
    startCropping() {
        if (this.getCurrentState() === states.CROP) {
            return;
        }

        this.endAll();
        this._state = states.CROP;
        const cropper = this._getModule(modules.CROPPER) as unknown as { start: () => void };
        cropper?.start();
        this.fire(events.START_CROPPING);
    }

    /**
     * Apply cropping
     * @param isApplying - Whether the cropping is applied or canceled
     * @example
     * fabricPhoto.startCropping();
     * fabricPhoto.endCropping(false); // cancel cropping
     *
     * fabricPhoto.startCropping();
     * fabricPhoto.endCropping(true); // apply cropping
     */
    endCropping(isApplying = true) {
        if (this.getCurrentState() !== states.CROP) {
            return;
        }

        const cropper = this._getModule(modules.CROPPER) as unknown as { end: (isApplying: boolean) => { url: string; imageName: string } | null };
        this._state = states.NORMAL;
        const data = cropper?.end(isApplying);

        this.once('loadImage', () => {
            this.fire(events.END_CROPPING);
        });

        if (data) {
            this.loadImageFromURL(data.url, data.imageName);
        }
    }

    /**
     * start cropping
     */
    startCropByBoundInfo() {
        this._state = states.CROP;
    }

    /**
     * Apply cropping
     * @param cropInfo - crop bound info left top width height
     */
    endCropByBoundInfo(cropInfo?: { left: number; top: number; width: number; height: number }) {
        if (!cropInfo || !this._canvas) {
            return;
        }

        const data = {
            imageName: this.getImageName(),
            url: this._canvas.toDataURL(cropInfo)
        };

        this.once('loadImage', () => {
            this.clearRedoStack();
            this.clearUndoStack();
            this.fire(events.END_CROPPING);
        });

        if (data) {
            this.loadImageFromURL(data.url, data.imageName);
        }
    }

    getViewPortImage() {
        return this._getMainModule().getViewPortImage();
    }

    /**
     * @param type - 'rotate' or 'setAngle'
     * @param angle - angle value (degree)
     * @private
     */
    _rotate(type: string, angle: number) {
        const callback = this.fire.bind(this, events.ROTATE_IMAGE);
        const command = commandFactory.create(commands.ROTATE_IMAGE, type, angle);

        /**
         * @event fabricPhoto#rotateImage
         * @param {number} currentAngle - image.angle
         * @example
         * fabricPhoto.on('rotateImage', function(angle) {
         *     console.log('angle: ', angle);
         * });
         */

        (command as { setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (angle: number) => void) => void }).setExecuteCallback?.(callback);
        (command as { setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (angle: number) => void) => void }).setUndoCallback?.(callback);

        this.execute(command as unknown as { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void });
    }

    /**
     * Rotate image
     * @param angle - Additional angle to rotate image
     * @example
     * fabricPhoto.setAngle(10); // angle = 10
     * fabricPhoto.rotate(10); // angle = 20
     * fabricPhoto.setAngle(5); // angle = 5
     * fabricPhoto.rotate(-95); // angle = -90
     */
    rotate(angle: number) {
        this._rotate('rotate', angle);
    }

    /**
     * Set angle
     * @param angle - Angle of image
     * @example
     * fabricPhoto.setAngle(10); // angle = 10
     * fabricPhoto.rotate(10); // angle = 20
     * fabricPhoto.setAngle(5); // angle = 5
     * fabricPhoto.rotate(50); // angle = 55
     * fabricPhoto.setAngle(-40); // angle = -40
     */
    setAngle(angle: number) {
        this._rotate('setAngle', angle);
    }

    /**
     * Get angle
     */
    getAngle() {
        const canvasImage = this._getMainModule().getCanvasImage();
        return canvasImage?.angle ?? 0;
    }

    /**
     * Start free-drawing mode
     * @param setting - Brush width & color
     * @example
     * fabricPhoto.startFreeDrawing();
     * fabricPhoto.endFreeDrawing();
     * fabricPhoto.startFreeDrawing({
     *     width: 12,
     *     color: 'rgba(0, 0, 0, 0.5)'
     * });
     */
    startFreeDrawing(setting?: { width?: number; color?: string }) {
        if (this.getCurrentState() === states.FREE_DRAWING) {
            return;
        }
        this.endAll();
        const drawModule = this._getModule(modules.FREE_DRAWING) as unknown as { start: (setting?: { width?: number; color?: string }) => void };
        drawModule?.start(setting);
        this._state = states.FREE_DRAWING;

        /**
         * @event ImageEditor#startFreeDrawing
         */
        this.fire(events.START_FREE_DRAWING);
    }

    /**
     * change path style
     * @param setting - Brush width & color
     */
    changeFreeDrawingPathStyle(setting?: { width?: number; color?: string }) {
        if (!this._canvas) return;

        const activeObj = this._canvas.getActiveObject();

        if (
            this.getCurrentState() !== states.FREE_DRAWING ||
            !activeObj ||
            (activeObj as { customType?: string }).customType !== 'freedraw'
        ) {
            return;
        }

        const drawModule = this._getModule(modules.FREE_DRAWING) as unknown as { setStyle: (obj: FabricObject, setting?: { width?: number; color?: string }) => void };
        drawModule?.setStyle(activeObj, setting);
    }

    /**
     * Set drawing brush
     * @param setting - Brush width & color
     * @example
     * fabricPhoto.startFreeDrawing();
     * fabricPhoto.setBrush({
     *     width: 12,
     *     color: 'rgba(0, 0, 0, 0.5)'
     * });
     * fabricPhoto.setBrush({
     *     width: 8,
     *     color: 'FFFFFF'
     * });
     */
    setBrush(setting: { width?: number; color?: string }) {
        const state = this._state;
        let compName: string;

        switch (state) {
            case states.LINE:
                compName = modules.LINE;
                break;
            default:
                compName = modules.FREE_DRAWING;
        }

        const drawModule = this._getModule(compName) as unknown as { setBrush: (setting: { width?: number; color?: string }) => void };
        drawModule?.setBrush(setting);
    }

    /**
     * End free-drawing mode
     * @example
     * fabricPhoto.startFreeDrawing();
     * fabricPhoto.endFreeDrawing();
     */
    endFreeDrawing() {
        if (this.getCurrentState() !== states.FREE_DRAWING) {
            return;
        }
        const drawModule = this._getModule(modules.FREE_DRAWING) as unknown as { end: () => void };
        drawModule?.end();
        this._state = states.NORMAL;

        /**
         * @event fabricPhoto#endFreeDrawing
         */
        this.fire(events.END_FREE_DRAWING);
    }

    /**
     * Start line-drawing mode
     * @param setting - Brush width & color
     * @example
     * fabricPhoto.startLineDrawing();
     * fabricPhoto.endLineDrawing();
     * fabricPhoto.startLineDrawing({
     *     width: 12,
     *     color: 'rgba(0, 0, 0, 0.5)'
     * });
     */
    startLineDrawing(setting?: { width?: number; color?: string }) {
        if (this.getCurrentState() === states.LINE) {
            return;
        }

        this.endAll();
        const lineModule = this._getModule(modules.LINE) as unknown as { start: (setting?: { width?: number; color?: string }) => void };
        lineModule?.start(setting);
        this._state = states.LINE;

        /**
         * @event fabricPhoto#startLineDrawing
         */
        this.fire(events.START_LINE_DRAWING);
    }

    /**
     * End line-drawing mode
     * @example
     * fabricPhoto.startLineDrawing();
     * fabricPhoto.endLineDrawing();
     */
    endLineDrawing() {
        if (this.getCurrentState() !== states.LINE) {
            return;
        }
        const lineModule = this._getModule(modules.LINE) as unknown as { end: () => void };
        lineModule?.end();
        this._state = states.NORMAL;

        /**
         * @event fabricPhoto#endLineDrawing
         */
        this.fire(events.END_LINE_DRAWING);
    }

    /**
     * Start arrow-drawing mode
     * @param setting - Brush width & color
     * @example
     * fabricPhoto.startArrowDrawing();
     * fabricPhoto.endArrowDrawing();
     * fabricPhoto.startLineDrawing({
     *     width: 12,
     *     color: 'rgba(0, 0, 0, 0.5)'
     * });
     */
    startArrowDrawing(setting?: { width?: number; color?: string }) {
        this.endAll();
        const arrowModule = this._getModule(modules.ARROW) as unknown as { start: (setting?: { width?: number; color?: string }) => void };
        arrowModule?.start(setting);
        this._state = states.ARROW;
        this.fire(events.START_ARROW_DRAWING);
    }

    /**
     * Start change arrow obj
     * @param setting - Brush width & color
     */
    changeArrowStyle(setting?: { width?: number; color?: string }) {
        if (!this._canvas) return;

        const activeObj = this._canvas.getActiveObject();

        if (
            this.getCurrentState() !== states.ARROW ||
            !activeObj ||
            (activeObj as { customType?: string }).customType !== 'arrow'
        ) {
            return;
        }

        const arrowModule = this._getModule(modules.ARROW) as unknown as { setStyle: (obj: FabricObject, setting?: { width?: number; color?: string }) => void };
        arrowModule?.setStyle(activeObj, setting);
    }

    /**
     * End arrow-drawing mode
     * @example
     * fabricPhoto.startArrowDrawing();
     * fabricPhoto.endArrowDrawing();
     */
    endArrowDrawing() {
        const arrowModule = this._getModule(modules.ARROW) as unknown as { end: () => void };
        arrowModule?.end();
        this._state = states.NORMAL;
        this.fire(events.END_ARROW_DRAWING);
    }

    /**
     * Start mosaic mode
     * @param setting - dimensions
     * @example
     * fabricPhoto.startMosaicDrawing();
     * fabricPhoto.endMosaicDrawing();
     * fabricPhoto.startLineDrawing({
     *     dimensions: 12,
     * });
     */
    startMosaicDrawing(setting?: { dimensions?: number }) {
        this.endAll();
        const mosaicModule = this._getModule(modules.MOSAIC) as unknown as { start: (setting?: { dimensions?: number }) => void };
        mosaicModule?.start(setting);
        this._state = states.MOSAIC;

        this.fire(events.START_MOSAIC_DRAWING);
    }

    /**
     * End endMosaic mode
     * @example
     * fabricPhoto.startMosaicDrawing();
     * fabricPhoto.endMosaicDrawing();
     */
    endMosaicDrawing() {
        const mosaicModule = this._getModule(modules.MOSAIC) as unknown as { end: () => void };
        mosaicModule?.end();
        this._state = states.NORMAL;
        this.fire(events.END_MOSAIC_DRAWING);
    }

    /**
     * Start to draw shape on canvas (bind event on canvas)
     * @example
     * fabricPhoto.startDrawingShapeMode();
     */
    startDrawingShapeMode() {
        if (this.getCurrentState() !== states.SHAPE) {
            this._state = states.SHAPE;
            const shapeModule = this._getModule(modules.SHAPE) as unknown as { startDrawingMode: () => void };
            shapeModule?.startDrawingMode();
        }
    }

    /**
     * Set states of current drawing shape
     * @param type - Shape type (ex: 'rect', 'circle', 'triangle')
     * @param options - Shape options
     * @example
     * fabricPhoto.setDrawingShape('rect', {
     *     fill: 'red',
     *     width: 100,
     *     height: 200
     * });
     * fabricPhoto.setDrawingShape('circle', {
     *     fill: 'transparent',
     *     stroke: 'blue',
     *     strokeWidth: 3,
     *     rx: 10,
     *     ry: 100
     * });
     * fabricPhoto.setDrawingShape('triangle', {
     *     width: 1,
     *     height: 1,
     *     isRegular: true
     * });
     * fabricPhoto.setDrawingShape('circle', {
     *     rx: 10,
     *     ry: 10,
     *     isRegular: true
     * });
     */
    setDrawingShape(type: string, options?: Record<string, unknown>) {
        const shapeModule = this._getModule(modules.SHAPE) as unknown as { setStates: (type: string, options?: Record<string, unknown>) => void };
        shapeModule?.setStates(type, options);
    }

    /**
     * Add shape
     * @param type - Shape type (ex: 'rect', 'circle', 'triangle')
     * @param options - Shape options
     * @example
     * fabricPhoto.addShape('rect', {
     *     fill: 'red',
     *     stroke: 'blue',
     *     strokeWidth: 3,
     *     width: 100,
     *     height: 200,
     *     left: 10,
     *     top: 10,
     *     isRegular: true
     * });
     * fabricPhoto.addShape('circle', {
     *     fill: 'red',
     *     stroke: 'blue',
     *     strokeWidth: 3,
     *     rx: 10,
     *     ry: 100,
     *     isRegular: false
     * });
     */
    addShape(type: string, options?: Record<string, unknown>) {
        options = options || {};

        this._setPositions(options);
        const shapeModule = this._getModule(modules.SHAPE) as unknown as { add: (type: string, options?: Record<string, unknown>) => void };
        shapeModule?.add(type, options);
    }

    /**
     * Change shape
     * @param options - Shape options
     * @example
     * // call after selecting shape object on canvas
     * fabricPhoto.changeShape({
     *     fill: 'red',
     *     stroke: 'blue',
     *     strokeWidth: 3,
     *     width: 100,
     *     height: 200
     * });
     * fabricPhoto.changeShape({
     *     fill: 'red',
     *     stroke: 'blue',
     *     strokeWidth: 3,
     *     rx: 10,
     *     ry: 100
     * });
     */
    changeShape(options?: Record<string, unknown>) {
        if (!this._canvas) return;

        const activeObj = this._canvas.getActiveObject();
        const shapeModule = this._getModule(modules.SHAPE) as unknown as { change: (obj: FabricObject, options?: Record<string, unknown>) => void };

        if (!activeObj) {
            return;
        }

        shapeModule?.change(activeObj, options);
    }

    /**
     * End to draw shape on canvas (unbind event on canvas)
     * @example
     * fabricPhoto.startDrawingShapeMode();
     * fabricPhoto.endDrawingShapeMode();
     */
    endDrawingShapeMode() {
        if (this.getCurrentState() === states.SHAPE) {
            const shapeModule = this._getModule(modules.SHAPE) as unknown as { endDrawingMode: () => void };
            shapeModule?.endDrawingMode();
            this._state = states.NORMAL;
        }
    }

    /**
     * Start text input mode
     * @example
     * fabricPhoto.endTextMode();
     * fabricPhoto.startTextMode();
     */
    startTextMode() {
        if (this.getCurrentState() !== states.TEXT) {
            this._state = states.TEXT;

            const textModule = this._getModule(modules.TEXT) as unknown as {
                start: (callbacks: {
                    mousedown: (event: { target: FabricObject | null; e: MouseEvent }) => void;
                    select: (event: { target: FabricObject | null }) => void;
                    selectClear: (event: { target: FabricObject | null }) => void;
                    dbclick: () => void;
                    remove: (fEvent: { target: FabricObject }) => void;
                }) => void;
            };

            textModule?.start({
                mousedown: this._onFabricMouseDown.bind(this),
                select: this._onFabricSelect.bind(this),
                selectClear: this._onFabricSelectClear.bind(this),
                dbclick: this._onDBClick.bind(this),
                remove: this._handlers.removedObject
            });
        }
    }

    /**
     * Add text on image
     * @param text - Initial input text
     * @param options - Options for generating text
     * @param defaultEdit - default start edit
     * @example
     * fabricPhoto.addText();
     * fabricPhoto.addText('init text', {
     *     styles: {
     *     fill: '#000',
     *         fontSize: '20',
     *         fontWeight: 'bold'
     *     },
     *     position: {
     *         x: 10,
     *         y: 10
     *     }
     * });
     */
    addText(text?: string, options?: Record<string, unknown>, defaultEdit = false) {
        if (this.getCurrentState() !== states.TEXT) {
            this._state = states.TEXT;
        }

        const textModule = this._getModule(modules.TEXT) as unknown as { add: (text: string, options?: Record<string, unknown>, defaultEdit?: boolean) => void };
        textModule?.add(text || '', options || {}, defaultEdit);
    }

    /**
     * Change contents of selected text object on image
     * @param text - Changing text
     * @example
     * fabricPhoto.changeText('change text');
     */
    changeText(text: string) {
        if (!this._canvas) return;

        const activeObj = this._canvas.getActiveObject();

        if (this.getCurrentState() !== states.TEXT || !activeObj) {
            return;
        }

        const textModule = this._getModule(modules.TEXT) as unknown as { change: (obj: FabricObject, text: string) => void };
        textModule?.change(activeObj, text);
    }

    /**
     * Set style
     * @param styleObj - Initial styles
     * @example
     * fabricPhoto.changeTextStyle({
     *     fontStyle: 'italic'
     * });
     */
    changeTextStyle(styleObj?: Record<string, unknown>) {
        if (!this._canvas) return;

        const activeObj = this._canvas.getActiveObject();

        if (this.getCurrentState() !== states.TEXT || !activeObj) {
            return;
        }

        const textModule = this._getModule(modules.TEXT) as unknown as { setStyle: (obj: FabricObject, style: Record<string, unknown>) => void };
        textModule?.setStyle(activeObj, styleObj ?? {});
    }

    /**
     * End text input mode
     * @example
     * fabricPhoto.startTextMode();
     * fabricPhoto.endTextMode();
     */
    endTextMode() {
        if (this.getCurrentState() !== states.TEXT) {
            return;
        }

        this._state = states.NORMAL;

        const textModule = this._getModule(modules.TEXT) as unknown as { end: () => void };
        textModule?.end();
    }

    /**
     * Double click event handler
     * @private
     */
    _onDBClick() {
        /**
         * @event ImageEditor#editText
         * @example
         * fabricPhoto.on('editText', function(obj) {
         *     console.log('text object: ' + obj);
         * });
         */
        this.fire(events.EDIT_TEXT);
    }

    /**
     * Mousedown event handler
     * @param event - Current mousedown event object
     * @private
     */
    _onFabricMouseDown(event: { target: FabricObject | null; e: MouseEvent }) {
        const obj = event.target;
        const e = event.e || {};
        const originPointer = this._canvas?.getPointer(e) as FabricPoint | undefined;
        const textModule = this._getModule(modules.TEXT) as unknown as { isPrevEditing: boolean };
        let isNew = !obj;
        if (obj && !obj.isType('text')) {
            isNew = true;
        }
        if (textModule && textModule.isPrevEditing) {
            textModule.isPrevEditing = false;

            return;
        }
        /**
         * @event fabricPhoto#activateText
         * @param {object} options
         *     @param {boolean} options.type - Type of text object (new / select)
         *     @param {string} options.text - Current text
         *     @param {object} options.styles - Current styles
         * @example
         * fabricPhoto.on('activateText', function(obj) {
         *     console.log('text object type: ' + obj.type);
         *     console.log('text contents: ' + obj.text);
         *     console.log('text styles: ' + obj.styles);
         *     console.log('text position on canvas: ' + obj.originPosition);
         *     console.log('text position on brwoser: ' + obj.clientPosition);
         * });
         */
        this.fire(events.ACTIVATE_TEXT, {
            type: !isNew ? 'select' : 'new',
            text: obj ? (obj as { text?: string }).text ?? '' : '',
            styles: obj
                ? {
                      fill: (obj as { fill?: string }).fill,
                      fontFamily: (obj as { fontFamily?: string }).fontFamily,
                      fontSize: (obj as { fontSize?: number }).fontSize,
                      fontStyle: (obj as { fontStyle?: string }).fontStyle,
                      textAlign: (obj as { textAlign?: string }).textAlign,
                      textDecoration: (obj as { textDecoration?: string }).textDecoration
                  }
                : {},
            originPosition: originPointer ? { x: originPointer.x, y: originPointer.y } : { x: 0, y: 0 },
            clientPosition: {
                x: (e as { clientX?: number }).clientX || 0,
                y: (e as { clientY?: number }).clientY || 0
            }
        });
    }

    /**
     * Remove active object or group
     * @example
     * fabricPhoto.removeActiveObject();
     */
    removeActiveObject() {
        if (!this._canvas) return;

        const canvas = this._canvas;
        const target = canvas.getActiveObject() || canvas.getActiveGroup();
        const command = commandFactory.create(commands.REMOVE_OBJECT, target);
        this.execute(command as unknown as { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void });
    }

    /**
     * Start pan mode
     */
    startPan() {
        if (this.getCurrentState() === states.PAN) {
            return;
        }

        this.endAll();
        const panModule = this._getModule(modules.PAN) as unknown as { start: () => void };
        panModule?.start();
        this._state = states.PAN;
        this.fire(events.START_PAN);
    }

    /**
     * End pan mode
     */
    endPan() {
        const panModule = this._getModule(modules.PAN) as unknown as { end: () => void };
        panModule?.end();
        this._state = states.NORMAL;
        this.fire(events.END_PAN);
    }

    setZoom(rate: number) {
        rate = rate || 1;
        const command = commandFactory.create(commands.ZOOM, rate);
        const callback = this._callbackAfterZoom.bind(this);

        (command as { setExecuteCallback?: (cb: (zoom: number) => void) => void; setUndoCallback?: (cb: (zoom: number) => void) => void }).setExecuteCallback?.(callback);
        (command as { setExecuteCallback?: (cb: (zoom: number) => void) => void; setUndoCallback?: (cb: (zoom: number) => void) => void }).setUndoCallback?.((zoom: number) => {
            callback(zoom);
        });

        this.execute(command as unknown as { execute: (moduleMap: unknown) => Promise<unknown>; undo: (moduleMap: unknown) => Promise<unknown>; setExecuteCallback?: (cb: () => void) => void; setUndoCallback?: (cb: (obj: unknown) => void) => void });
    }

    _callbackAfterZoom(zoom: number) {
        this.fire(consts.eventNames.CHANGE_ZOOM, zoom);
    }

    getZoom() {
        const mainModule = this._getModule(modules.MAIN) as unknown as { getZoom: () => number };
        return mainModule?.getZoom() ?? 1;
    }

    /**
     * Get data url
     * @param type - A DOMString indicating the image format. The default type is image/png.
     * @returns A DOMString containing the requested data URI
     * @example
     * imgEl.src = imageEditor.toDataURL();
     */
    toDataURL(type?: string) {
        this.endAll();
        return this._getMainModule().toDataURL(type);
    }

    /**
     * Get blob
     * @param type - A DOMString indicating the image format. The default type is image/png.
     * @returns Blob
     * @example
     * imgEl.src = imageEditor.toDataURL();
     */
    toBlobData(type?: string) {
        this.endAll();
        return this._getMainModule().toBlob(type);
    }

    /**
     * Get image name
     * @returns image name
     * @example
     * console.log(imageEditor.getImageName());
     */
    getImageName() {
        return this._getMainModule().getImageName();
    }

    /**
     * Clear undoStack
     * @example
     * fabricPhoto.clearUndoStack();
     */
    clearUndoStack() {
        this._module.clearUndoStack();
    }

    /**
     * Clear redoStack
     * @example
     * fabricPhoto.clearRedoStack();
     */
    clearRedoStack() {
        this._module.clearRedoStack();
    }

    /**
     * Whehter the undo stack is empty or not
     * @returns boolean
     * fabricPhoto.isEmptyUndoStack();
     */
    isEmptyUndoStack() {
        return this._module.isEmptyUndoStack();
    }

    /**
     * Whehter the redo stack is empty or not
     * @returns boolean
     * fabricPhoto.isEmptyRedoStack();
     */
    isEmptyRedoStack() {
        return this._module.isEmptyRedoStack();
    }

    /**
     * Resize canvas dimension
     * @param dimension - Max width & height
     */
    resizeCanvasDimension(dimension?: { width?: number; height?: number }) {
        const mainModule = this._getMainModule();

        if (!dimension) {
            return;
        }

        mainModule.setCssMaxDimension(dimension);
        mainModule.adjustCanvasDimension();
    }

    /**
     * Destroy
     */
    destroy() {
        if (!this._canvas) return;

        const wrapperEl = this._canvas.wrapperEl;

        this.endAll();
        this._detachDomEvents();

        this._canvas.clear();

        if (wrapperEl && wrapperEl.parentNode) {
            wrapperEl.parentNode.removeChild(wrapperEl);
        }

        forEach(
            this as unknown as Record<string, unknown>,
            (_value, key) => {
                (this as Record<string, unknown>)[key] = null;
            },
            this
        );
    }

    /**
     * Set position
     * @param options - Position options (left or top)
     * @private
     */
    _setPositions(options: Record<string, unknown>) {
        if (!this._canvas) return;

        const centerPosition = this._canvas.getCenter();

        if (isUndefined(options.left)) {
            options.left = centerPosition.left;
        }

        if (isUndefined(options.top)) {
            options.top = centerPosition.top;
        }
    }

    /**
     * adjustCanvasDimension
     */
    adjustCanvasDimension() {
        this._getMainModule().adjustCanvasDimension();
    }

    getViewPortInfo() {
        return this._getMainModule().getViewPortInfo();
    }

    // Fire event method (from CustomEvents mixin)
    fire(eventName: string, ...args: unknown[]) {
        // This will be mixed in from CustomEvents
        (CustomEvents.prototype.fire as (eventName: string, ...args: unknown[]) => void).call(this, eventName, ...args);
    }

    // Event listener methods (from CustomEvents mixin)
    on(eventName: string | Record<string, (...args: unknown[]) => unknown>, handler?: ((...args: unknown[]) => unknown) | unknown, context?: unknown) {
        (CustomEvents.prototype.on as (eventName: string | Record<string, (...args: unknown[]) => unknown>, handler?: ((...args: unknown[]) => unknown) | unknown, context?: unknown) => void).call(this, eventName, handler, context);
    }

    once(eventName: string | Record<string, (...args: unknown[]) => unknown>, handler?: ((...args: unknown[]) => unknown) | unknown, context?: unknown) {
        (CustomEvents.prototype.once as (eventName: string | Record<string, (...args: unknown[]) => unknown>, handler?: ((...args: unknown[]) => unknown) | unknown, context?: unknown) => void).call(this, eventName, handler, context);
    }

    off(eventName?: string | Record<string, (...args: unknown[]) => unknown>, handler?: (...args: unknown[]) => unknown) {
        (CustomEvents.prototype.off as (eventName?: string | Record<string, (...args: unknown[]) => unknown>, handler?: (...args: unknown[]) => unknown) => void).call(this, eventName, handler);
    }
}

CustomEvents.mixin(FabricPhoto as unknown as new (...args: unknown[]) => CustomEvents);

export default FabricPhoto;

export { FabricPhoto, consts };
