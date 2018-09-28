import Command from './base';
import consts from '../consts';

const {moduleNames} = consts;
const {MAIN} = moduleNames;
export default function(target) {
    return new Command({
        /**
         * @param {object.<string, Component>} moduleMap - Modules injection
         * @returns {Promise}
         * @ignore
         */
        execute(moduleMap) {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();
                const isValidGroup = target && target.isType('group') && !target.isEmpty();

                if (isValidGroup) {
                    canvas.discardActiveGroup(); // restore states for each objects
                    this.store = target.getObjects();
                    target.forEachObject(obj => {
                        obj.remove();
                    });
                    resolve();
                } else if (canvas.contains(target)) {
                    this.store = [target];
                    target.remove();
                    resolve();
                } else {
                    reject();
                }
            });
        },
        /**
         * @param {object.<string, Component>} moduleMap - Modules injection
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
