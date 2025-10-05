const { join } = require('path');
const typescript = require('@rollup/plugin-typescript');
const alias = require('@rollup/plugin-alias');

const cwd = __dirname;

const baseConfig = {
    input: join(cwd, 'src/index.ts'),
    external: ['react', 'react-dom', 'jquery'],
    output: [
        {
            file: join(cwd, 'dist/index.js'),
            format: 'cjs',
            sourcemap: true,
            exports: 'named'
        }
    ],
    plugins: [
        alias({
            entries: [
                // {
                //     find: 'fabric',
                //     replacement: join(cwd, 'node_modules/fabric/dist/fabric.js')
                // }
            ]
        }),
        typescript({
            tsconfig: './tsconfig.json'
        })
    ]
};
const esmConfig = {
    ...baseConfig,
    output: {
        ...baseConfig.output,
        sourcemap: true,
        format: 'es',
        file: join(cwd, 'dist/index.esm.js')
    }
};

function rollup() {
    const target = process.env.TARGET;
    if (target === 'umd') {
        return baseConfig;
    }
    if (target === 'esm') {
        return esmConfig;
    }
    return [baseConfig, esmConfig];
}
module.exports = rollup();
