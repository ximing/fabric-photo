# Vite + tsup 现代化改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 fabric-photo 的库构建从 rollup 迁移到 tsup、demo 从 webpack 迁移到 Vite（本地开发与 GitHub Pages 同源），并现代化 GitHub Actions。

**Architecture:** demo 源码从 `website/src/demo` 提升为根目录 `demo/`（Vite root），删除 dumi；库用 tsup 产出 cjs+esm+d.ts；CI 用 pnpm + Node 20 构建 `dist-demo` 部署到 gh-pages 分支。

**Tech Stack:** tsup 8、Vite、@vitejs/plugin-react（classic JSX runtime，React 16）、Tailwind 3 + PostCSS、pnpm 10、Node 20。

**Spec:** `docs/superpowers/specs/2026-08-01-vite-tsup-modernization-design.md`

## Global Constraints

- 包管理器统一 pnpm；Node 版本 20（本地 v20.20.1，CI `node-version: '20'`）
- fabric.js 锁定 1.7.3，bundle 进库产物（不 external），不按 fabric 5/6 API 改代码
- `src/` TypeScript strict，任何改动后 `pnpm typecheck` 必须通过
- 不升级 React 16、不迁移 ESLint 配置、不改 `src/` 库源码逻辑、不动 `scripts/ralph/`
- demo dev 端口保持 `9876`；Pages 线上路径保持 `https://ximing.github.io/fabric-photo/`
- 浏览器验证统一使用 kimi-webbridge 技能
- 库构建产物在 node 中 `require()` 会抛错（fabric 1.7.3 触碰 DOM，现状如此，非回归）——功能验证走浏览器，node 侧只做语法/打包静态检查

---

### Task 1: package.json 改组与旧构建配置删除

**Files:**
- Modify: `package.json`（全量替换）
- Delete: `babel.config.js`、`rollup.config.js`、`webpack.config.js`

**Interfaces:**
- Produces: scripts `dev`（vite）、`build`（tsup）、`build:demo`、`preview:demo`；devDeps 含 `vite`、`@vitejs/plugin-react`、`tsup`；exports map 指向 `dist/index.js|mjs|d.ts`。后续所有任务依赖这些 script 名。

- [ ] **Step 1: 全量替换 `package.json` 为以下内容**

```json
{
    "name": "fabric-photo",
    "version": "0.2.0",
    "description": "web 图片编辑器",
    "repository": "",
    "author": "ximing",
    "packageManager": "pnpm@10.33.0",
    "main": "./dist/index.js",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.mjs",
            "require": "./dist/index.js"
        }
    },
    "files": [
        "dist"
    ],
    "scripts": {
        "i": "pnpm install",
        "dev": "vite",
        "build": "tsup",
        "build:demo": "vite build",
        "preview:demo": "vite preview",
        "typecheck": "tsc --noEmit",
        "tsc": "tsc"
    },
    "publishConfig": {
        "access": "public",
        "registry": "https://registry.npmjs.org/"
    },
    "dependencies": {
        "classnames": "^2.5.1",
        "fabric": "1.7.3",
        "lucide-react": "^0.344.0",
        "tailwindcss": "^3.4.1"
    },
    "devDependencies": {
        "@babel/eslint-parser": "^7.28.0",
        "@commitlint/cli": "^20.4.3",
        "@commitlint/config-conventional": "^20.4.3",
        "@types/fabric": "^5.3.11",
        "@types/react": "^16.14.69",
        "@types/react-dom": "^16.9.25",
        "autoprefixer": "^10.4.27",
        "eslint": "^8.57.0",
        "eslint-config-airbnb": "^19.0.4",
        "eslint-config-prettier": "^10.1.8",
        "eslint-config-standard": "^17.1.0",
        "eslint-config-standard-jsx": "^11.0.0",
        "eslint-html-reporter": "^0.7.4",
        "eslint-plugin-flowtype": "^8.0.3",
        "eslint-plugin-import": "^2.32.0",
        "eslint-plugin-jest": "^29.15.0",
        "eslint-plugin-jsx-a11y": "^6.10.2",
        "eslint-plugin-node": "^11.1.0",
        "eslint-plugin-prettier": "^5.5.5",
        "eslint-plugin-promise": "^6.1.1",
        "eslint-plugin-react": "^7.37.5",
        "husky": "^9.1.7",
        "lint-staged": "^16.3.3",
        "mocha": "^11.7.5",
        "postcss": "^8.5.8",
        "postcss-import": "^15.1.0",
        "prettier": "^3.8.1",
        "react": "^16.10.2",
        "react-dom": "^16.10.2",
        "stylelint": "^17.4.0",
        "tslib": "^2.8.1",
        "typescript": "^5.9.3"
    },
    "onlyBuiltDependencies": [
        "canvas",
        "contextify",
        "node-sass",
        "nx"
    ]
}
```

