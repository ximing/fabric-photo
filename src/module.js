import CustomEvents from './lib/custom-event';

import Main from './modules/main';
import Draw from './modules/draw';
import Text from './modules/text';
import ImageLoader from './modules/image-loader';
import Rotation from './modules/rotation';
import Shape from './modules/shape';
import Line from './modules/line';
import Arrow from './modules/arrow';
import Cropper from './modules/cropper';
import Mosaic from './modules/mosaic';
import Pan from './modules/pan';

import consts from './consts';

import util from './lib/util.js';

const { eventNames, rejectMessages } = consts;

export default class {
    constructor() {
        this._customEvents = new CustomEvents();

        this._undoStack = [];
        this._redoStack = [];

        this._moduleMap = {};

        /* Lock-flag for executing command*/
        this._isLocked = false;

        this._createModules();
    }

    _createModules() {
        const main = new Main();

        this._register(main);
        this._register(new Draw(main));
        this._register(new Text(main));
        this._register(new ImageLoader(main));
        this._register(new Mosaic(main));
        this._register(new Rotation(main));
        this._register(new Shape(main));
        this._register(new Line(main));
        this._register(new Arrow(main));
        this._register(new Cropper(main));
        this._register(new Pan(main));
    }

    _register(component) {
        this._moduleMap[component.getName()] = component;
    }

    _invokeExecution(command) {
        this.lock();

        return command
            .execute(this._moduleMap)
            .then((value) => {
                this.pushUndoStack(command);
                this.unlock();
                if (util.isFunction(command.executeCallback)) {
                    command.executeCallback(value);
                }

                return value;
            })
            .catch((err) => {
                this.unlock();
                console.error(err);
            }) // do nothing with exception
            .then((value) => {
                this.unlock();

                return value;
            });
    }

    _invokeUndo(command) {
        this.lock();

        return command
            .undo(this._moduleMap)
            .then((value) => {
                this.pushRedoStack(command);
                this.unlock();
                if (util.isFunction(command.undoCallback)) {
                    command.undoCallback(value);
                }

                return value;
            })
            .catch(() => {
                this.unlock();
                console.error(err);
            }) //TODO  do nothing with exception
            .then((value) => {
                this.unlock();

                return value;
            });
    }

    _fire(...args) {
        const event = this._customEvents;
        const eventContext = event;
        event.emit.apply(eventContext, args);
    }

    on(...args) {
        const event = this._customEvents;
        const eventContext = event;
        event.on.apply(eventContext, args);
    }

    getModule(name) {
        return this._moduleMap[name];
    }

    lock() {
        this._isLocked = true;
    }

    unlock() {
        this._isLocked = false;
    }

    /**
     * 执行命令
     * 存储命令到undo然后清除 redoStack
     * @param {Command} command - Command
     * @returns {Promise}
     */
    invoke(command) {
        if (this._isLocked) {
            return Promise.reject(rejectMessages.isLock);
        }

        return this._invokeExecution(command).then((value) => {
            this.clearRedoStack();

            return value;
        });
    }

    //undo命令
    undo() {
        let command = this._undoStack.pop();
        let promise;

        if (command && this._isLocked) {
            this.pushUndoStack(command, true);
            command = null;
        }
        if (command) {
            if (this.isEmptyUndoStack()) {
                this._fire(eventNames.EMPTY_UNDO_STACK);
            }
            promise = this._invokeUndo(command);
        } else {
            promise = Promise.reject(rejectMessages.undo);
        }

        return promise;
    }

    //redo命令
    redo() {
        let command = this._redoStack.pop();

        let promise;

        if (command && this._isLocked) {
            this.pushRedoStack(command, true);
            command = null;
        }
        if (command) {
            if (this.isEmptyRedoStack()) {
                this._fire(eventNames.EMPTY_REDO_STACK);
            }
            promise = this._invokeExecution(command);
        } else {
            promise = Promise.reject(rejectMessages.redo);
        }

        return promise;
    }

    /**
     * Push undo stack
     * @param {Command} command - command
     * @param {boolean} [isSilent] - Fire event or not
     */
    pushUndoStack(command, isSilent) {
        this._undoStack.push(command);
        if (!isSilent) {
            this._fire(eventNames.PUSH_UNDO_STACK);
        }
    }

    pushRedoStack(command, isSilent) {
        this._redoStack.push(command);
        if (!isSilent) {
            this._fire(eventNames.PUSH_REDO_STACK);
        }
    }

    isEmptyRedoStack() {
        return this._redoStack.length === 0;
    }

    isEmptyUndoStack() {
        return this._undoStack.length === 0;
    }

    clearUndoStack() {
        if (!this.isEmptyUndoStack()) {
            this._undoStack = [];
            this._fire(eventNames.EMPTY_UNDO_STACK);
        }
    }

    clearRedoStack() {
        if (!this.isEmptyRedoStack()) {
            this._redoStack = [];
            this._fire(eventNames.EMPTY_REDO_STACK);
        }
    }
}
