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
function startShape(type: 'rect' | 'circle' | 'triangle'): void {
    editor.setDrawingShape(type, { fill: 'rgba(255, 0, 0, 0.3)', stroke: 'red', strokeWidth: 2 });
    editor.startDrawingShapeMode();
}
document.getElementById('btn-rect')!.addEventListener('click', () => startShape('rect'));
document.getElementById('btn-circle')!.addEventListener('click', () => startShape('circle'));
document.getElementById('btn-triangle')!.addEventListener('click', () => startShape('triangle'));
document.getElementById('btn-add-shape')!.addEventListener('click', () =>
    editor.addShape('rect', { width: 120, height: 80, fill: 'rgba(0, 0, 255, 0.3)', stroke: 'blue', strokeWidth: 2 })
);
const mosaicBtn = document.getElementById('btn-mosaic')!;
mosaicBtn.addEventListener('click', () => {
    if (editor.getCurrentState() === 'mosaic') {
        editor.endMosaicDrawing();
    } else {
        editor.startMosaicDrawing({ dimensions: 12 });
    }
});
const cropBtn = document.getElementById('btn-crop')!;
cropBtn.addEventListener('click', () => {
    if (editor.getCurrentState() === 'crop') {
        editor.endCropping(false);
    } else {
        editor.startCropping();
    }
});
document.getElementById('btn-crop-apply')!.addEventListener('click', () => editor.endCropping(true));
document.getElementById('btn-crop-cancel')!.addEventListener('click', () => editor.endCropping(false));
document.getElementById('btn-crop-bound')!.addEventListener('click', () => {
    editor.startCropByBoundInfo();
    editor.endCropByBoundInfo({ left: 0, top: 0, width: 100, height: 100 });
});
const textBtn = document.getElementById('btn-text')!;
textBtn.addEventListener('click', () => {
    if (editor.getCurrentState() === 'text') {
        editor.endTextMode();
    } else {
        editor.startTextMode();
    }
});
document.getElementById('btn-text-bold')!.addEventListener('click', () =>
    editor.changeTextStyle({ fontWeight: 'bold' })
);
document.getElementById('btn-end')!.addEventListener('click', () => editor.endAll());
const zoomLabel = document.getElementById('zoom-label')!;
editor.on('change:viewport', ({ viewport }) => {
    zoomLabel.textContent = `zoom: ${viewport.zoom.toFixed(2)} pan: ${viewport.panX.toFixed(0)},${viewport.panY.toFixed(0)}`;
});
editor.on('change:mode', ({ mode }) => {
    panBtn.textContent = mode === 'pan' ? '退出 pan' : 'pan';
    textBtn.textContent = mode === 'text' ? '退出 text' : 'text';
    mosaicBtn.textContent = mode === 'mosaic' ? '退出 mosaic' : 'mosaic';
    cropBtn.textContent = mode === 'crop' ? '退出 crop' : 'crop';
});

editor.on('loadImage', ({ name, width, height }) => {
    console.log('loadImage', name, width, height);
});
editor.on('clearImage', () => {
    console.log('clearImage');
});

// 启动自动加载示例图
loadDemo();
