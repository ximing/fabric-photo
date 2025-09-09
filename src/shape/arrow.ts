/**
 * Arrow shape class for rendering crop-zone with arrow style
 */

import { fabric } from 'fabric';
import type { Object } from '../types/fabric.js';

const Arrow = fabric.util.createClass(fabric.Path, {
    /**
     * Constructor
     * @param options - Options object
     */
    initialize(options: Record<string, unknown>) {
        options.type = 'arrow';
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
     * @returns Coordinates object with x and y arrays
     */
    _getCoordinates(ctx: CanvasRenderingContext2D): { x: number[]; y: number[] } {
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
            case 'tl':
                settings = tl;
                break;
            case 'tr':
                settings = {
                    width: brWidth,
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case 'bl':
                settings = {
                    width: tlWidth,
                    height: brHeight,
                    left: tlLeft
                };
                break;
            case 'br':
                settings = br;
                break;
            case 'ml':
                settings = {
                    width: tlWidth,
                    left: tlLeft
                };
                break;
            case 'mt':
                settings = {
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case 'mr':
                settings = {
                    width: brWidth
                };
                break;
            case 'mb':
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

    drawControls(ctx: CanvasRenderingContext2D): Object {
        if (!this.hasControls) {
            return this;
        }
        const wh = this._calculateCurrentDimensions();
        const width = wh.x;
        const height = wh.y;
        const scaleOffset = this.cornerSize;
        const left = -(width + scaleOffset) / 2;
        const top = -(height + scaleOffset) / 2;
        const methodName = this.transparentCorners ? 'stroke' : 'fill';
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = this.cornerColor;
        if (!this.transparentCorners) {
            ctx.strokeStyle = this.cornerStrokeColor;
        }
        this._setLineDash(ctx, this.cornerDashArray, null);
        // top-left
        this._drawControl('tl', ctx, methodName, left, top);
        // top-right
        this._drawControl('tr', ctx, methodName, left + width, top);
        // bottom-left
        this._drawControl('bl', ctx, methodName, left, top + height);
        // bottom-right
        this._drawControl('br', ctx, methodName, left + width, top + height);
        if (!this.get('lockUniScaling')) {
            // middle-top
            this._drawControl('mt', ctx, methodName, left + width / 2, top);
            // middle-bottom
            this._drawControl('mb', ctx, methodName, left + width / 2, top + height);
            // middle-right
            this._drawControl('mr', ctx, methodName, left + width, top + height / 2);
            // middle-left
            this._drawControl('ml', ctx, methodName, left, top + height / 2);
        }
        // middle-top-rotate
        if (this.hasRotatingPoint) {
            this._drawControl(
                'mtr',
                ctx,
                methodName,
                left + width / 2,
                top - this.rotatingPointOffset
            );
        }
        ctx.restore();
        return this;
    }
});

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export default Arrow;
