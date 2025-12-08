import * as fpCore from '../src/index';
import { Editor } from '../src/index';

const editor = new Editor({ container: document.getElementById('editor')! });

(window as unknown as { editor: Editor }).editor = editor;
// evaluate 驱动冒烟用：fp.editor / fp.AddObject / fp.createId / ...
(window as unknown as { fp: typeof fpCore & { editor: Editor } }).fp = { ...fpCore, editor };

function loadDemo(): void {
    editor.loadImageFromURL('./images/demo.jpeg', 'demo').catch((err: unknown) => {
        console.error('loadImageFromURL failed', err);
    });
}

document.getElementById('btn-load')!.addEventListener('click', loadDemo);
document.getElementById('btn-undo')!.addEventListener('click', () => editor.undo());
document.getElementById('btn-redo')!.addEventListener('click', () => editor.redo());
document.getElementById('btn-export')!.addEventListener('click', () => {
    try {
        console.log('export dataURL length:', editor.toDataURL().length);
    } catch (err) {
        console.error('export failed', err);
    }
});
document.getElementById('btn-zoom-in')!.addEventListener('click', () => editor.setZoom(editor.getZoom() * 1.25));
document.getElementById('btn-zoom-out')!.addEventListener('click', () => editor.setZoom(editor.getZoom() / 1.25));
const panBtn = document.getElementById('btn-pan')!;
panBtn.addEventListener('click', () => {
    if (editor.getCurrentState() === 'pan') {
        editor.endPan();
    } else {
        editor.startPan();
    }
});
document.getElementById('btn-freedraw')!.addEventListener('click', () =>
    editor.startFreeDrawing({ width: 4, color: 'red' })
);
document.getElementById('btn-line')!.addEventListener('click', () =>
    editor.startLineDrawing({ width: 4, color: 'red' })
);
document.getElementById('btn-arrow')!.addEventListener('click', () =>
    editor.startArrowDrawing({ width: 4, color: 'red' })
);
document.getElementById('btn-end')!.addEventListener('click', () => editor.endAll());
const zoomLabel = document.getElementById('zoom-label')!;
editor.on('change:viewport', ({ viewport }) => {
    zoomLabel.textContent = `zoom: ${viewport.zoom.toFixed(2)} pan: ${viewport.panX.toFixed(0)},${viewport.panY.toFixed(0)}`;
});
editor.on('change:mode', ({ mode }) => {
    panBtn.textContent = mode === 'pan' ? '退出 pan' : 'pan';
});

editor.on('loadImage', ({ name, width, height }) => {
    console.log('loadImage', name, width, height);
});
editor.on('clearImage', () => {
    console.log('clearImage');
});

// 启动自动加载示例图
loadDemo();
