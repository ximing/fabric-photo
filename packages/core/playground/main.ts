import { Editor } from '../src/index';

const editor = new Editor({ container: document.getElementById('editor')! });

(window as unknown as { editor: Editor }).editor = editor;

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

editor.on('loadImage', ({ name, width, height }) => {
    console.log('loadImage', name, width, height);
});
editor.on('clearImage', () => {
    console.log('clearImage');
});

// 启动自动加载示例图
loadDemo();
