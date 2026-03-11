import type { Canvas, Object as FabricObject } from './types/fabric.js';
import consts from './consts.js';

import addObject from './commands/add-object';
import remove from './commands/remove';
import clear from './commands/clear';
import loadImage from './commands/load-image.js';
import zoom from './commands/zoom.js';
import rotationImage from './commands/rotation-image.js';

const { commandNames } = consts;

/**
 * Command executor interface
 */
interface CommandExecutor {
    (canvas: Canvas, ...args: unknown[]): FabricObject | void;
}

/**
 * Command creators map
 */
type CommandCreators = Record<string, CommandExecutor>;

const creators: CommandCreators = {};

creators[commandNames.CLEAR_OBJECTS] = clear as CommandExecutor;
creators[commandNames.ADD_OBJECT] = addObject as CommandExecutor;
creators[commandNames.REMOVE_OBJECT] = remove as CommandExecutor;
creators[commandNames.LOAD_IMAGE] = loadImage as CommandExecutor;
creators[commandNames.ZOOM] = zoom as CommandExecutor;
creators[commandNames.ROTATE_IMAGE] = rotationImage as CommandExecutor;

/**
 * Create a command by name
 * @param name - Command name
 * @param args - Arguments to pass to the command
 * @returns The result of command execution
 */
function create(name: string, ...args: unknown[]): FabricObject | void {
    const creator = creators[name];
    if (!creator) {
        throw new Error(`Unknown command: ${name}`);
    }
    return creator.apply(null, [args[0], args[1], args[2], args[3], args[4]]);
}

export default {
    create
};
