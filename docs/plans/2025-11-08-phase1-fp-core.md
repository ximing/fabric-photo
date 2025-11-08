# 开发计划：Phase 1 — Monorepo 骨架 + @gmi/fp-core

日期：2025-11-08

对应技术方案：`docs/design/2025-11-08-monorepo-core.md`

## 目标

把仓库改造成 pnpm workspace monorepo，并交付功能完整的 `@gmi/fp-core`：不可变 Doc / EditorState / Step / Transaction、fabric 6 渲染投影、全部旧功能移植、vitest、playground。

## 约束

- pnpm；Node 20；TypeScript strict
- Phase 1 全程保留旧 `src/`、旧 `demo/`、root `dev` / `build` / `build:demo`，现有 CI 不能断
- fabric 锁定 6.x，只作为 core 内部渲染实现；公开 API 不暴露 fabric 类型
- 测试：vitest、node 环境、测试与源码同目录
- playground：`pnpm --filter @gmi/fp-core dev`，端口 9877

## 完成时目录（core）

`packages/core/src/`：`model/`（Doc、id）、`steps/`、`state/`、`transform/`、`plugins/`（history / keymap）、`editor.ts`、`render/`（FabricRenderer、controllers、exporter，不从 `index.ts` 导出）、`playground/`。

## 任务与落地

| 序号 | 任务 | 落地提交 | 日期 |
| --- | --- | --- | --- |
| 1 | Monorepo 骨架 + fp-core 空壳 | `build: pnpm workspace 骨架 + @gmi/fp-core 包空壳（旧构建链路保留）` | 2025-11-13 |
| 2 | 文档模型 + 序列化 | `feat(core): 文档模型 Doc/EditorObject + 序列化` | 2025-11-13 |
| 3 | Step 体系 | `feat(core): Step 体系（对象/背景/TransformDoc 旋转）` | 2025-11-13 |
| 4 | Transaction + EditorState | `feat(core): Transaction 与 EditorState` | 2025-11-13 |
| 5 | 插件接口 + History | `feat(core): 插件接口与 History 插件（undo/redo 栈）` | 2025-11-20 |
| 6 | Editor 主类 + 事件 + keymap | `feat(core): Editor 主类、事件系统与 keymap 插件` | 2025-11-20 |
| 7 | FabricRenderer 基础 | `feat(core): FabricRenderer 基础（背景/对象同步/viewport）` | 2025-11-20 |
| 8 | 导出 API | `feat(core): 导出 API（toDataURL/toBlob/viewport 区域）` | 2025-11-26 |
| 9 | 图片加载 + playground 起步 | `feat(core): 图片加载 API 与 playground 起步` | 2025-12-05 |
| 10 | controller + select | `feat(core): controller 机制与 select controller（变换可撤销）` | 2025-12-05 |
| 11 | zoom + pan | `feat(core): zoom（可撤销、指针中心）与 pan（瞬时）` | 2025-12-08 |
| 12 | freedraw / line / arrow | `feat(core): freedraw/line/arrow 绘制 controller` | 2025-12-08 |
| 13 | shape | `feat(core): shape controller（rect/circle/triangle + scale 折算）` | 2025-12-12 |
| 14 | text（IText 原地编辑） | `feat(core): text controller（IText 原地编辑 + toggle 样式）` | 2025-12-12 |
| 15 | mosaic | `feat(core): mosaic controller 与 MosaicShape 渲染` | 2025-12-17 |
| 16 | crop + Cropzone | `feat(core): crop controller 与 Cropzone（两条裁剪路径统一可撤销）` | 2025-12-20 |
| 17 | rotate / setAngle | `feat(core): rotate/setAngle（TransformDoc 渲染落地）` | 2025-12-20 |
| 18 | playground 全量操作台 | `feat(core): playground 全量操作台` | 2025-12-20 |
| 19 | README 与收口 | `docs(core): README 与 Phase 1 收口` | 2025-12-20 |

## 验收

- `pnpm --filter @gmi/fp-core typecheck` 与 `test` 全绿；root 旧 `dev` / `build:demo` 仍可用
- playground 可加载示例图、绘制、裁剪、旋转、撤销重做、导出
