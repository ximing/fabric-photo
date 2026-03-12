/**
 * Cropzone shape class for rendering crop selection zones
 */

import { fabric } from 'fabric';
import util from '../lib/util';

const clamp = util.clamp;

const CORNER_TYPE_TOP_LEFT = 'tl';
const CORNER_TYPE_TOP_RIGHT = 'tr';
const CORNER_TYPE_MIDDLE_TOP = 'mt';
const CORNER_TYPE_MIDDLE_LEFT = 'ml';
const CORNER_TYPE_MIDDLE_RIGHT = 'mr';
const CORNER_TYPE_MIDDLE_BOTTOM = 'mb';
const CORNER_TYPE_BOTTOM_LEFT = 'bl';
const CORNER_TYPE_BOTTOM_RIGHT = 'br';

/**
 * Cropzone coordinates interface
 */
interface CropzoneCoordinates {
    x: number[];
    y: number[];
}

const Cropzone = fabric.util.createClass(fabric.Rect, {
    /**
     * Constructor
     * @param options - Options object
     */
    initialize(options: Record<string, unknown>) {
        options.type = 'cropzone';
        this.callSuper('initialize', options);
        this.on({
            moving: this._onMoving,
            scaling: this._onScaling
        });
    },
    objectCaching: false,

    /**
     * Render Crop-zone
     * @param ctx - Context
     */
    _render(ctx: CanvasRenderingContext2D): void {
        const cropzoneDashLineWidth = 7;
        const cropzoneDashLineOffset = 7;
        this.callSuper('_render', ctx);

        // Calc original scale
        const originalFlipX = this.flipX ? -1 : 1;
        const originalFlipY = this.flipY ? -1 : 1;
        const originalScaleX = originalFlipX / this.scaleX;
        const originalScaleY = originalFlipY / this.scaleY;

        // Set original scale
        ctx.scale(originalScaleX, originalScaleY);

        // Render outer rect
        this._fillOuterRect(ctx, 'rgba(0, 0, 0, 0.55)');

        // Black dash line
        this._strokeBorder(ctx, 'rgb(0, 0, 0)', cropzoneDashLineWidth);

        // White dash line
        this._strokeBorder(
            ctx,
            'rgb(255, 255, 255)',
            cropzoneDashLineWidth,
            cropzoneDashLineOffset
        );

        // Reset scale
        ctx.scale(1 / originalScaleX, 1 / originalScaleY);
    },

    /**
     * Fill outer rectangle
     * @param ctx - Context
     * @param fillStyle - Fill-style
     */
    _fillOuterRect(ctx: CanvasRenderingContext2D, fillStyle: string | CanvasGradient | CanvasPattern): void {
        const coordinates = this._getCoordinates(ctx);
        const x = coordinates.x;
        const y = coordinates.y;

        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.beginPath();

        // Outer rectangle
        // Numbers are +/-1 so that overlay edges don't get blurry.
        ctx.moveTo(x[0] - 1, y[0] - 1);
        ctx.lineTo(x[3] + 1, y[0] - 1);
        ctx.lineTo(x[3] + 1, y[3] + 1);
        ctx.lineTo(x[0] - 1, y[3] - 1);
        ctx.lineTo(x[0] - 1, y[0] - 1);
        ctx.closePath();

        // Inner rectangle
        ctx.moveTo(x[1], y[1]);
        ctx.lineTo(x[1], y[2]);
        ctx.lineTo(x[2], y[2]);
        ctx.lineTo(x[2], y[1]);
        ctx.lineTo(x[1], y[1]);
        ctx.closePath();

        ctx.fill();
        ctx.restore();
    },

    /**
     * Get coordinates
     * @param ctx - Context
     * @returns Coordinates object
     */
    _getCoordinates(ctx: CanvasRenderingContext2D): CropzoneCoordinates {
        const ceil = Math.ceil;
        const width = this.getWidth();
        const height = this.getHeight();
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const left = this.getLeft();
        const top = this.getTop();
        const canvasEl = ctx.canvas as HTMLCanvasElement;

        return {
            x: [
                -(halfWidth + left),
                -halfWidth,
                halfWidth,
                halfWidth + (canvasEl.width - left - width)
            ].map(ceil),
            y: [
                -(halfHeight + top),
                -halfHeight,
                halfHeight,
                halfHeight + (canvasEl.height - top - height)
            ].map(ceil)
        };
    },

    /**
     * Stroke border
     * @param ctx - Context
     * @param strokeStyle - Stroke-style
     * @param lineDashWidth - Dash width
     * @param lineDashOffset - Dash offset
     */
    _strokeBorder(
        ctx: CanvasRenderingContext2D,
        strokeStyle: string | CanvasGradient | CanvasPattern,
        lineDashWidth: number,
        lineDashOffset?: number
    ): void {
        const halfWidth = this.getWidth() / 2;
        const halfHeight = this.getHeight() / 2;

        ctx.save();
        ctx.strokeStyle = strokeStyle;
        if (ctx.setLineDash) {
            ctx.setLineDash([lineDashWidth, lineDashWidth]);
        }
        if (lineDashOffset) {
            ctx.lineDashOffset = lineDashOffset;
        }

        ctx.beginPath();
        ctx.moveTo(-halfWidth, -halfHeight);
        ctx.lineTo(halfWidth, -halfHeight);
        ctx.lineTo(halfWidth, halfHeight);
        ctx.lineTo(-halfWidth, halfHeight);
        ctx.lineTo(-halfWidth, -halfHeight);
        ctx.stroke();

        ctx.restore();
    },

    /**
     * onMoving event listener
     */
    _onMoving(): void {
        const canvas = this.canvas;
        const left = this.getLeft();
        const top = this.getTop();
        const width = this.getWidth();
        const height = this.getHeight();
        const maxLeft = canvas.getWidth() - width;
        const maxTop = canvas.getHeight() - height;

        this.setLeft(clamp(left, 0, maxLeft));
        this.setTop(clamp(top, 0, maxTop));
    },

    /**
     * onScaling event listener
     * @param fEvent - Fabric event
     */
    _onScaling(fEvent: { e: MouseEvent }): void {
        const pointer = this.canvas.getPointer(fEvent.e);
        const settings = this._calcScalingSizeFromPointer(pointer);

        // On scaling cropzone,
        // change real width and height and fix scaleFactor to 1
        this.scale(1).set(settings);
    },

    /**
     * Calc scaled size from mouse pointer with selected corner
     * @param pointer - Mouse position
     * @returns Having left or(and) top or(and) width or(height
     */
    _calcScalingSizeFromPointer(pointer: { x: number; y: number }): Record<string, number> {
        const pointerX = pointer.x;
        const pointerY = pointer.y;
        const tlScalingSize = this._calcTopLeftScalingSizeFromPointer(pointerX, pointerY);
        const brScalingSize = this._calcBottomRightScalingSizeFromPointer(pointerX, pointerY);

        return this._makeScalingSettings(tlScalingSize, brScalingSize);
    },

    /**
     * Calc scaling size(position + dimension) from left-top corner
     * @param x - Mouse position X
     * @param y - Mouse position Y
     * @returns Top-left setting
     */
    _calcTopLeftScalingSizeFromPointer(x: number, y: number): { top: number; left: number; width: number; height: number } {
        const bottom = this.getHeight() + this.top;
        const right = this.getWidth() + this.left;
        const top = clamp(y, 0, bottom - 1);
        const left = clamp(x, 0, right - 1);

        return {
            top,
            left,
            width: right - left,
            height: bottom - top
        };
    },

    /**
     * Calc scaling size from right-bottom corner
     * @param x - Mouse position X
     * @param y - Mouse position Y
     * @returns Bottom-right setting
     */
    _calcBottomRightScalingSizeFromPointer(x: number, y: number): { width: number; height: number } {
        const canvas = this.canvas;
        const maxX = canvas.width;
        const maxY = canvas.height;
        const left = this.left;
        const top = this.top;

        return {
            width: clamp(x, left + 1, maxX) - left,
            height: clamp(y, top + 1, maxY) - top
        };
    },

    /**
     * Make scaling settings
     * @param tl - Top-Left setting
     * @param br - Bottom-Right setting
     * @returns Position setting
     */
    _makeScalingSettings(
        tl: { width: number; height: number; left: number; top: number },
        br: { width: number; height: number }
    ): Record<string, number> {
        const tlWidth = tl.width;
        const tlHeight = tl.height;
        const brHeight = br.height;
        const brWidth = br.width;
        const tlLeft = tl.left;
        const tlTop = tl.top;
        let settings: Record<string, number>;

        switch ((this as unknown as { __corner: string }).__corner) {
            case CORNER_TYPE_TOP_LEFT:
                settings = tl;
                break;
            case CORNER_TYPE_TOP_RIGHT:
                settings = {
                    width: brWidth,
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case CORNER_TYPE_BOTTOM_LEFT:
                settings = {
                    width: tlWidth,
                    height: brHeight,
                    left: tlLeft
                };
                break;
            case CORNER_TYPE_BOTTOM_RIGHT:
                settings = br;
                break;
            case CORNER_TYPE_MIDDLE_LEFT:
                settings = {
                    width: tlWidth,
                    left: tlLeft
                };
                break;
            case CORNER_TYPE_MIDDLE_TOP:
                settings = {
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case CORNER_TYPE_MIDDLE_RIGHT:
                settings = {
                    width: brWidth
                };
                break;
            case CORNER_TYPE_MIDDLE_BOTTOM:
                settings = {
                    height: brHeight
                };
                break;
            default:
                settings = {};
                break;
        }

        return settings;
    },

    /**
     * Return the whether this cropzone is valid
     * @returns Whether this cropzone is valid
     */
    isValid(): boolean {
        return this.left >= 0 && this.top >= 0 && this.width > 0 && this.height > 0;
    }
});

export default Cropzone;
