/**
 * Main module - canvas editor board related settings
 */
import type { Canvas, Image } from '../types/fabric.js';
import { Dimension, ImagePropertiesSetting } from './base.js';
import ModuleBase from './base.js';
import consts from '../consts';
import util from '../lib/util.js';
import dataURLtoBlob from '../lib/canvas-to-blob.js';
import { fabric } from 'fabric';

const DEFAULT_CSS_MAX_WIDTH = 700;
const DEFAULT_CSS_MAX_HEIGHT = 400;

const cssOnly = {
    cssOnly: true
};
const backstoreOnly = {
    backstoreOnly: true
};

/**
 * View port information
 */
interface ViewPortInfo {
    canvas: {
        height: number;
        width: number;
        cssHeight: number;
        cssWidth: number;
        left: number;
        top: number;
    };
}

/**
 * View port image result
 */
interface ViewPortImageResult {
    cropInfo: {
        width: number;
        height: number;
        left: number;
        top: number;
    };
    originInfo: {
        height: number;
        width: number;
        left: number;
        top: number;
    };
    viewPortInfo: {
        height: number;
        width: number;
    };
    url: string;
    radio: number;
}

/**
 * Max dimension input
 */
interface MaxDimension {
    width?: number;
    height?: number;
}

/**
 * Main module - canvas editor board related settings
 * This class extends ModuleBase and provides core canvas functionality
 */
export default class Main extends ModuleBase {
    /**
     * Fabric canvas instance
     */
    canvas: Canvas | null = null;

    /**
     * Fabric image instance
     */
    canvasImage: Image | null = null;

    /**
     * Max width of canvas elements
     */
    cssMaxWidth: number = DEFAULT_CSS_MAX_WIDTH;

    /**
     * Max height of canvas elements
     */
    cssMaxHeight: number = DEFAULT_CSS_MAX_HEIGHT;

    /**
     * Image name
     */
    imageName: string = '';

    /**
     * Current zoom level
     */
    private _zoom: number = 1;

    constructor() {
        super();
        this.name = consts.moduleNames.MAIN;

        // Disable path selection
        (fabric.Path.prototype as unknown as { selectable: boolean }).selectable = false;
    }

    /**
     * To data url from canvas
     * @param type - A DOMString indicating the image format. The default type is image/png.
     * @param quality - image's quality number
     * @returns A DOMString containing the requested data URI.
     */
    toDataURL(type: string, quality: number = 1): string {
        if (!this.canvas) {
            throw new Error('Canvas not initialized');
        }

        const wrapperElStyle = Object.assign({}, this.canvas.wrapperEl.style);
        const lowerCanvasElStyle = Object.assign({}, this.canvas.lowerCanvasEl.style);
        const upperCanvasElStyle = Object.assign({}, this.canvas.upperCanvasEl.style);
        let url = this.canvas.toDataURL(
            type,
            quality,
            1,
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );
        util.setStyle(this.canvas.wrapperEl, wrapperElStyle);
        util.setStyle(this.canvas.lowerCanvasEl, lowerCanvasElStyle);
        util.setStyle(this.canvas.upperCanvasEl, upperCanvasElStyle);
        return url;
    }

    /**
     * To data url from canvas
     * @param type - A DOMString indicating the image format. The default type is image/png.
     * @param quality - image's quality number
     * @returns Blob
     */
    toBlob(type: string, quality: number = 1): Blob {
        if (!dataURLtoBlob) {
            throw new Error('dataURLtoBlob not available in this environment');
        }
        return dataURLtoBlob(this.toDataURL(type, quality));
    }

    /**
     * Save image(background) of canvas
     * @param name - Name of image
     * @param canvasImage - Fabric image instance
     */
    setCanvasImage(name: string, canvasImage: Image | null): void {
        if (canvasImage) {
            util.stamp(canvasImage);
        }
        this.imageName = name;
        this.canvasImage = canvasImage;
    }

    /**
     * Set css max dimension
     * @param maxDimension - Max width & Max height
     */
    setCssMaxDimension(maxDimension: MaxDimension): void {
        this.cssMaxWidth = maxDimension.width || this.cssMaxWidth;
        this.cssMaxHeight = maxDimension.height || this.cssMaxHeight;
    }