变更说明（供 review，不用照抄）：删除 rollup 及其 7 插件、整套 @babel/*（保留 `@babel/eslint-parser`，`.eslintrc.js` 在用）、webpack 系与全部 loader、html-webpack-plugin、mini-css-extract-plugin、clean-webpack-plugin、eslint-webpack-plugin、babel-plugin-import、memory-fs、fs-extra、lerna、less/sass 系、未在 `postcss.config.js` 中引用的 postcss-clearfix/flexbugs-fixes/position/preset-env/size；移除 `install:website`/`build:website` scripts。`dependencies` 块不动。

- [ ] **Step 2: 删除旧构建配置**

```bash
git rm babel.config.js rollup.config.js webpack.config.js
```

- [ ] **Step 3: 重新安装依赖并添加新构建工具**

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm add -D vite @vitejs/plugin-react tsup
```

Expected: 安装成功；`pnpm add` 会在 package.json 写入 caret 版本范围；`node_modules/.bin/tsup`、`node_modules/.bin/vite` 存在（`ls node_modules/.bin/ | grep -E "tsup|vite"`）

注意：lockfile 必须重新生成（依赖集大变），删除重建是预期行为。

- [ ] **Step 4: 验证 typecheck 仍通过**

Run: `pnpm typecheck`
Expected: PASS（src 未改动，仅验证 typescript 卸载重装后正常）

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: 依赖改组，移除 webpack/rollup/babel 构建链，引入 vite/tsup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: tsup 库构建

**Files:**
- Create: `tsup.config.ts`
- Modify: `tsconfig.json`（tsc 转为纯 typecheck 用途）

**Interfaces:**
- Consumes: Task 1 的 `pnpm build` → `tsup` script。
- Produces: `dist/index.js`（cjs）、`dist/index.mjs`（esm）、`dist/index.d.ts`——与 package.json exports map 一一对应，Task 4 的 demo 虽不直接消费 dist，但发布产物以此为准。

- [ ] **Step 1: 创建 `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist'
});
```

- [ ] **Step 2: 精简 `tsconfig.json`**（declaration/declarationDir 会与 tsup dts 输出路径冲突，且 tsc 已不再负责产物）

全量替换为：

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "lib": ["ES2015", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 构建并验证产物**

Run: `pnpm build`
Expected: 成功；`ls dist/` 至少包含 `index.js`、`index.js.map`、`index.mjs`、`index.mjs.map`、`index.d.ts`

若 `index.d.ts` 未生成而是出现了 `dist/types/`，说明 tsconfig 的 declarationDir 仍在生效——回到 Step 2 确认 tsconfig 已替换。

- [ ] **Step 4: 静态校验产物**

```bash
node --check dist/index.js && echo "cjs syntax OK"
npx esbuild dist/index.mjs --bundle --platform=browser --outfile=/dev/null && echo "esm bundle OK"
grep -c "FabricPhoto" dist/index.d.ts
```

Expected: 两条 OK；`index.d.ts` 中包含 `FabricPhoto` 声明（count ≥ 1）。
（不要用 `node -e "require('./dist')"` 做功能验证——fabric 1.7.3 触碰 DOM，现状即会抛错，见 Global Constraints。）

- [ ] **Step 5: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tsup.config.ts tsconfig.json
git commit -m "build: 库构建从 rollup 迁移到 tsup（cjs+esm+d.ts）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: demo 目录迁移与代码改造

**Files:**
- Rename: `website/src/demo/` → `demo/src/`（`index.tsx`、`main.tsx`）
- Rename: `website/src/styles/` → `demo/src/styles/`（`globals.css`、`editor.css`）
- Rename: `website/public/images/` → `demo/public/images/`（`demo.jpeg`）
- Create: `demo/index.html`
- Modify: `demo/src/index.tsx`（样式 import 路径）、`demo/src/main.tsx`（库 import 路径 + 去 jQuery）
- Modify: `tailwind.config.js`（content glob）
- Delete: `html/`、`public/`

**Interfaces:**
- Consumes: 无（纯文件迁移，dev server 在 Task 4 才启动）。
- Produces: Vite root 目录 `demo/`：`demo/index.html` 引用 `/src/index.tsx`；`demo/src/main.tsx` 导出默认组件 `WrapContainer`（Task 4 dev server 的渲染入口）；`demo/public/images/demo.jpeg` 供 `loadImageFromURL('images/demo.jpeg')` 使用。

- [ ] **Step 1: 目录迁移**

```bash
mkdir -p demo/public
git mv website/src/demo demo/src
git mv website/src/styles demo/src/styles
git mv website/public/images demo/public/images
git rm -r html public || rm -rf html public
```

（`public/` 内可能有未跟踪的 webpack 产物，`git rm` 失败时退回 `rm -rf`。）

- [ ] **Step 2: 创建 `demo/index.html`**

```html
<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>kityphoto</title>
    <link rel="icon" href="data:;base64,=">
</head>

<body>
    <div id="demo_container">
    </div>
    <script type="module" src="/src/index.tsx"></script>
</body>

</html>
```

（由原 `html/index.html` 改造：删除 bootcss jQuery/lodash 两个 CDN script 标签和 `/public/index.js` script 标签，入口换成 Vite module script。）

- [ ] **Step 3: 修改 `demo/src/index.tsx` 样式 import 路径**

将前两行：

```ts
import '../styles/globals.css';
import '../styles/editor.css';
```

改为：

```ts
import './styles/globals.css';
import './styles/editor.css';
```

- [ ] **Step 4: 修改 `demo/src/main.tsx` 库 import 路径**

将第 22 行：

```ts
import { FabricPhoto, consts } from '../../../src/index';
```

改为：

```ts
import { FabricPhoto, consts } from '../../src/index';
```

- [ ] **Step 5: `demo/src/main.tsx` 去 jQuery（3 处 + 声明）**

a) 删除第 24 行：

```ts
declare const $: any;
```

b) `componentWillUnmount` 中（约第 129 行）：

```ts
      $('#upload-file-image-preview-paper').empty();
```

改为：

```ts
      const paper = document.querySelector('#upload-file-image-preview-paper');
      if (paper) {
        paper.innerHTML = '';
      }
```

c) `getWindowViewPort`（约第 160-165 行）：

```ts
    return {
      height: $(window).height(),
      width: $(window).width()
    };
```

改为：

```ts
    return {
      height: window.innerHeight,
      width: window.innerWidth
    };
```

- [ ] **Step 6: 更新 `tailwind.config.js` 的 content glob**

将：

```js
  content: [
    './website/src/demo/**/*.{js,jsx,ts,tsx}',
    './website/src/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
