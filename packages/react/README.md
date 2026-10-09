# @gmi/fp-react

基于 [`@gmi/fp-core`](../core) 的照片标注编辑器：缺省壳是铺满的画布、贴顶的两枚玻璃胶囊（左：图名、上传、撤销/重做；右：缩放、主题、导出）、底部工具坞（图标 + 中文，三组：查看 / 标注 / 照片）、坞上方的工具选项、按需打开的调整浮层与图层浮层、有选中才出现的属性卡。全部交互走 core 的命令/事务层，操作均可撤销。

## 安装

```bash
npm install @gmi/fp-react @gmi/fp-core react react-dom
```

样式单独打包为 `dist/style.css`（全部 `fp-` 前缀类，Tailwind preflight 关闭，**不污染宿主全局样式**），使用时需显式引入：

```ts
import '@gmi/fp-react/style.css';
```

## 最小用例

```tsx
import '@gmi/fp-react/style.css';
import { FabricPhotoEditor } from '@gmi/fp-react';

function App() {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <FabricPhotoEditor
                src="/photo.jpg"
                onReady={(editor) => console.log('ready', editor)}
                onChange={(state) => console.log('mode', state.mode)}
                onError={({ url, error }) => console.error('image load failed', url, error)}
            />
        </div>
    );
}
```

`<FabricPhotoEditor>` 缺省 children 为 TopBar + CanvasView + 内部的 DefaultChrome（底部工具坞、坞上方选项、调整/图层浮层、有选中才出现的属性卡），并负责创建/销毁 core `Editor`。注意父容器需提供尺寸（编辑器根节点 `width/height: 100%`）。DefaultChrome 不从包入口导出。

## 组件清单

| 组件 | 说明 |
| --- | --- |
| `FabricPhotoEditor` | 组合骨架 + Editor 生命周期；`src`/`imageName`/`cssMaxWidth`/`cssMaxHeight`/`onReady`/`onChange`/`onError`/`className`/`children`。缺省 children 为 TopBar + CanvasView + DefaultChrome，不再包含右列 `fp-side-panel`。`onError` 订阅 core `loadImageError`（须在 `src` 的 `loadImageFromURL` 之前挂上）；promise reject 仍被组件 catch 以防未处理 rejection。背景图加载中根节点加 `fp-editor-loading`，画布区渲染 `fp-canvas-loading` overlay（订阅 `isLoadingImage` / `loadImageStart`） |
| `TopBar` | 图名、上传图片（`loadImageFromFile`，位于图名与撤销之间）、undo/redo（historyChange 事件驱动禁用态）、内联 `ZoomControls`、主题切换、导出弹层（Esc/点外部关闭）：格式 PNG/JPEG/WebP、质量滑杆（仅 JPEG/WebP，0.1..1 步进 0.05 默认 0.9）、倍率 1x/2x/3x、范围整图/仅选中（无选中禁用）；确认导出走 core `toDataURL`，文件名 `<图名>-<宽>x<高>@<倍率>x[-selection].<ext>` |
| `Toolbar` | 底部横向坞，10 个工具一次点击可达（视觉顺序：选择、平移、箭头、画笔、直线、形状、文字、马赛克、裁剪、旋转；`TOOLS` 数组顺序不变）。加载中全部 disabled。短标签始终可见 |
| `FloatingOptions` | 坞上方的工具选项，仅绘制/crop 模式出现（其余 mode 返回 null，不再自己贴在画布顶）：crop→「完成 / 取消」；画笔类→线宽+色板；shape→形状类型+色板；mosaic→粒度 |
| `ZoomControls` | 顶条内的内联控件：− / 百分比（点击复位 100%，`aria-label="重置缩放"`）/ ＋，步长 0.2（`setZoom`）。不再绝对贴在画布底；要浮动时用 `className` 自己覆写定位。没有「适配」按钮 |
| `CanvasView` | 铺满的舞台底，ResizeObserver → `editor.notifyResize()`（保持 zoom/pan，按新容器重算居中） |
| `LayersPanel` | 图层面板：列出 doc.objects（顶层在前 = 数组倒序），每项类型图标 + 名称（kind 中文名 + 同类序号，如「矩形 3」）+ 隐藏/锁定切换按钮；点击选中、Shift 加选/减选（`selectObjects`），HTML5 拖拽排序（`moveObjectToIndex`），选中项高亮。空态文案：「暂无图层，从底部工具坞绘制」。缺省壳里放在「图层」浮层中 |
| `PropertiesPanel` | `section` 三档，默认 `'full'`（整板，兼容旧用法）。`full`：无选中显示只读缩放、背景尺寸或「未加载图片」、对象数，有背景才挂「背景调整」；有选中走对象表单，单选 image 带「图像调整」。`object`：无选中返回 null；有选中与 full 相同但不带滤镜。`filters`：只按滤镜目标渲染（背景调整 / 单选 image 的图像调整 / 「未加载图片」 / 「当前选择不能调整滤镜」）。对象表单仍是：shape/text/path 颜色与几何数字（描边宽度/字号/线宽）、mosaic 只读块数、image 只读尺寸、多选删除与「对齐分布」（6 对齐 + 2 分布，≥3 才启用分布）、不透明度、图层顺序与翻转；locked 时几何类控件禁用 |
| `ColorPalette` | 7 色固定色板（`PALETTE_COLORS`）+ 原生自定义取色 input，纯受控 |

所有组件接受可选 `className`，追加在语义类（`fp-topbar`、`fp-toolbar` 等）之后，便于覆写。

## Hooks

