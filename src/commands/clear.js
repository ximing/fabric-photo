import Command from './base';
import consts from '../consts';

const {moduleNames} = consts;
const {MAIN} = moduleNames;
export default function () {
    return new Command({
        /**
         * @param {object.<string, Component>} moduleMap - Components injection
         * @returns {Promise}
         * @ignore
         */
        execute(moduleMap) {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();
                const objs = canvas.getObjects();

                // Slice: "canvas.clear()" clears the objects array, So shallow copy the array
                this.store = objs.slice();
                objs.slice().forEach(obj => {
                    if(obj.get('type') === 'group') {
                        canvas.remove(obj);
                    }else{
                        obj.remove();
                    }
                });
                resolve();
            });
        },
        /**
         * @param {object.<string, Component>} moduleMap - Components injection
         * @returns {Promise}
         * @ignore
         */
        undo(moduleMap) {
            const canvas = moduleMap[MAIN].getCanvas();
            const canvasContext = canvas;

            canvas.add.apply(canvasContext, this.store);

            return Promise.resolve();
        }
    });
}
