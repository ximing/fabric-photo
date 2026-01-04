import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    AddObject,
    Editor,
    SetBackground,
    createId,
    type ImageObject,
    type MosaicObject,
    type PathObject,
    type ShapeObject,
    type TextObject
} from '@gmi/fp-core';
import { EditorProvider } from './provider';
import { PropertiesPanel } from './properties-panel';

// —— 真实无头 Editor（不触碰 fabric）：PropertiesPanel 通过 EditorProvider 注入，
// spy 直接打在实例方法上验证 change* 委托路径；doc 用 steps（AddObject/SetBackground +
// setSelection）构造。 ——

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// vitest 未开 globals，testing-library 自动清理未注册；getBy* 绑定 document.body，需手动清理
afterEach(() => {
    cleanup();
});

function renderWithEditor(editor: Editor): ReturnType<typeof render> {
    return render(
        <EditorProvider editor={editor}>
            <PropertiesPanel />
        </EditorProvider>
    );
}

function makeShape(id = createId()): ShapeObject {
    return {
        id,
        kind: 'shape',
        shapeType: 'rect',
        left: 10,
        top: 10,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 20,
        height: 20,
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 1
    };
}

function makeText(id = createId(), overrides: Partial<TextObject> = {}): TextObject {
    return {
        id,
        kind: 'text',
        text: '你好',
        left: 10,
        top: 10,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        fontSize: 50,
        fontFamily: 'sans-serif',
        fill: '#000000',
        fontWeight: 'normal',
        fontStyle: '',
        textDecoration: '',
        textAlign: 'left',
        ...overrides
    };
}

function makePath(tool: PathObject['tool'], id = createId()): PathObject {
    return {
        id,
        kind: 'path',
        tool,
        path: 'M 0 0 L 10 10',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        stroke: '#ff0000',
        strokeWidth: 2,
        fill: '#ff0000'
    };
}

function makeMosaic(id = createId()): MosaicObject {
    return {
        id,
        kind: 'mosaic',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 16,
        height: 16,
        rects: [
            { x: 0, y: 0, size: 8, color: '#111111' },
            { x: 8, y: 0, size: 8, color: '#222222' },
            { x: 0, y: 8, size: 8, color: '#333333' }
        ]
    };
}

function makeImage(id = createId()): ImageObject {
    return {
        id,
        kind: 'image',
        src: 'data:image/png;base64,x',
        left: 0,
        top: 0,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        width: 64,
        height: 32
    };
}

/** dispatch AddObject 并选中该对象（单选场景）。 */
function addAndSelect(editor: Editor, object: ShapeObject | TextObject | PathObject | MosaicObject | ImageObject): void {
    act(() => {
        editor.dispatch(
            editor.newTransaction().addStep(new AddObject(object)).setSelection([object.id])
        );
    });
}

function selectAll(editor: Editor, ids: readonly string[]): void {
    act(() => {
        editor.dispatch(editor.newTransaction().setSelection(ids));
    });
}

