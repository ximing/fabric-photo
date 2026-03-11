/**
 * Shape resize helper functions for handling shape resizing and origin adjustments
 */

import type { Object } from '../types/fabric.js';

/**
 * Point interface for coordinate values
 */
interface Point {
    x: number;
    y: number;
}

/**
 * Divisor values for different shape types
 */
const DIVISOR: Record<string, number> = {
    rect: 1,
    circle: 2,
    triangle: 1
};

/**
 * Dimension key mappings for different shape types
 */
const DIMENSION_KEYS: Record<string, { w: string; h: string }> = {
    rect: {
        w: 'width',
        h: 'height'
    },
    circle: {
        w: 'rx',
        h: 'ry'
    },
    triangle: {
        w: 'width',
        h: 'height'
    }
};

/**
 * Origin position result from rotation calculation
 */
interface OriginPositions {
    originX: 'left' | 'right';
    originY: 'top' | 'bottom';
}

/**
 * Point coordinates
 */
interface PointCoords {
    x: number;
    y: number;
}

/**
 * Set the start point value to the shape object
 * @param shape - Shape object
 */
function setStartPoint(shape: Object): void {
    const originX = shape.getOriginX();
    const originY = shape.getOriginY();
    const originKey = originX.substring(0, 1) + originY.substring(0, 1);

    const origins = shape.origins as Record<string, Point>;
    shape.startPoint = origins[originKey];
}

/**
 * Get the positions of rotated origin by the pointer value
 * @param origin - Origin value
 * @param pointer - Pointer value
 * @param angle - Rotating angle
 * @returns Positions of origin
 */
function getPositionsOfRotatedOrigin(origin: PointCoords, pointer: PointCoords, angle: number): OriginPositions {
    const sx = origin.x;
    const sy = origin.y;
    const px = pointer.x;
    const py = pointer.y;
    const r = (angle * Math.PI) / 180;
    const rx = (px - sx) * Math.cos(r) - (py - sy) * Math.sin(r) + sx;
    const ry = (px - sx) * Math.sin(r) + (py - sy) * Math.cos(r) + sy;

    return {
        originX: sx > rx ? 'right' : 'left',
        originY: sy > ry ? 'bottom' : 'top'
    };
}

/**
 * Whether the shape has the center origin or not
 * @param shape - Shape object
 * @returns State
 */
function hasCenterOrigin(shape: Object): boolean {
    return shape.getOriginX() === 'center' && shape.getOriginY() === 'center';
}

/**
 * Adjust the origin of shape by the start point
 * @param pointer - Pointer value
 * @param shape - Shape object
 */
function adjustOriginByStartPoint(pointer: PointCoords, shape: Object): void {
    const centerPoint = shape.getPointByOrigin('center', 'center');
    const angle = -shape.getAngle();
    const originPositions = getPositionsOfRotatedOrigin({ x: centerPoint.x, y: centerPoint.y }, pointer, angle);
    const originX = originPositions.originX;
    const originY = originPositions.originY;
    const origin = shape.getPointByOrigin(originX, originY);
    const left = shape.getLeft() - (centerPoint.x - origin.x);
    const top = shape.getTop() - (centerPoint.x - origin.y);

    shape.set({
        originX,
        originY,
        left,
        top
    });

    shape.setCoords();
}

/**
 * Adjust the origin of shape by the moving pointer value
 * @param pointer - Pointer value
 * @param shape - Shape object
 */
function adjustOriginByMovingPointer(pointer: PointCoords, shape: Object): void {
    const origin = shape.startPoint as PointCoords;
    const angle = -shape.getAngle();
    const originPositions = getPositionsOfRotatedOrigin(origin, pointer, angle);
    const originX = originPositions.originX;
    const originY = originPositions.originY;

    shape.setPositionByOrigin(origin, originX, originY);
}

/**
 * Adjust the dimension of shape on firing scaling event
 * @param shape - Shape object
 */
