# 编辑器 UI 产品化重构（明暗双主题）设计文档

日期：2026-08-04
状态：已与用户对齐，待实施

## 背景与问题

当前编辑器功能简单，但界面组织不够产品化：

1. **「第二排」工具选项条**（`ToolOptionBar`）固定占 grid 一整行，但 normal / text / pan 模式下完全空白——视觉上是一条刺眼的空行
2. **导出交互**是 4 行 radio 表单 + 确认按钮的「填表式」弹窗，二次确认结构过于突出
3. 工具栏带文字标签偏宽；顶栏塞了缩放控件偏挤；整体只有一套浅色基础样式，不专业、不新潮

## 目标

- 专业工具风视觉（类 Figma），**明暗两套主题**
- 消除空白第二排：工具选项改为画布顶部浮动条，按需出现
- 导出弹层收敛为紧凑 segmented 控件形态，选项不减少
- 全程不触碰 core：本次为纯 `packages/react` + demo 的 UI 层改造

## 非目标

- 不新增编辑功能；不改 core 任何 API
- 不做响应式/移动端适配（保持桌面编辑器假设）
- 不做导出「一键下载 + 格式菜单」（方案 A）——用户已选定保留全部选项的紧凑弹层（方案 B）

## 设计

### 1. 主题系统（tokens）

`packages/react/src/styles.css` 定义语义化 CSS 变量，暗/亮两套值：

| token | 用途 | 暗 | 亮 |
|---|---|---|---|
| `--fp-bg-app` | 画布区底色 | #181818 | #f5f5f5 |
| `--fp-bg-panel` | 顶栏/工具栏/侧栏 | #252526 | #ffffff |
| `--fp-bg-elevated` | 浮层/弹层（半透明） | rgba(45,45,45,.92) | rgba(255,255,255,.92) |
| `--fp-border` | 分隔线/细边框 | #333333 | #e5e5e5 |
| `--fp-text` | 主文字 | #cccccc | #333333 |
| `--fp-text-dim` | 次要文字/图标 | #999999 | #888888 |
| `--fp-accent` | 强调色 | #0d99ff | #0074d9（加深保证对比度） |
| `--fp-shadow-pop` | 浮层阴影 | 0 8px 24px rgba(0,0,0,.55) | 0 8px 24px rgba(0,0,0,.12) |

（实施时可微调色值，以 webbridge 截图目检为准。）

- 默认跟随 `prefers-color-scheme`（媒体查询写在 `.fp-editor` 上）；根元素挂 `data-theme="dark" | "light"` 时覆盖系统
- `TopBar` 新增日/月切换按钮（lucide `Sun` / `Moon`），选择持久化到 `localStorage("fp-theme")`；初始化读取顺序：localStorage → 系统偏好
- 纯 react 层实现，core 零感知
- 现有组件的硬编码色值全部迁移到变量（本次工作量主体）

### 2. 布局重构

- grid 由三行（`48px auto 1fr`）改为**两行**：`grid-template-rows: 48px 1fr`
  - 行 1：TopBar；行 2：工具栏 | 画布 | 右侧栏
- `ToolOptionBar` 重构为 **`FloatingOptions`**（文件名 `floating-options.tsx`，导出名同步更新）：
  - 不再占 grid 行；绝对定位浮于画布区顶部居中（相对画布区容器定位）
  - 玻璃拟态：`backdrop-filter: blur(12px)` + `--fp-bg-elevated` 半透底 + 1px `--fp-border` + `--fp-shadow-pop`，圆角 10px
  - 仅 crop / freedraw / line / arrow / shape / mosaic 模式渲染；normal / text / pan 返回 `null`——无空行、无画布跳动
  - 选项内容（线宽、形状类型、马赛克粒度、色板、crop Apply/Cancel）逻辑与路由（toolSettings / applyColor / editor 调用）全部不变，仅外壳与样式变化
- 缩放控件从 TopBar 移到**画布底部居中浮动胶囊**（− / 百分比复位 / ＋），样式同浮动条；点击百分比仍复位 100%
- TopBar 精简为：图名 · 撤销/重做 · 主题切换 · 导出
- Toolbar 收窄为纯图标 rail（宽 44px）：删除 `fp-tool-btn-label` 文字，工具名与快捷键进 `title` tooltip；active 态 = accent 底圆角块

### 3. 导出弹层

- 选项全保留：格式（PNG/JPEG/WebP）、质量滑杆（仅 JPEG/WebP）、倍率（1x/2x/3x）、范围（整图/仅选中，无选中禁用）
- radio 行全部替换为 **segmented 控件**：底槽（`--fp-bg-app`）+ 等宽分段，选中段 accent 底白字；用 `role="radiogroup"` + 按钮 `aria-pressed` 保持可访问性
- 弹层收窄至约 220px，圆角 10px，`--fp-bg-elevated` + `--fp-shadow-pop`；确认按钮 accent 主色撑满底部
- 开合逻辑（Esc / 点外部关闭）、文件名拼接、`toDataURL` 参数组装全部不变

### 4. 面板、细节与 demo

- LayersPanel / PropertiesPanel 同步迁移到主题变量；面板小标题 uppercase + 微字距，面板间 1px 分隔线
- 控件统一语言：按钮圆角 6px、hover 背景抬升、`focus-visible` accent 描边
- demo 站页面底色与编辑器主题联动（demo 直接消费 react 包变量即可，不加独立主题逻辑）

### 5. 组件/API 变化清单

- `packages/react/src/index.ts`：导出 `FloatingOptions` 替代 `ToolOptionBar`（** breaking**：自定义 children 的接入方需换组件；demo 用缺省布局不受影响）
- `FabricPhotoEditor` 缺省 children：`<ToolOptionBar />` 移除；`<FloatingOptions />` 与缩放胶囊放进 CanvasView 所在区域（实现时决定是包一层相对定位容器还是作为 `fp-editor` 绝对定位子元素）
- `TopBar` props 不变；内部去掉 zoom 三件套，加主题切换按钮
- README（`packages/react/README.md`）组件清单同步更新

### 6. 测试与验证

- 更新 react 包测试：
  - `tool-option-bar.test.tsx` → `floating-options.test.tsx`：类名/结构断言更新；新增「normal/text/pan 模式渲染 null」断言
  - `top-bar.test.tsx`：移除 zoom 控件断言；新增主题切换（data-theme 落根元素 + localStorage 写入）断言
  - 导出弹层：segmented 结构断言（radio input → 分段按钮）
  - `toolbar.test.tsx`：label 移入 title 的断言更新
- 门槛：`pnpm typecheck && pnpm test && pnpm build` 全绿
- 浏览器验证：kimi-webbridge 打开 demo（9876），暗/亮两主题各截图目检：浮动条形态、导出弹层、crop 模式、色板交互
