# @gmi/fp-core

ProseMirror 式（state / step / transaction / plugin）的 Canvas 图片编辑器内核，UI 无关。
文档模型与全部编辑语义都在内核里，fabric 6 只是 state 的「渲染投影」——换上层的
React/Vue/原生组件包即可得到完整编辑器。

## 安装

```bash
pnpm add @gmi/fp-core
```

## 最小用例

```ts
import { Editor } from '@gmi/fp-core';

const editor = new Editor({ container: document.getElementById('app')! });

await editor.loadImageFromURL('./demo.jpg', 'demo');

editor.on('loadImage', ({ width, height }) => {
    console.log('图片尺寸:', width, height);
});
```

`container` 缺省（且不注入 `renderer`）时为无头模式：state/step/transaction 全部可用，
仅渲染与依赖画布像素的 API（导出、拖拽交互）不可用——单测即用此模式。

## 架构一句话

一切修改都是 `Transaction`（一组 `Step`）经 `Editor.dispatch()` 落到不可变 `EditorState`，
`History` 插件收账提供 undo/redo，`FabricRenderer` 把 state 投影到 fabric 6 画布，
交互（绘制/裁剪/文本等）由 mode 路由到对应 controller，语义事件经 `EditorEventMap` 外发。

## 公开 API 清单

签名以 `src/editor.ts` 为准；除标注外，修改类方法均可撤销（undo/redo）。

### 构造与内核

| 签名 | 说明 |
| --- | --- |
| `new Editor(options?: EditorOptions)` | `container` 存在时自动创建 FabricRenderer；可注入自定义 `renderer` 与追加 `plugins`（history/keymap 始终默认注册） |
| `get state(): EditorState` | 当前不可变状态（doc / selection / viewport / mode） |
| `get history(): History` | History 插件实例（undo/redo 栈尺寸等） |
| `newTransaction(): Transaction` | 基于当前 state 新建事务 |
| `dispatch(tr: Transaction): void` | 固定管线：filter → apply → append → 置 state → history → renderer → 事件 → 插件 |
| `subscribe(listener): () => void` | 订阅 state 变化，返回退订函数 |
| `on / once / off(name, handler?)` | 订阅语义事件（见下方事件清单） |

### 撤销 / 重做

| 签名 | 说明 |
| --- | --- |
| `undo(): void` / `redo(): void` | 撤销 / 重做一步（空栈 no-op） |
| `clearUndoStack(): void` / `clearRedoStack(): void` | 清空对应栈 |
| `isEmptyUndoStack(): boolean` / `isEmptyRedoStack(): boolean` | 栈是否为空 |
| `isEdited(): boolean` | undo 栈非空（相对初始状态有编辑） |

### 图片加载

| 签名 | 说明 |
| --- | --- |
| `loadImageFromURL(url: string, imageName: string): Promise<void>` | 加载背景图并 fire `loadImage`；失败 reject 且 state 不变 |
| `loadImageFromFile(imgFile: File, imageName?: string): Promise<void>` | FileReader → dataURL → `loadImageFromURL` |
| `addImageObject(imgUrl: string): Promise<void>` | 贴一张新图片对象到背景中心并 fire `objectAdded`（需已加载背景） |

### 便捷查询

| 签名 | 说明 |
| --- | --- |
| `getCurrentState(): EditorMode` | 当前模式（normal / pan / freedraw / line / arrow / shape / text / mosaic / crop） |
| `getImageName(): string` | 当前背景图名，无背景返回 `''` |
| `endAll(): void` | 结束当前进行中的交互，回到 normal 模式（行为变更见「与旧 fabric-photo 的差异」） |

### 旋转

| 签名 | 说明 |
| --- | --- |
| `getAngle(): number` | 当前背景角度（度），无背景返回 0 |
| `setAngle(angle: number): void` | 旋转到绝对角度（%360 归一）；无背景或角度未变为 no-op |
| `rotate(delta: number): void` | 相对旋转 `delta` 度 |

### 对象操作

| 签名 | 说明 |
| --- | --- |
| `removeActiveObject(): void` | 删除当前选中对象（单选/多选），每个被删对象 fire `objectRemoved` |
| `clearObjects(): void` | 清空全部对象并清空选中 |
| `deactivateAll(): void` | 取消全部选中（不进历史） |

### 剪贴板（内部对象剪贴板，不操作系统剪贴板）

