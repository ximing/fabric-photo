/**
 * Mosaic shape class for rendering mosaic effect on canvas
 */

import { fabric } from 'fabric';

/**
 * Mosaic rectangle item
 */
interface MosaicRectItem {
    left: number;
    top: number;
    dimensions: number;
    fill: string;
}

/**
 * Point interface
 */
interface Point {
    left: number;
    top: number;
}

const Mosaic = fabric.util.createClass(fabric.Object, {
    type: 'mosaic',
    objectCaching: false,

    /**
     * Initialize the mosaic object
     * @param options - Options object
     */
    initialize(options?: Object) {
        options = options || {};

        (this as unknown as { _minPoint: Point })._minPoint = { left: 0, top: 0 };

        (this as unknown as { _maxPoint: Point })._maxPoint = { left: 0, top: 0 };

        (this as unknown as { _mosaicRects: MosaicRectItem[] })._mosaicRects = [];

        this.callSuper('initialize', options);

        this.addMosicRectWithUpdate((options as { mosaicRects?: MosaicRectItem[] }).mosaicRects || []);
    },

    /**
     * Convert to object
     * @returns Object representation
     */
    toObject(): Record<string, unknown> {
        return fabric.util.object.extend(this.callSuper('toObject'), {
            _mosaicRects: this.get('_mosaicRects')
        });
    },

    /**
     * Render the mosaic
     * @param ctx - Canvas context
     */
    _render(ctx: CanvasRenderingContext2D): void {
        const mosaicRects = (this as unknown as { _mosaicRects: MosaicRectItem[] })._mosaicRects;
        mosaicRects.forEach((item) => {
            ctx.fillStyle = item.fill;
            ctx.fillRect(item.left, item.top, item.dimensions, item.dimensions);
        });
    },

    /**
     * Add mosaic rectangles
     * @param objects - Array of mosaic rectangle items
     */
    addMosaicRect(objects: MosaicRectItem[]): void {
        const minPoint = (this as unknown as { _minPoint: Point })._minPoint;
        const maxPoint = (this as unknown as { _maxPoint: Point })._maxPoint;
        const mosaicRects = (this as unknown as { _mosaicRects: MosaicRectItem[] })._mosaicRects;

        objects.forEach((object) => {
            if (object.left < minPoint.left || object.top < minPoint.top) {
                (this as unknown as { _minPoint: Point })._minPoint = {
                    left: object.left,
                    top: object.top
                };
            }
            if (object.left > maxPoint.left || object.top > maxPoint.top) {
                (this as unknown as { _maxPoint: Point })._maxPoint = {
                    left: object.left,
                    top: object.top
                };
            }
            mosaicRects.push({
                left: object.left,
                top: object.top,
                dimensions: object.dimensions,
                fill: object.fill
            });
        });
    },

    /**
     * Add mosaic rectangles with update
     * @param objects - Array of mosaic rectangle items
     */
    addMosicRectWithUpdate(objects: MosaicRectItem[]): void {
        this.addMosaicRect(objects);
        const minPoint = (this as unknown as { _minPoint: Point })._minPoint;
        const maxPoint = (this as unknown as { _maxPoint: Point })._maxPoint;
        this.set({
            width: maxPoint.left - minPoint.left,
            height: maxPoint.top - minPoint.top,
            left: minPoint.left,
            top: minPoint.top,
            selectable: false
        });
    }
});

export default Mosaic;
