/**
 * Base command class with execute/undo functionality
 */

/**
 * Generic command function type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandFunction = (...args: any[]) => any;

/**
 * Actions interface for command execution.
 */
interface CommandActions {
    execute: CommandFunction;
    undo: CommandFunction;
}

/**
 * Callback type for execute/undo hooks.
 */
type CommandCallback = (...args: unknown[]) => unknown;

export default class BaseCommand {
    execute: CommandFunction;
    undo: CommandFunction;
    executeCallback: CommandCallback | null;
    undoCallback: CommandCallback | null;

    constructor(actions: CommandActions) {
        this.execute = actions.execute;
        this.undo = actions.undo;

        this.executeCallback = null;
        this.undoCallback = null;
    }

    setExecuteCallback(callback: CommandCallback): this {
        this.executeCallback = callback;
        return this;
    }

    setUndoCallback(callback: CommandCallback): this {
        this.undoCallback = callback;
        return this;
    }
}
