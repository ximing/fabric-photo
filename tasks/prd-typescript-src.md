# PRD: 使用 TypeScript 重写 src 目录

## 简介

将 fabric-photo 项目现有的 JavaScript 源码（src 目录）完全重写为 TypeScript，以获得完整的类型安全、提升代码质量和可维护性。完全替换现有 .js 文件，不保留兼容性。

## 目标

- 为 src 目录下所有 JavaScript 文件添加完整的 TypeScript 类型支持
- 通过 strict 模式确保类型安全，减少运行时错误
- 改善代码结构和类型定义
- 为 fabric.js 依赖添加类型声明
- 通过编译时检查捕获潜在问题

## 用户故事

### US-001: 添加 TypeScript 配置文件
**Description:** 作为开发者，我需要配置 TypeScript 编译环境，以便项目能够正确编译。

**Acceptance Criteria:**
- [ ] 在项目根目录创建 tsconfig.json
- [ ] 配置 strict: true 开启严格模式
- [ ] 配置 target: "ES2015" 或更高版本
- [ ] 配置 module: "ESNext" 支持 ES 模块
- [ ] 配置 outDir 指向 dist 目录
- [ ] 配置 include 包含 src 目录
- [ ] TypeScript 编译无错误

### US-002: 安装 TypeScript 依赖
**Description:** 作为开发者，我需要安装 TypeScript 依赖，以便项目能够使用 TypeScript 编译。

**Acceptance Criteria:**
- [ ] 安装 typescript 作为 devDependencies
- [ ] 安装 @types/fabric 或创建自定义类型声明
- [ ] 配置 package.json 添加 tsc 编译脚本
- [ ] 类型检查通过

### US-003: 重写 commands 目录为 TypeScript
**Description:** 作为开发者，我需要将 commands 目录下的命令模块重写为 TypeScript。

**Acceptance Criteria:**
- [ ] 重写 src/command.js 为 command.ts
- [ ] 重写 src/commands/base.js 为 commands/base.ts
- [ ] 重写 src/commands/add-object.js 为 commands/add-object.ts
- [ ] 重写 src/commands/clear.js 为 commands/clear.ts
- [ ] 重写 src/commands/load-image.js 为 commands/load-image.ts
- [ ] 重写 src/commands/remove.js 为 commands/remove.ts
- [ ] 重写 src/commands/rotation-image.js 为 commands/rotation-image.ts
- [ ] 重写 src/commands/zoom.js 为 commands/zoom.ts
- [ ] 所有文件编译无错误
- [ ] 运行时功能正常

### US-004: 重写 lib 目录为 TypeScript
**Description:** 作为开发者，我需要将 lib 目录下的工具模块重写为 TypeScript。

**Acceptance Criteria:**
- [ ] 重写 src/lib/canvas-to-blob.js 为 lib/canvas-to-blob.ts
- [ ] 重写 src/lib/custom-event.js 为 lib/custom-event.ts
- [ ] 重写 src/lib/event.js 为 lib/event.ts
- [ ] 重写 src/lib/shape-resize-helper.js 为 lib/shape-resize-helper.ts
- [ ] 重写 src/lib/util.js 为 lib/util.ts
- [ ] 所有文件编译无错误
- [ ] 运行时功能正常

### US-005: 重写 modules 目录为 TypeScript
**Description:** 作为开发者，我需要将 modules 目录下的模块重写为 TypeScript。

**Acceptance Criteria:**
- [ ] 重写 src/module.js 为 module.ts
- [ ] 重写 src/modules/base.js 为 modules/base.ts
- [ ] 重写 src/modules/main.js 为 modules/main.ts
- [ ] 重写 src/modules/arrow.js 为 modules/arrow.ts
- [ ] 重写 src/modules/arrow.2.js 为 modules/arrow-2.ts
- [ ] 重写 src/modules/cropper.js 为 modules/cropper.ts
- [ ] 重写 src/modules/draw.js 为 modules/draw.ts
- [ ] 重写 src/modules/image-loader.js 为 modules/image-loader.ts
- [ ] 重写 src/modules/line.js 为 modules/line.ts
- [ ] 重写 src/modules/mosaic.js 为 modules/mosaic.ts
- [ ] 重写 src/modules/mosaic.1.js 为 modules/mosaic-1.ts
- [ ] 重写 src/modules/mosaic.2.js 为 modules/mosaic-2.ts
- [ ] 重写 src/modules/pan.js 为 modules/pan.ts
- [ ] 重写 src/modules/rotation.js 为 modules/rotation.ts
- [ ] 重写 src/modules/shape.js 为 modules/shape.ts
- [ ] 重写 src/modules/text.js 为 modules/text.ts
- [ ] 所有文件编译无错误
- [ ] 运行时功能正常

### US-006: 重写 shape 目录为 TypeScript
**Description:** 作为开发者，我需要将 shape 目录下的形状模块重写为 TypeScript。

**Acceptance Criteria:**
- [ ] 重写 src/shape/arrow.js 为 shape/arrow.ts
- [ ] 重写 src/shape/cropzone.js 为 shape/cropzone.ts
- [ ] 重写 src/shape/mosaic.js 为 shape/mosaic.ts
- [ ] 所有文件编译无错误
- [ ] 运行时功能正常

### US-007: 重写根目录核心文件为 TypeScript
**Description:** 作为开发者，我需要将根目录的核心文件重写为 TypeScript。

**Acceptance Criteria:**
- [ ] 重写 src/index.js 为 index.ts
- [ ] 重写 src/consts.js 为 consts.ts
- [ ] 所有文件编译无错误
- [ ] 导出 API 功能正常

### US-008: 删除原有的 JavaScript 文件
**Description:** 作为开发者，我需要删除所有被重写的 JavaScript 文件，完成完全替换。

**Acceptance Criteria:**
- [ ] 删除所有已重写的 .js 文件
- [ ] 更新构建配置（rollup.config.js）使用新的 .ts 文件
- [ ] 项目能够正常构建
- [ ] 运行时功能正常

## 功能需求

- FR-1: 创建 tsconfig.json 配置文件，包含 strict 模式
- FR-2: 安装 typescript 和 @types/fabric 依赖
- FR-3: 将 src/commands/ 目录下所有 .js 文件重写为 .ts
- FR-4: 将 src/lib/ 目录下所有 .js 文件重写为 .ts
- FR-5: 将 src/modules/ 目录下所有 .js 文件重写为 .ts
- FR-6: 将 src/shape/ 目录下所有 .js 文件重写为 .ts
- FR-7: 将 src/index.js 和 src/consts.js 重写为 .ts
- FR-8: 更新 package.json 添加 tsc 编译脚本
- FR-9: 更新构建配置以支持 TypeScript
- FR-10: 删除所有已重写的 .js 文件

## 非目标

- 不保留与 JavaScript 版本的兼容性
- 不同时维护 .js 和 .ts 两套代码
- 不修改 fabric.js 库本身
- 不添加新的功能模块

## 技术考虑

- 使用 @types/fabric 或创建自定义类型声明文件
- 保持现有的模块导出方式（CommonJS/ES Module）
- 使用 rollup-plugin-typescript2 或 @rollup/plugin-typescript 处理 TypeScript 编译
- 对于 fabric.js 的复杂类型，可以使用 any 作为过渡

## 成功指标

- 所有 TypeScript 文件编译无错误
- 构建产物正常生成
- 运行时功能与原来一致
- 严格模式下无类型警告

## 待澄清问题

- 构建配置是否需要同时输出 ESM 和 CJS 格式？
- 是否需要添加 Git hooks 在提交前运行类型检查？
