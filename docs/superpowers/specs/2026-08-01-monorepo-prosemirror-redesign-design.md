# fabric-photo 整体大升级设计：pnpm monorepo + ProseMirror 式内核 + Figma 式 React UI

日期：2026-08-01
状态：已获用户批准

## 背景与目标

fabric-photo 当前是单包 TypeScript 库：fabric.js 1.7.3 + 模块/命令架构，构建为 tsup，demo 为 Vite（2026-08-01 刚完成现代化改造）。本次做整体架构升级：

1. **pnpm workspace monorepo**：绘制内核独立为 `@gmi/fp-core`，React 界面独立为 `@gmi/fp-react`，配套 demo 演示页
2. **底层架构换成 ProseMirror 式**：不可变 EditorState + Step/Transaction 驱动 + 插件系统（用户已确认为「完整 ProseMirror 式」）
3. **React 界面为 Figma 式交互**（完整布局：左工具栏 + 顶栏 + 右属性面板 + 中央画布 + 快捷键）
4. **功能维持不变**：以现有全部真实功能为验收基线（死代码除外）
5. **fabric 升级到 6.x**（用户已确认），仅作渲染层，不向 fp-react 暴露 fabric 类型

已确认的决策（2026-08-01，逐题问答）：

| 决策点 | 结论 |
|---|---|
| ProseMirror 架构落地形态 | 完整式：不可变 state + step/transaction + 插件 + history 插件 |
| 核心架构方案 | 方案 A：State 单一事实源，fabric 纯渲染投影（否决 B「fabric 为事实源」与 C「分阶段」） |
| fabric 版本 | 6.x 最新，core 的 external dependency，类型不外泄 |
| 仓库策略 | 本仓库原地改造为 monorepo；Pages URL 不变、内容换新 demo；CI 沿用 GITHUB_TOKEN 链路 |
| npm 发布 | 按可发布标准配置（exports/files/publishConfig），本次不实际 publish |
| React 版本 | React 19 开发，peerDependencies `>=18` |
| 功能基线 | 全部真实功能迁移；死代码明确不迁移 |
| undo 粒度 | 增强为 Figma 行为：对象拖拽/缩放结束作为一个 Step 入历史 |

## 总体架构

State 为唯一事实源，fabric 仅为渲染投影：

```
用户交互 → dispatch(Transaction[Step...]) → 新 EditorState（不可变）
                                        ↓
                          FabricRenderer 把 state diff 投影到 fabric canvas
```

拖拽类交互两阶段：进行中直接改 fabric 对象（乐观预览，60fps），结束时把最终几何作为一个 Step 提交——「对象变换可撤销」由此落地。

### 备选方案（已否决）

- **方案 B：fabric 场景图为事实源，事务层只包历史**——本质是现有命令模式换皮，undo 继续依赖对 fabric 对象的精确逆操作，违背「完整 ProseMirror 式」决策。
- **方案 C：先 B 后 A 分阶段**——core 写两遍，B 阶段 API 被 fp-react 依赖后翻转有连带成本。

## Monorepo 结构

```
fabric-photo/                        ← 本仓库原地改造
├── package.json                     # root private，聚合 scripts + 共享 devDeps
├── pnpm-workspace.yaml              # packages/* + demo
├── tsconfig.base.json               # strict 共享配置
├── packages/
│   ├── core/                        # @gmi/fp-core —— 编辑器内核（不依赖 React）
│   │   ├── package.json             # exports map + files；deps: fabric ^6（external）
│   │   ├── tsup.config.ts           # cjs + esm + d.ts
│   │   ├── playground/              # 最小 HTML 验证页（dev 专用，不进 npm files）
│   │   └── src/
│   └── react/                       # @gmi/fp-react —— Figma 式 UI
│       ├── package.json             # peerDeps: react >=18, react-dom >=18；deps: @gmi/fp-core: workspace:*
│       ├── tsup.config.ts           # cjs + esm + d.ts + style.css 产物
│       └── src/
├── demo/                            # fabric-photo-demo（private），Vite + React 19，消费 @gmi/fp-react
├── docs/
└── .github/workflows/github-pages.yml
```

