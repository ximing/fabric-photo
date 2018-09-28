import {fabric} from 'fabric';
import Base from './base';
import consts from '../consts';
import util from '../lib/util';

const defaultStyles = {
    fill: '#000000',
    left: 0,
    top: 0
};
const resetStyles = {
    fill: '#000000',
    fontStyle: 'normal',
    fontWeight: 'normal',
    textAlign: 'left',
    textDecoraiton: ''
};
const browser = util.browser;

const TEXTAREA_CLASSNAME = 'fabric-photo-eidtor-textarea';
const TEXTAREA_STYLES = util.makeStyleText({
    position: 'absolute',
    padding: 0,
    display: 'none',
    border: '1px dotted red',
    overflow: 'hidden',
    resize: 'none',
    outline: 'none',
    'border-radius': 0,
    'background-color': 'transparent',
    '-webkit-appearance': 'none',
    'z-index': 99999,
    'white-space': 'pre'
});

const EXTRA_PIXEL_LINEHEIGHT = 0.1;
const DBCLICK_TIME = 500;

export default class Text extends Base {
    constructor(parent) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.TEXT;
        this._defaultStyles = defaultStyles;
        this._isSelected = false;
        this._selectedObj = {};

        /*Editing text object*/
        this._editingObj = {};

        /*Listeners for fabric event*/
        this._listeners = {};

        //文本编辑框
        this._textarea = null;

        /*Ratio of current canvas*/
        this._ratio = 1;

        this._lastClickTime = (new Date()).getTime();

        /*Text object infos before editing*/
        this._editingObjInfos = {};

