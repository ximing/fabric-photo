# Phase 3：新 demo + CI 切换 + 旧代码清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 @gmi/fp-react 重写 demo（Vite + React 19，本地与 GitHub Pages 同源），删除旧库代码与旧构建链路，CI 切换到 monorepo 验证+部署，readme/CLAUDE.md 重写，线上 https://ximing.github.io/fabric-photo/ 平滑切换为新 Figma UI。

**Architecture:** demo/ 成为 workspace 成员（`fabric-photo-demo`，private），经 workspace link 消费 @gmi/fp-react / @gmi/fp-core 的 **dist 产物**（dev/build 前经 pre hook 先构建两包）；旧 `src/`、root 旧构建配置与旧依赖整体删除；CI 在部署前跑 `pnpm -r typecheck` + `pnpm -r test` 门禁。

**Tech Stack:** Vite 8 + @vitejs/plugin-react 6（automatic JSX runtime）、React 19、pnpm workspace、GitHub Actions（actions v4 + JamesIves/github-pages-deploy-action@v4 + GITHUB_TOKEN）。

**Spec:** `docs/superpowers/specs/2026-08-01-monorepo-prosemirror-redesign-design.md`（§4 阶段计划 / CI）

## Global Constraints

- 包管理器统一 pnpm；Node 20
- **线上 URL 不变**：`https://ximing.github.io/fabric-photo/`；部署目标 `dist-demo` → `gh-pages` 分支不变；`secrets.GITHUB_TOKEN` + `permissions: contents: write` + git-config secrets 不变
- demo dev 端口保持 `9876`；base 逻辑保持 `command === 'build' || isPreview ? '/fabric-photo/' : '/'`（vite preview 的 command 是 'serve'——这是已踩过的坑）
- demo 经 workspace link 消费两包 **dist 产物**：demo 包的 `predev`/`prebuild` hook 先跑 `pnpm -r --filter @gmi/* build`
- TypeScript strict；每个任务结束 `pnpm -r typecheck && pnpm -r test` 必过（core 144 / react 97 不回归）
- 删除旧代码是破坏性操作：T4 删除前必须确认新 demo 已可独立运行（T2/T3 已验收）
- `scripts/ralph/` 不动；`docs/` 不动；`packages/` 不动（T4 只删旧 `src/` 与 root 旧配置）
- 浏览器验证统一 kimi-webbridge（本地 dev：session `fp-demo-dev`；线上：session `fp-pages-verify`）
- 主 Agent 只做调度；实现由 SubAgent 完成

## 文件结构（Phase 3 完成时）

```
demo/                              # workspace 成员 fabric-photo-demo（private）
├── package.json                   # T1
├── tsconfig.json                  # T1
├── vite.config.ts                 # T1（从 root 迁入改造）
├── index.html                     # T1（新入口）
├── public/images/demo.jpeg        # 保留（已存在）
└── src/
    ├── main.tsx                   # T2
    └── style.css                  # T2（页面壳全屏样式）
.github/workflows/github-pages.yml # T5
readme.md                          # T5（重写）
CLAUDE.md                          # T5（重写）
删除（T4）：src/、vite.config.ts、tsup.config.ts、tsconfig.json、tailwind.config.js、
          postcss.config.js、index.js、jsdoc.conf.json、_config.yml（root 层）
```

---

### Task 1: demo 包化（workspace 成员 + 独立可跑骨架）

**Files:**
- Create: `demo/package.json`、`demo/tsconfig.json`、`demo/vite.config.ts`
- Modify: `demo/index.html`（新入口）
- Create: `demo/src/main.tsx`（占位）、`demo/src/style.css`

**Interfaces:**
- Produces: `pnpm --filter fabric-photo-demo dev|build|preview|typecheck` 四个 script；demo 为 workspace 成员（pnpm-workspace.yaml 的 `demo` glob 已覆盖，无需改）——T2-T6 依赖。

- [ ] **Step 1: 创建 `demo/package.json`**

