import Command from './base';
import consts from '../consts';

const {
    moduleNames
} = consts;
const {
    MAIN
} = moduleNames;
export default function(zoom) {
    return new Command({
        /**
         * @param {object.<string, Component>} moduleMap - Modules injection
         * @returns {Promise}
         * @ignore
         */
        execute(moduleMap) {
            const mainModule = moduleMap[MAIN];
            // const canvas = mainModule.getCanvas();
            // this.zoom = (canvas.viewportTransform[0] || 1);
            // let zoom = rate * (canvas.viewportTransform[0] || 1);
            //直接这么设置是不行的，因为 这个本质上是在设置 transform 会导致坐标系乱套
            // this.zoom = canvas.getZoom();
            // canvas.setZoom(zoom);
            //使用新的方法通过放大canvas本身的方式进行设置
            this.zoom = mainModule.getZoom();//mainModule.getZoom();
            mainModule.setZoom(zoom);
            return Promise.resolve(zoom);
        },
        /**
         * @param {object.<string, Component>} moduleMap - Modules injection
         * @returns {Promise}
         * @ignore
         */
        undo(moduleMap) {
            // const canvas = moduleMap[MAIN].getCanvas();
            // const canvasContext = canvas;
            // canvas.setZoom.call(canvasContext, this.zoom);
            const mainModule = moduleMap[MAIN];
            mainModule.setZoom(this.zoom);
            return Promise.resolve(this.zoom);
        }
    });
}
