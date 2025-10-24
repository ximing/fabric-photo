# src 目录说明

## 这个目录负责什么

`fabric-photo` 库的全部源码。对外只通过 `index.ts` 暴露 `FabricPhoto` 类和 `consts`。

## 架构协作方式

- `index.ts` — `FabricPhoto` 主类：持有 `_module`（模块协调器）与 `_canvas`（fabric.Canvas），所有对外 API（`startCropping`、`rotate`、`addText` 等）都是「切状态 + 调模块/命令 + fire 事件」的组合
- `module.ts` — 模块协调器：实例化并注册全部功能模块（`_createModules`），维护 undo/redo 栈（`pushUndoStack`/`undo`/`redo`），命令通过 `invoke` 执行
- `command.ts` — 命令工厂：`creators` 表把 `consts.commandNames` 映射到 `commands/` 下的命令创建函数
- `consts.ts` — 全局注册表：`moduleNames`、`commandNames`、`states`（keyMirror）、`eventNames`、`keyCodes`、`fObjectOptions`、`rejectMessages`。新增模块/命令/状态/事件必须先在这里登记
- `modules/` — 功能模块（涂鸦、裁剪、马赛克、文本等），均继承 `modules/base.ts` 的 `ModuleBase`，通过 `getRoot()` 委托访问 root（Main 模块）上的 canvas/image 能力
- `commands/` — 可撤销命令，execute/undo 成对，见 `commands/CLAUDE.md`
- `lib/` — 无业务含义的通用工具：`custom-event.ts`（事件 mixin，混入 `FabricPhoto` 与模块协调器）、`util.ts`、`event.ts`、`shape-resize-helper.ts`、`canvas-to-blob.ts`
- `shape/` — 自定义 fabric 对象（arrow、cropzone、mosaic），供 modules 使用
- `types/fabric.d.ts` — fabric 1.7.3 的本地类型声明

## 放置约束

- 新功能优先判断归属：交互模式/功能 → `modules/`；可撤销的原子操作 → `commands/`；纯工具函数 → `lib/`；自定义 fabric 对象 → `shape/`
- 不要把 fabric 类型断言散落在业务代码里复写，优先补 `types/fabric.d.ts`
- 编辑器状态切换必须走 `consts.states`，事件名必须用 `consts.eventNames`，禁止字符串字面量硬编码

## 开发偏好

- 模式互斥：进入新模式前先 `endAll()` 收尾旧模式（参考 `index.ts` 中各 `startXxx` 方法）
- 事件通信用 `CustomEvents` 的 `fire/on/once/off`，模块与主类之间不直接互相引用实例
- 修改后跑 `pnpm typecheck`；库没有单元测试基础设施，行为验证靠 `pnpm dev` 演示页