```json
{
  "name": "fabric-photo-demo",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "predev": "pnpm -r --filter @gmi/* build",
    "dev": "vite --port 9876 --strictPort",
    "prebuild": "pnpm -r --filter @gmi/* build",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@gmi/fp-core": "workspace:*",
    "@gmi/fp-react": "workspace:*",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.5",
    "typescript": "^5.9.3",
    "vite": "^8.2.0"
  }
}
```

- [ ] **Step 2: 创建 `demo/tsconfig.json` 与 `demo/vite.config.ts`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "vite.config.ts"],
  "exclude": ["node_modules"]
}
```

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
    base: command === 'build' || isPreview ? '/fabric-photo/' : '/',
    plugins: [react()],
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

（与旧 root vite.config.ts 的差异：root 即 demo/ 自身不再需要 `root: 'demo'`；React 19 用默认 automatic runtime，不要 `jsxRuntime: 'classic'`。）

- [ ] **Step 3: 改造 `demo/index.html`**

全量替换：

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
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>

</html>
```

- [ ] **Step 4: 占位入口 + 页面壳样式**

`demo/src/main.tsx`（T2 替换为完整实现，本步先打通链路）：

```tsx
import { createRoot } from 'react-dom/client';
import { FabricPhotoEditor } from '@gmi/fp-react';
import '@gmi/fp-react/style.css';
import './style.css';

createRoot(document.getElementById('root')!).render(
    <FabricPhotoEditor src="images/demo.jpeg" imageName="demo" />
);
```

`demo/src/style.css`：

```css
html,
body,
#root {
    height: 100%;
    margin: 0;
}

body {
    font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
```

- [ ] **Step 5: 安装与验证**

```bash
pnpm install
pnpm --filter fabric-photo-demo typecheck && pnpm --filter fabric-photo-demo build
```

Expected: 成功（prebuild 先构建 core/react）；`ls dist-demo/` 含 index.html、assets/、images/demo.jpeg；`grep -o '/fabric-photo/assets/[^"]*' dist-demo/index.html` 能匹配。

- [ ] **Step 6: Commit**

```bash
git add demo/ pnpm-lock.yaml
git commit -m "feat(demo): demo 包化为 workspace 成员（Vite + React 19 + fp-react）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

注意：root `vite.config.ts`（旧）仍在，root `dev`/`build:demo` scripts 仍指旧链路——T4 才切。本任务新旧并存。

---

### Task 2: demo 页面完整实现（上传 + window.editor + 下载验证钩子）

**Files:**
- Modify: `demo/src/main.tsx`
- Modify: `demo/src/style.css`

**Interfaces:**
- Consumes: T1 骨架；@gmi/fp-react 的 `FabricPhotoEditor`、`Editor`（类型来自 @gmi/fp-core，经 @gmi/fp-react re-export 或直接 `@gmi/fp-core` 导入类型——用后者，demo 已直接依赖）。
- Produces: T3 冒烟的完整页面：编辑器 + 浮动上传按钮 + `window.editor`。

- [ ] **Step 1: 完整 `demo/src/main.tsx`**

```tsx
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
```

`demo/src/style.css` 追加：

```css
.demo-shell {
    position: relative;
    height: 100%;
}

.demo-upload {
    position: absolute;
    top: 8px;
    right: 248px; /* 顶栏内、避开右侧面板 */
    z-index: 10;
    padding: 4px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    background: #ffffff;
    cursor: pointer;
}

