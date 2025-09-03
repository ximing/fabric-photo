/**
 * Zoom command - changes canvas zoom level
 */

import BaseCommand from './base';
import consts from '../consts';

const { moduleNames } = consts;
const { MAIN } = moduleNames;

/**
 * Module map type for dependency injection
 */
type ModuleMap = Record<string, {
    getZoom: () => number;
    setZoom: (zoom: number) => number;
}>;

/**
 * Creates a command to change canvas zoom level
 * @param zoom - The target zoom level
 * @returns BaseCommand instance
 */
export default function zoom(zoom: number): BaseCommand {
    return new BaseCommand({
        /**
         * Execute: set canvas zoom to target level
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the new zoom level
         */
        execute(moduleMap: ModuleMap): Promise<number> {
            const mainModule = moduleMap[MAIN];
            // Store current zoom level for undo
            (this as unknown as { zoom: number }).zoom = mainModule.getZoom();
            mainModule.setZoom(zoom);
            return Promise.resolve(zoom);
        },
        /**
         * Undo: restore previous zoom level
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the restored zoom level
         */
        undo(moduleMap: ModuleMap): Promise<number> {
            const mainModule = moduleMap[MAIN];
            const storedZoom = (this as unknown as { zoom: number }).zoom;
            mainModule.setZoom(storedZoom);
            return Promise.resolve(storedZoom);
        }
    });
}
