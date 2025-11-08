# fabric-photo 现代化改造设计：demo 升级 Vite + 库构建升级 tsup

日期：2026-08-01
状态：已获用户批准

## 背景与目标

fabric-photo 是基于 fabric.js 1.7.3 的纯前端图片编辑器库。当前工具链陈旧且部分已损坏：

- 库构建用 rollup 2 + `@rollup/plugin-typescript`，配置里残留大量无用 babel 依赖
- 本地 demo 用 webpack-dev-server（`webpack.config.js`），页面依赖 bootcss CDN 的 jQuery/lodash（CDN 已不稳定）
- GitHub Pages 示例站由 `website/` 内的 dumi 2 构建，但 `website/docs/index.md` 的 demo 代码是 `website/src/demo` 的旧拷贝，且引用了不存在的 `../src/scss/index.scss`
- CI（`.github/workflows/github-pages.yml`）最近一次 run 已失败：actions 版本过老（checkout@master、setup-node@v1）、Node 10 无法运行现代工具链、且用 npm 而仓库统一 pnpm

目标（用户已确认的四项决策）：

1. **Vite demo 统一部署**：废弃 dumi，本地开发与 GitHub Pages 使用同一份 Vite demo
2. **现代化 CI**：pnpm + Node 20 + 最新 actions，保持部署到 `gh-pages` 分支行为不变
3. **现代 exports map**：tsup 产物 `dist/index.js`（cjs）+ `dist/index.mjs`（esm）+ `dist/index.d.ts`
4. **原生 JS 替代 jQuery**：删除 bootcss CDN script 标签

## 总体方案

demo 源码从 `website/src/demo` 提升为根目录 `demo/`，删除整个 `website/`（含 dumi、docs、独立 lockfile）。Vite root 即 `demo/`，本地 dev 与 Pages 部署同源。

### 备选方案（已否决）

- demo 原地留在 `website/src/demo`、仅删 dumi 配置：改动最小，但 `website/` 目录名失去意义，配置路径别扭。
- 保留 dumi 文档站：需继续同步维护两份 demo 代码（docs 内嵌拷贝 + src/demo），违背单一事实来源。

## 详细设计

### 1. 库构建：rollup → tsup

- 新增 `tsup.config.ts`：
  - entry：`src/index.ts`
  - format：`['cjs', 'esm']`
  - `dts: true`、`sourcemap: true`、`clean: true`
  - fabric 1.7.3 保持 bundle 进产物（与现状一致，不 external；它是 CJS/UMD 老包，external 会破坏浏览器直连场景）
- 产物（tsup 默认命名）：
  - `dist/index.js` — CJS
  - `dist/index.mjs` — ESM
  - `dist/index.d.ts` — 类型声明
- `package.json`：
  ```json
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  }
  ```