        /*Previous state of editing*/
        this.isPrevEditing = false;
    }

    start(listeners) {
        const canvas = this.getCanvas();

        this._listeners = listeners;

        canvas.selection = false;
        canvas.defaultCursor = 'text';
        canvas.on({
            'mouse:down': this._listeners.mousedown,
            'object:selected': this._listeners.select,
            'before:selection:cleared': this._listeners.selectClear,
            'object:scaling': this._onFabricScaling
        });

        this._createTextarea();

        this.setCanvasRatio();
    }

    end() {
        const canvas = this.getCanvas();

        canvas.selection = false;
        canvas.defaultCursor = 'default';
        canvas.deactivateAllWithDispatch(); // action for undo stack
        canvas.off({
            'mouse:down': this._listeners.mousedown,
            'object:selected': this._listeners.select,
            'before:selection:cleared': this._listeners.selectClear,
            'object:scaling': this._onFabricScaling
        });

        this._removeTextarea();

        this._listeners = {};
    }

    /**
     * Add new text on canvas image
     * @param {string} text - Initial input text
     * @param {object} options - Options for generating text
     *     @param {object} [options.styles] Initial styles
     *         @param {string} [options.styles.fill] Color
     *         @param {string} [options.styles.fontFamily] Font type for text
     *         @param {number} [options.styles.fontSize] Size
     *         @param {string} [options.styles.fontStyle] Type of inclination (normal / italic)
     *         @param {string} [options.styles.fontWeight] Type of thicker or thinner looking (normal / bold)
     *         @param {string} [options.styles.textAlign] Type of text align (left / center / right)
     *         @param {string} [options.styles.textDecoraiton] Type of line (underline / line-throgh / overline)
     *     @param {{x: number, y: number}} [options.position] - Initial position
     * @param {boolean} defaultEdit default start edit
     */
    add(text, options,defaultEdit=false) {
        const canvas = this.getCanvas();
        let styles = this._defaultStyles;

        this._setInitPos(options.position);

        if (options.styles) {
            styles = Object.assign(styles,options.styles);
        }

        const newText = new fabric.Text(text, styles);
        newText.set(consts.fObjectOptions.SELECTION_STYLE);
        newText.set({objectCaching:false});
        newText.setControlsVisibility({
            bl:true,br:true,mb:false,ml:false,mr:false,mt:false,tl:true,tr:true,mtr:true
        });
        newText.on({
            mouseup: this._onFabricMouseUp.bind(this)
        });

        canvas.add(newText);

        if (!canvas.getActiveObject()) {
            canvas.setActiveObject(newText);
            if(defaultEdit){
                this._changeToEditingMode(newText);
                this._lastClickTime = (new Date()).getTime();
                this._listeners.dbclick(); // fire dbclick event
            }
        }

        this.isPrevEditing = true;
    }

    /**
     * Change text of activate object on canvas image
     * @param {object} activeObj - Current selected text object
     * @param {string} text - Changed text
     */
    change(activeObj, text) {
        activeObj.set('text', text);

        this.getCanvas().renderAll();
    }

    /**
     * Set style
     * @param {object} activeObj - Current selected text object
     * @param {object} styleObj - Initial styles
     *     @param {string} [styleObj.fill] Color
     *     @param {string} [styleObj.fontFamily] Font type for text
     *     @param {number} [styleObj.fontSize] Size
     *     @param {string} [styleObj.fontStyle] Type of inclination (normal / italic)
     *     @param {string} [styleObj.fontWeight] Type of thicker or thinner looking (normal / bold)
     *     @param {string} [styleObj.textAlign] Type of text align (left / center / right)
     *     @param {string} [styleObj.textDecoraiton] Type of line (underline / line-throgh / overline)
     */
    setStyle(activeObj, styleObj) {
        util.forEach(styleObj, (val, key) => {
            if (activeObj[key] === val) {
                styleObj[key] = resetStyles[key] || '';
            }
        }, this);

        activeObj.set(styleObj);

        this.getCanvas().renderAll();
    }

    /**
     * Set infos of the current selected object
     * @param {fabric.Text} obj - Current selected text object
     * @param {boolean} state - State of selecting
     */
    setSelectedInfo(obj, state) {
        this._selectedObj = obj;
        this._isSelected = state;
    }

    /**
     * Whether object is selected or not
     * @returns {boolean} State of selecting
     */
    isSelected() {
        return this._isSelected;
    }

    /**
     * Get current selected text object
     * @returns {fabric.Text} Current selected text object
     */
    getSelectedObj() {
        return this._selectedObj;
    }

    /**
     * Set ratio value of canvas
     */
    setCanvasRatio() {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;

        this._ratio = ratio;
    }

    /**
     * Get ratio value of canvas
     * @returns {number} Ratio value
     */
    getCanvasRatio() {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;
        return ratio;
    }

    /**
     * Set initial position on canvas image
     * @param {{x: number, y: number}} [position] - Selected position
     * @private
     */
    _setInitPos(position) {
        position = position || this.getCanvasImage().getCenterPoint();

        this._defaultStyles.left = position.x;
        this._defaultStyles.top = position.y;
    }

    /**
     * Create textarea element on canvas container
     * @private
     */
    _createTextarea() {
        const container = this.getCanvasElement().parentNode;
        const textarea = document.createElement('textarea');

        textarea.className = TEXTAREA_CLASSNAME;
        textarea.setAttribute('style', TEXTAREA_STYLES);
        textarea.setAttribute('wrap', 'off');

        container.appendChild(textarea);

        this._textarea = textarea;

        this._listeners = Object.assign(this._listeners, {
            input: this._onInput.bind(this),
            keydown: this._onKeyDown.bind(this),
            blur: this._onBlur.bind(this),
            scroll:this._onScroll.bind(this)
        });

        if (browser.msie && browser.version === 9) {
            fabric.util.addListener(textarea, 'keydown', this._listeners.keydown);
        } else {
            fabric.util.addListener(textarea, 'input', this._listeners.input);
        }
        fabric.util.addListener(textarea, 'blur', this._listeners.blur);
        fabric.util.addListener(textarea, 'scroll', this._listeners.scroll);
    }

    /**
     * Remove textarea element on canvas container
     * @private
     */
    _removeTextarea() {
        const container = this.getCanvasElement().parentNode;
        const textarea = container.querySelector('textarea');

        container.removeChild(textarea);

        this._textarea = null;

        if (browser.msie && browser.version < 10) {
            fabric.util.removeListener(textarea, 'keydown', this._listeners.keydown);
        } else {
            fabric.util.removeListener(textarea, 'input', this._listeners.input);
        }
        fabric.util.removeListener(textarea, 'blur', this._listeners.blur);
        fabric.util.removeListener(textarea, 'scroll', this._listeners.scroll);
    }

    /**
     * Input event handler
     * @private
     */
    _onInput() {
        const ratio = this.getCanvasRatio();
        const obj = this._editingObj;
        const textareaStyle = this._textarea.style;

        obj.setText(this._textarea.value);

        textareaStyle.width = `${Math.ceil(obj.getWidth() / ratio)}px`;
        textareaStyle.height = `${Math.ceil(obj.getHeight() / ratio)}px`;
    }

    /**
     * Keydown event handler
     * @private
     */
    _onKeyDown() {
        const ratio = this.getCanvasRatio();
        const obj = this._editingObj;
        const textareaStyle = this._textarea.style;

        setTimeout(() => {
            obj.setText(this._textarea.value);

            textareaStyle.width = `${Math.ceil(obj.getWidth() / ratio)}px`;
            textareaStyle.height = `${Math.ceil(obj.getHeight() / ratio)}px`;
        }, 0);
    }

    /**
     * Blur event handler
     * @private
     */
    _onBlur() {
        const editingObj = this._editingObj;
        const editingObjInfos = this._editingObjInfos;
        let transWidth = (editingObj.getWidth()) - (editingObjInfos.width);
        let transHeight = (editingObj.getHeight()) - (editingObjInfos.height);
        // if (ratio === 1) {
        //     transWidth /= 2;
        //     transHeight /= 2;
        // }

        this._textarea.style.display = 'none';
        this._editingObj.set({
            left: editingObjInfos.left + transWidth / 2,
            top: editingObjInfos.top + transHeight / 2
        });

        this.getCanvas().add(this._editingObj);
        //this._editingObj.
        this.getCanvas().on('object:removed', this._listeners.remove);

    }

    /**
     * Scroll event handler
     * @private
     */
    _onScroll() {
        this._textarea.scrollLeft = 0;
        this._textarea.scrollTop = 0;
    }

    /**
     * Fabric scaling event handler
     * @param {fabric.Event} fEvent - Current scaling event on selected object
     * @private
     */
    _onFabricScaling(fEvent) {
        const obj = fEvent.target;
        const scalingSize = obj.getFontSize() * obj.getScaleY();

        obj.setFontSize(scalingSize);
        obj.setScaleX(1);
        obj.setScaleY(1);
    }

    /**
     * Fabric mouseup event handler
     * @param {fabric.Event} fEvent - Current mousedown event on selected object
     * @private
     */
    _onFabricMouseUp(fEvent) {
        const newClickTime = (new Date()).getTime();

        if (this._isDoubleClick(newClickTime)) {
            this._changeToEditingMode(fEvent.target);
            this._listeners.dbclick(); // fire dbclick event
        }

        this._lastClickTime = newClickTime;
    }

    /**
     * Get state of firing double click event
     * @param {Date} newClickTime - Current clicked time
     * @returns {boolean} Whether double clicked or not
     * @private
     */
    _isDoubleClick(newClickTime) {
        return (newClickTime - this._lastClickTime < DBCLICK_TIME);
    }

    /**
     * Change state of text object for editing
     * @param {fabric.fEvent} fEvent.target is fabric.Text - Text object fired event
     * @private
     */
    _changeToEditingMode(obj) {
        // const obj = fEvent.target;
        const ratio = this.getCanvasRatio();
        const textareaStyle = this._textarea.style;

        this.isPrevEditing = true;

        const canvas = this.getCanvas();
        const lowerCanvasElStyle = canvas.lowerCanvasEl.style;
        const lowerElLeft = parseInt(lowerCanvasElStyle.left,10);
        const lowerElTop = parseInt(lowerCanvasElStyle.top,10);
        canvas.off('object:removed', this._listeners.remove);

        obj.remove();

        this._editingObj = obj;
        this._textarea.value = obj.getText();

        this._editingObjInfos = {
            left: this._editingObj.getLeft(),
            top: this._editingObj.getTop(),
            width: this._editingObj.getWidth(),
            height: this._editingObj.getHeight()
        };

        textareaStyle.display = 'block';

        textareaStyle.left = `${obj.oCoords.tl.x / ratio + lowerElLeft}px`;
        textareaStyle.top = `${obj.oCoords.tl.y / ratio + lowerElTop}px`;

        textareaStyle.width = `${Math.ceil(obj.getWidth() / ratio)}px`;
        textareaStyle.height = `${Math.ceil(obj.getHeight() / ratio)}px`;
        textareaStyle.transform = `rotate(${obj.getAngle()}deg)`;
        textareaStyle.color = obj.getFill();

        textareaStyle['font-size'] = `${obj.getFontSize() / ratio}px`;
        textareaStyle['font-family'] = obj.getFontFamily();
        textareaStyle['font-style'] = obj.getFontStyle();
        textareaStyle['font-weight'] = obj.getFontWeight();
        textareaStyle['text-align'] = obj.getTextAlign();
        textareaStyle['line-height'] = obj.getLineHeight() + EXTRA_PIXEL_LINEHEIGHT;
        textareaStyle['transform-origin'] = 'left top';
        this._textarea.focus();
    }
}