describe('PropertiesPanel', () => {
    it('无选中：显示画布属性——SetBackground 后显示背景尺寸与对象数；无背景显示「未加载图片」', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);

        expect(utils.getByText('未加载图片')).not.toBeNull();
        expect(utils.getByText('100%')).not.toBeNull(); // 缩放只读

        act(() => {
            editor.dispatch(
                editor
                    .newTransaction()
                    .addStep(new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'p.png', angle: 0 }))
                    .addStep(new AddObject(makeShape()))
                    .addStep(new AddObject(makeShape()))
            );
        });

        expect(utils.getByText('100 × 80')).not.toBeNull();
        expect(utils.getByText('2', { selector: '.fp-props-canvas-count' })).not.toBeNull();
        editor.destroy();
    });

    it('单选 shape：出现 fill/stroke/strokeWidth 输入；改 strokeWidth → changeShape({strokeWidth: 6})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeShape');
        const utils = renderWithEditor(editor);
        const shape = makeShape();
        addAndSelect(editor, shape);

        const fillInput = utils.getByLabelText('填充') as HTMLInputElement;
        const strokeInput = utils.getByLabelText('描边') as HTMLInputElement;
        const widthInput = utils.getByLabelText('描边宽度') as HTMLInputElement;
        expect(fillInput.value).toBe('#ff0000');
        expect(strokeInput.value).toBe('#000000');
        expect(widthInput.value).toBe('1');

        fireEvent.change(widthInput, { target: { value: '6' } });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ strokeWidth: 6 });

        fireEvent.change(fillInput, { target: { value: '#00ff00' } });
        expect(spy).toHaveBeenCalledWith({ fill: '#00ff00' });

        fireEvent.change(strokeInput, { target: { value: '#0000ff' } });
        expect(spy).toHaveBeenCalledWith({ stroke: '#0000ff' });
        editor.destroy();
    });

    it('单选 text：textarea + fontSize + fill + 三个 style toggle；点 bold → changeTextStyle({fontWeight: bold})', () => {
        const editor = new Editor();
        const textSpy = vi.spyOn(editor, 'changeText');
        const styleSpy = vi.spyOn(editor, 'changeTextStyle');
        const utils = renderWithEditor(editor);
        const text = makeText();
        addAndSelect(editor, text);

        // textarea 改内容 → changeText
        const textarea = utils.getByLabelText('文本内容') as HTMLTextAreaElement;
        expect(textarea.value).toBe('你好');
        fireEvent.change(textarea, { target: { value: '改过了' } });
        expect(textSpy).toHaveBeenCalledWith('改过了');

        // fontSize → changeTextStyle({fontSize})
        const sizeInput = utils.getByLabelText('字号') as HTMLInputElement;
        expect(sizeInput.value).toBe('50');
        fireEvent.change(sizeInput, { target: { value: '24' } });
        expect(styleSpy).toHaveBeenCalledWith({ fontSize: 24 });

        // fill → changeTextStyle({fill})
        fireEvent.change(utils.getByLabelText('填充'), { target: { value: '#123456' } });
        expect(styleSpy).toHaveBeenCalledWith({ fill: '#123456' });

        // 三个 toggle：对象当前为默认态 → 均不 active；点击委托 toggle 语义（传目标值，core 判同重置）
        const bold = utils.getByRole('button', { name: '加粗' });
        const italic = utils.getByRole('button', { name: '斜体' });
        const underline = utils.getByRole('button', { name: '下划线' });
        expect(bold.getAttribute('aria-pressed')).toBe('false');
        expect(italic.getAttribute('aria-pressed')).toBe('false');
        expect(underline.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(bold);
        expect(styleSpy).toHaveBeenCalledWith({ fontWeight: 'bold' });
        fireEvent.click(italic);
        expect(styleSpy).toHaveBeenCalledWith({ fontStyle: 'italic' });
        fireEvent.click(underline);
        expect(styleSpy).toHaveBeenCalledWith({ textDecoration: 'underline' });
        editor.destroy();
    });

    it('单选 text：对象 fontWeight 已是 bold 时加粗按钮为 active 态', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeText(createId(), { fontWeight: 'bold', fontStyle: 'italic' }));

        expect(utils.getByRole('button', { name: '加粗' }).getAttribute('aria-pressed')).toBe('true');
        expect(utils.getByRole('button', { name: '斜体' }).getAttribute('aria-pressed')).toBe('true');
        expect(utils.getByRole('button', { name: '下划线' }).getAttribute('aria-pressed')).toBe('false');
        editor.destroy();
    });

    it('单选 arrow path：改色 → changeArrowStyle({color})；改宽 → changeArrowStyle({width})', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeArrowStyle');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makePath('arrow'));

        fireEvent.change(utils.getByLabelText('颜色'), { target: { value: '#00ff00' } });
        expect(spy).toHaveBeenCalledWith({ color: '#00ff00' });

        fireEvent.change(utils.getByLabelText('线宽'), { target: { value: '8' } });
        expect(spy).toHaveBeenCalledWith({ width: 8 });
        editor.destroy();
    });

    it('单选 freedraw path：改色/改宽 → changeFreeDrawingPathStyle', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'changeFreeDrawingPathStyle');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makePath('freedraw'));

        fireEvent.change(utils.getByLabelText('颜色'), { target: { value: '#00ff00' } });
        expect(spy).toHaveBeenCalledWith({ color: '#00ff00' });

        fireEvent.change(utils.getByLabelText('线宽'), { target: { value: '5' } });
        expect(spy).toHaveBeenCalledWith({ width: 5 });
        editor.destroy();
    });

    it('多选：显示「已选 N 个对象」；点删除 → removeActiveObject', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'removeActiveObject');
        const a = makeShape();
        const b = makeText();
        act(() => {
            editor.dispatch(
                editor.newTransaction().addStep(new AddObject(a)).addStep(new AddObject(b))
            );
        });
        const utils = renderWithEditor(editor);
        selectAll(editor, [a.id, b.id]);

        expect(utils.getByText('已选 2 个对象')).not.toBeNull();
        fireEvent.click(utils.getByRole('button', { name: '删除' }));
        expect(spy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it('单选 mosaic：只读块数 + 删除按钮；点删除 → removeActiveObject', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'removeActiveObject');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeMosaic());

        expect(utils.getByText('3', { selector: '.fp-props-readonly-value' })).not.toBeNull();
        fireEvent.click(utils.getByRole('button', { name: '删除' }));
        expect(spy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it('单选 image：只读尺寸 + 删除按钮', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeImage());

        expect(utils.getByText('64 × 32')).not.toBeNull();
        expect(utils.getByRole('button', { name: '删除' })).not.toBeNull();
        editor.destroy();
    });

    it('className 语义占位（fp-props-panel，grid 落位在 styles.css）并可追加自定义 class', () => {
        const editor = new Editor();
        const utils = render(
            <EditorProvider editor={editor}>
                <PropertiesPanel className="extra" />
            </EditorProvider>
        );

        const panel = utils.container.querySelector('.fp-props-panel') as HTMLElement;
        expect(panel).not.toBeNull();
        expect(panel.className).toContain('extra');
        expect(panel.getAttribute('style')).toBeNull();
        editor.destroy();
    });
});