    /**
     * Set canvas element to fabric.Canvas
     * @param element - Wrapper or canvas element or selector
     */
    setCanvasElement(element: unknown): void {
        if (!element) {
            throw new Error('Element is required');
        }

        let selectedElement: Element | null = null;

        // Handle jQuery object
        if (typeof element === 'object' && element !== null && 'jquery' in element) {
            const jqueryElement = element as { jquery: unknown; length: number; get: (index: number) => Element };
            selectedElement = jqueryElement.get(0);
        } else if (typeof element === 'object' && element !== null && 'nodeType' in element) {
            // Handle DOM Element
            selectedElement = element as Element;
        } else if (typeof element === 'string') {
            // Handle selector
            selectedElement = document.querySelector(element);
        }

        if (!selectedElement || !selectedElement.nodeName) {
            throw new Error('容器元素是空');
        }

        let canvasElement: HTMLCanvasElement | undefined;

        if (selectedElement.nodeName.toUpperCase() !== 'CANVAS') {
            canvasElement = document.createElement('canvas');
            selectedElement.appendChild(canvasElement);
        } else {
            // Use the selected element as canvas
            canvasElement = selectedElement as HTMLCanvasElement;
        }

        this.canvas = new fabric.Canvas(canvasElement, {
            containerClass: 'xm-fabric-photo-editor-canvas-container',
            enableRetinaScaling: false
        });
        this.canvas.selection = false;

        // Set overflow hidden for zoom and panning
        if (this.canvas.wrapperEl) {
            this.canvas.wrapperEl.style.setProperty('overflow', 'hidden');
        }
    }

    /**
     * Adjust canvas dimension with scaling image
     */
    adjustCanvasDimension(): void {
        if (!this.canvasImage || !this.canvas) {
            return;
        }

        // Reset zoom to adjust canvas
        const canvasImage = this.canvasImage.scale(1);
        const boundingRect = canvasImage.getBoundingRect();
        const width = boundingRect.width;
        const height = boundingRect.height;
        const maxDimension = this._calcMaxDimension(width, height);

        this.setCanvasCssDimension({
            width: `${maxDimension.width}px`,
            height: `${maxDimension.height}px`
        });

        this.setCanvasBackstoreDimension({
            width,
            height
        });

        this.canvas.centerObject(canvasImage);

        if (this.canvas.lowerCanvasEl) {
            this.canvas.lowerCanvasEl.style.setProperty('top', '0px');
            this.canvas.lowerCanvasEl.style.setProperty('left', '0px');
        }
        if (this.canvas.upperCanvasEl) {
            this.canvas.upperCanvasEl.style.setProperty('top', '0px');
            this.canvas.upperCanvasEl.style.setProperty('left', '0px');
        }

        this._zoom = maxDimension.width / width;
    }

    /**
     * Calculate max dimension of canvas
     * The css-max dimension is dynamically decided with maintaining image ratio
     * The css-max dimension is lower than canvas dimension (attribute of canvas, not css)
     * @param width - Canvas width
     * @param height - Canvas height
     * @returns Max width & Max height
     * @private
     */
    private _calcMaxDimension(width: number, height: number): { width: number; height: number } {
        const wScaleFactor = this.cssMaxWidth / width;
        const hScaleFactor = this.cssMaxHeight / height;
        let cssMaxWidth = Math.min(width, this.cssMaxWidth);
        let cssMaxHeight = Math.min(height, this.cssMaxHeight);

        if (wScaleFactor < 1 && wScaleFactor < hScaleFactor) {
            cssMaxWidth = width * wScaleFactor;
            cssMaxHeight = height * wScaleFactor;
        } else if (hScaleFactor < 1 && hScaleFactor < wScaleFactor) {
            cssMaxWidth = width * hScaleFactor;
            cssMaxHeight = height * hScaleFactor;
        }

        return {
            width: Math.floor(cssMaxWidth),
            height: Math.floor(cssMaxHeight)
        };
    }

    /**
     * Set canvas dimension - css only
     * @param dimension - Canvas css dimension
     */
    setCanvasCssDimension(dimension: Dimension): void {
        if (!this.canvas) {
            return;
        }
        this.canvas.setDimensions(dimension, cssOnly);
    }

    /**
     * Set canvas dimension - backstore only
     * @param dimension - Canvas backstore dimension
     */
    setCanvasBackstoreDimension(dimension: Dimension): void {
        if (!this.canvas) {
            return;
        }
        this.canvas.setDimensions(dimension, backstoreOnly);
    }

    /**
     * Set zoom level
     * @param zoom - Zoom level
     */
    setZoom(zoom: number): void {
        if (!this.canvas) {
            return;
        }

        if (this._zoom === zoom) {
            return;
        }

        const { width, height } = this.getViewPortInfo().canvas;
        const maxDimension = this._calcMaxDimension(width, height);

        // Maximum is no more than twice the size of the picture
        zoom = Math.max(maxDimension.width / width, Math.min(zoom, 2));

        const maxWidth = width * zoom;
        const maxHeight = height * zoom;

        if (this.canvas.lowerCanvasEl) {
            this.canvas.lowerCanvasEl.style.setProperty('height', `${maxHeight}px`);
            this.canvas.lowerCanvasEl.style.setProperty('width', `${maxWidth}px`);
            this.canvas.lowerCanvasEl.style.setProperty('top', '0px');
            this.canvas.lowerCanvasEl.style.setProperty('left', '0px');
        }
        if (this.canvas.upperCanvasEl) {
            this.canvas.upperCanvasEl.style.setProperty('height', `${maxHeight}px`);
            this.canvas.upperCanvasEl.style.setProperty('width', `${maxWidth}px`);
            this.canvas.upperCanvasEl.style.setProperty('top', '0px');
            this.canvas.upperCanvasEl.style.setProperty('left', '0px');
        }

        if (this.cssMaxWidth > maxWidth && this.canvas.wrapperEl) {
            this.canvas.wrapperEl.style.setProperty('width', `${maxWidth}px`);
        }
        if (this.cssMaxHeight > maxHeight && this.canvas.wrapperEl) {
            this.canvas.wrapperEl.style.setProperty('height', `${maxHeight}px`);
        }

        this._zoom = zoom;
        this.canvas.renderAll();
    }

