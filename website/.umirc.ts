import { defineConfig } from 'dumi';

export default defineConfig({
    title: 'fabric-photo',
    favicon:
        'https://user-images.githubusercontent.com/9554297/83762004-a0761b00-a6a9-11ea-83b4-9c8ff721d4b8.png',
    logo:
        'https://user-images.githubusercontent.com/9554297/83762004-a0761b00-a6a9-11ea-83b4-9c8ff721d4b8.png',
    outputPath: 'dist',
    hash: process.env.NODE_ENV !== 'development',
    base: '/fabric-photo',
    publicPath:
        process.env.NODE_ENV !== 'development' ? 'https://ximing.github.io/fabric-photo/' : '/',
    exportStatic: {}

    // more config: https://d.umijs.org/config
});
