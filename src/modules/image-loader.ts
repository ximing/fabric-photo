/**
 * Image loader module
 * Handles loading and setting background images on canvas
 */
import { fabric } from 'fabric';
import ModuleBase from './base.js';
import consts from '../consts';

const { moduleNames, rejectMessages } = consts;

const imageOption = {
    padding: 0,
    crossOrigin: 'anonymous'
};

export default class ImageLoader extends ModuleBase {
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = moduleNames.IMAGE_LOADER;
    }

    /**
     * Load image from url
     * @param imageName - File name
     * @param img - fabric.Image instance or URL of an image
     * @returns Promise
     */
    load(imageName: string | null | undefined, img: fabric.Image | string | null | undefined): Promise<void | fabric.Image> {
        let promise: Promise<void | fabric.Image>;

        if (!imageName && !img) {
            const canvas = this.getCanvas();

            canvas.backgroundImage = null;
            canvas.renderAll();

            promise = new Promise<void>((resolve) => {
                this.setCanvasImage('', null);
                resolve();
            });
        } else {
            promise = this._setBackgroundImage(img as fabric.Image | string).then((oImage) => {
                this.setCanvasImage(imageName ?? '', oImage as fabric.Image);
                this.adjustCanvasDimension();

                return oImage;
            });
        }

        return promise;
    }

    /**
     * Set background image
     * @param img fabric.Image instance or URL of an image to set background to
     * @returns Promise
     * @private
     */
    _setBackgroundImage(img: fabric.Image | string): Promise<fabric.Image> {
        if (!img) {
            return Promise.reject(rejectMessages.loadImage);
        }

        return new Promise<fabric.Image>((resolve, reject) => {
            const canvas = this.getCanvas();

            canvas.setBackgroundImage(img, () => {
                const oImage = canvas.backgroundImage as fabric.Image | undefined;
                const element = oImage && typeof oImage.getElement === 'function' ? oImage.getElement() : null;

                if (element && oImage) {
                    resolve(oImage);
                } else {
                    reject(rejectMessages.loadImage);
                }
            }, imageOption as any);
        });
    }
}
