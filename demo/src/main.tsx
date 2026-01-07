import { createRoot } from 'react-dom/client';
import { FabricPhotoEditor } from '@gmi/fp-react';
import '@gmi/fp-react/style.css';
import './style.css';

createRoot(document.getElementById('root')!).render(
    <FabricPhotoEditor src="images/demo.jpeg" imageName="demo" />
);