- **包边界**：fp-core 公开 API 不暴露任何 fabric 类型；fp-react 只通过 core 的 state/事件 API 工作，不含编辑逻辑
- **构建**：每包独立 tsup；root scripts 用 `pnpm -r` / `--filter` 聚合（`dev` / `build` / `test` / `typecheck`）
- **线上不中断**：旧 `src/`、旧 `demo/`、现有 CI 在 Phase 1-2 期间原样保留（继续部署旧站）；Phase 3 一次切换：删旧代码、新 demo 上线、workflow 更新。Pages 中断窗口 = 一次部署的几十秒。具体地：Phase 1 搭 workspace 骨架改写 root package.json 时，必须保留 `dev` / `build:demo` / `preview:demo` scripts 与 root `vite.config.ts` / `tsup.config.ts`（旧 demo 仍 import 旧 `src/`），保证现有 workflow 在 Phase 1-2 每次 push 后依然全绿
- 旧包名 `fabric-photo` 退役不发布新版

## @gmi/fp-core 内核设计

### 文档模型（纯 JSON，不可变）

```ts
interface Doc {
  background: { src: string; width: number; height: number; name: string } | null;
  objects: EditorObject[];   // 数组序即 z 序
}
type EditorObject =
  | { kind: 'shape'; shapeType: 'rect'|'circle'|'triangle'; id, left, top, width, height, angle, fill, ... }
  | { kind: 'text';  text, fontSize, fontFamily, fill, angle, ... }
  | { kind: 'path';  tool: 'freedraw'|'line'|'arrow'; points, stroke, strokeWidth, ... }
  | { kind: 'mosaic'; rects: { x, y, size, color }[] };
```

### State / Step / Transaction / Plugin

- `EditorState { doc, selection: string[], mode, viewport: { zoom, panX, panY } }`；`apply(tr) → 新 state`
- Step（每个带 `invert()`）：`AddObject / RemoveObject / UpdateObject / ReorderObject / ClearObjects / SetBackground / TransformDoc(rotate) / SetZoom`
- `Transaction`：step 序列 + selection/mode 变更 + meta。`addToHistory` meta 表达历史粒度——**pan 移动 viewport 但不入历史，zoom 入历史**（ProseMirror 同款机制，恰好对齐现状语义）
- **History 插件**：undo/redo 栈存反转 step 组 + 选中态还原；`pushUndoStack/pushRedoStack/emptyUndoStack/emptyRedoStack` 事件语义保留
- **插件接口**：`{ stateFields, filterTransaction, appendTransaction, eventHandlers }`；history 是第一个插件

### 渲染层（core 内部，不公开）

- `FabricRenderer`：持有 `fabric.Canvas`；`sync(state)` 按对象 id 做 diff 增删改；维护 id → fabric.Object 映射
- **每个模式一个 controller**（crop/draw/line/arrow/mosaic/text/shape/pan）：旧 `modules/` 的转世，订阅 fabric 事件 → 产出 transaction

### 借 fabric 6 升级淘汰的旧 hack（逐条声明）

| 旧实现（1.7.3 时代） | 新实现（fabric 6） |
|---|---|
| CSS style 手改三层 canvas 的缩放/平移（main.ts/pan.ts/text.ts/mosaic.ts 全部依赖） | `viewportTransform` + `zoomToPoint`（缩放以指针为中心） |
| 文本编辑浮 DOM textarea（`fabric-photo-eidtor-textarea`） | `IText` 原地编辑 |
| `fabric.util.createClass` 自定义对象（cropzone 蚂蚁线、mosaic、arrow-shape） | 原生 `class extends fabric.Rect/Object` + `classRegistry` 注册 |
| `getActiveGroup` / `discardActiveGroup` / `deactivateAllWithDispatch` | `ActiveSelection` / `discardActiveObject` |
| `fabric.Path.prototype.selectable = false` 全局副作用 | 按对象设置 |
| `toDataURL` 长参数签名、`setBackgroundImage` 旧签名 | fabric 6 对象参数签名 |

### 功能映射（旧 → 新，验收基线）