| Hook | 签名 | 说明 |
| --- | --- | --- |
| `useEditor` | `() => Editor` | 取 context 中的 core Editor（须在 `EditorProvider`/`FabricPhotoEditor` 内） |
| `useEditorState` | `<T>(selector: (state: EditorState) => T) => T` | 订阅 core state 切片，selector 结果变化才重渲染 |
| `useEditorEvent` | `(event, handler) => void` | 订阅 core 事件（如 `historyChange`），自动退订 |
| `useToolSettings` | `() => EditorUIState`（`{ toolSettings, setToolSettings, theme, toggleTheme }`） | UI 层状态：React 层工具预设（线宽/颜色/形状类型/粒度等，激活绘制工具时透传给 core）+ 主题切片（只要主题请用 `useTheme`） |
| `useTheme` | `() => ThemeState`（`{ theme, toggleTheme }`） | 主题切片薄封装（读 `EditorUIContext`，须在 `EditorProvider`/`FabricPhotoEditor` 内） |
| `useThemeState` | `() => ThemeState`（`{ theme, toggleTheme }`） | 主题状态（dark/light）：初值 localStorage("fp-theme") → 系统偏好 → light；localStorage 读写失败（禁用/沙箱 SecurityError）静默跳过持久化；`FabricPhotoEditor` 根 div 挂 `data-theme` 承载明暗变量 |

配套导出：`DEFAULT_TOOL_SETTINGS`、`modeToTool(mode)`、`activateTool(editor, toolId, settings)`、`applyColor(editor, settings, setSettings, tool, selectedObjects, color)`（色板实时生效路由：有选中改对象、否则写工具预设并同步 editor）。

## 自组布局

不用完整骨架时，给 `FabricPhotoEditor` 传自定义 children（挂载容器仍由它渲染），内部用 `useEditor` 取 Editor、`CanvasView` 放画布，其他区域完全自定义：

```tsx
import '@gmi/fp-react/style.css';
import { CanvasView, FabricPhotoEditor, useEditor } from '@gmi/fp-react';

function MyCanvas() {
    const editor = useEditor();
    return <CanvasView editor={editor} />;
}

function App() {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <FabricPhotoEditor src="/photo.jpg">
                {/* 替换缺省骨架：只渲染画布，工具条等用自有组件 */}
                <MyCanvas />
            </FabricPhotoEditor>
        </div>
    );
}
```

根节点不再是三列 grid。`.fp-canvas-mount` 绝对铺满（z-index 1）。自定义 children 叠在画布上，需要自己定位，并给出高于画布挂载层的 z-index，否则会被盖住。`FloatingOptions` 不再自己贴顶，`ZoomControls` 不再自己贴底。`.fp-side-panel` 不是缺省结构（样式仍留作纵向 flex，给想自己并排图层和属性的调用方）。缺省壳的调整/图层浮层与属性卡由未导出的 DefaultChrome 渲染，自定义 children 时不会出现。

## 快捷键

单字母工具键与 Esc 由本包 `useShortcuts` 处理（输入框/文本编辑中自动失效）：

| 按键 | 工具/动作 |
| --- | --- |
| `V` | 选择 |
| `C` | 裁剪 |
| `R` | 旋转 90° |
| `A` | 箭头 |
| `P` | 画笔 |
| `L` | 直线 |
| `S` | 形状 |
| `T` | 文字 |
| `M` | 马赛克 |
| `H` | 平移 |
| `Esc` | 退出当前模式（`editor.endAll()`） |
| `Shift+H` | 水平翻转选中对象 |
| `Shift+V` | 垂直翻转选中对象 |
| `Space`（按住） | 临时平移：按下进入 pan，松开恢复之前的工具（按住期间单字母工具键屏蔽） |

以下由 `@gmi/fp-core` 内建 keymap 处理：

| 按键 | 动作 |
| --- | --- |
| `Mod+Z`（macOS `⌘Z` / Win `Ctrl+Z`） | 撤销 |
| `Mod+Shift+Z` / `Ctrl+Y` | 重做 |
| `Delete` / `Backspace` | 删除选中对象 |
| `Mod+C` / `Mod+X` | 复制 / 剪切选中对象（内部剪贴板） |
| `Mod+V` | 粘贴（偏移 +16，连续粘贴级联） |
| `Mod+D` | 创建选中对象副本（偏移 +16） |
| `]` / `[` | 上移一层 / 下移一层 |
| `Mod+]` / `Mod+[` | 置顶 / 置底 |
| `Mod+=` / `Mod++` | 放大一档（+0.2） |
| `Mod+-` | 缩小一档（−0.2） |
| `Mod+0` | 缩放重置为 100% |

另外，拖拽旋转控制点时按住 `Shift` 吸附到 15° 整数倍（core 渲染投影内建，多选组同样生效）。

## 样式说明

- 所有类名 `fp-` 前缀（Tailwind `prefix: 'fp-'`，`preflight: false`），不引入未前缀的全局选择器/reset，宿主页面样式不受影响。
- 布局：画布铺满；顶条、底部工具坞、调整浮层、图层浮层、属性卡全部绝对定位叠在画布上，不占轨道。舞台色亮色 `#e4e1dc`、暗色 `#1a1917`。`data-theme` 与 `prefers-color-scheme` 仍控制明暗 token。没有左轨，也没有常驻右栏。
- 按钮 hover/active 态齐备；禁用态 50% 透明。
- 色板格子 20×20 圆角带边框（白色块 `#ffffff` 有可见边框），选中态双层描边高亮。
- 覆写方式：给组件传 `className` 追加自定义类，或在自己的 CSS 中按 `fp-` 类名覆写（组件无内联样式，唯一例外是色板格子的动态背景色）。