- scripts：`build` → `tsup`；`typecheck` 保持 `tsc --noEmit` 不变。
- 删除 `rollup.config.js`、`babel.config.js`，卸载全部 rollup/babel/webpack 相关 devDependencies（约 60+ 个：rollup 及其 7 个插件、整套 @babel/*、webpack/webpack-cli/webpack-dev-server/webpack-merge/webpack-stream、babel-loader/css-loader/less-loader/sass-loader/postcss-loader/style-loader/file-loader/url-loader/html-loader、html-webpack-plugin、mini-css-extract-plugin、clean-webpack-plugin、eslint-webpack-plugin、babel-plugin-import、memory-fs、fs-extra——后两者已全仓 grep 确认零引用，直接卸载）。
- 保留 eslint/prettier/husky/lint-staged/commitlint/mocha/stylelint 等工程化依赖。
- 卸载 `lerna`（仓库是单包，非 monorepo，README 已注明）。

### 2. Demo：webpack-dev-server → Vite

目录迁移：

- `website/src/demo/` → `demo/src/`（`index.tsx`、`main.tsx`）
- `website/src/styles/` → `demo/src/styles/`（`globals.css`、`editor.css`，Tailwind 3 + `@apply`）
- `website/public/images/` → `demo/public/images/`（demo 代码中 `loadImageFromURL('images/demo.jpeg')` 相对路径保持不变）
- `html/index.html` → `demo/index.html`，改造：
  - 删除 bootcss jQuery/lodash 两个 CDN script 标签
  - 入口改为 `<script type="module" src="/src/index.tsx"></script>`
  - 保留 `<div id="demo_container">`

根目录新增 `vite.config.ts`：

- `root: 'demo'`
- 插件：`@vitejs/plugin-react`，`jsxRuntime: 'classic'`（兼容 React 16 + `ReactDOM.render` 写法）
- dev server：端口保持 `9876`，host `0.0.0.0`
- build：`outDir: '../dist-demo'`，`emptyOutDir: true`；`base` 按命令区分——serve 时 `/`，build 时 `/fabric-photo/`（与线上 Pages 路径一致）

demo 代码改造（`demo/src/main.tsx`）：

- 3 处 `$()` 调用改原生 DOM API：
  - `$('#upload-file-image-preview-paper').empty()` → `document.querySelector('#upload-file-image-preview-paper').innerHTML = ''`
  - `$(window).height()` / `$(window).width()` → `window.innerHeight` / `window.innerWidth`
  - 删除 `declare const $: any`
- import 路径 `../../../src/index` 调整为 `../../src/index`（demo/src/main.tsx → src/index.ts，实际按迁移后相对位置计算）

Tailwind/Postcss：

- Vite 自动加载根 `postcss.config.js`（postcss-import + tailwindcss + autoprefixer），配置不变
- `tailwind.config.js` 的 content glob 改为 `./demo/src/**/*.{js,jsx,ts,tsx}` 与 `./src/**/*.{js,jsx,ts,tsx}`

删除：

- `webpack.config.js`
- `html/`（404.html、index.html——404.html 是 dumi/Pages 时代的产物，Vite 单页 demo 不需要）
- `public/`（webpack 产物目录，内含旧 index.html/index.js）

scripts：`dev` → `vite`；新增 `build:demo` → `vite build`；新增 `preview:demo` → `vite preview`。

新增 devDependencies：`vite`、`@vitejs/plugin-react`。

### 3. GitHub Actions 现代化

`.github/workflows/github-pages.yml` 保持同名、同触发条件（push master + tags v1 + paths 过滤 `src/**`、`demo/**`（替代 `website/**`）、`.github/**` + repository_dispatch）。

job 改为：

1. `actions/checkout@v4`（`persist-credentials: false`）
2. `pnpm/action-setup@v4`
3. `actions/setup-node@v4`：node 20，`cache: 'pnpm'`
4. `pnpm install --frozen-lockfile`
5. `pnpm build:demo`
6. `JamesIves/github-pages-deploy-action@v4`：
   - `token: ${{ secrets.ACCESS_TOKEN }}`
   - `branch: gh-pages`
   - `folder: dist-demo`
   - `git-config-name` / `git-config-email` 沿用现有 secrets

线上 URL（`https://ximing.github.io/fabric-photo/`）与展示内容（同一个编辑器 demo 页）保持不变。

### 4. 清理与文档

- 删除整个 `website/`（含 docs、package.json、pnpm-lock.yaml、.umirc.ts、tsconfig.json、typings.d.ts）
- 移除根 package.json 的 `install:website` / `build:website` scripts
- 更新 `readme.md`：开发命令说明（`pnpm dev` / `pnpm build` / `pnpm build:demo`）
- 更新 `CLAUDE.md`：
  - 项目概览中 `website/`（dumi 文档/演示站）的描述改为 `demo/`（Vite 演示页，本地 dev 与 GitHub Pages 同源）
  - 开发入口小节的命令同步更新
  - 局部规则导航移除 `website/CLAUDE.md` 条目

### 5. 依赖变更汇总

新增：`vite`、`@vitejs/plugin-react`、`tsup`。
移除：rollup 系、babel 系、webpack 系、loader 系、lerna、website 全部（dumi、father-build、gh-pages、yorkie、@umijs/*）。
不动：`fabric@1.7.3`、`typescript`、`react@^16` / `react-dom@^16`（demo 用）、tailwindcss/postcss/autoprefixer、eslint/prettier/husky 等工程化依赖。

## 验证计划

1. `pnpm typecheck` 通过。
2. `pnpm build` 成功，`dist/index.js` / `index.mjs` / `index.d.ts` 齐全；静态校验：`node --check dist/index.js` 语法通过、`esbuild dist/index.mjs --bundle --platform=browser` 可解析、`dist/index.d.ts` 含 `FabricPhoto` 声明。注意：产物不支持在 Node 中直接 `require`（fabric 1.7.3 在模块加载期触碰 DOM，旧 rollup 产物同样如此，非回归），功能验证走浏览器冒烟。
3. `pnpm dev` 启动 Vite，用 kimi-webbridge 打开 `http://localhost:9876`：编辑器渲染、示例图片加载、工具栏按钮点击无控制台报错。
4. `pnpm build:demo` 后 `pnpm preview:demo`（`--base /fabric-photo/` 路径下），kimi-webbridge 验证子路径资源加载与页面展示正常。
5. CI 无法本地完整验证：核对 action 版本、secrets 名称与现有仓库设置一致；合并后观察首次 run 结果。

## 明确不做

- 不升级 fabric.js（锁定 1.7.3，项目规则）
- 不升级 React 16 → 18（demo 用 `ReactDOM.render`，本次只做构建工具迁移）
- 不迁移 ESLint 配置（eslint 8 保留，仅卸载 eslint-webpack-plugin）
- 不改动 `src/` 库源码逻辑、`scripts/ralph/` 工作流
- 不发布 npm 新版本（产物验证通过后由用户自行决定）
