import { sep } from 'path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

/**
 * fabric 1.7.3 内嵌一段仅 Node 环境执行的代码
 * （由 `typeof document/window !== 'undefined'` 提前 return 保护），
 * 其中 require('canvas'/'xmldom'/'url'/'http'/'https'/'jsdom'/'fs')。
 * 浏览器产物不需要这些模块，且 canvas 是未编译的原生模块，
 * 直接 bundle 会失败——这里将它们打桩为空对象。
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