| 旧 FabricPhoto API | 新 core 机制 | 备注 |
|---|---|---|
| loadImageFromURL / loadImageFromFile | `SetBackground` step | 可撤销 |
| startCropping / endCropping | mode 切换 + crop controller + `SetBackground`（裁剪结果） | 可撤销 |
| startCropByBoundInfo / endCropByBoundInfo | 同上，统一走 `SetBackground` | **行为统一：现状此路径会清空 undo/redo 栈，新架构统一为可撤销**（增强，在此声明） |
| rotate / setAngle / getAngle | `TransformDoc` step（同步旋转全部对象） | 可撤销 |
| startFreeDrawing / setBrush / endFreeDrawing | mode + draw controller → `AddObject(path)` | |
| startLineDrawing / endLineDrawing | mode + line controller → `AddObject(path)` | |
| startArrowDrawing / changeArrowStyle | mode + arrow controller → `AddObject(path)` | |
| startMosaicDrawing | mode + mosaic controller（覆盖层取平均色算法保留）→ `AddObject(mosaic)` | |
| startDrawingShapeMode / setDrawingShape / addShape / changeShape | mode + shape controller → `AddObject(shape)` / `UpdateObject` | |
| startTextMode / addText / changeText / changeTextStyle | mode + text controller（IText）→ `AddObject(text)` / `UpdateObject`；样式 toggle 语义保留 | |
| startPan / endPan | mode + pan controller → viewport 瞬时变更（不入历史） | |
| setZoom / getZoom | `SetZoom` step | 可撤销（对齐现状） |
| 对象拖拽/缩放 | 预览态直改 fabric + 结束提交 `UpdateObject` | **增强：可撤销** |
| clearObjects | `ClearObjects` step | 可撤销 |
| removeActiveObject | `RemoveObject` step（含多选 ActiveSelection） | 可撤销 |
| undo / redo / clearUndoStack / clearRedoStack / isEmptyUndoStack / isEmptyRedoStack | history 插件 | |
| toDataURL / toBlobData | renderer 导出（backstore 原图） | |
| getViewPortImage / getViewPortInfo | renderer 基于 viewportTransform 实现 | 功能保留，实现更换 |
| resizeCanvasDimension / adjustCanvasDimension / cssMaxWidth/cssMaxHeight | renderer 尺寸管理 | |
| getCurrentState / endAll / deactivateAll / destroy / isEdited | Editor 主类对应方法 | `destory()` 错拼别名不迁移 |
| getImageName | state.doc.background.name | |
| on / once / off / fire（30 个事件名） | `subscribe(state, prevState)` + 语义事件；事件名按新 API 重新设计，语义覆盖原集合 | flipImage/applyFilter 死事件不迁移 |
| 快捷键 Ctrl/Cmd+Z、Ctrl/Cmd+Y、Delete/Backspace | keymap 插件 | 保留 |

**明确不迁移（死代码）**：`modules/arrow.2.ts`、`modules/mosaic.1.ts`、`modules/mosaic.2.ts`（未注册的并存实现）、`lib/event.ts`（加载即崩、无引用）、`shape/arrow.ts`（无引用）、FLIP/ICON/FILTER 模块名与 FLIP_IMAGE/APPLY_FILTER/CLEAR 命令名（只登记未实现）、`destory()` 错拼别名。

公开 API 重新设计（不保留旧 `FabricPhoto` 类兼容层），语义一一对应，readme 重写。

### 测试

vitest 单测覆盖纯数据层：state apply、每个 step 的 apply/invert、transform 组合、history 分支（undo 后新操作截断 redo）、doc 序列化/反序列化。渲染层走 playground + kimi-webbridge 浏览器冒烟。

## @gmi/fp-react 设计（Figma 式交互）

### 组件树

```tsx
<FabricPhotoEditor src="..." cssMaxWidth={700} cssMaxHeight={400} onReady onChange>
  <TopBar />           {/* 顶部：undo/redo、缩放 -/%/+、导出 */}
  <Toolbar />          {/* 左侧竖排：选择/裁剪/旋转/箭头/画笔/直线/形状/文字/马赛克/平移 */}
  <CanvasView />       {/* 中央：灰底，画布居中 */}
  <PropertiesPanel />  {/* 右侧：随 selection 切换的属性表单 */}
</FabricPhotoEditor>
```

- 顶层组件内部创建 core `Editor` 存入 context
- `useEditorState(selector)` 基于 `useSyncExternalStore` 做选择性重渲染
- 所有 UI 操作 = `editor.dispatch(...)`；UI 只是 state 的函数，**react 包不含编辑逻辑**
- 子组件可单独导出，支持只渲染 `<CanvasView />` 自组布局

