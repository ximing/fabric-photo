import {fabric} from 'fabric';
const Arrow = fabric.util.createClass(fabric.Path, {
    /**
     * Constructor
     * @param {Object} options Options object
     * @override
     */
    initialize(options) {
        options.type = 'arrow';
        this.callSuper('initialize', options);
        this.on({
            'moving': this._onMoving,
            'scaling': this._onScaling
        });
    },
    objectCaching: false,

    /**
     * Render Crop-zone
     * @param {CanvasRenderingContext2D} ctx - Context
     * @private
     * @override
     */
    _render(ctx) {
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
        this._strokeBorder(ctx, 'rgb(255, 255, 255)', cropzoneDashLineWidth, cropzoneDashLineOffset);

        // Reset scale
        ctx.scale(1 / originalScaleX, 1 / originalScaleY);
    },

    drawControls(ctx) {
        if (!this.hasControls) {
            return this;
        }
        var wh = this._calculateCurrentDimensions(),
            width = wh.x,
            height = wh.y,
            scaleOffset = this.cornerSize,
            left = -(width + scaleOffset) / 2,
            top = -(height + scaleOffset) / 2,
            methodName = this.transparentCorners ? 'stroke' : 'fill';
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = this.cornerColor;
        if (!this.transparentCorners) {
            ctx.strokeStyle = this.cornerStrokeColor;
        }
        this._setLineDash(ctx, this.cornerDashArray, null);
        // top-left
        this._drawControl('tl', ctx, methodName,
            left,
            top);
        // top-right
        this._drawControl('tr', ctx, methodName,
            left + width,
            top);
        // bottom-left
        this._drawControl('bl', ctx, methodName,
            left,
            top + height);
        // bottom-right
        this._drawControl('br', ctx, methodName,
            left + width,
            top + height);
        if (!this.get('lockUniScaling')) {
            // middle-top
            this._drawControl('mt', ctx, methodName,
                left + width / 2,
                top);
            // middle-bottom
            this._drawControl('mb', ctx, methodName,
                left + width / 2,
                top + height);
            // middle-right
            this._drawControl('mr', ctx, methodName,
                left + width,
                top + height / 2);
            // middle-left
            this._drawControl('ml', ctx, methodName,
                left,
                top + height / 2);
        }
        // middle-top-rotate
        if (this.hasRotatingPoint) {
            this._drawControl('mtr', ctx, methodName,
                left + width / 2,
                top - this.rotatingPointOffset);
        }
        ctx.restore();
    }
});
export default Arrow;
