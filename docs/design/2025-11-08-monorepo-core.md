# 技术方案：pnpm monorepo + 不可变内核 + Figma 式 React UI

日期：2025-11-08

## 背景与目标

当时仓库已是单包 TypeScript 库：fabric.js 1.7.3 + 模块/命令架构，构建为 tsup，demo 为 Vite（2025-10 至 2025-11 完成现代化改造）。本次做整体架构升级：

1. **pnpm workspace monorepo**：内核独立为 `@gmi/fp-core`，React 界面独立为 `@gmi/fp-react`，配套 demo
2. **不可变文档模型**：`EditorState` + `Step` / `Transaction` + 插件系统（完整落地，含 history 插件）
3. **React 界面为 Figma 式交互**（左工具栏 + 顶栏 + 右属性面板 + 中央画布 + 快捷键）
4. **功能维持不变**：以现有全部真实功能为验收基线（死代码除外）
5. **fabric 升级到 6.x**，仅作渲染层，不向 fp-react 暴露 fabric 类型

### 已确认决策

| 决策点 | 结论 |
|---|---|
| 内核形态 | 不可变 state + step/transaction + 插件 + history 插件 |
| 核心架构 | 方案 A：State 单一事实源，fabric 纯渲染投影（否决 B「fabric 为事实源」与 C「分阶段」） |
| fabric 版本 | 6.x，core 的 external dependency，类型不外泄 |
| 仓库策略 | 本仓库原地改造为 monorepo；Pages URL 不变、内容换新 demo |
| npm 发布 | 按可发布标准配置，本次不实际 publish |
| React 版本 | React 19 开发，peerDependencies `>=18` |
| 功能基线 | 全部真实功能迁移；死代码明确不迁移 |
| undo 粒度 | 对象拖拽/缩放结束作为一个 Step 入历史 |

## 总体架构

State 为唯一事实源，fabric 仅为渲染投影：

```
用户交互 → dispatch(Transaction[Step...]) → 新 EditorState（不可变）
                                        ↓
                          FabricRenderer 把 state diff 投影到 fabric canvas
```

拖拽类交互两阶段：进行中直接改 fabric 对象（乐观预览），结束时把最终几何作为一个 Step 提交。

已否决：以 fabric 场景图为事实源、事务层只包历史（本质是旧命令模式换皮）；先 B 后 A 分阶段（core 写两遍）。

## Monorepo 结构

```
fabric-photo/
├── package.json                     # root private，聚合 scripts
├── pnpm-workspace.yaml              # packages/* + demo
├── tsconfig.base.json
├── packages/
│   ├── core/                        # @gmi/fp-core，不依赖 React
│   └── react/                       # @gmi/fp-react，deps: @gmi/fp-core workspace:*
├── demo/                            # fabric-photo-demo（private），Vite + React 19
└── .github/workflows/github-pages.yml
```

- fp-core 公开 API 不暴露任何 fabric 类型
- fp-react 只通过 core 的 state / 事件 API 工作，不含编辑逻辑
- 每包独立 tsup；root 用 `pnpm -r` / `--filter` 聚合
- Phase 1–2 期间旧 `src/`、旧 `demo/`、现有 CI 原样保留；Phase 3 一次切换

## @gmi/fp-core

### 文档模型

```ts
interface Doc {
  background: { src: string; width: number; height: number; name: string } | null;
  objects: EditorObject[];   // 数组序即 z 序
}
```

对象 kind：`shape` / `text` / `path` / `mosaic` / `image`。

### State / Step / Transaction / Plugin

- `EditorState { doc, selection, mode, viewport }`；`apply(tr) → 新 state`
- Step 成对实现 `apply` / `invert`：`AddObject` / `RemoveObject` / `UpdateObject` / `ReorderObject` / `ClearObjects` / `SetBackground` / `TransformDoc` / `SetZoom`
- `Transaction`：step 序列 + selection/mode/viewport 变更 + meta。`addToHistory` 表达历史粒度——pan 不入历史，zoom 入历史
- History 插件：undo/redo 栈存反转 step 组 + 选中态还原
- 插件接口：`filterTransaction` / `appendTransaction` / `onTransaction` / `destroy`

落地补充：

- doc 坐标系 = 背景图片像素坐标系；viewport 负责映射到屏幕
- canvas 铺满容器；`cssMaxWidth/cssMaxHeight` 仅作 fit 上限
- `SetBackground` apply 时清空 objects（对齐「加载新图 / 裁剪后对象清除」），invert 恢复完整旧 doc；两条裁剪路径统一可撤销
- 缩放 clamp `[0.05, 8]`，以指针为中心；pan 不做边界 clamp

### 渲染层（core 内部，不公开）

- `FabricRenderer`：持有 `fabric.Canvas`，按对象 id diff 同步
- 每个模式一个 controller（crop / draw / line / arrow / mosaic / text / shape / pan / select）
- 借 fabric 6 淘汰旧 hack：CSS 手改三层 canvas → `viewportTransform` / `zoomToPoint`；浮 DOM textarea → `IText`；`createClass` → 原生 class + `classRegistry`

### 功能映射要点

旧 `FabricPhoto` API 按语义迁移到 Step / controller，不保留兼容层。贴图走 `kind: 'image'` + `AddObject`。明确不迁移死代码：`modules/arrow.2.ts`、`modules/mosaic.1.ts` / `mosaic.2.ts`、`lib/event.ts`、`shape/arrow.ts`、未实现的 FLIP/ICON/FILTER、`destory()` 错拼别名。

测试：vitest 覆盖纯数据层（step apply/invert、history、序列化）；渲染层走 playground 浏览器冒烟。

## @gmi/fp-react

```tsx
<FabricPhotoEditor src="..." cssMaxWidth={700} cssMaxHeight={400}>
  <TopBar />
  <Toolbar />
  <CanvasView />
  <PropertiesPanel />
</FabricPhotoEditor>
```

- 顶层创建 core `Editor` 存入 context；`useEditorState(selector)` 基于 `useSyncExternalStore`
- 所有 UI 操作 = `editor.dispatch(...)` 或 Editor 公开 API
- 点工具激活 mode；Esc 回选择；工具选项条按模式出现
- 快捷键：撤销/重做/删除/单字母切工具
- 色板实时作用于选中对象或当前工具
- 样式 Tailwind（`fp-` 前缀），产物 `dist/style.css`

## 阶段划分

| 阶段 | 交付 | 计划 | 时间 |
|---|---|---|---|
| Phase 1 | monorepo 骨架 + `@gmi/fp-core` 全功能 | `docs/plans/2025-11-08-phase1-fp-core.md` | 2025-11-08 起 |
| Phase 2 | `@gmi/fp-react` Figma 式 UI 包 | `docs/plans/2025-12-28-phase2-fp-react.md` | 2025-12-28 起 |
| Phase 3 | 新 demo 上线、旧代码清除、CI 切换 | `docs/plans/2026-01-07-phase3-demo.md` | 2026-01-07 |

Phase 3 之后 CI：`pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm build:demo` → 部署 `dist-demo`。继续使用 `GITHUB_TOKEN` + `contents: write`。

## 明确不做

- 不实际 publish npm
- 不做协同编辑 / 服务端 / 持久化
- 不保留旧 `FabricPhoto` API 兼容层
- 不迁移死代码
- 不改 `scripts/ralph/` 工作流
