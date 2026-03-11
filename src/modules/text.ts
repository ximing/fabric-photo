/**
 * Text module
 * Provides text editing functionality on canvas
 */
import { fabric } from 'fabric';
import type { Text as FabricText } from '../types/fabric';
import ModuleBase from './base';
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

const { browser } = util;

const TEXTAREA_CLASSNAME = 'fabric-photo-eidtor-textarea';
const TEXTAREA_STYLES = util.makeStyleText({
    position: 'absolute',
    padding: '0',
    display: 'none',
    border: '1px dotted red',
    overflow: 'hidden',
    resize: 'none',
    outline: 'none',
    'border-radius': '0',
    'background-color': 'transparent',
    '-webkit-appearance': 'none',
    'z-index': '99999',
    'white-space': 'pre'
});

const EXTRA_PIXEL_LINEHEIGHT = 0.1;
const DBCLICK_TIME = 500;

interface TextListeners {
    mousedown: (fEvent: { target: FabricText; e: MouseEvent }) => void;
    select: (fEvent: { target: FabricText }) => void;
    selectClear: () => void;
    scaling: (fEvent: { target: FabricText }) => void;
    dbclick: () => void;
    remove: () => void;
    input: () => void;
    keydown: (e: KeyboardEvent) => void;
    blur: () => void;
    scroll: () => void;
}

interface EditingObjInfos {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface TextStyleOptions {
    fill?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: string;
    fontWeight?: string | number;
    textAlign?: string;
    textDecoraiton?: string;
}

interface AddTextOptions {
    styles?: TextStyleOptions;
    position?: { x: number; y: number };
}

export default class TextEditor extends ModuleBase {
    private _defaultStyles: Record<string, unknown> = { ...defaultStyles };

    private _isSelected: boolean = false;

    private _selectedObj: FabricText = {} as FabricText;

    private _editingObj: FabricText = {} as FabricText;

    private _listeners: Partial<TextListeners> = {};

    private _textarea: HTMLTextAreaElement | null = null;

    private _ratio: number = 1;

    private _lastClickTime: number = 0;

    private _editingObjInfos: EditingObjInfos = { left: 0, top: 0, width: 0, height: 0 };

    isPrevEditing: boolean = false;

    constructor(parent: ModuleBase | null) {
        super();
        this.setParent(parent);
        this.name = consts.moduleNames.TEXT;
        this._defaultStyles = { ...defaultStyles };
        this._isSelected = false;
        this._selectedObj = {} as FabricText;
        this._editingObj = {} as FabricText;
        this._listeners = {};
        this._textarea = null;
        this._ratio = 1;
        this._lastClickTime = new Date().getTime();
        this._editingObjInfos = { left: 0, top: 0, width: 0, height: 0 };
        this.isPrevEditing = false;
    }

    start(listeners: Partial<TextListeners>): void {
        const canvas = this.getCanvas();

        this._listeners = listeners;

        canvas.selection = false;
        canvas.defaultCursor = 'text';
        canvas.on({
            'mouse:down': this._listeners.mousedown as any,
            'object:selected': this._listeners.select as any,
            'before:selection:cleared': this._listeners.selectClear as any,
            'object:scaling': this._onFabricScaling
        });

        this._createTextarea();

        this.setCanvasRatio();
    }

    end(): void {
        const canvas = this.getCanvas();

        canvas.selection = false;
        canvas.defaultCursor = 'default';
        canvas.deactivateAllWithDispatch();
        canvas.off({
            'mouse:down': this._listeners.mousedown as any,
            'object:selected': this._listeners.select as any,
            'before:selection:cleared': this._listeners.selectClear as any,
            'object:scaling': this._onFabricScaling
        });

        this._removeTextarea();

        this._listeners = {};
    }

