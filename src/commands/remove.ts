/**
 * Remove command - removes an object from canvas
 */

import type { Object as FabricObject } from '../types/fabric';
import BaseCommand from './base';
import consts from '../consts';

const { moduleNames } = consts;
const { MAIN } = moduleNames;

/**
 * Module map type for dependency injection
 */
type ModuleMap = Record<string, {
    getCanvas: () => import('../types/fabric').Canvas;
}>;

/**
 * Creates a command to remove an object from the canvas
 * @param target - The fabric object to remove
 * @returns BaseCommand instance
 */
export default function remove(target: FabricObject): BaseCommand {
    return new BaseCommand({
        /**
         * Execute: remove object from canvas
         * @param moduleMap - Modules injection
         * @returns Promise resolving when object is removed
         */
        execute(moduleMap: ModuleMap): Promise<void> {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();
                const isValidGroup = target && target.isType('group') && !target.isEmpty();

                if (isValidGroup) {
                    canvas.discardActiveGroup(); // restore states for each objects
                    // Use type assertion to handle store property
                    (this as unknown as { store: FabricObject[] }).store = target.getObjects();
                    target.forEachObject((obj: FabricObject) => {
                        obj.remove();
                    });
                    resolve();
                } else if (canvas.contains(target)) {
                    (this as unknown as { store: FabricObject[] }).store = [target];
                    target.remove();
                    resolve();
                } else {
                    reject();
                }
            });
        },
        /**
         * Undo: add object back to canvas
         * @param moduleMap - Modules injection
         * @returns Promise resolving when object is restored
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