    /**
     * Get current zoom level
     * @returns Current zoom level
     */
    getZoom(): number {
        return this._zoom;
    }

    /**
     * Get viewport image
     * @returns Viewport image result with crop info and data URL
     */
    getViewPortImage(): ViewPortImageResult {
        if (!this.canvas) {
            throw new Error('Canvas not initialized');
        }

        const wrapperEl = this.canvas.wrapperEl;
        const upperCanvasEl = this.canvas.upperCanvasEl;
        const left = parseInt(upperCanvasEl.style['left'] || '0', 10);
        const top = parseInt(upperCanvasEl.style['top'] || '0', 10);
        const canvasCssWidth = parseInt(wrapperEl.style['width'] || '0', 10);
        const canvasCssHeight = parseInt(wrapperEl.style['height'] || '0', 10);
        const upperCanvasCssWidth = parseInt(upperCanvasEl.style['width'] || '0', 10);
        const upperCanvasCssHeight = parseInt(upperCanvasEl.style['height'] || '0', 10);
        const canvasWidth = upperCanvasEl.width || 0;

        const radio = upperCanvasCssWidth / canvasWidth;
        const cropInfo = {
            width: canvasCssWidth / radio,
            height: canvasCssHeight / radio,
            left: Math.abs(left / radio),
            top: Math.abs(top / radio)
        };

        const wrapperElStyle = Object.assign({}, this.canvas.wrapperEl.style);
        const lowerCanvasElStyle = Object.assign({}, this.canvas.lowerCanvasEl.style);
        const upperCanvasElStyle = Object.assign({}, this.canvas.upperCanvasEl.style);
        const url = this.canvas.toDataURL(cropInfo);

        util.setStyle(this.canvas.wrapperEl, wrapperElStyle);
        util.setStyle(this.canvas.lowerCanvasEl, lowerCanvasElStyle);
        util.setStyle(this.canvas.upperCanvasEl, upperCanvasElStyle);

        return {
            cropInfo,
            originInfo: {
                height: upperCanvasCssHeight,
                width: upperCanvasCssWidth,
                left: Math.abs(left),
                top: Math.abs(top)
            },
            viewPortInfo: {
                height: canvasCssHeight,
                width: canvasCssWidth
            },
            url,
            radio
        };
    }

    /**
     * Get viewport info
     * @returns Viewport information
     */
    getViewPortInfo(): ViewPortInfo {
        if (!this.canvas) {
            return {
                canvas: {
                    height: 0,
                    width: 0,
                    cssHeight: 0,
                    cssWidth: 0,
                    left: 0,
                    top: 0
                }
            };
        }

        const canvas = this.canvas;
        const upperCanvasEl = canvas.upperCanvasEl;
        const left = parseInt(upperCanvasEl.style['left'] || '0', 10);
        const top = parseInt(upperCanvasEl.style['top'] || '0', 10);
        const upperCanvasCssWidth = parseInt(upperCanvasEl.style['width'] || '0', 10);
        const upperCanvasCssHeight = parseInt(upperCanvasEl.style['height'] || '0', 10);

        return {
            canvas: {
                height: canvas.height || 0,
                width: canvas.width || 0,
                cssHeight: upperCanvasCssHeight,
                cssWidth: upperCanvasCssWidth,
                left,
                top
            }
        };
    }

    /**
     * Set image properties
     * @param setting - Image properties
     * @param withRendering - If true, The changed image will be reflected in the canvas
     */
    setImageProperties(setting: ImagePropertiesSetting, withRendering?: boolean): void {
        const canvasImage = this.canvasImage;

        if (!canvasImage || !this.canvas) {
            return;
        }

        canvasImage.set(setting as Record<string, unknown>).setCoords();
        if (withRendering) {
            this.canvas.renderAll();
        }
    }

    /**
     * Returns canvas element of fabric.Canvas[[lower-canvas]]
     * @returns HTMLCanvasElement
     */
    getCanvasElement(): HTMLCanvasElement {
        if (!this.canvas) {
            throw new Error('Canvas not initialized');
        }
        return this.canvas.getElement();
    }

    /**
     * Get fabric.Canvas instance
     * @returns fabric.Canvas
     */
    getCanvas(): Canvas | null {
        return this.canvas;
    }

    /**
     * Get canvasImage (fabric.Image instance)
     * @returns fabric.Image
     */
    getCanvasImage(): Image | null {
        return this.canvasImage;
    }

    /**
     * Get image name
     * @returns string
     */
    getImageName(): string {
        return this.imageName;
    }
}
