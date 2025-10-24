# modules 目录说明

## 这个目录负责什么

编辑器的功能模块，一个文件对应一种编辑能力：`main`（canvas/图片管理，root 模块）、`image-loader`、`cropper`、`rotation`、`draw`（涂鸦）、`line`、`arrow`、`shape`、`text`、`mosaic`、`pan`。

## 放置约束

- 所有模块必须继承 `base.ts` 的 `ModuleBase`，并设置 `name` 为 `consts.moduleNames` 中的对应值
- 交互型模块实现 `start(setting?)` / `end()` 生命周期，与 `consts.states` 中的状态一一对应；`start` 负责绑定 canvas 事件，`end` 负责解绑并复原
- 访问 canvas、图片、editor 一律通过 `getRoot()` 委托（`getCanvas()`、`getCanvasImage()`、`setImageProperties()` 等已封装在 `ModuleBase` 上），不要自己持有 root 或其他模块的引用
- 需要新增自定义 fabric 对象时放到 `src/shape/`，模块里只做使用

## 新增模块的注册步骤

1. 在 `src/consts.ts` 的 `ModuleNames` 数组中加入模块名；如有新模式，同步加入 `States`
2. 在本目录新建模块文件，继承 `ModuleBase`
3. 在 `src/module.ts` 的 `_createModules()` 中实例化并 `_register`（构造参数传 `main` 实例）
4. 在 `src/index.ts` 的 `FabricPhoto` 上添加对外 `startXxx`/`endXxx` 方法（先 `endAll()`，再切 `_state`，最后 `fire` 事件）
5. 事件名加入 `consts.eventNames`，并在 `readme.md` 事件表中补充

## 开发偏好

- `main.ts` 是 root 模块：canvas 创建、图片加载后的尺寸适配（`adjustCanvasDimension`）、缩放、导出（`toDataURL`/`toBlob`）都在这里，改图片生命周期相关逻辑先看它
- 模块间不直接通信；需要通知外部时通过事件（`getEditor()` 拿到主类后 `fire`，或由主类统一 fire）
- 注意 `arrow.2.ts`、`mosaic.1.ts`、`mosaic.2.ts` 是并存的多版本实现，改动前确认哪一份被 `src/module.ts` 实际注册
