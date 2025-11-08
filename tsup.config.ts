import { sep } from 'path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

/**
 * fabric 1.7.3 内含仅 Node 环境执行的代码分支（if/else 的 else 分支，
 * Node 下模块加载期会真实执行），其中 require('canvas'/'xmldom'/'url'/'http'/'https'/'jsdom'/'fs')。
 * 浏览器运行时该分支不会执行，但打包器需要静态解析这些 specifier，
 * 且 canvas 是未编译的原生模块，直接 bundle 会失败——这里将它们打桩为空对象。
 * 注意：产物不支持在 Node 中直接 require。
 */
const fabricNodeDepsStub: Plugin = {
    name: 'fabric-node-deps-stub',
    setup(build) {
        build.onResolve({ filter: /^(canvas|xmldom|url|http|https|jsdom|fs)$/ }, (args) => {
            if (args.importer.includes(`${sep}fabric${sep}`)) {
                return { path: args.path, namespace: 'fabric-node-stub' };
            }
            return null;
        });
        build.onLoad({ filter: /.*/, namespace: 'fabric-node-stub' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js'
        }));
    }
};

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    // fabric 1.7.3 保持 bundle 进产物，不 external（全局约束）
    noExternal: ['fabric'],
    esbuildPlugins: [fabricNodeDepsStub]
});