### Figma 交互规范

- 点工具激活对应 mode；再次点击或 `Esc` 回选择模式；模式激活时顶栏下方出现该工具选项条（裁剪 Apply/Cancel、画笔线宽等）
- 选中对象 → 右侧属性面板（颜色/字号/线宽/角度）；无选中 → 画布属性（缩放、图片尺寸）
- 快捷键：`Cmd/Ctrl+Z` 撤销、`Cmd/Ctrl+Shift+Z` / `Ctrl+Y` 重做、`Delete/Backspace` 删除选中、单字母工具切换（`V` 选择 / `T` 文字 / `P` 画笔 / `C` 裁剪 等）
- 双击文本原地编辑（core 的 IText 能力）；缩放以指针为中心
- 颜色选择：色板（红/黄/绿/蓝/灰/黑/白）+ 自定义取色，**实时作用于选中对象或当前工具**（修复现状「改了 state 不生效」缺陷）

### 样式与发布

- 包内 Tailwind（`prefix: 'fp-'` 防消费者类名冲突），构建时编译出 `dist/style.css`；消费者 `import '@gmi/fp-react/style.css'`
- 图标用 lucide-react（沿用现有依赖）
- TS 类型全量导出

## 阶段计划

每个 phase 独立走 writing-plans → SubAgent 逐任务执行 + 任务级 review + 终审；主 Agent 只做需求/方案/调度。

| Phase | 交付物 | 关键任务 | 验证 |
|---|---|---|---|
| **1. 骨架 + fp-core** | monorepo 骨架；core 全部功能 + vitest | workspace 配置（旧 src/demo/CI 保留不动）；core 引擎（state/step/transaction/history/plugin）；FabricRenderer + 8 个 mode controller；功能逐项移植；playground 冒烟页 | `pnpm -r typecheck` + `pnpm -r test` 全绿；webbridge 打开 playground 逐项点验功能映射表 |
| **2. fp-react** | Figma 布局 UI 包 | EditorProvider + hooks；TopBar/Toolbar/CanvasView/PropertiesPanel；选项条；快捷键；样式构建 | 并入 Phase 3 demo 整体验证（react 包不做独立页面） |
| **3. demo + 切换** | 新 demo 上线；旧代码清除 | demo 重写（Vite + React 19 + fp-react）；删旧 `src/`、旧 demo 内容、root 旧构建配置（tsup.config.ts/vite.config.ts）；workflow 更新；readme/CLAUDE.md 重写 | CI 全绿；webbridge 验证线上 https://ximing.github.io/fabric-photo/ 为新 demo 且功能可用 |

### CI（Phase 3 切换后）

`.github/workflows/github-pages.yml` 保持触发条件与部署行为，构建步骤改为：

1. `pnpm install --frozen-lockfile`
2. `pnpm -r typecheck`
3. `pnpm -r test`
4. `pnpm build:demo`
5. JamesIves/github-pages-deploy-action@v4 部署 `dist-demo` 到 `gh-pages`（沿用 `secrets.GITHUB_TOKEN` + `permissions: contents: write`，2026-08-01 已验证可用；git-config-name/email secrets 不变）

### 全局约束

- 包管理器统一 pnpm；Node 20
- TypeScript strict；每阶段结束 `pnpm -r typecheck` 必过
- fabric 锁定 6.x；只作为 core 的渲染实现，core 公共 API 与 fp-react 不暴露 fabric 类型
- 浏览器验证统一使用 kimi-webbridge；core 的 playground 与最终 demo 都需冒烟
- CLAUDE.md 按 monorepo 重写（Phase 3）
- 主 Agent 只做需求梳理、技术方案、任务调度；实现、测试、验证均由 SubAgent 执行

## 明确不做

- 不实际 publish npm（仅按可发布标准配置）
- 不做协同编辑 / 服务端 / 持久化存储
- 不做图层面板（澄清阶段未选）
- 不保留旧 `FabricPhoto` API 兼容层；旧 `fabric-photo` 包不发布退役版本
- 不迁移死代码（见功能映射末节清单）
- 不改 `scripts/ralph/` 工作流
