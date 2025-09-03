/**
 * Rotation image command - rotates the canvas image
 */

import BaseCommand from './base';
import consts from '../consts';

const { moduleNames } = consts;

/**
 * Rotation module interface
 */
interface RotationModule {
    getCurrentAngle: () => number;
    rotate: (angle: number) => Promise<number | import('../types/fabric.js').Canvas>;
    setAngle: (angle: number) => Promise<number>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * Module map type for dependency injection
 */
type ModuleMap = Record<string, RotationModule>;

/**
 * Creates a command to rotate the canvas image
 * @param type - The type of rotation operation ('rotate' or other)
 * @param angle - The angle to rotate
 * @returns BaseCommand instance
 */
export default function rotationImage(type: string, angle: number): BaseCommand {
    return new BaseCommand({
        /**
         * Execute: rotate the image
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the rotation result
         */
        execute(moduleMap: ModuleMap): Promise<number | import('../types/fabric.js').Canvas> {
            const rotationComp = moduleMap[moduleNames.ROTATION] as RotationModule;
            (this as unknown as { store: number }).store = rotationComp.getCurrentAngle();
            return rotationComp[type](angle);
        },
        /**
         * Undo: restore the previous angle
         * @param moduleMap - Modules injection
         * @returns Promise resolving to the restored angle
         */
        undo(moduleMap: ModuleMap): Promise<number> {
            const rotationComp = moduleMap[moduleNames.ROTATION] as RotationModule;
            const store = (this as unknown as { store: number }).store;
            return rotationComp.setAngle(store);
        }
    });
}
