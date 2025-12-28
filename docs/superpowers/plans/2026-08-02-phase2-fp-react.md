# Phase 2：@gmi/fp-react（Figma 式 React UI 包）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 `@gmi/fp-react`——基于 @gmi/fp-core 的 Figma 式 React 组件包（左工具栏 + 顶栏 + 右属性面板 + 中央画布 + 快捷键），组件只是 core state 的函数，不含编辑逻辑。

**Architecture:** `EditorProvider` 创建/持有 core `Editor` 并存入 context；`useEditorState(selector, isEqual?)` 基于 `useSyncExternalStore` 做选择性重渲染；所有交互 = `editor.dispatch` 或 Editor 高级 API；工具设置（笔刷/颜色/形状类型）由 React 层持有（core 终审结论：core 的 setBrush 等在 state 之外）；样式为 Tailwind（`fp-` 前缀，preflight 关闭）编译产物 `dist/style.css`。

**Tech Stack:** React 19（peer `>=18`）、@gmi/fp-core（workspace:*）、lucide-react、Tailwind 3、tsup 8、vitest + jsdom + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-08-01-monorepo-prosemirror-redesign-design.md`（§3）

## Global Constraints

- 包管理器统一 pnpm；Node 20
- TypeScript strict；每任务结束 `pnpm --filter @gmi/fp-react typecheck` 必过；`pnpm --filter @gmi/fp-react test` 不回归
- **react 包只 import @gmi/fp-core 的公开 API**（`@gmi/fp-core` 包名导入）；**禁止 import fabric**；不得依赖 core 内部路径（`@gmi/fp-core/dist/...`、`../core/src/...`）
- **react 包不含编辑逻辑**：一切状态变更走 Editor API/dispatch；UI 只是 state 的函数
- 工具设置（笔刷宽度/颜色、形状类型、马赛克粒度）由 React 层持有（core 不存这份 state——终审架构结论）
- `useEditorState` 必须 selector + 比较函数（core 的 `change` 在内容相等时也可能产生新 state 身份——终审结论）
- Tailwind：`prefix: 'fp-'`、`corePlugins: { preflight: false }`（不向消费者泄露全局 reset）；产物 `dist/style.css`
- React peer `>=18`；开发用 React 19 + @vitejs/plugin-react 无关（本包无 playground——spec：react 包不做独立页面，整体浏览器验证在 Phase 3 demo）
- **旧 CI 链路不可断**：root `dev`/`build`/`build:demo`/`preview:demo`/`typecheck` scripts 与旧 `src/`、`demo/`、`packages/core` 保持可用；除 packages/react 外只允许动 root `package.json`（聚合 script 已有，无需改）与 plan 列出的文件
- 测试：vitest + jsdom + @testing-library/react，测试与源码同目录（`*.test.tsx`/`*.test.ts`）；组件测试用**无头 Editor**（`new Editor()` 不传 container/renderer）注入——不依赖 fabric 渲染
- 主 Agent 只做调度；实现由 SubAgent 完成

## 文件结构（Phase 2 完成时）

```
packages/react/
├── package.json               # T1
├── tsconfig.json              # T1
├── tsup.config.ts             # T1
├── vitest.config.ts           # T1
├── tailwind.config.js         # T1
├── postcss.config.js          # T1
├── README.md                  # T9
└── src/
    ├── index.ts               # T3（公共导出面）
    ├── styles.css             # T9（@tailwind 指令）
    ├── tool-settings.ts       # T2（ToolSettings 类型/默认值/tool↔mode 映射）
    ├── context.ts             # T2（EditorContext + EditorUIContext 类型）
    ├── provider.tsx           # T2（EditorProvider + toolSettings state）
    ├── hooks.ts               # T2（useEditor/useEditorState/useEditorEvent/useToolSettings）
    ├── editor.tsx             # T3（FabricPhotoEditor 组合组件）
    ├── canvas-view.tsx        # T3（容器挂载 + ResizeObserver）
    ├── top-bar.tsx            # T5
    ├── toolbar.tsx            # T4
    ├── tool-option-bar.tsx    # T4（模式选项条：crop Apply/Cancel 等）
    ├── properties-panel.tsx   # T6
    ├── color-palette.tsx      # T7
    └── shortcuts.ts           # T8（useShortcuts hook）
