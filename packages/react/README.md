# @gmi/fp-react

基于 [`@gmi/fp-core`](../core) 的 Figma 式 React 图片编辑器 UI 组件包：顶栏（撤销/重做、缩放、导出）、左工具栏（10 个工具）、工具选项条（裁剪 Apply/Cancel、线宽、形状类型、马赛克粒度、色板）、灰底画布区、右列图层面板（顺序/选中/隐藏/锁定）与选中驱动的属性面板。全部交互走 core 的命令/事务层，操作均可撤销。

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
            />
        </div>
    );
}
```

`<FabricPhotoEditor>` 渲染完整骨架（TopBar + ToolOptionBar + Toolbar + CanvasView + 右列侧栏：LayersPanel 在上、PropertiesPanel 在下），并负责创建/销毁 core `Editor`。注意父容器需提供尺寸（编辑器根节点 `width/height: 100%`）。

## 组件清单

| 组件 | 说明 |
| --- | --- |
| `FabricPhotoEditor` | 组合骨架 + Editor 生命周期；`src`/`imageName`/`cssMaxWidth`/`cssMaxHeight`/`onReady`/`onChange`/`className`/`children` |
| `TopBar` | 图名、undo/redo（historyChange 事件驱动禁用态）、缩放（-/百分比复位/+）、导出弹层（Esc/点外部关闭）：格式 PNG/JPEG/WebP、质量滑杆（仅 JPEG/WebP，0.1..1 步进 0.05 默认 0.9）、倍率 1x/2x/3x、范围整图/仅选中（无选中禁用）；确认导出走 core `toDataURL`，文件名 `<图名>-<宽>x<高>@<倍率>x[-selection].<ext>` |
| `Toolbar` | 左侧 10 工具图标按钮（选择/裁剪/旋转/箭头/画笔/直线/形状/文字/马赛克/平移） |
| `ToolOptionBar` | 按当前 mode 渲染：crop→Apply/Cancel；画笔类→线宽+色板；shape→形状类型+色板；mosaic→粒度 |
| `CanvasView` | 灰底画布区（`#e5e5e5`），ResizeObserver → `editor.notifyResize()` |
| `LayersPanel` | 图层面板：列出 doc.objects（顶层在前 = 数组倒序），每项类型图标 + 名称（kind 中文名 + 同类序号，如「矩形 3」）+ 隐藏/锁定切换按钮；点击选中、Shift 加选/减选（`selectObjects`），HTML5 拖拽排序（`moveObjectToIndex`），选中项高亮，空列表占位文案 |
| `PropertiesPanel` | 选中驱动表单：shape/text/path 颜色与尺寸（可撤销）、mosaic 只读信息、多选删除；多选有「对齐分布」按钮组（6 对齐 + 2 分布，`alignActiveObjects`/`distributeActiveObjects`，≥3 选中才启用分布）；单选/多选均有「不透明度」滑杆（0..100 ↔ 0..1，`setObjectOpacity` + mergeKey 连续拖动一个 undo 条目）、图层顺序（置顶/上移/下移/置底）与翻转（水平/垂直）按钮组；单选 locked 对象显示「已锁定」提示并禁用几何类控件（描边宽度/字号/线宽）；无选中显示画布属性 +「背景调整」滤镜组（已加载背景时，亮度/对比度/饱和度/模糊滑杆 + 灰度/褐色/反色 + 重置，mergeKey 连续拖动一个 undo 条目）；单选 image 带同样的「图像调整」组（作用于该对象） |
| `ColorPalette` | 7 色固定色板（`PALETTE_COLORS`）+ 原生自定义取色 input，纯受控 |

所有组件接受可选 `className`，追加在语义类（`fp-topbar`、`fp-toolbar` 等）之后，便于覆写。

## Hooks

| Hook | 签名 | 说明 |
| --- | --- | --- |
| `useEditor` | `() => Editor` | 取 context 中的 core Editor（须在 `EditorProvider`/`FabricPhotoEditor` 内） |
| `useEditorState` | `<T>(selector: (state: EditorState) => T) => T` | 订阅 core state 切片，selector 结果变化才重渲染 |
| `useEditorEvent` | `(event, handler) => void` | 订阅 core 事件（如 `historyChange`），自动退订 |
| `useToolSettings` | `() => { toolSettings, setToolSettings }` | React 层工具预设（线宽/颜色/形状类型/粒度等），激活绘制工具时透传给 core |
| `useThemeState` | `() => ThemeState`（`{ theme, toggleTheme }`） | 主题状态（dark/light）：初值 localStorage("fp-theme") → 系统偏好 → light；`FabricPhotoEditor` 根 div 挂 `data-theme` 承载明暗变量 |

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

注意：自定义 children 时，`FabricPhotoEditor` 的 grid 布局（`fp-editor`）仍在，`CanvasView` 落入 `canvas` 命名区域；如需完全脱离骨架布局，可传 `className` 覆写 `.fp-editor` 的 grid 定义。

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
- 布局：顶栏 48px、选项条 auto、左工具栏 48px、右面板 240px（`fp-side-panel`：图层面板在上，max-height 45%，属性面板在下填满）、画布区灰底 `#e5e5e5`，grid 命名区域 `top/opts/tools/canvas/props`。
- 按钮 hover/active 态齐备；禁用态 50% 透明。
- 色板格子 20×20 圆角带边框（白色块 `#ffffff` 有可见边框），选中态双层描边高亮。
- 覆写方式：给组件传 `className` 追加自定义类，或在自己的 CSS 中按 `fp-` 类名覆写（组件无内联样式，唯一例外是色板格子的动态背景色）。
