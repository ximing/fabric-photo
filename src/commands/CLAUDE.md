# commands 目录说明

## 这个目录负责什么

可撤销操作（命令模式）：`load-image`、`add-object`、`remove`、`clear`、`rotation-image`、`zoom`。每个命令是一个 `BaseCommand` 实例，支撑全局 undo/redo。

## 放置约束

- 命令必须提供 `execute` / `undo` 两个函数（见 `base.ts` 的 `CommandActions`），二者以 `moduleMap` 为参数、`Promise` 或同步返回
- `undo` 必须能把 `execute` 造成的 canvas/图片变化完整还原；做不到完整还原的操作不要做成命令
- 只有「可撤销的原子操作」放这里；交互模式（涂鸦、裁剪过程）属于 `src/modules/`，不要混进来
- 命令完成后需要通知外部时，用 `setExecuteCallback` / `setUndoCallback` 挂回调，由 `src/index.ts` 主类统一 fire 事件，命令自身不 fire

## 新增命令的注册步骤

1. 在 `src/consts.ts` 的 `CommandNames` 数组中加入命令名
2. 在本目录新建命令文件，返回 `new BaseCommand({ execute, undo })`
3. 在 `src/command.ts` 的 `creators` 表中登记：`creators[commandNames.XXX] = xxx`
4. 在 `src/index.ts` 中通过 `commandFactory.create(commands.XXX, ...args)` 创建并调用 `this.execute(command)`

## 开发偏好

- `execute`/`undo` 内通过 `moduleMap[consts.moduleNames.MAIN]` 拿到 root 模块操作 canvas，与现有命令保持一致
- 执行命令前主类会先 `endAll()` 退出所有编辑模式，命令内无需再处理模式清理
