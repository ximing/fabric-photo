/**
 * module base class
 * all modules should inherite this base class
 */
import type { Canvas, Image } from '../types/fabric.js';

/**
 * Dimension object for canvas sizing
 */
export interface Dimension {
    width?: string | number;
    height?: string | number;
    [key: string]: string | number | undefined;
}

/**
 * Image properties setting
 */
export interface ImagePropertiesSetting {
    [key: string]: unknown;
}

/**
 * Root module interface - defines the contract for root module methods
 */
interface RootModule {
    setCanvasImage(name: string, oImage: Image | null): void;
    getCanvasElement(): HTMLCanvasElement;
    getCanvas(): Canvas;
    getCanvasImage(): Image | null;
    getImageName(): string;
    getEditor(): unknown;
    setImageProperties(setting: ImagePropertiesSetting, withRendering?: boolean): void;
    setCanvasCssDimension(dimension: Dimension): void;
    setCanvasBackstoreDimension(dimension: Dimension): void;
    adjustCanvasDimension(): void;
}

/**
 * Module base class - all modules should inherit this base class
 */
export default class ModuleBase {
    /**
     * Component name
     */
    name: string = '';

    /**
     * Parent component
     */
    _parent: ModuleBase | null = null;

    /**
     * Save image(background) of canvas
     * @param name - Name of image
     * @param oImage - Fabric image instance
     */
    setCanvasImage(name: string, oImage: Image | null): void {
        this.getRoot().setCanvasImage(name, oImage);
    }

    /**
     * Returns canvas element of fabric.Canvas[[lower-canvas]]
     * @returns HTMLCanvasElement
     */
    getCanvasElement(): HTMLCanvasElement {
        return this.getRoot().getCanvasElement();
    }

    /**
     * Get fabric.Canvas instance
     * @returns fabric.Canvas
     */
    getCanvas(): Canvas {
        return this.getRoot().getCanvas();
    }

    /**
     * Get canvasImage (fabric.Image instance)
     * @returns fabric.Image
     */
    getCanvasImage(): Image | null {
        return this.getRoot().getCanvasImage();
    }

    /**
     * Get image name
     * @returns string
     */
    getImageName(): string {
        return this.getRoot().getImageName();
    }

    /**
     * Get image editor
     * @returns ImageEditor
     */
    getEditor(): unknown {
        return this.getRoot().getEditor();
    }

    /**
     * Return component name
     * @returns string
     */
    getName(): string {
        return this.name;
    }

    /**
     * Set image properties
     * @param setting - Image properties
     * @param withRendering - If true, The changed image will be reflected in the canvas
     */
    setImageProperties(setting: ImagePropertiesSetting, withRendering?: boolean): void {
        this.getRoot().setImageProperties(setting, withRendering);
    }

    /**
     * Set canvas dimension - css only
     * @param dimension - Canvas css dimension
     */
    setCanvasCssDimension(dimension: Dimension): void {
        this.getRoot().setCanvasCssDimension(dimension);
    }

    /**
     * Set canvas dimension - css only
     * @param dimension - Canvas backstore dimension
     */
    setCanvasBackstoreDimension(dimension: Dimension): void {
        this.getRoot().setCanvasBackstoreDimension(dimension);
    }

    /**
     * Set parent
     * @param parent - Parent
     */
    setParent(parent: ModuleBase | null): void {
        this._parent = parent ?? null;
    }

    /**
     * Adjust canvas dimension with scaling image
     */
    adjustCanvasDimension(): void {
        this.getRoot().adjustCanvasDimension();
    }

    /**
     * Return parent.
     * If the view is root, return null
     * @returns Component|null
     */
    getParent(): ModuleBase | null {
        return this._parent;
    }

    /**
     * Return root
     * @returns Module
     */
    getRoot(): RootModule {
        let next = this.getParent();
        let current: ModuleBase = this;

        while (next) {
            current = next;
            next = current.getParent();
        }

        return current as unknown as RootModule;
    }
}
