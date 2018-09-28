import util from '../lib/util';
import Command from './base';
import consts from '../consts';

const {moduleNames} = consts;
const {MAIN} = moduleNames;
export default function(object) {
    util.stamp(object);

    return new Command({
        /**
         * @param {object.<string, Component>} moduleMap - Modules injection
         * @returns {Promise}
         * @ignore
         */
        execute(moduleMap) {
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();

                if (!canvas.contains(object)) {
                    canvas.add(object);
                    resolve(object);
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
            return new Promise((resolve, reject) => {
                const canvas = moduleMap[MAIN].getCanvas();

                if (canvas.contains(object)) {
                    canvas.remove(object);
                    resolve(object);
                } else {
                    reject();
                }
            });
        }
    });
}
