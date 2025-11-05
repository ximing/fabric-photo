import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
    root: 'demo',
    base: command === 'build' || isPreview ? '/fabric-photo/' : '/',
    plugins: [
        react({
            jsxRuntime: 'classic'
        })
    ],
    server: {
        host: '0.0.0.0',
        port: 9876
    },
    build: {
        outDir: '../dist-demo',
        emptyOutDir: true
    }
}));
