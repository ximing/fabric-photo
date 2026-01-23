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

    it('NumberField 键盘输入 clamp 到 min/max：描边宽度超界收敛 1-20', () => {
        const editor = new Editor();
        const shapeSpy = vi.spyOn(editor, 'changeShape');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeShape());

        // min/max attribute 不拦截键盘输入，onChange 必须 clamp
        const widthInput = utils.getByLabelText('描边宽度') as HTMLInputElement;
        fireEvent.change(widthInput, { target: { value: '999' } });
        expect(shapeSpy).toHaveBeenLastCalledWith({ strokeWidth: 20 });
        fireEvent.change(widthInput, { target: { value: '0' } });
        expect(shapeSpy).toHaveBeenLastCalledWith({ strokeWidth: 1 });
        editor.destroy();
    });

    it('NumberField 只有 min 时向下 clamp：字号输 0 → changeTextStyle({fontSize: 1})', () => {
        const editor = new Editor();
        const styleSpy = vi.spyOn(editor, 'changeTextStyle');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeText());

        fireEvent.change(utils.getByLabelText('字号'), { target: { value: '0' } });
        expect(styleSpy).toHaveBeenLastCalledWith({ fontSize: 1 });
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

    it('单选：图层顺序 4 按钮与翻转 2 按钮渲染并委托 core API', () => {
        const editor = new Editor();
        const frontSpy = vi.spyOn(editor, 'bringToFront');
        const forwardSpy = vi.spyOn(editor, 'bringForward');
        const backwardSpy = vi.spyOn(editor, 'sendBackward');
        const backSpy = vi.spyOn(editor, 'sendToBack');
        const flipSpy = vi.spyOn(editor, 'flipActiveObjects');
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeShape());

        fireEvent.click(utils.getByRole('button', { name: '置顶' }));
        expect(frontSpy).toHaveBeenCalledTimes(1);
        fireEvent.click(utils.getByRole('button', { name: '上移' }));
        expect(forwardSpy).toHaveBeenCalledTimes(1);
        fireEvent.click(utils.getByRole('button', { name: '下移' }));
        expect(backwardSpy).toHaveBeenCalledTimes(1);
        fireEvent.click(utils.getByRole('button', { name: '置底' }));
        expect(backSpy).toHaveBeenCalledTimes(1);

        fireEvent.click(utils.getByRole('button', { name: '水平翻转' }));
        expect(flipSpy).toHaveBeenCalledWith('horizontal');
        fireEvent.click(utils.getByRole('button', { name: '垂直翻转' }));
        expect(flipSpy).toHaveBeenCalledWith('vertical');
        editor.destroy();
    });

    it('多选：同样有图层顺序与翻转按钮组并委托 core API', () => {
        const editor = new Editor();
        const backSpy = vi.spyOn(editor, 'sendToBack');
        const flipSpy = vi.spyOn(editor, 'flipActiveObjects');
        const a = makeShape();
        const b = makeShape();
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(a)).addStep(new AddObject(b)));
        });
        const utils = renderWithEditor(editor);
        selectAll(editor, [a.id, b.id]);

        fireEvent.click(utils.getByRole('button', { name: '置底' }));
        expect(backSpy).toHaveBeenCalledTimes(1);
        fireEvent.click(utils.getByRole('button', { name: '水平翻转' }));
        expect(flipSpy).toHaveBeenCalledWith('horizontal');
        editor.destroy();
    });

    it('多选：对齐分布按钮组渲染（6 对齐 + 2 分布），点击委托 core API', () => {
        const editor = new Editor();
        const alignSpy = vi.spyOn(editor, 'alignActiveObjects');
        const distributeSpy = vi.spyOn(editor, 'distributeActiveObjects');
        const a = makeShape();
        const b = makeShape();
        const c = makeShape();
        act(() => {
            editor.dispatch(
                editor.newTransaction().addStep(new AddObject(a)).addStep(new AddObject(b)).addStep(new AddObject(c))
            );
        });
        const utils = renderWithEditor(editor);
        selectAll(editor, [a.id, b.id, c.id]);

        for (const [name, edge] of [
            ['左对齐', 'left'],
            ['水平居中', 'centerX'],
            ['右对齐', 'right'],
            ['顶对齐', 'top'],
            ['垂直居中', 'centerY'],
            ['底对齐', 'bottom']
        ] as const) {
            fireEvent.click(utils.getByRole('button', { name }));
            expect(alignSpy).toHaveBeenLastCalledWith(edge);
        }
        expect(alignSpy).toHaveBeenCalledTimes(6);

        fireEvent.click(utils.getByRole('button', { name: '水平分布' }));
        expect(distributeSpy).toHaveBeenCalledWith('horizontal');
        fireEvent.click(utils.getByRole('button', { name: '垂直分布' }));
        expect(distributeSpy).toHaveBeenCalledWith('vertical');
        editor.destroy();
    });

    it('多选 2 个：分布按钮禁用（≥3 才启用），对齐按钮可用', () => {
        const editor = new Editor();
        const a = makeShape();
        const b = makeShape();
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(a)).addStep(new AddObject(b)));
        });
        const utils = renderWithEditor(editor);
        selectAll(editor, [a.id, b.id]);

        expect((utils.getByRole('button', { name: '水平分布' }) as HTMLButtonElement).disabled).toBe(true);
        expect((utils.getByRole('button', { name: '垂直分布' }) as HTMLButtonElement).disabled).toBe(true);
        expect((utils.getByRole('button', { name: '左对齐' }) as HTMLButtonElement).disabled).toBe(false);
        editor.destroy();
    });

    it('单选：不渲染对齐分布按钮组', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeShape());

        expect(utils.queryByRole('button', { name: '左对齐' })).toBeNull();
        expect(utils.queryByRole('button', { name: '水平分布' })).toBeNull();
        editor.destroy();
    });

    it('单选各 kind（含只读 mosaic/image）均有图层顺序与翻转按钮组', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeImage());

        expect(utils.getByRole('button', { name: '置顶' })).not.toBeNull();
        expect(utils.getByRole('button', { name: '水平翻转' })).not.toBeNull();
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

    it('无选中且有背景：渲染「背景调整」组；滑杆 onChange 调 setBackgroundFilters 且带稳定 mergeKey', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setBackgroundFilters');
        act(() => {
            editor.dispatch(
                editor.newTransaction().addStep(
                    new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'p.png', angle: 0 })
                )
            );
        });
        const utils = renderWithEditor(editor);

        expect(utils.getByText('背景调整')).not.toBeNull();
        const brightness = utils.getByLabelText('亮度') as HTMLInputElement;
        expect(brightness.value).toBe('0');

        fireEvent.change(brightness, { target: { value: '40' } });
        expect(spy).toHaveBeenCalledWith({ brightness: 0.4 }, { mergeKey: 'bg-filters' });
        fireEvent.change(utils.getByLabelText('模糊'), { target: { value: '25' } });
        expect(spy).toHaveBeenCalledWith({ blur: 0.25 }, { mergeKey: 'bg-filters' });
        editor.destroy();
    });

    it('无选中且有背景：toggle 与重置按钮委托 core API（resetBackgroundFilters）', () => {
        const editor = new Editor();
        const patchSpy = vi.spyOn(editor, 'setBackgroundFilters');
        const resetSpy = vi.spyOn(editor, 'resetBackgroundFilters');
        act(() => {
            editor.dispatch(
                editor.newTransaction().addStep(
                    new SetBackground({ src: 'data:image/png;base64,x', width: 100, height: 80, name: 'p.png', angle: 0 })
                )
            );
        });
        const utils = renderWithEditor(editor);

        const grayscale = utils.getByRole('button', { name: '灰度' });
        expect(grayscale.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(grayscale);
        expect(patchSpy).toHaveBeenCalledWith({ grayscale: true }, { mergeKey: 'bg-filters' });

        fireEvent.click(utils.getByRole('button', { name: '重置' }));
        expect(resetSpy).toHaveBeenCalledTimes(1);
        editor.destroy();
    });

    it('无选中且无背景：不渲染「背景调整」组', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        expect(utils.queryByText('背景调整')).toBeNull();
        editor.destroy();
    });

    it('单选 image：渲染「图像调整」组；滑杆 onChange 调 setImageFilters 且带 img-filters-${id} mergeKey', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setImageFilters');
        const utils = renderWithEditor(editor);
        const image = makeImage();
        addAndSelect(editor, image);

        expect(utils.getByText('图像调整')).not.toBeNull();
        fireEvent.change(utils.getByLabelText('对比度'), { target: { value: '-30' } });
        expect(spy).toHaveBeenCalledWith(image.id, { contrast: -0.3 }, { mergeKey: `img-filters-${image.id}` });

        fireEvent.click(utils.getByRole('button', { name: '反色' }));
        expect(spy).toHaveBeenCalledWith(image.id, { invert: true }, { mergeKey: `img-filters-${image.id}` });
        editor.destroy();
    });

    it('单选 image：重置按钮调 resetImageFilters(objectId)；对象已有滤镜时滑杆/toggle 回显当前值', () => {
        const editor = new Editor();
        const resetSpy = vi.spyOn(editor, 'resetImageFilters');
        const image = { ...makeImage(), filters: { brightness: 0.5, contrast: 0, saturation: 0, blur: 0.2, grayscale: true, sepia: false, invert: false } };
        act(() => {
            editor.dispatch(editor.newTransaction().addStep(new AddObject(image)).setSelection([image.id]));
        });
        const utils = renderWithEditor(editor);

        expect((utils.getByLabelText('亮度') as HTMLInputElement).value).toBe('50');
        expect((utils.getByLabelText('模糊') as HTMLInputElement).value).toBe('20');
        expect(utils.getByRole('button', { name: '灰度' }).getAttribute('aria-pressed')).toBe('true');
        expect(utils.getByRole('button', { name: '褐色' }).getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(utils.getByRole('button', { name: '重置' }));
        expect(resetSpy).toHaveBeenCalledWith(image.id);
        editor.destroy();
    });

    it('单选非 image（shape）：不渲染滤镜调整组', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        addAndSelect(editor, makeShape());
        expect(utils.queryByText('图像调整')).toBeNull();
        editor.destroy();
    });

    it('单选：「不透明度」滑杆回显缺省 100，onChange 委托 setObjectOpacity 且带 mergeKey', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setObjectOpacity');
        const utils = renderWithEditor(editor);
        const shape = makeShape();
        addAndSelect(editor, shape);

        const slider = utils.getByLabelText('不透明度') as HTMLInputElement;
        expect(slider.value).toBe('100'); // 缺省 opacity 1 ↔ 100

        fireEvent.change(slider, { target: { value: '40' } });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith([shape.id], 0.4, { mergeKey: `opacity:${shape.id}` });
        editor.destroy();
    });

    it('多选：「不透明度」滑杆作用于全部选中对象（显示第一个选中对象的值）', () => {
        const editor = new Editor();
        const spy = vi.spyOn(editor, 'setObjectOpacity');
        const utils = renderWithEditor(editor);
        const a = { ...makeShape(), opacity: 0.5 };
        const b = makeText();
        act(() => {
            const tr = editor.newTransaction();
            tr.addStep(new AddObject(a)).addStep(new AddObject(b));
            editor.dispatch(tr);
        });
        selectAll(editor, [a.id, b.id]);

        const slider = utils.getByLabelText('不透明度') as HTMLInputElement;
        expect(slider.value).toBe('50'); // 第一个选中对象 a 的 0.5 ↔ 50

        fireEvent.change(slider, { target: { value: '80' } });
        expect(spy).toHaveBeenCalledWith([a.id, b.id], 0.8, { mergeKey: `opacity:${a.id}+${b.id}` });
        editor.destroy();
    });

    it('单选 locked 对象：显示「已锁定」提示且几何类控件禁用（颜色控件不受影响）', () => {
        const editor = new Editor();
        const utils = renderWithEditor(editor);
        const shape = { ...makeShape(), locked: true };
        addAndSelect(editor, shape);

        expect(utils.getByText('已锁定：几何类控件不可用，解锁后可编辑')).not.toBeNull();
        expect((utils.getByLabelText('描边宽度') as HTMLInputElement).disabled).toBe(true);
        // 非几何控件（颜色）保持可用
        expect((utils.getByLabelText('填充') as HTMLInputElement).disabled).toBe(false);
        // 图层顺序/翻转按钮仍可用（locked 语义：几何变换禁止，z 序/翻转/删除允许）
        expect((utils.getByRole('button', { name: '置顶' }) as HTMLButtonElement).disabled).toBe(false);
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
