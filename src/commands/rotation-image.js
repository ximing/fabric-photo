import Command from './base';
import consts from '../consts';

const {moduleNames} = consts;
export default function(type,angle) {
    return new Command({
        execute(moduleMap) {
            const rotationComp = moduleMap[moduleNames.ROTATION];
            this.store = rotationComp.getCurrentAngle();
            return rotationComp[type](angle);
        },
        undo(moduleMap) {
            const rotationComp = moduleMap[moduleNames.ROTATION];
            return rotationComp.setAngle(this.store);
        }
    });
}
