export default class {
    constructor(actions) {

        this.execute = actions.execute;

        this.undo = actions.undo;

        this.executeCallback = null;

        this.undoCallback = null;
    }

    execute() {
        throw new Error('没有实现execute方法');
    }

    undo() {
        throw new Error('没有实现undo方法');
    }

    setExecuteCallback(callback) {
        this.executeCallback = callback;
        return this;
    }

    setUndoCallback(callback) {
        this.undoCallback = callback;
        return this;
    }
}