    /**
     * Add new text on canvas image
     * @param text - Initial input text
     * @param options - Options for generating text
     * @param defaultEdit default start edit
     */
    add(text: string, options: AddTextOptions = {}, defaultEdit: boolean = false): void {
        const canvas = this.getCanvas();
        let styles = this._defaultStyles;

        this._setInitPos(options.position);

        if (options.styles) {
            styles = Object.assign(styles, options.styles);
        }

        const newText = new fabric.Text(text, styles as any);
        newText.set(consts.fObjectOptions.SELECTION_STYLE as any);
        newText.set({ objectCaching: false });
        newText.setControlsVisibility({
            bl: true,
            br: true,
            mb: false,
            ml: false,
            mr: false,
            mt: false,
            tl: true,
            tr: true,
            mtr: true
        });
        newText.on('mouseup', this._onFabricMouseUp.bind(this) as any);

        canvas.add(newText);

        if (!canvas.getActiveObject()) {
            canvas.setActiveObject(newText);
            if (defaultEdit) {
                this._changeToEditingMode(newText);
                this._lastClickTime = new Date().getTime();
                if (this._listeners.dbclick) {
                    this._listeners.dbclick();
                }
            }
        }

        this.isPrevEditing = true;
    }

    /**
     * Change text of activate object on canvas image
     * @param activeObj - Current selected text object
     * @param text - Changed text
     */
    change(activeObj: FabricText, text: string): void {
        activeObj.set('text', text);

        this.getCanvas().renderAll();
    }

    /**
     * Set style
     * @param activeObj - Current selected text object
     * @param styleObj - Initial styles
     */
    setStyle(activeObj: FabricText, styleObj: Record<string, unknown>): void {
        util.forEach(
            styleObj,
            (val: unknown, key: string | number) => {
                if (activeObj[key as keyof FabricText] === val) {
                    styleObj[key as string] = resetStyles[key as keyof typeof resetStyles] || '';
                }
            },
            this
        );

        activeObj.set(styleObj as any);

        this.getCanvas().renderAll();
    }

    /**
     * Set infos of the current selected object
     * @param obj - Current selected text object
     * @param state - State of selecting
     */
    setSelectedInfo(obj: FabricText, state: boolean): void {
        this._selectedObj = obj;
        this._isSelected = state;
    }

    /**
     * Whether object is selected or not
     * @returns State of selecting
     */
    isSelected(): boolean {
        return this._isSelected;
    }

    /**
     * Get current selected text object
     * @returns Current selected text object
     */
    getSelectedObj(): FabricText {
        return this._selectedObj;
    }

    /**
     * Set ratio value of canvas
     */
    setCanvasRatio(): void {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;

        this._ratio = ratio;
    }

    /**
     * Get ratio value of canvas
     * @returns Ratio value
     */
    getCanvasRatio(): number {
        const canvasElement = this.getCanvasElement();
        const cssWidth = parseInt(canvasElement.style.width, 10);
        const originWidth = canvasElement.width;
        const ratio = originWidth / cssWidth;
        return ratio;
    }

    /**
     * Set initial position on canvas image
     * @param position - Selected position
     * @private
     */
    _setInitPos(position?: { x: number; y: number }): void {
        const canvasImage = this.getCanvasImage();
        if (!canvasImage) {
            return;
        }
        const pos = position || canvasImage.getCenterPoint();

        this._defaultStyles.left = pos.x;
        this._defaultStyles.top = pos.y;
    }

    /**
     * Create textarea element on canvas container
     * @private
     */
    _createTextarea(): void {
        const container = this.getCanvasElement().parentNode as HTMLElement;
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
            scroll: this._onScroll.bind(this)
        });