.demo-upload:hover {
    background: #f0f0f0;
}
```

- [ ] **Step 2: typecheck + 构建**

```bash
pnpm --filter fabric-photo-demo typecheck && pnpm --filter fabric-photo-demo build
```

Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add demo/
git commit -m "feat(demo): 编辑器接入与上传入口

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 本地全功能浏览器冒烟（fp-react 首次真实验证）

**Files:**
- 无新文件（验证任务；发现问题按 fix 流程处理）

**Interfaces:**
- Consumes: T2 页面。
- Produces: T4 删除旧代码的安全前提（新 demo 功能验收通过）。

- [ ] **Step 1: 启动 dev server**

```bash
pnpm --filter fabric-photo-demo dev > /tmp/fp-demo-dev.log 2>&1 &
sleep 5; grep -E "Local|ready|error" /tmp/fp-demo-dev.log
```

（predev 会先构建 core/react。若 9876 被占：`lsof -ti:9876 | xargs kill` 后重启。）

- [ ] **Step 2: kimi-webbridge 逐项冒烟（session `fp-demo-dev`，标签组「fp-demo 本地冒烟」）**

| # | 验收项 | 通过标准 |
|---|---|---|
| 1 | 加载 | Figma 四区布局可见（顶栏/左工具栏/灰底画布/右面板），示例图居中，控制台无报错，`window.editor` 存在 |
| 2 | 工具栏 | 10 个工具按钮；点「画笔」按钮高亮、state.mode === 'freedraw'；再点回 normal |
| 3 | 绘制 | 画布上拖一笔 → doc.objects 出现 path 对象；右侧面板切到该对象属性（选中态） |
| 4 | 实时改色 | 选中对象点色板红色 → stroke 立即变红（state 与画面一致） |
| 5 | 文字 | 点文字工具 → 点画布 → 进入 IText 编辑 → 输入 → 点击别处提交 → 对象文本正确 |
| 6 | 裁剪 | 裁剪按钮 → 蚂蚁线框出现 → Apply → background 宽高变小；undo 恢复 |
| 7 | 旋转 | 旋转按钮 → angle=90 宽高互换；undo 恢复 |
| 8 | 缩放/平移 | zoom +/- 与百分比复位；滚轮缩放；pan 工具拖动；zoom undo 可用 |
| 9 | undo/redo | 按钮禁用态随 historyChange 变化；undo 撤销上一操作、redo 重做 |
| 10 | 形状 | 形状工具 → 选项条选 circle → Shift 拖出正圆 |
| 11 | 马赛克 | 马赛克工具涂抹 → 色块出现，可选中删除 |
| 12 | 快捷键 | p→freedraw、v→normal、Delete 删选中、Cmd/Ctrl+Z undo、Esc endAll |
| 13 | 导出 | 点下载按钮 → evaluate 拦截确认 toDataURL 被调且 a[download] 触发（文件名 demo.png） |
| 14 | 上传换图 | evaluate 构造 File 调 `editor.loadImageFromFile`（或点击上传按钮走 input）→ 新图加载、对象清空、可撤销 |
| 15 | 视觉走查 | 整页截图：布局无错位、色板白块有边框、禁用态可见 |

**上下文纪律**：evaluate 用 compact JSON.stringify；截图不超过 6 张；发现问题先记录再继续，冒烟结束后统一判定。

- [ ] **Step 3: 生产构建 preview 冒烟**

```bash
lsof -ti:9876 | xargs kill; pnpm --filter fabric-photo-demo preview > /tmp/fp-demo-preview.log 2>&1 &
```

webbridge 打开 `http://localhost:4173/fabric-photo/`（以日志端口为准）：页面加载、图片显示、无 404（重点查 assets 路径带 /fabric-photo/ 前缀）、一次绘制操作。

- [ ] **Step 4: 停 server + 冒烟报告**

```bash
lsof -ti:4173 | xargs kill 2>/dev/null; true
```

冒烟结果写入报告文件（逐项 PASS/FAIL + 证据）。发现的真实 bug：STOP 上报 BLOCKED（不要自己修）。

---

### Task 4: 旧代码与旧构建链路清理

**Files:**
- Delete: `src/`（整个旧库）、`vite.config.ts`、`tsup.config.ts`、`tsconfig.json`、`tailwind.config.js`、`postcss.config.js`、`index.js`、`jsdoc.conf.json`、`_config.yml`（均 root 层）
- Modify: `package.json`（scripts 重定向 + dependencies/devDependencies 瘦身）
- Modify: `.husky/pre-commit` 或 lint-staged 配置（若存在且调用陈旧工具）

**Interfaces:**
- Consumes: T3 验收通过（新 demo 独立可用）。
- Produces: 纯 monorepo 的 root；T5 的 CI/文档基座。

- [ ] **Step 1: 删除旧文件**

```bash
git rm -r src vite.config.ts tsup.config.ts tsconfig.json tailwind.config.js postcss.config.js index.js jsdoc.conf.json _config.yml
```

- [ ] **Step 2: root `package.json` 改写**

scripts 全量替换为：

