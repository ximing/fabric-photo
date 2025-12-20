import * as fpCore from '../src/index';
import { Editor } from '../src/index';

const editor = new Editor({ container: document.getElementById('editor')! });

(window as unknown as { editor: Editor }).editor = editor;
// evaluate 驱动冒烟用：fp.editor / fp.AddObject / fp.createId / ...
(window as unknown as { fp: typeof fpCore & { editor: Editor } }).fp = { ...fpCore, editor };

function $(id: string): HTMLElement {
    return document.getElementById(id)!;
}
function onClick(id: string, handler: () => void): void {
    $(id).addEventListener('click', handler);
}

// —— 色板 ——

const PALETTE: Array<{ name: string; hex: string }> = [
    { name: '红', hex: '#ff0000' },
    { name: '黄', hex: '#ffcc00' },
    { name: '绿', hex: '#00aa44' },
    { name: '蓝', hex: '#1677ff' },
    { name: '灰', hex: '#888888' },
    { name: '黑', hex: '#000000' },
    { name: '白', hex: '#ffffff' }
];
let currentColor = PALETTE[0].hex;

const paletteEl = $('palette');
for (const { name, hex } of PALETTE) {
    const sw = document.createElement('span');
    sw.className = 'swatch' + (hex === currentColor ? ' active' : '');
    sw.title = name;
    sw.dataset.color = hex;
    sw.style.background = hex;
    sw.addEventListener('click', () => applyColor(hex));
    paletteEl.appendChild(sw);
}

/** 对当前工具（setBrush）与选中对象（shape/path/text 样式）同时生效。 */
function applyColor(hex: string): void {
    currentColor = hex;
    for (const sw of Array.from(paletteEl.querySelectorAll<HTMLElement>('.swatch'))) {
        sw.classList.toggle('active', sw.dataset.color === hex);
    }
    editor.setBrush({ color: hex }); // 按当前 mode 路由到 draw/line/arrow
    editor.changeShape({ fill: `${hex}4d`, stroke: hex }); // 选中 shape
    editor.changeFreeDrawingPathStyle({ color: hex }); // 选中 freedraw 路径
    editor.changeArrowStyle({ color: hex }); // 选中 arrow 路径
    editor.changeTextStyle({ fill: hex }); // 选中/编辑中的文本
}

// —— 工具 ——

onClick('btn-select', () => editor.endAll());
onClick('btn-pan', () => {
    if (editor.getCurrentState() === 'pan') {
        editor.endPan();
    } else {
        editor.startPan();
    }
});
onClick('btn-crop', () => {
    if (editor.getCurrentState() === 'crop') {
        editor.endCropping(false);
    } else {
        editor.startCropping();
    }
});
onClick('btn-crop-apply', () => editor.endCropping(true));
onClick('btn-crop-cancel', () => editor.endCropping(false));
onClick('btn-rotate90', () => editor.rotate(90));
onClick('btn-freedraw', () => editor.startFreeDrawing({ width: 4, color: currentColor }));
onClick('btn-line', () => editor.startLineDrawing({ width: 4, color: currentColor }));
onClick('btn-arrow', () => editor.startArrowDrawing({ width: 4, color: currentColor }));

function startShape(type: 'rect' | 'circle' | 'triangle'): void {
    editor.setDrawingShape(type, { fill: `${currentColor}4d`, stroke: currentColor, strokeWidth: 2 });
    editor.startDrawingShapeMode();
}
onClick('btn-rect', () => startShape('rect'));
onClick('btn-circle', () => startShape('circle'));
onClick('btn-triangle', () => startShape('triangle'));

onClick('btn-text', () => {
    if (editor.getCurrentState() === 'text') {
        editor.endTextMode();
    } else {
        editor.startTextMode();
    }
});
onClick('btn-text-bold', () => editor.changeTextStyle({ fontWeight: 'bold' }));
onClick('btn-mosaic', () => {
    if (editor.getCurrentState() === 'mosaic') {
        editor.endMosaicDrawing();
    } else {
        editor.startMosaicDrawing({ dimensions: 12 });
    }
});

// —— 操作 ——

const zoomLabel = $('zoom-label');
function refreshZoom(): void {
    zoomLabel.textContent = `${Math.round(editor.getZoom() * 100)}%`;
}
onClick('btn-zoom-in', () => editor.setZoom(editor.getZoom() * 1.25));
onClick('btn-zoom-out', () => editor.setZoom(editor.getZoom() / 1.25));
onClick('btn-undo', () => editor.undo());
onClick('btn-redo', () => editor.redo());
onClick('btn-clear', () => editor.clearObjects());
onClick('btn-remove', () => editor.removeActiveObject());
onClick('btn-export', () => {
    try {
        const a = document.createElement('a');
        a.href = editor.toDataURL('image/png');
        a.download = 'fp-export.png';
        a.click();
        console.log('export png, dataURL length:', a.href.length);
    } catch (err) {
        console.error('export failed', err);
    }
});
onClick('btn-load-file', () => ($('file-input') as HTMLInputElement).click());
($('file-input') as HTMLInputElement).addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file !== undefined) {
        editor.loadImageFromFile(file).catch((err: unknown) => {
            console.error('loadImageFromFile failed', err);
        });
    }
    (event.target as HTMLInputElement).value = '';
});
onClick('btn-add-image', () => {
    editor.addImageObject('./images/demo.jpeg').catch((err: unknown) => {
        console.error('addImageObject failed', err);
    });
});
onClick('btn-add-shape', () =>
    editor.addShape('rect', { width: 120, height: 80, fill: `${currentColor}4d`, stroke: currentColor, strokeWidth: 2 })
);

// —— 状态条 / undo-redo 禁用态 / 工具高亮 ——

const statusbar = $('statusbar');
let undoSize = 0;
let redoSize = 0;
function refreshStatus(): void {
    statusbar.textContent =
        `mode: ${editor.getCurrentState()} | objects: ${editor.state.doc.objects.length} | ` +
        `undo: ${undoSize} | redo: ${redoSize}`;
    ($('btn-undo') as HTMLButtonElement).disabled = undoSize === 0;
    ($('btn-redo') as HTMLButtonElement).disabled = redoSize === 0;
}

const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#tools button[data-mode]'));
editor.on('change:mode', ({ mode }) => {
    for (const btn of toolButtons) {
        // shape 三按钮共用 mode 'shape'，全部高亮由「最后点击的形状」不可靠，统一按 mode 高亮
        btn.classList.toggle('active', btn.dataset.mode === mode);
    }
    refreshStatus();
});
editor.on('change', () => refreshStatus());
editor.on('change:viewport', () => refreshZoom());
editor.on('historyChange', (sizes) => {
    undoSize = sizes.undoSize;
    redoSize = sizes.redoSize;
    refreshStatus();
});

editor.on('loadImage', ({ name, width, height }) => {
    console.log('loadImage', name, width, height);
});
editor.on('clearImage', () => {
    console.log('clearImage');
});

// 启动自动加载示例图
editor.loadImageFromURL('./images/demo.jpeg', 'demo').catch((err: unknown) => {
    console.error('loadImageFromURL failed', err);
});
refreshZoom();
refreshStatus();
