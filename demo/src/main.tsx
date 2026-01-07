import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { FabricPhotoEditor } from '@gmi/fp-react';
import type { Editor } from '@gmi/fp-core';
import '@gmi/fp-react/style.css';
import './style.css';

declare global {
    interface Window {
        editor?: Editor;
    }
}

function App() {
    const fileRef = useRef<HTMLInputElement>(null);

    const onUploadClick = () => fileRef.current?.click();
    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && window.editor) {
            void window.editor.loadImageFromFile(file, file.name);
        }
        e.target.value = '';
    };

    return (
        <div className="demo-shell">
            <FabricPhotoEditor
                src="images/demo.jpeg"
                imageName="demo"
                cssMaxWidth={700}
                cssMaxHeight={400}
                onReady={(editor) => {
                    window.editor = editor;
                }}
            />
            <button type="button" className="demo-upload" onClick={onUploadClick}>
                上传图片
            </button>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onFileChange}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<App />);