```json
"scripts": {
    "i": "pnpm install",
    "dev": "pnpm --filter fabric-photo-demo dev",
    "build": "pnpm -r build",
    "build:demo": "pnpm --filter fabric-photo-demo build",
    "preview:demo": "pnpm --filter fabric-photo-demo preview",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
}
```

（删除 `tsc`、`build:packages`、`typecheck:all`——被 `pnpm -r` 形式覆盖。）

dependencies 块**整个删除**（classnames/fabric@1.7.3/lucide-react/tailwindcss 全是旧 src/旧 demo 的依赖；core/react 各自声明自己的）。

devDependencies 瘦身：删除 `@babel/eslint-parser`、`@types/fabric`、`@types/react`、`@types/react-dom`、`autoprefixer`、`eslint` 及全部 `eslint-*`、`eslint-html-reporter`、`lint-staged`、`mocha`、`postcss`、`postcss-import`、`stylelint`、`tsup`、`vite`、`@vitejs/plugin-react`、`react`、`react-dom`（后四个已移到 demo/react 包）。保留：`@commitlint/cli`、`@commitlint/config-conventional`、`husky`、`prettier`、`tslib`、`typescript`。

`onlyBuiltDependencies`：删除 `node-sass`、`nx` 死条目（保留 `canvas`、`contextify`——jsdom/fabric 的 optional 原生依赖）。

- [ ] **Step 3: git hooks 检查**

```bash
cat .husky/pre-commit 2>/dev/null; cat .husky/commit-msg 2>/dev/null; grep -n "lint-staged" package.json
```

若 pre-commit 调用 lint-staged（已卸载）→ 删除该 hook 文件（`git rm .husky/pre-commit`）；commit-msg（commitlint）保留。若 package.json 有 `lint-staged` 字段 → 删除该字段。

- [ ] **Step 4: 重装 + 全量验证**

```bash
pnpm install
pnpm -r typecheck && pnpm -r test && pnpm build:demo
```

Expected: 全绿（core 144、react 97、demo typecheck、demo build 产出 dist-demo）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 删除旧库 src 与旧构建链路，root 瘦身为纯 monorepo 枢纽

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: CI workflow 更新 + readme/CLAUDE.md 重写

**Files:**
- Modify: `.github/workflows/github-pages.yml`（全量替换）
- Modify: `readme.md`（重写）
- Modify: `CLAUDE.md`（重写）

**Interfaces:**
- Consumes: T4 的 scripts 与包结构。
- Produces: T6 push 后的 CI 行为。

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
      - 'packages/**'
      - 'demo/**'
      - '.github/**'
      - 'pnpm-lock.yaml'
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
      - name: Install, verify & build 🔧
        run: |
          pnpm install --frozen-lockfile
          pnpm -r typecheck
          pnpm -r test
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

- [ ] **Step 2: 校验 YAML**

Run: `pnpm dlx js-yaml .github/workflows/github-pages.yml > /dev/null && echo "YAML OK"`

- [ ] **Step 3: 重写 `readme.md`**

结构（保留原 readme 的项目简介与特性列表语气，全量重写其余）：
1. 项目简介（web 图片编辑器，ProseMirror 式架构 + fabric 6 + React）+ 线上 demo 链接
2. Monorepo 结构表：`packages/core`（@gmi/fp-core——state/step/transaction 内核，UI 无关）、`packages/react`（@gmi/fp-react——Figma 式 React 组件）、`demo`（演示站，GitHub Pages）
3. 特性列表（对齐 core 功能：裁剪/旋转/涂鸦/直线/箭头/形状/文字/马赛克/缩放/平移/撤销重做/导出）
4. 快速开始（`pnpm install` → `pnpm dev` → http://localhost:9876）
5. 开发命令表：`pnpm dev` / `pnpm build` / `pnpm build:demo` / `pnpm preview:demo` / `pnpm test` / `pnpm typecheck`；core playground（`pnpm --filter @gmi/fp-core dev`，端口 9877）
6. 包使用（最小组件示例：`npm i @gmi/fp-core @gmi/fp-react` + `<FabricPhotoEditor src=... />` + style.css import——标注「暂未发布，仅 monorepo 内使用」）
7. 文档链接：packages/core/README.md、packages/react/README.md、docs/superpowers/specs/

