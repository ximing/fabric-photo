import util from './lib/util';

export default {
    /**
     * Component names
     * @type {Object.<string, string>}
     */
    moduleNames: util.keyMirror(
        'MAIN',
        'IMAGE_LOADER',
        'CROPPER',
        'FLIP',
        'ROTATION',
        'FREE_DRAWING',
        'LINE',
        'ARROW',
        'TEXT',
        'ICON',
        'FILTER',
        'SHAPE',
        'MOSAIC',
        'PAN'
    ),

    /**
     * Command names
     * @type {Object.<string, string>}
     */
    commandNames: util.keyMirror(
        'CLEAR',
        'LOAD_IMAGE',
        'FLIP_IMAGE',
        'ROTATE_IMAGE',
        'ADD_OBJECT',
        'REMOVE_OBJECT',
        'APPLY_FILTER',
        'ZOOM'
    ),

    /**
     * Event names
     * @type {Object.<string, string>}
     */
    eventNames: {
        LOAD_IMAGE: 'loadImage',
        CLEAR_OBJECTS: 'clearObjects',
        CLEAR_IMAGE: 'clearImage',
        START_CROPPING: 'startCropping',
        END_CROPPING: 'endCropping',
        FLIP_IMAGE: 'flipImage',
        ROTATE_IMAGE: 'rotateImage',
        ADD_OBJECT: 'addObject',
        SELECT_OBJECT: 'selectObject',
        REMOVE_OBJECT: 'removeObject',
        ADJUST_OBJECT: 'adjustObject',
        START_FREE_DRAWING: 'startFreeDrawing',
        END_FREE_DRAWING: 'endFreeDrawing',
        START_LINE_DRAWING: 'startLineDrawing',
        END_LINE_DRAWING: 'endLineDrawing',
        START_PAN: 'startPan',
        END_PAN: 'endPan',
        START_ARROW_DRAWING: 'startArrowDrawing',
        END_ARROW_DRAWING: 'endArrowDrawing',
        START_MOSAIC_DRAWING: 'startMosaicDrawing',
        END_MOSAIC_DRAWING: 'endMosaicDrawing',
        EMPTY_REDO_STACK: 'emptyRedoStack',
        EMPTY_UNDO_STACK: 'emptyUndoStack',
        PUSH_UNDO_STACK: 'pushUndoStack',
        PUSH_REDO_STACK: 'pushRedoStack',
        ACTIVATE_TEXT: 'activateText',
        APPLY_FILTER: 'applyFilter',
        EDIT_TEXT: 'editText',
        MOUSE_DOWN: 'mousedown',
        CHANGE_ZOOM:'changeZoom'
    },

    /**
     * Editor states
     * @type {Object.<string, string>}
     */
    states: util.keyMirror(
        'NORMAL',
        'CROP',
        'FREE_DRAWING',
        'LINE',
        'ARROW',
        'MOSAIC',
        'TEXT',
        'SHAPE',
        'PAN'
    ),

    /**
     * Shortcut key values
     * @type {Object.<string, number>}
     */
    keyCodes: {
        Z: 90,
        Y: 89,
        SHIFT: 16,
        BACKSPACE: 8,
        DEL: 46
    },

    /**
     * Fabric object options
     * @type {Object.<string, Object>}
     */
    fObjectOptions: {
        SELECTION_STYLE: {
            borderColor: '#118BFB',
            cornerColor: '#FFFFFF',
            cornerStrokeColor:'#118BFB',
            cornerSize: 12,
            padding:1,
            originX: 'center',
            originY: 'center',
            transparentCorners: false,
            cornerStyle:'circle'
        }
    },

    rejectMessages: {
        flip: 'The flipX and flipY setting values are not changed.',
        rotation: 'The current angle is same the old angle.',
        loadImage: 'The background image is empty.',
        isLock: 'The executing command state is locked.',
        undo: 'The promise of undo command is reject.',
        redo: 'The promise of redo command is reject.'
    },

    MOUSE_MOVE_THRESHOLD:10
};
