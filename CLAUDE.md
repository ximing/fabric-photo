# 项目指令

## 项目概览

- 仓库类型：单包 TypeScript 库（非 monorepo），npm 包名 `fabric-photo`
- 定位：基于 Canvas（fabric.js 1.7.3）的纯前端图片编辑器，无后端依赖
- 关键子系统：
  - `src/` — 库源码（TypeScript，strict 模式），入口 `src/index.ts` 导出 `FabricPhoto` 与 `consts`
  - `demo/` — Vite 演示页（React 16），本地 `pnpm dev` 与 GitHub Pages 同源，构建输出 `dist-demo/`
  - `scripts/ralph/` — 自主编码 agent 工作流，自带 `CLAUDE.md`
  - `dist/` — 构建产物（tsup，cjs + esm + d.ts），不要手改；仅供浏览器/bundler 使用，不支持 Node 直接 require（fabric 1.7.3 加载期触碰 DOM）
  - `dist-demo/` — demo 站点构建产物（GitHub Pages 部署源），不要手改

## 全局规则

- 包管理器统一使用 pnpm
- `src/` 使用 TypeScript strict 模式；改动后必须通过 `pnpm typecheck`
- fabric.js 版本锁定在 1.7.3，其 API 与新版差异很大，不要按 fabric 5/6 的写法改代码；类型声明见 `src/types/fabric.d.ts`
- 核心架构是「模块 + 命令」模式：功能模块继承 `src/modules/base.ts` 的 `ModuleBase`，可撤销操作封装为 `src/commands/` 下的命令（execute/undo 成对）
- 新增模块或命令需要多处注册（`src/consts.ts` 名称表 + `src/module.ts`/`src/command.ts` 工厂），详见对应目录的局部规则
- 对外 API 只通过 `src/index.ts` 的 `FabricPhoto` 类暴露；新增公开方法需同步更新 `readme.md` 的 API 文档

## 开发入口

- 安装依赖：`pnpm install`
- 本地开发（Vite dev server + 演示页，端口 9876）：`pnpm dev`
- 构建库产物：`pnpm build`（tsup，输出到 `dist/`，cjs + esm + d.ts）
- 构建 demo 站点：`pnpm build:demo`（Vite，输出到 `dist-demo/`）
- 类型检查：`pnpm typecheck`

## 局部规则导航

- `src/CLAUDE.md` — 库源码整体架构（模块/命令/事件/状态机如何协作）
- `src/modules/CLAUDE.md` — 功能模块的编写与注册约定
- `src/commands/CLAUDE.md` — 命令（撤销/重做）的编写与注册约定
- `scripts/ralph/CLAUDE.md` — Ralph 自主 agent 工作流（已有，独立维护）
- `dist/**` 为构建产物的约束见 `.claude/rules/generated-dist.md`（CatPaw 对应 `.catpaw/rules/generated-dist.md`）