- [ ] **Step 4: 重写 `CLAUDE.md`**

结构（给后续维护者与 agent 的规则，替换旧的「模块+命令」体系描述）：
1. 项目概览：pnpm workspace monorepo；三包定位；纯前端无后端
2. 关键架构（新）：ProseMirror 式——不可变 Doc/EditorState 为唯一事实源；一切修改经 Transaction（Step + selection/mode/viewport + meta）dispatch；history 插件（step 反转 + before/after 快照）；fabric 6 仅渲染投影（FabricRenderer + 每模式一个 controller，拖拽预览直改 fabric、结束提交 Step）；react 包零编辑逻辑（state 的函数）
3. 全局规则：pnpm；TS strict + `pnpm -r typecheck`；fabric 锁定 6.x 且只在 core 内部（公共 API 与 react 不暴露 fabric 类型）；react 包只 import @gmi/fp-core 公开 API；测试 vitest（core node 环境、react jsdom + 无头 Editor）；浏览器验证 kimi-webbridge
4. 目录规则：`packages/core/src`（model/steps/state/transform/plugins/editor + render/ 内部）、`packages/react/src`（组件/hooks）、`demo/`、`dist*/` 产物不要手改、`scripts/ralph/` 独立维护
5. 开发入口：同 readme 命令表
6. 新增功能约定：新编辑操作 → 新 Step（apply/invert 成对 + 单测）；新交互模式 → 新 controller（Controller 接口）；新 UI → react 组件（hooks 订阅，不碰编辑逻辑）；新公开 API → 同步 packages/core/README.md 或 packages/react/README.md
7. 遗留：旧 fabric-photo（单包、fabric 1.7.3）已随 Phase 3 删除，历史见 git

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/github-pages.yml readme.md CLAUDE.md
git commit -m "docs+ci: CI 切换 monorepo 验证+部署；readme/CLAUDE.md 重写

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 收口验证 + 推送 + 线上验收

**Files:**
- 无新文件（验证与发布任务）

**Interfaces:**
- Consumes: T1-T5 全部。
- Produces: Phase 3 完成——线上为新 Figma UI。

- [ ] **Step 1: 本地全量收口**

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck && pnpm -r test && pnpm build:demo
```

Expected: 全绿（模拟 CI 的完整命令序列）。

- [ ] **Step 2: 推送**

```bash
git push origin master
```

（T4/T5 的 push 会命中新 workflow 的 paths：`demo/**`、`packages/**`、`.github/**`。）

- [ ] **Step 3: 观察 CI**

```bash
gh run list --limit 1
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: Build job 全绿（install → typecheck → test → build:demo → Deploy）。

- [ ] **Step 4: 线上 webbridge 验收（session `fp-pages-verify`，标签组「fabric-photo 线上验证」）**

打开 `https://ximing.github.io/fabric-photo/`（硬刷新：`evaluate` 里 `location.reload(true)` 或带 cache-bust query）：
1. title 为 kityphoto；Figma 四区布局可见（判定：存在 `.fp-toolbar` 与 `.fp-topbar` 或等价 class）；示例图从 `/fabric-photo/images/demo.jpeg` 加载成功（network 或 evaluate 检查 `editor.state.doc.background`）
2. 画布像素验证：canvas 采样有非零 alpha（图片确已绘制——截图可能因 GPU 层呈现白色，以像素为准）
3. 一次绘制操作（合成事件画一笔）→ state 出现对象
4. 控制台无报错；assets 无 404

- [ ] **Step 5: 冒烟报告**

CI 结果 + 线上验收证据写入报告文件。

---

## Phase 3 完成定义（DoD）

1. `pnpm -r typecheck && pnpm -r test && pnpm build:demo` 本地全绿
2. CI run 全绿并实际部署到 gh-pages
3. 线上 https://ximing.github.io/fabric-photo/ 为新 Figma UI 且图片/绘制可用
4. 仓库无旧 `src/`、无旧构建配置、root package.json 为纯 monorepo 枢纽
5. readme/CLAUDE.md 反映 monorepo 新架构
