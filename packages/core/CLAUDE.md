# packages/core — @gmi/fp-core 编辑器内核

## 这个目录负责什么

- ProseMirror 式编辑器内核：不可变 `Doc` / `EditorState` / `Transaction` / `Step`，UI 无关
- fabric 6 渲染投影与各交互模式 controller 的内部实现

## 放置约束

- `src/model/` — Doc 模型；`src/steps/` — Step 实现；`src/state/` — EditorState；`src/transform/` — Transaction；`src/plugins/` — history / keymap；`src/editor.ts` — 主类
- `src/render/`（FabricRenderer、controllers、exporter、object-factory）为内部实现，不得从 `src/index.ts` 导出
- `playground/` — core 独立调试页（无 React），`pnpm --filter @gmi/fp-core dev`，端口 9877

## 开发约束

- fabric 只允许出现在本包内部；公开 API（`src/index.ts` 导出面）不得暴露 fabric 类型
- 新编辑操作 → 新 Step：`apply`/`invert` 成对实现，附单测（core node 环境无头 Editor 即可测全语义）
- 新交互模式 → 新 controller：实现 `render/controllers/controller.ts` 的 Controller 接口，在 `Editor` 构造中注册，并挂到对应 mode
- 保持无头模式可用（不传 container/renderer）：state/step/transaction 全可用，单测跑在此模式
- 新公开 API → 同步更新 `packages/core/README.md` 的 API 清单
