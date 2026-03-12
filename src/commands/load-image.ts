/**
 * Load image command - loads an image onto the canvas
 */

import type { Canvas, Object as FabricObject, fabricImage } from '../types/fabric';
import BaseCommand from './base';
import consts from '../consts';

const { moduleNames } = consts;
const { IMAGE_LOADER } = moduleNames;

/**
 * Module map type for dependency injection
 */
type ModuleMap = Record<string, {
    getCanvas: () => Canvas;
    getImageName: () => string;
    getCanvasImage: () => fabricImage | null;
    load: (name: string, img: HTMLImageElement | fabricImage | null) => Promise<fabricImage>;
}>;

/**
 * Store type for preserving canvas state
 */
interface LoadImageStore {
    prevName: string;
    prevImage: fabricImage | null;
    objects: FabricObject[];
}

/**
 * Creates a command to load an image onto the canvas
 * @param imageName - Name identifier for the image
 * @param img - The image to load (HTMLImageElement or fabricImage)
 * @returns BaseCommand instance
 */
export default function loadImage(imageName: string, img: HTMLImageElement | fabricImage | null): BaseCommand {
    return new BaseCommand({
        /**
         * Execute: load new image onto canvas
         * Stores previous state for undo
         * @param moduleMap - Modules injection
         * @returns Promise
         */
        execute(moduleMap: ModuleMap): Promise<fabricImage> {
            const loader = moduleMap[IMAGE_LOADER];
            const canvas = loader.getCanvas();

            (this as unknown as { store: LoadImageStore }).store = {
                prevName: loader.getImageName(),
                prevImage: loader.getCanvasImage(),
                // "canvas.clear()" clears the data, so use slice for deep copy
                objects: canvas.getObjects().slice()
            };

            canvas.clear();

            return loader.load(imageName, img);
        },
        /**
         * Undo: restore previous canvas state
         * @param moduleMap - Modules injection
         * @returns Promise
         */
        undo(moduleMap: ModuleMap): Promise<fabricImage> {
            const loader = moduleMap[IMAGE_LOADER];
            const canvas = loader.getCanvas();
            const canvasContext = canvas;
            const store = (this as unknown as { store: LoadImageStore }).store;

            canvas.clear();
            canvas.add.apply(canvasContext, store.objects);

            return loader.load(store.prevName, store.prevImage);
        }
    });
}