```

另：`packages/core` 有一处增补（T3 的 `notifyResize`，见 Task 3）。

---

### Task 1: packages/react 骨架

**Files:**
- Create: `packages/react/package.json`、`packages/react/tsconfig.json`、`packages/react/tsup.config.ts`、`packages/react/vitest.config.ts`、`packages/react/tailwind.config.js`、`packages/react/postcss.config.js`、`packages/react/src/index.ts`、`packages/react/src/styles.css`

**Interfaces:**
- Produces: `pnpm --filter @gmi/fp-react build|typecheck|test` 三个 script；`@gmi/fp-core` workspace 依赖接通——后续所有任务依赖。

- [ ] **Step 1: 创建 `packages/react/package.json`**

```json
{
  "name": "@gmi/fp-react",
  "version": "0.1.0",
  "description": "Figma-style React UI for @gmi/fp-core image editor",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./style.css": "./dist/style.css"
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "scripts": {
    "build": "tsup && pnpm build:css",
    "build:css": "tailwindcss -i src/styles.css -o dist/style.css --minify",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@gmi/fp-core": "workspace:*",
    "lucide-react": "^0.344.0"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
```

- [ ] **Step 2: 创建 tsconfig/tsup/vitest/tailwind/postcss 配置**

`tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`tsup.config.ts`：

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    external: ['react', 'react-dom', 'react/jsx-runtime']
});
```

（`@gmi/fp-core` 与 `lucide-react` 在 dependencies → tsup 默认 external，保持 external；CSS 由 build:css 单独产出，tsup 不处理 styles.css——index.ts 不 import styles.css，消费者显式 `import '@gmi/fp-react/style.css'`。）

`vitest.config.ts`（注意：root vite.config.ts 有 `root: 'demo'`，vitest 必须有自己的配置才不会被截获——core 包同款处理）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}']
    }
});
```

`tailwind.config.js`：

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
    prefix: 'fp-',
    corePlugins: { preflight: false },
    content: ['./src/**/*.{ts,tsx}'],
    theme: { extend: {} },
    plugins: []
};
```

`postcss.config.js`：

```js
module.exports = {
    plugins: {
        tailwindcss: {},
        autoprefixer: {}
    }
};
```

- [ ] **Step 3: 占位 `src/index.ts` + 安装依赖**

```ts
export const VERSION = '0.1.0';
```

```bash
pnpm --filter @gmi/fp-react add -D react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19 vitest jsdom @testing-library/react @testing-library/dom tailwindcss autoprefixer postcss tsup typescript
pnpm install
```

- [ ] **Step 4: 验证**

```bash
pnpm --filter @gmi/fp-react typecheck && pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react build
pnpm --filter @gmi/fp-core test
```

Expected: fp-react typecheck/build 通过；test 无测试文件（`vitest run --passWithNoTests`——把 test script 改成这个后重跑须过）；fp-core 测试不回归（141）；build 后 `ls packages/react/dist/` 有 index.js/index.mjs/index.d.ts/style.css（style.css 此时几乎为空，styles.css 还没建——把 build:css 依赖的 `src/styles.css` 用三行 @tailwind 指令先建出来）。

`src/styles.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Commit**

```bash
git add packages/react pnpm-lock.yaml
git commit -m "build: @gmi/fp-react 包骨架（tsup + tailwind fp- 前缀 + vitest jsdom）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: tool-settings + Provider + hooks

**Files:**
- Create: `packages/react/src/tool-settings.ts`
- Create: `packages/react/src/context.ts`
- Create: `packages/react/src/provider.tsx`
- Create: `packages/react/src/hooks.ts`
- Test: `packages/react/src/hooks.test.tsx`、`packages/react/src/tool-settings.test.ts`

**Interfaces:**
- Consumes: `@gmi/fp-core` 的 `Editor`、`EditorState`、`EditorMode`、`EditorEventMap`。
- Produces（T3-T8 全部依赖，签名逐字固定）:

```ts
// tool-settings.ts
export type ToolId = 'select' | 'crop' | 'rotate' | 'arrow' | 'freedraw' | 'line' | 'shape' | 'text' | 'mosaic' | 'pan';
export interface ToolSettings {
    freedraw: { width: number; color: string };
    line: { width: number; color: string };
    arrow: { width: number; color: string };
    shape: { shapeType: 'rect' | 'circle' | 'triangle'; fill: string; stroke: string; strokeWidth: number };
    text: { fill: string; fontSize: number };
    mosaic: { dimensions: number };
}
export const DEFAULT_TOOL_SETTINGS: ToolSettings;   // freedraw/line/arrow: width 4, color '#ff0000'；shape: rect/fill 'transparent'/stroke '#ff0000'/strokeWidth 4；text: fill '#ff0000'/fontSize 50；mosaic: dimensions 8
export function modeToTool(mode: EditorMode): ToolId;   // normal→select, crop→crop, freedraw→freedraw, line→line, arrow→arrow, mosaic→mosaic, text→text, shape→shape, pan→pan
export function activateTool(editor: Editor, tool: ToolId, settings: ToolSettings): void;
// select→editor.endAll()；crop→startCropping()；rotate→editor.rotate(90)（动作非模式）；arrow→startArrowDrawing(settings.arrow)；
// freedraw→startFreeDrawing(settings.freedraw)；line→startLineDrawing(settings.line)；shape→setDrawingShape(settings.shape.shapeType, {...}) + startDrawingShapeMode()；
// text→startTextMode()；mosaic→startMosaicDrawing(settings.mosaic)；pan→startPan()

