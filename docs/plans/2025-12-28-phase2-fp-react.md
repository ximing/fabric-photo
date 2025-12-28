# 开发计划：Phase 2 — @gmi/fp-react

日期：2025-12-28

对应技术方案：`docs/design/2025-11-08-monorepo-core.md`

## 目标

交付 `@gmi/fp-react`：基于 `@gmi/fp-core` 的 Figma 式 React 组件包（左工具栏 + 顶栏 + 右属性面板 + 中央画布 + 快捷键）。组件只是 state 的函数，不含编辑逻辑。

## 约束

- 只允许 import `@gmi/fp-core` 公开 API；禁止 import fabric
- 工具设置（笔刷/颜色/形状类型/马赛克粒度）由 React 层持有
- `useEditorState` 必须 selector + 比较函数，避免内容相等的新 state 身份导致无效重渲染
- Tailwind：`prefix: 'fp-'`，关闭 preflight；产物 `dist/style.css`
- React peer `>=18`，开发用 React 19
- 旧 CI 链路不可断（旧 `src/` / `demo/` 仍在）
- 测试：vitest + jsdom + Testing Library；注入无头 `Editor()`，不依赖 fabric 渲染

## 任务与落地

| 序号 | 任务 | 落地提交 | 日期 |
| --- | --- | --- | --- |
| 1 | packages/react 骨架 | `build: @gmi/fp-react 包骨架（tsup + tailwind fp- 前缀 + vitest jsdom）` | 2025-12-28 |
| 2 | tool-settings + Provider + hooks | `feat(react): tool-settings、EditorProvider 与 hooks` | 2025-12-28 |
| 3 | FabricPhotoEditor + CanvasView；core 增补 notifyResize | `feat(react): FabricPhotoEditor 组合骨架与 CanvasView；core 增补 notifyResize` | 2026-01-01 |
| 4 | Toolbar + 工具选项条 | `feat(react): Toolbar 与工具选项条` | 2026-01-01 |
| 5 | TopBar | `feat(react): TopBar（undo/redo、zoom、导出、图名）` | 2026-01-01 |
| 6 | PropertiesPanel | `feat(react): PropertiesPanel 选中驱动属性表单` | 2026-01-01 |
| 7 | 色板（实时生效） | `feat(react): ColorPalette 色板与实时改色路由` | 2026-01-04 |
| 8 | 快捷键 | `feat(react): 快捷键（单字母工具切换 + Esc）` | 2026-01-04 |
| 9 | 样式产物 + README | `feat(react): 样式产物与 Phase 2 收口（README）` | 2026-01-04 |

## 验收

- `pnpm --filter @gmi/fp-react typecheck` 与 `test` 通过
- 组件可单独导出；缺省布局四区齐全
- 整体浏览器验收放到 Phase 3 demo（本包不做独立页面）
