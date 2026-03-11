/**
 * Clear command - clears all objects from canvas
 */

import type { Canvas, Object as FabricObject } from '../types/fabric.js';
import BaseCommand from './base';
import consts from '../consts';

const { moduleNames } = consts;
const { MAIN } = moduleNames;

/**
 * Module map type for dependency injection
 */
type ModuleMap = Record<string, {
    getCanvas: () => Canvas;
}>;

/**
 * Creates a command to clear all objects from the canvas
 * @returns BaseCommand instance
 */
export default function clear(): BaseCommand {
    return new BaseCommand({
        /**
         * Execute: clear all objects from canvas
         * Stores objects for undo functionality
         * @param moduleMap - Components injection
         * @returns Promise
         */
        execute(moduleMap: ModuleMap): Promise<void> {
            return new Promise((resolve) => {
                const canvas = moduleMap[MAIN].getCanvas();
                const objs = canvas.getObjects();

                // Slice: "canvas.clear()" clears the objects array, so shallow copy the array
                (this as unknown as { store: FabricObject[] }).store = objs.slice();
                objs.slice().forEach((obj: FabricObject) => {
                    if (obj.get('type') === 'group') {
                        canvas.remove(obj);
                    } else {
                        obj.remove();
                    }
                });
                resolve();
            });
        },
        /**
         * Undo: restore previously cleared objects to canvas
         * @param moduleMap - Components injection
         * @returns Promise
         */
        undo(moduleMap: ModuleMap): Promise<void> {
            const canvas = moduleMap[MAIN].getCanvas();
            const canvasContext = canvas;
            const store = (this as unknown as { store: FabricObject[] }).store;

            canvas.add.apply(canvasContext, store);

            return Promise.resolve();
        }
    });
}