| 签名 | 说明 |
| --- | --- |
| `copyActiveObjects(): boolean` | 复制当前选中（单选/多选）到内部剪贴板；无选中返回 `false` |
| `paste(): boolean` | 粘贴：新 id + left/top 偏移 +16（连续 paste 级联 16*n，copy/cut 后重置），一笔事务并选中粘贴结果；剪贴板空返回 `false` |
| `cutActiveObjects(): boolean` | = `copyActiveObjects` 成功后一笔事务移除选中对象；无选中返回 `false` |
| `duplicateActiveObjects(): boolean` | 与 `paste` 同语义但不读/不写剪贴板，偏移恒 +16；无选中返回 `false` |

### z 序

| 签名 | 说明 |
| --- | --- |
| `bringToFront(): void` / `sendToBack(): void` | 选中对象（多选保持相对顺序）置顶 / 置底；无选中或已在顶/底 no-op 不 dispatch |
| `bringForward(): void` / `sendBackward(): void` | 选中对象上移 / 下移一层；同上 no-op 语义 |

对应 Step：`ReorderObjects`（存 before/after 完整 id 序，apply/invert 成对）与工厂函数
`computeReorderedIds(doc, ids, action)`（`action: 'front' \| 'back' \| 'forward' \| 'backward'`，
序不变返回 `null`），均从包入口导出。

### 翻转

| 签名 | 说明 |
| --- | --- |
| `flipActiveObjects(axis: 'horizontal' \| 'vertical'): boolean` | 选中对象 scaleX/scaleY 取负（一笔事务，多选逐个 UpdateObject）；无选中返回 `false` |

### 滤镜与图像调整

| 签名 | 说明 |
| --- | --- |
| `setBackgroundFilters(filters: Partial<FilterSettings>, opts?: { mergeKey?: string }): void` | patch 与现有背景滤镜（缺省 `DEFAULT_FILTERS`）合并后落账；无背景或合并后未变为 no-op |
| `setImageFilters(objectId: string, filters: Partial<FilterSettings>, opts?: { mergeKey?: string }): void` | 同上，作用于指定 image 对象；对象不存在或非 image 为 no-op |
| `resetBackgroundFilters(): void` / `resetImageFilters(objectId: string): void` | 移除 filters 字段恢复默认（可撤销）；已无滤镜为 no-op |

`FilterSettings = { brightness, contrast, saturation, blur, grayscale, sepia, invert }`
（brightness/contrast/saturation ∈ [-1,1]，blur ∈ [0,1]），`DEFAULT_FILTERS` 为全中性默认值；
两者与 `SetFilters` Step（构造 `(target: 'background' | objectId, before, after)`，apply/invert 成对）
均从包入口导出。当前滤镜读 state：`doc.background?.filters` / `对象.filters`，缺省 = 无滤镜。

`opts.mergeKey` 透传事务 meta：History 收账时若新事务的 mergeKey 与 undo 栈顶条目相同，
则合并进该条目（before 快照保持最初值），不新增条目——滑杆连续拖动 N 次 dispatch
只产生一个 undo 条目；无 mergeKey 行为不变。

### 视口

| 签名 | 说明 |
| --- | --- |
| `setZoom(rate: number): void` | 缩放（clamp [0.05, 8]），支点恒为容器中心 |
| `getZoom(): number` | 当前缩放倍率 |
| `startPan(): void` / `endPan(): void` | 进入 / 退出平移模式（拖动画布平移，瞬时不入历史） |

### 绘制（freedraw / line / arrow）

| 签名 | 说明 |
| --- | --- |
| `startFreeDrawing(setting?)` / `endFreeDrawing()` | 进入 / 退出自由绘制；`setting: { width?, color? }` |
| `startLineDrawing(setting?)` / `endLineDrawing()` | 进入 / 退出直线绘制 |
| `startArrowDrawing(setting?)` / `endArrowDrawing()` | 进入 / 退出箭头绘制 |
| `setBrush(setting: { width?; color? }): void` | 按当前 mode 路由到对应画笔；非绘制模式 no-op |
| `changeFreeDrawingPathStyle(setting?): void` | 修改选中 freedraw 路径的 stroke/strokeWidth |
| `changeArrowStyle(setting?): void` | 修改选中 arrow 路径的 stroke/strokeWidth |

### 形状

| 签名 | 说明 |
| --- | --- |
| `startDrawingShapeMode(): void` / `endDrawingShapeMode(): void` | 进入 / 退出形状绘制模式 |
| `setDrawingShape(type, options?): void` | 预设下一次拖出形状的类型（rect/circle/triangle）与样式（fill/stroke/strokeWidth） |
| `addShape(type, options?): void` | 直接添加形状对象并 fire `objectAdded`；left/top 缺省取画布中心，尺寸缺省 100 |
| `changeShape(options): void` | 修改选中 shape 的 fill/stroke/strokeWidth |

### 马赛克