// context.ts（只含 createContext 与类型，供 provider/hooks 分开测试）
export interface EditorUIState {
    toolSettings: ToolSettings;
    setToolSettings: Dispatch<SetStateAction<ToolSettings>>;
}
export const EditorContext: Context<Editor | null>;
export const EditorUIContext: Context<EditorUIState | null>;

// provider.tsx
export interface EditorProviderProps {
    editor: Editor;             // 显式注入（FabricPhotoEditor 或测试创建）
    children: ReactNode;
}
export function EditorProvider(props: EditorProviderProps): JSX.Element;

// hooks.ts
export function useEditor(): Editor;                                   // 无 provider 抛错
export function useEditorState<T>(selector: (state: EditorState) => T, isEqual?: (a: T, b: T) => boolean): T;
export function useEditorEvent<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void;
export function useToolSettings(): EditorUIState;
```

- `useEditorState` 实现要点（Global Constraints：selector + 比较，防内容相等的新 state 身份导致重渲染）：`useSyncExternalStore` 的 subscribe 用 `editor.subscribe`；getSnapshot 返回**缓存的 selector 结果**——每次 `editor.subscribe` 回调里重算 `selector(editor.state)`，仅当 `isEqual`（默认 `Object.is`）为 false 时才更新缓存并触发重渲染。selector 函数身份变化（内联 selector）不得导致死循环：selector 用 ref 保存最新值。
- `useEditorEvent`：handler 用 ref 保存最新值，effect 里 `editor.on(name, stable)` + 返回 `editor.off(name, stable)`。

- [ ] **Step 1: 写测试**

`tool-settings.test.ts`：DEFAULT_TOOL_SETTINGS 逐字段断言；modeToTool 9 个 mode 全覆盖；activateTool 用无头 Editor（`new Editor()`）+ vi.spyOn 断言每个 tool 调用了正确的 Editor 方法及参数（rotate 断言 `rotate(90)`；shape 断言先 setDrawingShape 后 startDrawingShapeMode，参数来自 settings）。

`hooks.test.tsx`（@testing-library/react + 无头 Editor）：
1. `useEditorState` 初始返回 selector(state)；dispatch AddObject 后（`act(() => editor.dispatch(...))`）重渲染拿到新值
2. selector 返回相同值时不重渲染（渲染计数 spy：dispatch 一个不影响 selector 结果的事务，如 setMode，断言计数不变）
3. `useEditorEvent`：fire loadImage（dispatch SetBackground 后）handler 被调；handler 引用变化不重复订阅（解绑/重绑正确）
4. `useEditor` 无 provider 抛错
5. `useToolSettings`：setToolSettings 更新后 context 值变化

- [ ] **Step 2: 运行确认失败 → Step 3: 实现四个文件 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): tool-settings、EditorProvider 与 hooks

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: FabricPhotoEditor 组合骨架 + CanvasView + core notifyResize 增补

**Files:**
- Create: `packages/react/src/editor.tsx`
- Create: `packages/react/src/canvas-view.tsx`
- Modify: `packages/react/src/index.ts`（公共导出面）
- Modify: `packages/core/src/render/fabric-renderer.ts`（`notifyResize()`）
- Modify: `packages/core/src/editor.ts`（`notifyResize()` 委托）
- Test: `packages/react/src/editor.test.tsx`、`packages/core/src/editor.test.ts`（追加 notifyResize 用例）

**Interfaces:**
- Consumes: T2 全部。
- Produces（T4-T8 与 Phase 3 demo 依赖）:

```tsx
// canvas-view.tsx
export interface CanvasViewProps {
    editor: Editor;
    className?: string;
}
export function CanvasView(props: CanvasViewProps): JSX.Element;
// 渲染 <div className={fp- 灰底容器 + className}>；effect：editor.attachContainer?——见下「core 增补」

