/**
 * Base command class with execute/undo functionality
 */

type CommandFunction = () => void;

/**
 * Actions interface for command execution
 */
interface CommandActions {
    execute: CommandFunction;
    undo: CommandFunction;
}

/**
 * Callback type for execute/undo hooks
 */
type CommandCallback = () => void;

export default class BaseCommand {
    private readonly executeFn: CommandFunction;
    private readonly undoFn: CommandFunction;
    private executeCallback: CommandCallback | null;
    private undoCallback: CommandCallback | null;

    constructor(actions: CommandActions) {
        this.executeFn = actions.execute;
        this.undoFn = actions.undo;
        this.executeCallback = null;
        this.undoCallback = null;
    }

    execute(): void {
        if (this.executeCallback) {
            this.executeCallback();
        }
    }

    undo(): void {
        if (this.undoCallback) {
            this.undoCallback();
        }
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