function adjustDimensionOnScaling(shape: Object): void {
    const type = shape.type;
    const dimensionKeys = DIMENSION_KEYS[type];
    const scaleX = shape.scaleX;
    const scaleY = shape.scaleY;
    let width = (shape[dimensionKeys.w] as number) * scaleX;
    let height = (shape[dimensionKeys.h] as number) * scaleY;

    if (shape.isRegular) {
        const maxScale = Math.max(scaleX, scaleY);

        width = (shape[dimensionKeys.w] as number) * maxScale;
        height = (shape[dimensionKeys.h] as number) * maxScale;
    }

    const options: Record<string, unknown> = {
        hasControls: false,
        hasBorders: false,
        scaleX: 1,
        scaleY: 1
    };

    options[dimensionKeys.w] = width;
    options[dimensionKeys.h] = height;

    shape.set(options);
}

/**
 * Adjust the dimension of shape on firing mouse move event
 * @param pointer - Pointer value
 * @param shape - Shape object
 */
function adjustDimensionOnMouseMove(pointer: PointCoords, shape: Object): void {
    const origin = shape.startPoint as PointCoords;
    const type = shape.type;
    const divisor = DIVISOR[type];
    const dimensionKeys = DIMENSION_KEYS[type];
    const strokeWidth = shape.strokeWidth;
    const isTriangle = shape.type === 'triangle';
    const options: Record<string, unknown> = {};
    let width = Math.abs(origin.x - pointer.x) / divisor;
    let height = Math.abs(origin.y - pointer.y) / divisor;

    if (width > strokeWidth) {
        width -= strokeWidth / divisor;
    }

    if (height > strokeWidth) {
        height -= strokeWidth / divisor;
    }

    if (shape.isRegular) {
        width = height = Math.max(width, height);

        if (isTriangle) {
            height = (Math.sqrt(3) / 2) * width;
        }
    }

    options[dimensionKeys.w] = width;
    options[dimensionKeys.h] = height;

    shape.set(options);
}

/**
 * ShapeResizeHelper module exports
 */
interface ShapeResizeHelper {
    /**
     * Set each origin value to shape
     * @param shape - Shape object
     */
    setOrigins(shape: Object): void;

    /**
     * Resize the shape
     * @param shape - Shape object
     * @param pointer - Mouse pointer values on canvas
     * @param isScaling - Whether the resizing action is scaling or not
     */
    resize(shape: Object, pointer: PointCoords, isScaling: boolean): void;

    /**
     * Adjust the origin position of shape to center
     * @param shape - Shape object
     */
    adjustOriginToCenter(shape: Object): void;
}

const shapeResizeHelper: ShapeResizeHelper = {
    /**
     * Set each origin value to shape
     * @param shape - Shape object
     */
    setOrigins(shape: Object): void {
        const leftTopPoint = shape.getPointByOrigin('left', 'top');
        const rightTopPoint = shape.getPointByOrigin('right', 'top');
        const rightBottomPoint = shape.getPointByOrigin('right', 'bottom');
        const leftBottomPoint = shape.getPointByOrigin('left', 'bottom');

        (shape as unknown as { origins: Record<string, Point> }).origins = {
            lt: leftTopPoint,
            rt: rightTopPoint,
            rb: rightBottomPoint,
            lb: leftBottomPoint
        };
    },

    /**
     * Resize the shape
     * @param shape - Shape object
     * @param pointer - Mouse pointer values on canvas
     * @param isScaling - Whether the resizing action is scaling or not
     */
    resize(shape: Object, pointer: PointCoords, isScaling: boolean): void {
        if (hasCenterOrigin(shape)) {
            adjustOriginByStartPoint(pointer, shape);
            setStartPoint(shape);
        }

        if (isScaling) {
            adjustDimensionOnScaling(shape);
        } else {
            adjustDimensionOnMouseMove(pointer, shape);
        }

        adjustOriginByMovingPointer(pointer, shape);
    },

    /**
     * Adjust the origin position of shape to center
     * @param shape - Shape object
     */
    adjustOriginToCenter(shape: Object): void {
        const centerPoint = shape.getPointByOrigin('center', 'center');
        const originX = shape.getOriginX();
        const originY = shape.getOriginY();
        const origin = shape.getPointByOrigin(originX, originY);
        const left = shape.getLeft() + (centerPoint.x - origin.x);
        const top = shape.getTop() + (centerPoint.y - origin.y);

        shape.set({
            hasControls: true,
            hasBorders: true,
            originX: 'center',
            originY: 'center',
            left,
            top
        });

        shape.setCoords();
    }
};

export default shapeResizeHelper;