```

改为：

```js
  content: [
    './demo/index.html',
    './demo/src/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
```

- [ ] **Step 7: 验证无残留引用**

```bash
grep -rn "website/src\|bootcss\|jQuery\|jquery" demo/ tailwind.config.js 2>/dev/null
grep -rn "declare const \$" demo/src/ 2>/dev/null
```

Expected: 两条命令均无输出。

- [ ] **Step 8: Commit**

```bash
git add demo/ tailwind.config.js
git commit -m "feat: demo 迁移至根目录 demo/，去除 jQuery/lodash CDN 依赖

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Vite 配置与 dev 浏览器冒烟

**Files:**
- Create: `vite.config.ts`

**Interfaces:**
- Consumes: Task 1 的 `pnpm dev` → `vite` script；Task 3 的 `demo/` 目录（Vite root）。
- Produces: dev server `http://localhost:9876`；Task 5 用同一配置的 `build` 分支。

- [ ] **Step 1: 创建 `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    root: 'demo',
    base: command === 'build' ? '/fabric-photo/' : '/',
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
```

说明：`jsxRuntime: 'classic'` 兼容 React 16 + `ReactDOM.render` 写法；`base` 仅 build 时用 Pages 子路径。

- [ ] **Step 2: 启动 dev server（后台）**

```bash
pnpm dev > /tmp/fabric-photo-vite-dev.log 2>&1 &
sleep 3; grep -E "Local|ready|error" /tmp/fabric-photo-vite-dev.log
```

Expected: 日志出现 `Local: http://localhost:9876/`，无 error。

- [ ] **Step 3: kimi-webbridge 浏览器冒烟**

使用 kimi-webbridge 技能打开 `http://localhost:9876`，检查：

1. 页面渲染出编辑器（工具栏 + 图片上传区域可见）
2. 控制台无红色报错（404 / module resolve / React 错误）
3. 若 demo 自动加载 `images/demo.jpeg`，确认图片显示在画布中
4. 点击工具栏任意按钮（如裁剪/文字），无新增控制台报错

- [ ] **Step 4: 停掉 dev server 并 Commit**

```bash
kill %1 2>/dev/null; pkill -f "vite" 2>/dev/null; true
git add vite.config.ts
git commit -m "feat: demo dev server 从 webpack-dev-server 迁移到 Vite

Co-Authored-By: Claude <noreply@anthropic.com>"
```

若 Step 3 发现问题，先修复再提交（修复也并入本 commit）。

---

### Task 5: 生产构建与 preview 冒烟

**Files:**
- Modify: `.gitignore`（忽略 `dist-demo`）

**Interfaces:**
- Consumes: Task 4 的 `vite.config.ts`（`build.outDir: '../dist-demo'`、`base: '/fabric-photo/'`）；Task 1 的 `build:demo` / `preview:demo` scripts。
- Produces: `dist-demo/`——Task 6 CI 中 `folder: dist-demo` 的部署源。

- [ ] **Step 1: `.gitignore` 追加 `dist-demo`**

文件当前内容：

```
node_modules
.idea
out
dist
```

追加一行变为：

```
node_modules
.idea
out
dist
dist-demo
```

- [ ] **Step 2: 生产构建**

Run: `pnpm build:demo`
Expected: 成功；`ls dist-demo/` 包含 `index.html`、`assets/`、`images/demo.jpeg`；`grep -o '/fabric-photo/assets/[^"]*' dist-demo/index.html` 能匹配到带 base 前缀的资源路径。

- [ ] **Step 3: preview 冒烟**

```bash
pnpm preview:demo > /tmp/fabric-photo-vite-preview.log 2>&1 &
sleep 2; grep -E "Local|http" /tmp/fabric-photo-vite-preview.log
```

用 kimi-webbridge 打开 `http://localhost:4173/fabric-photo/`（vite preview 默认端口 4173，以日志实际输出为准），检查项同 Task 4 Step 3：编辑器渲染、控制台无报错、图片加载、工具按钮可点。

- [ ] **Step 4: 停 server 并 Commit**

```bash
pkill -f "vite preview" 2>/dev/null; true
git add .gitignore
git commit -m "build: 忽略 dist-demo 产物目录

Co-Authored-By: Claude <noreply@anthropic.com>"
```

若冒烟发现问题，修复后一并提交。

---

### Task 6: GitHub Actions 现代化

**Files:**
- Modify: `.github/workflows/github-pages.yml`（全量替换）

**Interfaces:**
- Consumes: Task 5 的 `dist-demo/`（部署 folder）；Task 1 的 `build:demo` script 与 `packageManager: pnpm@10.33.0` 字段（`pnpm/action-setup@v4` 从此读取版本）。

- [ ] **Step 1: 全量替换 `.github/workflows/github-pages.yml`**

```yaml
name: Example Build & Deploy to GitHub Pages
on:
  push:
    branches:
      - master
    tags:
      - v1
    paths:
      - 'src/**'
      - 'demo/**'
      - '.github/**'
  repository_dispatch:
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout  🛎️
        uses: actions/checkout@v4
        with:
          persist-credentials: false
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install & build 🔧
        run: |
          pnpm install --frozen-lockfile
          pnpm build:demo
        env:
          CI: true
      - name: Deploy 🚀
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: gh-pages
          folder: dist-demo
          git-config-name: ${{ secrets.GIT_CONFIG_NAME }}
          git-config-email: ${{ secrets.GIT_CONFIG_EMAIL }}
```

变更说明：actions 全部升到 v4；Node 10 → 20；npm → pnpm（`--frozen-lockfile`）；构建命令从 dumi 的 `build:website` 换成 `build:demo`；部署 folder 从 `website/dist` 换成 `dist-demo`；触发 paths 中 `website/**` 换成 `demo/**`；secrets 名称与 gh-pages 分支保持不变。

- [ ] **Step 2: 校验 YAML 语法**

Run: `npx js-yaml .github/workflows/github-pages.yml > /dev/null && echo "YAML OK"`
Expected: 输出 `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/github-pages.yml
git commit -m "ci: GitHub Actions 现代化（pnpm + Node 20 + actions v4），部署 Vite demo

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 删除 website/ 与文档更新

**Files:**
- Delete: `website/`（整个目录）
- Modify: `readme.md`（本地开发小节）
- Modify: `CLAUDE.md`（项目概览、开发入口、局部规则导航）

**Interfaces:**
- Consumes: Task 3 已将 demo 所需全部文件迁出 `website/`（迁移时用 `git mv`，website 内剩余 dumi 专属文件均可删除）。
- Produces: 最终文档状态，任务完成后仓库无 dumi 残留。

- [ ] **Step 1: 删除 website/**

```bash
git rm -r website
```

- [ ] **Step 2: 更新 `readme.md` 本地开发小节（约 361-375 行）**

将：

````markdown
## 🛠️ 本地开发

```bash
# 克隆项目
git clone https://github.com/ximing/fabric-photo.git

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 构建
pnpm run build
```
````

替换为：

````markdown
## 🛠️ 本地开发

```bash
# 克隆项目
git clone https://github.com/ximing/fabric-photo.git

# 安装依赖
pnpm install

# 启动 demo 开发服务器（Vite，端口 9876）
pnpm run dev

# 构建库产物（tsup，输出 dist/）
pnpm run build

# 构建 demo 站点（输出 dist-demo/，即 GitHub Pages 内容）
pnpm run build:demo
```
````

- [ ] **Step 3: 更新 `CLAUDE.md` 三处**

a) 项目概览的关键子系统列表，将：

```
  - `website/` — dumi 文档/演示站，独立 `package.json` 与 lockfile
```

替换为：

```
  - `demo/` — Vite 演示页（React 16），本地 `pnpm dev` 与 GitHub Pages 同源，构建输出 `dist-demo/`
```

b) 项目概览的关键子系统列表，将：

```
  - `html/`、`public/` — 本地 dev server 的演示页面
```

替换为：

```
  - `dist-demo/` — demo 站点构建产物（GitHub Pages 部署源），不要手改
```

c) 开发入口小节，将：

```
- 安装依赖：`pnpm install`
- 本地开发（webpack dev server + 演示页）：`pnpm dev`
- 构建库产物：`pnpm build`（rollup，输出到 `dist/`）
- 类型检查：`pnpm typecheck`
- 文档站：`pnpm install:website` / `pnpm build:website`（在 `website/` 内独立安装构建）
```

替换为：

```
- 安装依赖：`pnpm install`
- 本地开发（Vite dev server + 演示页，端口 9876）：`pnpm dev`
- 构建库产物：`pnpm build`（tsup，输出到 `dist/`，cjs + esm + d.ts）
- 构建 demo 站点：`pnpm build:demo`（Vite，输出到 `dist-demo/`）
- 类型检查：`pnpm typecheck`
```

d) 局部规则导航，删除这一行：

```
- `website/CLAUDE.md` — 文档站的结构与构建约定
```

- [ ] **Step 4: 全仓检查残留引用**

```bash
grep -rn "website\|dumi\|webpack\|rollup" readme.md CLAUDE.md package.json vite.config.ts tsup.config.ts .github/workflows/ 2>/dev/null | grep -v "dist-demo\|node_modules"
```

Expected: 无输出（或仅有合理的历史叙述性文字，逐条确认）。

- [ ] **Step 5: 最终验证**

```bash
pnpm typecheck && pnpm build && pnpm build:demo
```

Expected: 三个命令全部成功。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 删除 dumi website 目录，更新 readme 与 CLAUDE.md

Co-Authored-By: Claude <noreply@anthropic.com>"
```