// editor.tsx
export interface FabricPhotoEditorProps {
    src?: string;
    imageName?: string;          // 默认 'image'
    cssMaxWidth?: number;        // 默认 700
    cssMaxHeight?: number;       // 默认 400
    onReady?: (editor: Editor) => void;
    onChange?: (state: EditorState) => void;
    className?: string;
    children?: ReactNode;        // 缺省 <><TopBar/><Toolbar/><CanvasView/><PropertiesPanel/></>
}
export function FabricPhotoEditor(props: FabricPhotoEditorProps): JSX.Element;

// index.ts 导出（Phase 2 全量公共面）
export { VERSION } from './version';   // 或保留 const VERSION
export { FabricPhotoEditor } from './editor';
export type { FabricPhotoEditorProps } from './editor';
export { CanvasView } from './canvas-view';
export type { CanvasViewProps } from './canvas-view';
export { EditorProvider } from './provider';
export { useEditor, useEditorState, useEditorEvent, useToolSettings } from './hooks';
export { DEFAULT_TOOL_SETTINGS, modeToTool, activateTool } from './tool-settings';
export type { ToolId, ToolSettings } from './tool-settings';
export type { EditorUIState } from './context';
// Toolbar/ToolOptionBar/TopBar/PropertiesPanel/ColorPalette 由 T4-T7 逐个追加导出（index.ts 只导出已实现的）
```

**core 增补（`notifyResize`）**：CanvasView 的容器尺寸随布局变化（窗口缩放/面板开合），core renderer 需要无状态变更的重排：
- `FabricRenderer.notifyResize(): void`：`syncCanvasSize()` + `applyViewport(lastState)` + `requestRenderAll()`（不触碰 state.viewport——zoom/pan 保持，按新容器尺寸重算居中）
- `Editor.notifyResize(): void`：有 renderer 时委托；无头模式 no-op
- core 侧测试：fake renderer 记录调用；FabricRenderer 的 notifyResize 无单测（浏览器层，Phase 3 验证）

**CanvasView 实现**：容器 div 用 ref 回调创建 Editor？——不：Editor 由 FabricPhotoEditor 创建（`new Editor({ container })` 需要 DOM 先存在）。时序方案：CanvasView 渲染目标 div（ref 保存）；FabricPhotoEditor 用 `useState` 持有 containerEl（ref 回调 set），effect 里 `new Editor({ container: el, cssMaxWidth, cssMaxHeight })` 创建后 `editor.loadImageFromURL(src)`（src 存在时）+ onReady + `editor.subscribe(onChange)`；CanvasView 的 ResizeObserver 调 `editor.notifyResize()`。Editor 销毁：effect cleanup `editor.destroy()`。

**布局（Figma 骨架，editor.tsx 内联 grid）**：

```
grid-template-areas: "top top top" "tools canvas props";
grid-template-rows: 48px 1fr;
grid-template-columns: 48px 1fr 240px;
```

TopBar/Toolbar/PropertiesPanel 在 T4-T6 实现——本任务 children 缺省值只放 `<CanvasView editor={editor}/>`，grid 用 `"canvas canvas canvas"` 单区？——不允许过度设计：本任务 grid 就按三区/两行布好，T4-T6 的组件各自带 gridArea 样式插入即可（TopBar `fp-col-span-3` 等具体类名在 T9 样式任务统一梳理，本任务用内联 style 定 grid 骨架）。

- [ ] **Step 1: core 增补 + 测试**

core：`editor.test.ts` 追加——无 renderer 时 `notifyResize()` no-op 不抛错；有 fake renderer 时委托调用一次。先写失败测试，再实现两处方法。跑 `pnpm --filter @gmi/fp-core test`（141+1 全绿）。

- [ ] **Step 2: 写 react 侧失败测试 `editor.test.tsx`**

1. FabricPhotoEditor 渲染出容器 div（grid 骨架 class）
2. onReady 被调且拿到 Editor 实例；onChange 在 dispatch 后被调
3. children 自定义时渲染 children 而非缺省布局
4. unmount 时 editor.destroy 被调（spy）

（CanvasView 真实 fabric 挂载不在 jsdom 测——spec 划定 Phase 3 浏览器验证；测试里注入无头 editor 或直接测 FabricPhotoEditor 的容器创建逻辑。若 jsdom 下 `new Editor({container})` 不崩（fabric 6 在 jsdom 可构造 Canvas），可顺带断言 canvas 元素出现——实现时先试，不行就降级为无头断言并在报告说明。）

- [ ] **Step 3: 实现 editor.tsx / canvas-view.tsx / index.ts**

- [ ] **Step 4: 通过 + typecheck（两包）**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck && pnpm --filter @gmi/fp-core test`

