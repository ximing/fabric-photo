import consts from './consts';


import addObject from './commands/add-object';
import remove from './commands/remove';
import clear from './commands/clear';
import loadImage from './commands/load-image.js';
import zoom from './commands/zoom.js';
import rotationImage from './commands/rotation-image.js';
const {commandNames} = consts;
const creators = {};

creators[commandNames.CLEAR_OBJECTS] = clear;
creators[commandNames.ADD_OBJECT] = addObject;
creators[commandNames.REMOVE_OBJECT] = remove;
creators[commandNames.LOAD_IMAGE] = loadImage;
creators[commandNames.ZOOM] = zoom;
creators[commandNames.ROTATE_IMAGE] = rotationImage;

function create(name, ...args) {
    return creators[name].apply(null, args);
}

export default {
    create
};
