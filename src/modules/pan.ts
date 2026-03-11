/**
 * Pan module
 * Provides panning functionality on canvas
 */
import { fabric } from 'fabric';
import type { Object as FabricObject } from '../types/fabric';
import ModuleBase from './base';
import consts from '../consts';

interface PanListeners {
    mousedown: (fEvent: { target: FabricObject; e: MouseEvent }) => void;
    mousemove: (fEvent: { e: MouseEvent }) => void;
    mouseup: (fEvent: { e: MouseEvent }) => void;
}

interface PanPointer {
    x: number;
    y: number;
}

export default class Pan extends ModuleBase {
    private _listeners: PanListeners = {
        mousedown: this._onFabricMouseDown.bind(this),
        mousemove: this._onFabricMouseMove.bind(this),
        mouseup: this._onFabricMouseUp.bind(this)
    };

    private pointer: PanPointer | null = null;

    private $lower: HTMLCanvasElement | null = null;

    private $upper: HTMLCanvasElement | null = null;

    private $wrapper: HTMLElement | null = null;

    private deltaX: number = 0;

    private deltaY: number = 0;

    private deltaWidth: number = 0;

    private deltaHeight: number = 0;

    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.PAN;
    }

    start(): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'move';
        canvas.selection = false;

        canvas.forEachObject((obj: FabricObject) => {
            obj.set({
                evented: false
            });
        });

        canvas.on({
            'mouse:down': this._listeners.mousedown
        });
    }

    end(): void {
        const canvas = this.getCanvas();

        canvas.defaultCursor = 'default';
        canvas.selection = false;

        canvas.forEachObject((obj: FabricObject) => {
            obj.set({
                evented: true
            });
        });

        canvas.off('mouse:down', this._listeners.mousedown);
    }

    /**
     * Mousedown event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseDown(fEvent: { target: FabricObject; e: MouseEvent }): void {
        const canvas = this.getCanvas();
        this.pointer = canvas.getPointer(fEvent.e);
        this.$lower = canvas.lowerCanvasEl;
        this.$upper = canvas.upperCanvasEl;
        this.$wrapper = canvas.wrapperEl;

        if (!this.$lower || !this.$upper || !this.$wrapper) {
            return;
        }

        this.deltaX = parseInt(window.getComputedStyle(this.$lower).left, 10);
        this.deltaY = parseInt(window.getComputedStyle(this.$lower).top, 10);
        this.deltaWidth =
            this.$upper.getBoundingClientRect().width - this.$wrapper.getBoundingClientRect().width;
        this.deltaHeight =
            this.$upper.getBoundingClientRect().height - this.$wrapper.getBoundingClientRect().height;
        canvas.on({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }

    /**
     * Mousemove event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseMove(fEvent: { e: MouseEvent }): void {
        const canvas = this.getCanvas();
        const movePointer = canvas.getPointer(fEvent.e);

        if (!this.pointer) {
            return;
        }

        let deltaX = this.deltaX + movePointer.x - this.pointer.x;
        let deltaY = this.deltaY + movePointer.y - this.pointer.y;

        if (this.$lower && this.$upper) {
            if (this.deltaWidth > Math.abs(deltaX) && deltaX < 0) {
                this.$lower.style.left = `${deltaX}px`;
                this.$upper.style.left = `${deltaX}px`;
                this.deltaX = deltaX;
            }
            if (this.deltaHeight > Math.abs(deltaY) && deltaY < 0) {
                this.$lower.style.top = `${deltaY}px`;
                this.$upper.style.top = `${deltaY}px`;
                this.deltaY = deltaY;
            }
        }
    }

    /**
     * Mouseup event handler in fabric canvas
     * @param fEvent - Fabric event object
     * @private
     */
    _onFabricMouseUp(): void {
        const canvas = this.getCanvas();
        this.pointer = null;
        this.$lower = null;
        this.$upper = null;
        canvas.off({
            'mouse:move': this._listeners.mousemove,
            'mouse:up': this._listeners.mouseup
        });
    }
}