- [ ] **Step 5: Commit**

```bash
git add packages/react packages/core
git commit -m "feat(react): FabricPhotoEditor 组合骨架与 CanvasView；core 增补 notifyResize

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Toolbar + 工具选项条

**Files:**
- Create: `packages/react/src/toolbar.tsx`
- Create: `packages/react/src/tool-option-bar.tsx`
- Modify: `packages/react/src/index.ts`（追加导出）
- Modify: `packages/react/src/editor.tsx`（缺省 children 加入 TopBar 占位以外的 Toolbar/ToolOptionBar）
- Test: `packages/react/src/toolbar.test.tsx`

**Interfaces:**
- Consumes: T2 `useEditor/useEditorState/useToolSettings/activateTool/modeToTool/ToolId`；T3 FabricPhotoEditor。
- Produces:

```tsx
// toolbar.tsx
export interface ToolDef {
    id: ToolId;
    icon: LucideIcon;
    label: string;        // 中文：选择/裁剪/旋转/箭头/画笔/直线/形状/文字/马赛克/平移
    shortcut?: string;    // T8 展示用：V C R A P L S T M H
}
export const TOOLS: ToolDef[];   // 顺序：select, crop, rotate, arrow, freedraw, line, shape, text, mosaic, pan
export function Toolbar(props: { className?: string }): JSX.Element;

