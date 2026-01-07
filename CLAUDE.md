# 项目指令

## 1. 项目概览

- 仓库类型：pnpm workspace monorepo，纯前端图片编辑器，无后端依赖
- 三个 workspace 成员：
  - `packages/core`（`@gmi/fp-core`）— 编辑器内核：ProseMirror 式 state / step / transaction 架构，UI 无关
  - `packages/react`（`@gmi/fp-react`）— Figma 式 React 组件包（顶栏/工具栏/选项条/画布/属性面板）
  - `demo`（`fabric-photo-demo`，private）— Vite + React 演示站，GitHub Pages 部署源

## 2. 关键架构

- 不可变 `Doc` / `EditorState` 是唯一事实源；一切修改都封装为 `Transaction`（一组 `Step` + selection/mode/viewport 变更 + meta），经 `Editor.dispatch()` 落账
- dispatch 顺序固定：filterTransaction → apply → appendTransaction → 置 state → history 收账 → renderer 同步 → 事件 → 其余插件 onTransaction
- `History` 插件提供 undo/redo：step 反转（apply/invert 成对）+ before/after selection 快照；undo/redo 事务以 `addToHistory=false` 跳过收账
- fabric 6 只是 state 的「渲染投影」：`FabricRenderer` 把 state 同步到画布；每种交互模式一个 controller，拖拽预览直改 fabric 对象、手势结束才提交 Step
- `packages/react` 零编辑逻辑：组件是 state 的函数，经 hooks 订阅 core，所有操作走 core 的公开 API
- core 支持无头模式（不传 container/renderer）：state/step/transaction 全可用，单测即跑在此模式

## 3. 全局规则

- 包管理器统一使用 pnpm（`pnpm@10.33.0`）
- 全部包 TypeScript strict；改动后必须通过 `pnpm typecheck`（即 `pnpm -r typecheck`）
- fabric 锁定 6.x，且只允许出现在 `packages/core` 内部：core 的公开 API 与 react 包均不得暴露 fabric 类型
- `packages/react` 只允许 import `@gmi/fp-core` 的公开 API（`packages/core/src/index.ts` 导出面），不得触碰 core 内部路径
- 测试用 vitest：core 为 node 环境（无头 Editor），react 为 jsdom + `@testing-library/react`
- 浏览器行为验证使用 kimi-webbridge（真实浏览器，非无头）

## 4. 目录规则

- `packages/core/src` — `model/`（Doc 模型）、`steps/`（Step 实现）、`state/`（EditorState）、`transform/`（Transaction）、`plugins/`（history/keymap）、`editor.ts`（主类）；`render/`（FabricRenderer、controllers、exporter）为内部实现，不导出
- `packages/react/src` — 组件（`*.tsx`）与 hooks；样式 Tailwind（`fp-` 前缀，preflight 关闭），产物 `dist/style.css` 需显式 import
- `packages/core/playground` — core 独立调试页（无 React），`pnpm --filter @gmi/fp-core dev`，端口 9877
- `demo/` — 演示站源码；dev/build 前经 `pre*` 钩子自动先构建 `@gmi/*` 包
- `dist/`、`dist-demo/`、各包 `dist/` 均为构建产物，不要手改
- `scripts/ralph/` — 自主编码 agent 工作流，自带 CLAUDE.md，独立维护

## 5. 开发入口

- 安装依赖：`pnpm install`
- 本地开发（demo，端口 9876）：`pnpm dev`
- 构建全部包：`pnpm build`
- 构建 demo 站点（输出 `dist-demo/`）：`pnpm build:demo`；本地预览：`pnpm preview:demo`
- 测试：`pnpm test`；类型检查：`pnpm typecheck`
- core playground：`pnpm --filter @gmi/fp-core dev`（端口 9877）

## 6. 新增功能约定

- 新编辑操作 → 新 Step：`apply`/`invert` 成对实现，附单测（core node 环境无头 Editor 即可测全语义）
- 新交互模式 → 新 controller：实现 `render/controllers/controller.ts` 的 Controller 接口，在 `Editor` 构造中注册，并挂到对应 mode
- 新 UI → react 组件：hooks 订阅 state/事件（`useEditorState`/`useEditorEvent`），不写任何编辑逻辑
- 新公开 API → 同步更新 `packages/core/README.md` 或 `packages/react/README.md` 的 API 清单

## 7. 遗留

- 旧 fabric-photo（单包、fabric 1.7.3、「模块 + 命令」架构）已随 Phase 3 删除，历史见 git
