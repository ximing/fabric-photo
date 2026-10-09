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
                onError={({ url, error }) => {
                    console.error('image load failed', url, error);
                }}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<App />);