// tool-option-bar.tsx（模式激活时顶栏下方的选项条）
export function ToolOptionBar(props: { className?: string }): JSX.Element;
```

- Toolbar：每个工具一个图标按钮；active = `useEditorState(s => modeToTool(s.mode)) === tool.id`；rotate 是动作按钮（无 active 态）；点击 → `activateTool(editor, tool.id, toolSettings)`，再次点击 mode 工具 → `editor.endAll()`
- 图标（lucide-react）：select `MousePointer2`、crop `Crop`、rotate `RotateCw`、arrow `ArrowUpRight`、freedraw `Pencil`、line `Slash`、shape `Square`、text `Type`、mosaic `Grid3x3`、pan `Hand`
- ToolOptionBar 按当前 mode 渲染：
  - `crop`：Apply（`editor.endCropping(true)`）/ Cancel（`editor.endCropping(false)`）
  - `freedraw` / `line` / `arrow`：线宽选择（2/4/8/12 → setToolSettings 对应工具的 width + `editor.setBrush({width})` 实时生效）
  - `shape`：形状类型三选一（rect/circle/triangle → setToolSettings.shape.shapeType + `editor.setDrawingShape(type)`）
  - `mosaic`：粒度选择（4/8/16 → setToolSettings.mosaic.dimensions + 重新 startMosaicDrawing？——不允许重启模式：mosaic dimensions 只在下次 start 生效，标注 title 提示）
  - `text` / `normal` / `pan`：不渲染选项条
- ToolOptionBar 容器始终占位（无内容时高度 0），位置在 TopBar 与画布区之间（grid 行 2 插入——editor.tsx grid 改 `"top top top" "opts opts opts" "tools canvas props"`，三行 48px auto 1fr）

- [ ] **Step 1: 写测试 `toolbar.test.tsx`**

无头 Editor + EditorProvider 渲染：
1. 10 个工具按钮按 TOOLS 顺序渲染（label 文本可寻）
2. 点击「画笔」→ `editor.getCurrentState() === 'freedraw'` 且按钮 active class；再点 → 回 normal
3. 点击「旋转」→ spy `rotate` 被调 90；无 active 态残留
4. mode 为 crop 时选项条出现 Apply/Cancel；点 Apply spy `endCropping(true)`
5. mode 为 shape 时选项条出现三形状按钮；切换 circle → toolSettings 更新且 `setDrawingShape` spy 被调
6. mode 为 freedraw 时出现线宽选项；点 8 → toolSettings.freedraw.width === 8 且 `setBrush` spy 被调 `{width: 8}`

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): Toolbar 与工具选项条

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: TopBar（undo/redo、zoom、导出、图名）

**Files:**
- Create: `packages/react/src/top-bar.tsx`
- Modify: `packages/react/src/index.ts`（追加导出）
- Modify: `packages/react/src/editor.tsx`（缺省 children 加入 TopBar）
- Test: `packages/react/src/top-bar.test.tsx`

**Interfaces:**
- Consumes: T2 hooks。
- Produces:

```tsx
// top-bar.tsx
export function TopBar(props: { className?: string }): JSX.Element;
```

- 左：图名（`useEditorState(s => s.doc.background?.name ?? '')`，无图显示空）
- 中：undo/redo 按钮（lucide `Undo2`/`Redo2`）——禁用态来自 `useEditorEvent('historyChange')` + 本地 state（初始 `editor.isEmptyUndoStack()` 等）
- 右：zoom `Minus` 按钮（`editor.setZoom(z - 0.2)`）、百分比显示（`useEditorState(s => Math.round(s.viewport.zoom * 100) + '%'`，点击复位 `setZoom(1)`）、`Plus` 按钮（`setZoom(z + 0.2)`）；分隔；`Download` 导出按钮（`editor.toDataURL('image/png')` → 创建 `a[download=<图名>.png]` 点击）

- [ ] **Step 1: 写测试 `top-bar.test.tsx`**

无头 Editor：
1. 初始 undo/redo 均 disabled；dispatch 一笔 AddObject（act）→ undo 可用 redo 仍 disabled
2. 点击 undo 按钮 → spy `editor.undo`；点击百分比 → spy `setZoom(1)`
3. zoom + → `setZoom` spy 收到 `1.2`（初始 zoom 1 + 0.2，浮点用 closeTo）
4. 图名显示：dispatch SetBackground（带 name）后显示该 name
5. 导出按钮点击 → spy `toDataURL` 被调（a[download] 点击用 createElement spy 或 stub URL.createObjectURL——简化：spy `editor.toDataURL` 与 `HTMLAnchorElement.prototype.click`）

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): TopBar（undo/redo、zoom、导出、图名）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: PropertiesPanel（选中驱动属性表单）

**Files:**
- Create: `packages/react/src/properties-panel.tsx`
- Modify: `packages/react/src/index.ts`（追加导出）
- Modify: `packages/react/src/editor.tsx`（缺省 children 加入 PropertiesPanel）
- Test: `packages/react/src/properties-panel.test.tsx`

**Interfaces:**
- Consumes: T2 hooks；core 的 `EditorObject` 类型与 change* API。
- Produces:

```tsx
// properties-panel.tsx
export function PropertiesPanel(props: { className?: string }): JSX.Element;
```

渲染逻辑（selection 来自 `useEditorState(s => s.selection)` + `useEditorState(s => s.doc.objects)`，选中对象 = objects.filter(o => selection.includes(o.id))）：

- **无选中**：画布属性——缩放百分比（同 TopBar 值，只读）、背景尺寸（`bg.width × bg.height`，无图显示「未加载图片」）、对象数
- **单选 shape**：fill 色、stroke 色、strokeWidth 数值（1-20）→ `editor.changeShape({fill?, stroke?, strokeWidth?})`
- **单选 text**：文本内容 textarea（`editor.changeText`）、fontSize 数值、fill 色、bold/italic/underline 三 toggle 按钮（`editor.changeTextStyle({fontWeight:'bold'})` 等——core toggle 语义，按钮 active 态读对象当前值）
- **单选 path**：stroke 色、strokeWidth → `tool==='arrow'` 时 `editor.changeArrowStyle({...})`，否则 `editor.changeFreeDrawingPathStyle({...})`
- **单选 mosaic**：只读（块数）+ 删除按钮（`editor.removeActiveObject()`）
- **单选 image**：只读（尺寸）+ 删除按钮
- **多选**：「已选 N 个对象」+ 删除按钮
- 颜色输入统一用 T7 的 ColorField（本任务先用原生 `<input type="color">`，T7 替换为色板组件——不行：T7 依赖本任务形态？调整为：本任务直接内联一个小的 `ColorField` 私有组件（input[type=color] + 当前值显示），T7 做完整色板并替换调用点）

- [ ] **Step 1: 写测试 `properties-panel.test.tsx`**

无头 Editor，dispatch 构造不同 doc 后断言：
1. 无选中：显示背景尺寸（SetBackground 后）与对象数
2. 单选 rect（AddObject + setSelection）：出现 fill/stroke/strokeWidth 输入；改 strokeWidth → spy `changeShape({strokeWidth: 6})`
3. 单选 text：出现 textarea 与三个 style toggle；点 bold → spy `changeTextStyle({fontWeight: 'bold'})`；对象 fontWeight 为 bold 时按钮 active
4. 单选 arrow path：改色 → spy `changeArrowStyle`；单选 freedraw path → spy `changeFreeDrawingPathStyle`
5. 多选：显示数量；点删除 → spy `removeActiveObject`
6. 单选 mosaic：只读 + 删除按钮

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): PropertiesPanel 选中驱动属性表单

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 色板组件 + 自定义取色（实时生效）

**Files:**
- Create: `packages/react/src/color-palette.tsx`
- Modify: `packages/react/src/tool-option-bar.tsx`（绘制类工具选项条加色板）
- Modify: `packages/react/src/properties-panel.tsx`（ColorField 换成 ColorPalette 或并用）
- Modify: `packages/react/src/index.ts`（追加导出）
- Test: `packages/react/src/color-palette.test.tsx`

**Interfaces:**
- Consumes: T2/T4/T6。
- Produces:

```tsx
// color-palette.tsx
export const PALETTE_COLORS = ['#ff0000', '#ffff00', '#00ff00', '#0000ff', '#808080', '#000000', '#ffffff'] as const;
export interface ColorPaletteProps {
    value: string;
    onChange: (color: string) => void;
    className?: string;
}
export function ColorPalette(props: ColorPaletteProps): JSX.Element;   // 7 色板 + 自定义 input[type=color]
```

- **实时生效语义**（修复旧 demo「改色不实时」缺陷）：选项条/面板里的色板 onChange 路由——有选中对象 → 对应 change* API（shape→changeShape、text→changeTextStyle({fill})、path→changeArrowStyle/changeFreeDrawingPathStyle）；无选中但有激活工具 → setToolSettings 对应工具 color + `editor.setBrush({color})`；两者都无时 → setToolSettings.freedraw.color（默认工具预设）
- 路由逻辑抽成 `applyColor(editor, toolSettings, setToolSettings, activeTool, selectedObjects, color)` 导出（tool-settings.ts 或 color-palette.tsx 内），供选项条与属性面板复用
- 属性面板中 shape/text/path 的颜色字段旁同时提供色板展开（点击 swatch 弹出）与原生 color input——简化为直接渲染 ColorPalette 行内（面板空间足够）

- [ ] **Step 1: 写测试 `color-palette.test.tsx`**

1. 7 个色板按钮 + 1 个自定义 input 渲染
2. 点击红色 → onChange('#ff0000')
3. applyColor 路由：选中 shape 时 → changeShape spy 收到 {fill: color}；选中 text 时 → changeTextStyle spy；选中 arrow path 时 → changeArrowStyle spy（且 color 同步 fill——core 已处理）；无选中、mode=freedraw 时 → setBrush spy + toolSettings.freedraw.color 更新
4. 自定义 input change → onChange 收到值

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 + 接入选项条/属性面板 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): ColorPalette 色板与实时改色路由

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 快捷键（单字母工具 + Esc）

**Files:**
- Create: `packages/react/src/shortcuts.ts`
- Modify: `packages/react/src/editor.tsx`（FabricPhotoEditor 内启用 useShortcuts）
- Test: `packages/react/src/shortcuts.test.tsx`

**Interfaces:**
- Consumes: T2 `activateTool`；core `editor.isTextEditing()`。
- Produces:

```ts
// shortcuts.ts
export const TOOL_SHORTCUTS: Record<string, ToolId>;   // v→select, c→crop, r→rotate, a→arrow, p→freedraw, l→line, s→shape, t→text, m→mosaic, h→pan
export function useShortcuts(editor: Editor, getToolSettings: () => ToolSettings): void;
```

- 监听 `document.documentElement` keydown（与 core keymap 同层级）
- 守卫：`e.metaKey || e.ctrlKey || e.altKey` 跳过；target 为 input/textarea/contenteditable 跳过；`editor.isTextEditing()` 跳过
- 单字母 → `activateTool(editor, tool, getToolSettings())`；`Escape` → `editor.endAll()`
- cleanup 移除监听

- [ ] **Step 1: 写测试 `shortcuts.test.tsx`**

无头 Editor + renderHook（@testing-library/react 的 renderHook）：
1. 按 'p' → `getCurrentState() === 'freedraw'`
2. 按 'v' → endAll spy
3. Escape → endAll spy
4. metaKey+'p' 不触发；input 聚焦时 'p' 不触发（dispatchEvent 到 input）
5. unmount 后按键不触发

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-react test && pnpm --filter @gmi/fp-react typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): 快捷键（单字母工具切换 + Esc）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 样式产物 + README + Phase 2 收口

**Files:**
- Modify: `packages/react/src/styles.css`（组件自定义类补充）
- Modify: 各组件文件（className 统一梳理为 fp- 前缀 Tailwind 类 + styles.css 自定义类）
- Create: `packages/react/README.md`
- Modify: `readme.md`（v2 小节更新 fp-react 状态）

**Interfaces:**
- Produces: `dist/style.css`（含全部组件样式）；Phase 2 完成。

- [ ] **Step 1: 样式梳理**

遍历 T3-T8 组件，把内联 style 替换为 Tailwind fp- 类（布局 grid 骨架、按钮态、面板分区、色板格子）；Tailwind 表达不了的（grid-template-areas、蚂蚁线动画无）写入 styles.css 的 `@layer components` 自定义类（`.fp-editor-layout`、`.fp-tool-btn`、`.fp-tool-btn-active` 等）。要求：
- 布局：顶栏 48px、选项条 auto、左工具栏 48px、右面板 240px、画布区灰底 `#e5e5e5`
- 按钮 hover/active 态；禁用态 50% 透明
- 色板格子 20x20 圆角带边框（白色块需可见边框）

- [ ] **Step 2: 构建产物验证**

```bash
pnpm --filter @gmi/fp-react build
ls packages/react/dist/
grep -c "fp-" packages/react/dist/style.css
grep -n "preflight\|*, ::before" packages/react/dist/style.css | head -5
```

Expected: dist 含 index.js/index.mjs/index.d.ts/style.css；style.css 含 fp- 前缀类；**无未前缀的 preflight/全局选择器**（preflight: false 生效）。

- [ ] **Step 3: 写 `packages/react/README.md`**

包定位；安装（含 `import '@gmi/fp-react/style.css'` 说明）；最小用例（`<FabricPhotoEditor src="..." onReady={...} />`）；组件清单（FabricPhotoEditor/TopBar/Toolbar/ToolOptionBar/CanvasView/PropertiesPanel/ColorPalette）；hooks 清单（useEditor/useEditorState/useEditorEvent/useToolSettings）；自组布局示例（只用 EditorProvider + CanvasView）；快捷键表（对照 T8 TOOL_SHORTCUTS）；样式前缀说明（fp-，preflight 关闭不污染全局）。

- [ ] **Step 4: readme.md v2 小节更新**

把「React 组件包 @gmi/fp-react 与新 demo 在路上」改为「React 组件包 [`@gmi/fp-react`](packages/react)（Figma 式交互）已可用，新 demo 在路上」。

- [ ] **Step 5: 全量收口验证**

```bash
pnpm -r typecheck && pnpm -r test && pnpm -r build
pnpm typecheck && pnpm build:demo
```

Expected: 全绿（fp-core 141+1、fp-react 全部、旧链路）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(react): 样式产物与 Phase 2 收口（README）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2 完成定义（DoD）

1. `pnpm -r typecheck` / `pnpm -r test` / `pnpm -r build` 全绿；旧链路 `pnpm typecheck && pnpm build:demo` 全绿
2. `packages/react/dist` 产物齐全（index.js/index.mjs/index.d.ts/style.css），style.css 全部 fp- 前缀且无全局选择器
3. spec §3 的组件树与交互规范逐项有实现：TopBar（undo/redo、缩放、导出）、Toolbar（10 工具）、CanvasView（灰底居中）、PropertiesPanel（选中驱动）、选项条（crop Apply/Cancel、线宽、形状类型、粒度）、快捷键（undo/redo/delete 由 core；单字母工具 + Esc 由 react）、色板实时生效
4. 公共 d.ts 不含 fabric 类型；react 包源码无 fabric import
5. Phase 3 的前置就绪：demo 可以 `import { FabricPhotoEditor } from '@gmi/fp-react'` 直接用


