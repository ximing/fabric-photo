/**
 * Rotation module
 * Provides rotation functionality for canvas images
 */
import { fabric } from 'fabric';
import type { Object as FabricObject } from '../types/fabric';
import ModuleBase from './base';
import consts from '../consts';

const { rejectMessages } = consts;

export default class Rotation extends ModuleBase {
    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.ROTATION;
    }

    getCurrentAngle(): number {
        const canvasImage = this.getCanvasImage();
        return canvasImage ? canvasImage.angle : 0;
    }

    /**
     * Set angle of the image
     *
     *  Do not call "this.setImageProperties" for setting angle directly.
     *  Before setting angle, The originX,Y of image should be set to center.
     *      See "http://fabricjs.com/docs/fabric.Object.html#setAngle"
     *
     * @param angle - Angle value
     * @returns Promise
     */
    setAngle(angle: number): Promise<number> {
        const oldAngle = this.getCurrentAngle() % 360;

        angle %= 360;
        if (angle === oldAngle) {
            return Promise.reject(rejectMessages.rotation);
        }
        const canvasImage = this.getCanvasImage();
        if (!canvasImage) {
            return Promise.reject(rejectMessages.rotation);
        }
        const oldImageCenter = canvasImage.getCenterPoint();
        canvasImage.setAngle(angle).setCoords();
        this.adjustCanvasDimension();
        const newImageCenter = canvasImage.getCenterPoint();
        this._rotateForEachObject(oldImageCenter, newImageCenter, angle - oldAngle);

        return Promise.resolve(angle);
    }

    /**
     * Rotate for each object
     * @param oldImageCenter - Image center point before rotation
     * @param newImageCenter - Image center point after rotation
     * @param angleDiff - Image angle difference after rotation
     * @private
     */
    _rotateForEachObject(oldImageCenter: any, newImageCenter: any, angleDiff: number): void {
        const canvas = this.getCanvas();
        const centerDiff = {
            x: oldImageCenter.x - newImageCenter.x,
            y: oldImageCenter.y - newImageCenter.y
        };

        canvas.forEachObject((obj: FabricObject) => {
            const objCenter = obj.getCenterPoint();
            const radian = fabric.util.degreesToRadians(angleDiff);
            const newObjCenter = fabric.util.rotatePoint(objCenter, oldImageCenter, radian);

            obj.set({
                left: newObjCenter.x - centerDiff.x,
                top: newObjCenter.y - centerDiff.y,
                angle: (obj.angle + angleDiff) % 360
            });
            obj.setCoords();
        });
        canvas.renderAll();
    }

    /**
     * Rotate the image
     * @param additionalAngle - Additional angle
     * @returns Promise
     */
    rotate(additionalAngle: number): Promise<number> {
        const current = this.getCurrentAngle();

        return this.setAngle(current + additionalAngle);
    }
}
