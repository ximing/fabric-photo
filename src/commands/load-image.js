import Command from './base';
import consts from '../consts';

const {moduleNames} = consts;
const {IMAGE_LOADER} = moduleNames;
export default function (imageName, img) {
    return new Command({
        execute(moduleMap) {
            const loader = moduleMap[IMAGE_LOADER];
            const canvas = loader.getCanvas();

            this.store = {
                prevName: loader.getImageName(),
                prevImage: loader.getCanvasImage(),
                //"canvas.clear()" 会清除数据,所以用 slice进行一下 深拷贝
                objects: canvas.getObjects().slice()
            };

            canvas.clear();

            return loader.load(imageName, img);

        },
        undo(moduleMap) {
            const loader = moduleMap[IMAGE_LOADER];
            const canvas = loader.getCanvas();
            const store = this.store;
            const canvasContext = canvas;

            canvas.clear();
            canvas.add.apply(canvasContext, store.objects);

            return loader.load(store.prevName, store.prevImage);

        }
    });
}