        if (browser.msie && browser.version === 9) {
            fabric.util.addListener(textarea, 'keydown', this._listeners.keydown as EventListener);
        } else {
            fabric.util.addListener(textarea, 'input', this._listeners.input as EventListener);
        }
        fabric.util.addListener(textarea, 'blur', this._listeners.blur as EventListener);
        fabric.util.addListener(textarea, 'scroll', this._listeners.scroll as EventListener);
    }

    /**
     * Remove textarea element on canvas container
     * @private
     */
    _removeTextarea(): void {
        const container = this.getCanvasElement().parentNode as HTMLElement;
        const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

        if (textarea && textarea.parentNode) {
            container.removeChild(textarea);
        }

        this._textarea = null;

        if (browser.msie && browser.version < 10) {
            fabric.util.removeListener(textarea, 'keydown', this._listeners.keydown as EventListener);
        } else {
            fabric.util.removeListener(textarea, 'input', this._listeners.input as EventListener);
        }
        fabric.util.removeListener(textarea, 'blur', this._listeners.blur as EventListener);
        fabric.util.removeListener(textarea, 'scroll', this._listeners.scroll as EventListener);
    }

    /**
     * Input event handler
     * @private
     */
    _onInput(): void {
        if (!this._textarea) {
            return;
        }
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
    _onKeyDown(): void {
        if (!this._textarea) {
            return;
        }
        const ratio = this.getCanvasRatio();
        const obj = this._editingObj;
        const textareaStyle = this._textarea.style;

        setTimeout(() => {
            obj.setText(this._textarea!.value);

            textareaStyle.width = `${Math.ceil(obj.getWidth() / ratio)}px`;
            textareaStyle.height = `${Math.ceil(obj.getHeight() / ratio)}px`;
        }, 0);
    }

    /**
     * Blur event handler
     * @private
     */
    _onBlur(): void {
        if (!this._textarea) {
            return;
        }
        const editingObj = this._editingObj;
        const editingObjInfos = this._editingObjInfos;
        let transWidth = editingObj.getWidth() - editingObjInfos.width;
        let transHeight = editingObj.getHeight() - editingObjInfos.height;

        this._textarea.style.display = 'none';
        this._editingObj.set({
            left: editingObjInfos.left + transWidth / 2,
            top: editingObjInfos.top + transHeight / 2
        });

        this.getCanvas().add(this._editingObj);
        if (this._listeners.remove) {
            this.getCanvas().on('object:removed', this._listeners.remove);
        }
    }

    /**
     * Scroll event handler
     * @private
     */
    _onScroll(): void {
        if (!this._textarea) {
            return;
        }
        this._textarea.scrollLeft = 0;
        this._textarea.scrollTop = 0;
    }

    /**
     * Fabric scaling event handler
     * @param fEvent - Current scaling event on selected object
     * @private
     */
    _onFabricScaling(fEvent: { target: FabricText }): void {
        const obj = fEvent.target;
        const scalingSize = obj.getFontSize() * obj.getScaleY();

        obj.setFontSize(scalingSize);
        obj.setScaleX(1);
        obj.setScaleY(1);
    }

    /**
     * Fabric mouseup event handler
     * @param fEvent - Current mousedown event on selected object
     * @private
     */
    _onFabricMouseUp(fEvent: { target: FabricText }): void {
        const newClickTime = new Date().getTime();

        if (this._isDoubleClick(newClickTime)) {
            this._changeToEditingMode(fEvent.target);
            if (this._listeners.dbclick) {
                this._listeners.dbclick();
            }
        }

        this._lastClickTime = newClickTime;
    }

    /**
     * Get state of firing double click event
     * @param newClickTime - Current clicked time
     * @returns Whether double clicked or not
     * @private
     */
    _isDoubleClick(newClickTime: number): boolean {
        return newClickTime - this._lastClickTime < DBCLICK_TIME;
    }

    /**
     * Change state of text object for editing
     * @param obj - Text object to edit
     * @private
     */
    _changeToEditingMode(obj: FabricText): void {
        const ratio = this.getCanvasRatio();
        const textareaStyle = this._textarea?.style;

        if (!textareaStyle) {
            return;
        }

        this.isPrevEditing = true;

        const canvas = this.getCanvas();
        const lowerCanvasElStyle = canvas.lowerCanvasEl.style;
        const lowerElLeft = parseInt(lowerCanvasElStyle.left, 10);
        const lowerElTop = parseInt(lowerCanvasElStyle.top, 10);
        canvas.off('object:removed', this._listeners.remove as any);

        obj.remove();

        this._editingObj = obj;
        if (this._textarea) {
            this._textarea.value = obj.getText();
        }

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
        textareaStyle.color = obj.getFill() ?? '#000000';

        (textareaStyle as any)['font-size'] = `${obj.getFontSize() / ratio}px`;
        (textareaStyle as any)['font-family'] = obj.getFontFamily() ?? 'sans-serif';
        (textareaStyle as any)['font-style'] = obj.getFontStyle() ?? 'normal';
        (textareaStyle as any)['font-weight'] = obj.getFontWeight()?.toString() ?? 'normal';
        (textareaStyle as any)['text-align'] = obj.getTextAlign() ?? 'left';
        (textareaStyle as any)['line-height'] = String((obj.getLineHeight() ?? 1) + EXTRA_PIXEL_LINEHEIGHT);
        (textareaStyle as any)['transform-origin'] = 'left top';
        this._textarea?.focus();
    }
}