| 签名 | 说明 |
| --- | --- |
| `startMosaicDrawing(setting?: { dimensions?: number }): void` | 进入马赛克涂抹模式，`dimensions` 为涂抹块边长（doc 像素，默认 8） |
| `endMosaicDrawing(): void` | 退出马赛克模式 |

### 裁剪

| 签名 | 说明 |
| --- | --- |
| `startCropping(): void` | 进入裁剪模式：出现背景 80% 的蚂蚁线裁剪框，可拖动/缩放（clamp 在背景内），Shift 拖空白重画锁正方形 |
| `endCropping(isApplying = true): void` | 结束裁剪：`true` 应用裁剪矩形为新背景（可撤销），`false` 丢弃裁剪框退出 |
| `startCropByBoundInfo(): void` | 进入无 UI 的矩形裁剪模式（仅切 mode，不出裁剪框） |
| `endCropByBoundInfo(cropInfo?): void` | 按 cropInfo（doc 坐标，缺省整图）裁剪，与 `endCropping(true)` 同一落盘路径 |

### 文本

| 签名 | 说明 |
| --- | --- |
| `startTextMode(): void` / `endTextMode(): void` | 进入 / 退出文本模式（点击空白新建并编辑，双击已有文本再编辑） |
| `addText(text?, options?, defaultEdit = false): void` | 添加文本对象并 fire `objectAdded`；`options: { styles?, position? }`，`defaultEdit` 创建后立即编辑 |
| `changeText(text: string): void` | 修改选中（含编辑中）文本的内容 |
| `changeTextStyle(styleObj?: TextStyleOptions): void` | 修改选中文本样式，toggle 语义：同值则重置为该字段默认值 |
| `isTextEditing(): boolean` | 是否有文本正处于编辑态 |

### 画布尺寸

| 签名 | 说明 |
| --- | --- |
| `resizeCanvasDimension(dimension?: { width?; height? }): void` | 调整 fit 上限与容器尺寸并 refit（refit 不进历史） |
| `adjustCanvasDimension(): void` | refit：viewport 归位（zoom 1、pan 0），图像重新居中 |

### 导出

| 签名 | 说明 |
| --- | --- |
| `toDataURL(type?: string): string` | 整图 dataURL（背景原始像素，不受 zoom/pan 影响），`type` 如 `image/png`（默认）/`image/jpeg`/`image/webp` |
| `toBlobData(type?: string): Promise<Blob \| null>` | 整图 Blob，进制同 `toDataURL` |
| `getViewPortImage(): string` | 当前视口可见区域（容器 CSS 像素）的 dataURL |
| `getViewPortInfo(): ViewportInfo` | 容器可见区域在 doc 坐标系下的矩形；无头模式返回全 0 |

### 生命周期

| 签名 | 说明 |
| --- | --- |
| `destroy(): void` | 销毁 renderer、插件、全部订阅与事件监听 |

## 事件清单（EditorEventMap）

经 `editor.on(name, handler)` 订阅。

| 事件 | payload | 触发时机 |
| --- | --- | --- |
| `change` | `{ state, prev }` | 每次 dispatch 成功置 state 后（所有变化的兜底事件） |
| `change:mode` | `{ mode, prevMode }` | 模式切换（startXxx/endXxx/endAll 等） |
| `change:selection` | `{ selection: readonly string[] }` | 选中集变化（点击选择、deactivateAll、删除对象等） |
| `change:viewport` | `{ viewport }` | zoom/pan 变化（setZoom、拖拽平移、refit 等） |
| `loadImage` | `{ name, width, height }` | `loadImageFromURL` / `loadImageFromFile` 成功 |
| `clearImage` | `{}` | 背景从有到无（含 undo 加载/换图） |
| `historyChange` | `{ undoSize, redoSize }` | undo/redo 栈尺寸变化 |
| `objectAdded` | `{ object }` | `addImageObject` / `addShape` / `addText` 成功 |
| `objectRemoved` | `{ id }` | `removeActiveObject` 删除每个对象时 |

## 与旧 fabric-photo 的有意行为差异

- **`endAll()`（以及上层绑定到它的 Esc 快捷键）在裁剪中 = 取消裁剪**：仅退出裁剪模式，
  不应用裁剪框。旧 fabric-photo 的 `endAll` 链式调用 `endCropping()` 且其 `isApplying`
  默认 `true`，副作用是直接应用裁剪。新内核如需应用裁剪请显式调用 `endCropping(true)`。
- `setAngle` 无背景或角度未变时从旧的 reject 语义改为静默 no-op。
- 旋转不再单设 `rotateImage` 事件，语义由 `change` + `change:viewport` 覆盖。

## 许可

MIT
