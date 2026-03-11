/**
 * Add object command - adds an object to canvas
 */

import type { Canvas, Object as FabricObject } from '../types/fabric';
import util from '../lib/util';
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
 * Creates a command to add an object to the canvas
 * @param object - The fabric object to add
 * @returns BaseCommand instance
 */
export default function addObject(object: FabricObject): BaseCommand {
    util.stamp(object);

    return new BaseCommand({
        /**
         * Execute: add object to canvas
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the added object
         */
        execute(moduleMap: ModuleMap): Promise<FabricObject> {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();

                if (!canvas.contains(object)) {
                    canvas.add(object);
                    resolve(object);
                } else {
                    reject();
                }
            });
        },
        /**
         * Undo: remove object from canvas
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the removed object
         */
        undo(moduleMap: ModuleMap): Promise<FabricObject> {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();

                if (canvas.contains(object)) {
                    canvas.remove(object);
                    resolve(object);
                } else {
                    reject();
                }
            });
        }
    });
}
