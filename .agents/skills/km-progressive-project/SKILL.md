---
name: km-progressive-project
description: 把现有项目重构为适合 Codex 或 CatPaw IDE 的持久化指令渐进式加载架构。用户提到“拆分根 AGENTS.md”、“按目录下沉规则”、“给当前项目设计分层指令文件”、“创建不同目录的 AGENTS.md”、“补 `.Codex/rules` / `.catpaw/rules`”、“把仓库改造成渐进式加载”时使用。技能默认不仅解释加载机制，还会基于仓库结构直接设计并落地最合适的指令文件布局。
---

# 渐进式项目指令架构

## 目的

本技能不是单纯解释 Codex 如何加载指令。

本技能的默认目标是：

1. 识别当前仓库的结构与目录职责
2. 判断哪些规则应该放在根级、目录级、路径级
3. 将项目重构为最合适的渐进式加载架构
4. 创建或改写合适的 `AGENTS.md`、嵌套 `AGENTS.md`、`.Codex/rules/*.md`、`.catpaw/rules/*.md`，确保两套规则体系各自字段正确且语义一致

如果仓库可访问，默认直接分析并改文件，而不是只停留在解释层。

## 适用场景

以下请求应直接使用本技能：

- “帮我把当前项目改成渐进式加载”
- “这个仓库怎么拆 AGENTS.md 才合理”
- “根据目录职责生成不同的 AGENTS.md”
- “帮我补 `.Codex/rules` / `.catpaw/rules`”
- “根规则太大了，帮我下沉到子目录”
- “想让 Codex 进入不同目录时加载不同约束”
- "请根据 Codex 的持久化指令机制重构项目规则"
- "帮我补 `.catpaw/rules` 的 Auto Attached 规则"
- "让 CatPaw IDE 和 Codex 都能用上分层规则"

## 成功标准

完成后应满足：

- 根 `AGENTS.md` 足够精简，只保留全局基线
- 子目录规则只在进入对应区域时加载
- 跨目录但可按文件模式命中的规则放到 `.Codex/rules/*.md` 并带 `paths`，同步到 `.catpaw/rules/*.md` 并带兼容 CatPaw 的 frontmatter
- 不为每个目录机械生成规则，只覆盖真正有语义边界的区域
- 现有规则体系没有被打散成多个互相冲突的真相源
- `.Codex/rules/*.md` 与 `.catpaw/rules/*.md` 必须保持完全相同的正文内容，只允许 frontmatter 格式不同
- CatPaw 的 `globs` 与 `paths` 使用同一组标准 glob 路径表达式，不能只写文件扩展名列表；两者应保持一致以避免作用域漂移  

## 加载模型速记

设计前先基于以下事实判断，不要偏离：

### Codex 加载机制

#### 启动时加载

Codex 会从当前工作目录向上加载可见的：

- `AGENTS.md`
- `Codex.local.md`
- `.Codex/AGENTS.md`
- `.Codex/rules/` 中未被更窄作用域限制的内容

#### 按需加载

以下内容只有在 Codex 真正进入相关区域时才加载：

- 子目录中的 `AGENTS.md`
- 带 `paths` 的 `.Codex/rules/*.md`
- 更深层目录中的局部规则

#### 导入不是懒加载

如果根 `AGENTS.md` 通过 `@...` 导入大段内容，被导入内容会跟着根文件一起进入上下文。

因此：

- `@...` 用于复用与维护
- 不要把它当成主要的渐进式加载机制

### CatPaw IDE 加载机制

CatPaw IDE 通过 `.catpaw/rules/*.md` 文件加载规则，使用 YAML frontmatter 控制加载行为。

#### frontmatter 字段说明

| 字段          | 必填     | 说明                                                                                               |
| ------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `ruleType`    | ✅       | 规则类型，决定何时加载。可选值：`Always`、`Auto Attached`、`Manual`、`Model Request`               |
| `description` | ❌       | 规则的简要描述，便于理解规则用途                                                                   |
| `globs`       | 条件必填 | 仅 `ruleType: Auto Attached` 时必填。指定匹配的文件路径模式（如 `src/**/*.service.ts,src/**/index.tsx`），必须符合标准 glob 语法 |
| `paths`       | ❌       | 限制规则生效的目录范围；为避免歧义，推荐与 `globs` 保持完全一致 |

#### ruleType 与加载时机

| ruleType        | 加载时机                                         | 使用场景                                           |
| --------------- | ------------------------------------------------ | -------------------------------------------------- |
| `Always`        | 每次对话始终加载                                 | 全局基线规则，如项目结构、技术栈、常用命令         |
| `Auto Attached` | 编辑/查看匹配 `globs` + `paths` 的文件时按需加载 | 横切关注点，如测试规则、组件规范、API handler 约束 |
| `Manual`        | 用户手动选择加载                                 | 参考性规则，不常用但偶尔需要                       |
| `Model Request` | 模型主动请求加载                                 | 模型按需查询的深度参考                             |

#### CatPaw 与 Codex 字段映射

| Codex (`.Codex/rules/*.md`) | CatPaw IDE (`.catpaw/rules/*.md`)             | 说明                                                      |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `paths` (frontmatter)              | `globs` + `paths` (frontmatter)               | CatPaw 推荐让 `globs` 与 `paths` 使用同一组路径 glob，确保匹配范围一致 |
| 无 frontmatter = 始终加载          | `ruleType: Always`                            | 全局规则 |
| 带 `paths` = 按需加载              | `ruleType: Auto Attached` + `globs` + `paths` | 横切规则 |
| —                                  | `ruleType: Manual` / `Model Request`          | CatPaw 独有，Codex 无对应 |

**注意**：CatPaw 的 `globs` 与 `paths` 都应使用标准 glob 路径表达式。对于同一条 Auto Attached 规则，推荐两者保持一致，例如：`globs: src/**/*.service.ts,src/**/index.tsx`，并在 `paths` 中列出同样的条目。

## 设计原则

### 1. 根文件只放基线

根 `AGENTS.md` 只放：

- 仓库级目标与架构概览
- 必须全局生效的工程约束
- 常用构建、测试、提交流程入口
- 指引性说明：更细规则分布在哪些区域

不要把包级、页面级、框架级细节堆在根文件。

### 2. 目录规则只为“稳定语义边界”服务

只有同时满足以下至少两项，才值得单独建局部 `AGENTS.md`：

- 目录职责稳定
- 会被多人长期触达
- 对文件放置和实现方式有持续约束
- 与父目录相比有明确增量规则

### 3. 路径规则解决横切关注点

如果规则跨多个目录，但能用文件模式描述，就同时创建 `.Codex/rules/*.md` 和 `.catpaw/rules/*.md`：

- `**/*.test.ts`
- `src/**/*.tsx`
- `packages/*/src/**/*.ts`
- `docs/**/*.md`

Codex 的规则文件必须带 `paths`；CatPaw 的规则文件必须设置 `ruleType: Auto Attached` 并填写 `globs` 和 `paths`，且推荐两者使用完全一致的 glob 集合，否则很容易出现作用域漂移或广泛加载。

### 4. 不要制造两个真相源

优先沿用仓库现有约定：

- 如果仓库已经用 `AGENTS.md` + `.Codex/rules/*.md`，继续在这套体系内演进
- 如果仓库已经用 `.catpaw/rules/readme.md` 作为目录级真相源，并以 sibling `AGENTS.md` 作为镜像，则继续沿用，不要额外再发明一套目录级来源
- `.Codex/rules/*.md` 和 `.catpaw/rules/*.md` 应保持同名文件的正文内容完全一致，只允许 frontmatter 不同（Codex 用 `paths`，CatPaw 用兼容的 `ruleType` + `globs` + `paths`）
- 如果规则目录下已经存在以 `km-`、`km-web-`、`km-rn-` 为前缀的规则文件，将其视为既有通用知识资产：默认不改写、不迁移、不合并、不删除，项目规则设计只需重点挖掘仓库本身的约束与结构

### 5. 子级规则只能补充，不应推翻父级基线

局部规则的职责是缩小作用域、补充细节、明确放置边界，而不是否定根规则。

## 决策表

| 目标                                          | Codex 位置               | CatPaw IDE 位置                                                       |
| --------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| 所有人始终都要看到                            | 根 `AGENTS.md`                 | `.catpaw/rules/*.md`（`ruleType: Always`）                            |
| 只有某个子树需要看到                          | 该子树下的 `AGENTS.md`         | 子树下的 `.catpaw/rules/*.md`（`ruleType: Always`）                   |
| 横跨多个目录但可由 glob 命中                  | `.Codex/rules/*.md` + `paths` | `.catpaw/rules/*.md`（`ruleType: Auto Attached` + `globs` + `paths`） |
| 当前用户个人、仅当前仓库适用                  | `Codex.local.md`              | —                                                                     |
| 目录级规则已有 `.catpaw/rules/readme.md` 体系 | 维护 sibling `AGENTS.md`       | 维护 `readme.md`                                                      |
| 一次性工作流、不是持久化规则                  | skill，不放进 `AGENTS.md`      | skill，不放进 `.catpaw/rules/`                                        |

## 目录识别启发式

分析仓库时，优先按“语义边界”而不是目录层级深度分类。

### 仓库根

通常适合保留：

- 项目概览
- workspace / monorepo 结构说明
- 根命令
- 全局代码质量约束
- 指向下层规则的导航

### `apps/`、`packages/`、`services/`、`modules/`

如果每个子目录是独立产品、包或子系统：

- 给每个稳定子系统一个局部 `AGENTS.md`
- 内容写该区域独有的约束，不重复根规则

### `src/pages`、`features`、`domains`

如果目录承载页面、业务域或功能分片：

- 页面根目录适合写放置策略与分形组织原则
- 具体页面目录只有在差异足够大时才继续下沉

### `components`、`types`、`utils`、`hooks`

这类共享目录适合写“共享边界”：

- 什么内容才算全局共享
- 页面私有内容应该下沉到哪里
- 不要混入与目录职责无关的业务规则

### `tests`、`__tests__`、`specs`

优先用 `.Codex/rules/testing.md` 这类路径规则，而不是给每个测试目录都写 `AGENTS.md`。

### `docs`、`scripts`、`configs`

只有当这些目录有稳定编辑规范时才建规则；否则保持依赖根说明即可。

### 示例、产物、镜像目录

以下目录通常不值得建局部规则：

- `dist`
- `coverage`
- `build`
- 自动生成目录
- 第三方镜像目录
- 临时实验目录

## 标准执行流程

### Step 1：盘点现状

至少检查：

- 现有 `AGENTS.md`、`Codex.local.md`、`.Codex/rules/*.md`
- 现有 `.catpaw/rules/*.md`（检查 frontmatter 字段是否正确：`ruleType`、`globs`、`paths`）
- 是否存在 `.catpaw/rules/readme.md` 约定
- `.Codex/rules/` 和 `.catpaw/rules/` 中是否存在同名规则正文不一致的问题
- CatPaw 的 `globs` 与 `paths` 是否使用了同一组 glob 条目
- 规则目录中是否已有以 `km-`、`km-web-`、`km-rn-` 为前缀的文件；若存在，标记为既有通用资产，默认排除在本次项目规则重构范围之外
- 目录树中哪些区域是真正长期维护的代码区域
- 当前规则是否过于集中、重复、冲突、缺少作用域

输出一个目标清单：
`{ path, kind, current_state, recommended_action, reason }`

### Step 2：识别稳定边界

基于目录名、代表性文件、已有文档与代码组织判断：

- 哪些是仓库级共识
- 哪些是子系统级约束
- 哪些是横切关注点
- 哪些只是临时结构，不值得建规则

判断不清时，优先保守，不要过度拆分。

### Step 3：设计目标布局

默认优先产出如下三层：

1. 根 `AGENTS.md`
2. 少量高价值的嵌套 `AGENTS.md`
3. 少量带 `paths` 的 `.Codex/rules/*.md` + 对应的 `.catpaw/rules/*.md`

如果仓库已有 `.catpaw/rules/readme.md` 体系，则目录级规则继续以该文件为真相源，再保持 sibling `AGENTS.md` 与其正文一致。

所有横切规则文件应同时产出 `.Codex/rules/` 和 `.catpaw/rules/` 两个版本，且同名文件正文必须完全相同；差异只允许存在于 frontmatter。

### Step 4：重写根 `AGENTS.md`

根文件应做到：

- 能让首次进入仓库的 Codex 快速理解项目
- 不携带大段局部规范
- 明确指出哪些子系统有自己的规则
- 明确指出哪些横切规则通过 `.Codex/rules` 加载

### Step 5：下沉局部 `AGENTS.md`

只给高价值目录创建局部规则，例如：

- `apps/web/AGENTS.md`
- `packages/logger/AGENTS.md`
- `reactive-state/react/AGENTS.md`
- `src/pages/AGENTS.md`

局部文件应只回答三件事：

- 这个目录负责什么
- 什么该放这里，什么不该放这里
- 在这里改代码时优先遵循什么局部范式

### Step 6：抽横切规则到 `.Codex/rules` 和 `.catpaw/rules`

以下类型优先使用路径规则：

- 测试文件
- React / Vue / TSX 组件
- API handler
- docs / markdown
- 配置文件

每个横切规则需同时产出两个文件，且同名文件正文必须完全相同；差异只允许存在于 frontmatter。

#### Codex 最小模板（`.Codex/rules/*.md`）

```markdown
---
paths:
  - "src/**/*.tsx"
  - "packages/*/src/**/*.tsx"
---

# React 组件规则

- 导出组件时优先保持接口清晰。
- 共享组件不要耦合页面私有状态。
```

#### CatPaw IDE 最小模板（`.catpaw/rules/*.md`）

```markdown
---
ruleType: Auto Attached
globs: src/**/*.tsx,packages/*/src/**/*.tsx
paths:
  - "src/**/*.tsx"
  - "packages/*/src/**/*.tsx"
---

# React 组件规则

- 导出组件时优先保持接口清晰。
- 共享组件不要耦合页面私有状态。
```

**字段填写规则**：

- `ruleType`：横切规则一律使用 `Auto Attached`
- `globs`：直接复用同一条规则的路径 glob，用逗号分隔（如 `src/**/*.service.ts,src/**/index.tsx`）
- `paths`：与 `globs` 保持完全一致，按数组列出相同条目
- 全局规则使用 `ruleType: Always`，不需要 `globs` 和 `paths`

### Step 7：收敛重复与冲突

完成后必须处理：

- 根文件里残留的局部内容
- 子级原封不动重复父级的段落
- `.Codex/rules` 没有 `paths` 导致的过宽作用域
- `.catpaw/rules` 横切规则没有 `globs` 或 `paths` 导致的过宽作用域
- `.catpaw/rules` 的 `ruleType: Auto Attached` 缺少 `globs`（必填字段）
- `.Codex/rules/` 和 `.catpaw/rules/` 中同一规则的正文内容不一致
- 为了"看起来完整"而机械生成的大量空洞规则文件

### Step 8：验证加载行为

至少验证：

1. 根规则是否足够短且全局化
2. 局部规则是否只放在真正会进入的目录
3. Codex 的路径规则是否带 `paths`
4. CatPaw 的横切规则是否设置了 `ruleType: Auto Attached` 并填写了 `globs` 和 `paths`
5. CatPaw 的 `globs` 与 `paths` 是否使用完全一致的 glob 条目
6. `.Codex/rules/` 和 `.catpaw/rules/` 同名规则正文是否一致
7. 导入是否没有破坏懒加载目标
8. 如果可用，`/memory` 中的已加载文件是否符合预期

## 输出与落地要求

如果用户让你“改项目”，默认直接落地文件，并在汇报时给出：

1. 新的规则布局
2. 每个新增或更新文件的职责
3. 为什么这些目录值得有局部规则
4. 哪些目录故意不建规则，以及原因
5. 仍存在的不确定点或后续可继续拆分的区域

不要只给抽象建议；能改就改。

## 文件模板

### 根 `AGENTS.md` 模板

```markdown
# 项目指令

## 项目概览

- 仓库类型：...
- 关键子系统：...

## 全局规则

- ...

## 开发入口

- 构建：...
- 测试：...

## 局部规则导航

- `packages/logger/` 有自己的 `AGENTS.md`
- React 组件规则在 `.Codex/rules/react-components.md`
```

### 目录级 `AGENTS.md` 模板

```markdown
# 目录说明

## 这个目录负责什么

- ...

## 放置约束

- 放什么
- 不放什么

## 开发偏好

- ...
```

### 全局 `.catpaw/rules/*.md` 模板（`ruleType: Always`）

始终加载的规则，等同于根 `AGENTS.md` 的 CatPaw 版本：

```markdown
---
ruleType: Always
description: 项目全局基线规则
---

## 项目基本信息

- ...

## 全局规则

- ...
```

### 横切 `.catpaw/rules/*.md` 模板（`ruleType: Auto Attached`）

按需加载的横切规则，编辑匹配文件时自动附加：

```markdown
---
ruleType: Auto Attached
globs: **/__tests__/**,**/*.test.ts,**/*.spec.ts
paths:
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# 测试规则

- 测试覆盖率不低于 80%。
- 测试文件与源文件同目录放置。
```

### 目录级 `.catpaw/rules/readme.md` 模板

仅在仓库已经采用该体系时使用：

```markdown
---
ruleType: Always
description: 目录职责简述
---

## 目录说明

- ...

## 约束

- ...
```

如果该目录的规则仅针对特定文件类型，可改用 `Auto Attached`：

```markdown
---
ruleType: Auto Attached
globs: packages/core/src/**/*.ts,packages/core/src/**/*.tsx
paths:
  - "packages/core/src/**/*.ts"
  - "packages/core/src/**/*.tsx"
---

## 核心包开发约束

- ...
```

随后让 sibling `AGENTS.md` 保持与正文一致，只去掉 frontmatter。

## 推荐布局示例

对典型 monorepo，优先考虑这种布局：

```text
repo/
├── AGENTS.md
├── .Codex/
│   └── rules/
│       ├── testing.md          # paths: ["**/*.test.ts"]
│       ├── react-components.md # paths: ["src/**/*.tsx"]
│       └── markdown.md         # paths: ["docs/**/*.md"]
├── .catpaw/
│   └── rules/
│       ├── base.md             # ruleType: Always（全局基线）
│       ├── testing.md          # ruleType: Auto Attached, globs: **/__tests__/**,**/*.test.ts,**/*.spec.ts
│       ├── react-components.md # ruleType: Auto Attached, globs: src/**/*.tsx,packages/*/src/**/*.tsx
│       └── markdown.md         # ruleType: Auto Attached, globs: docs/**/*.md
├── apps/
│   ├── web/
│   │   └── AGENTS.md
│   └── admin/
│       └── AGENTS.md
├── packages/
│   ├── logger/
│   │   └── AGENTS.md
│   └── core/
│       └── AGENTS.md
└── shared/
    ├── components/
    │   └── AGENTS.md
    └── types/
        └── AGENTS.md
```

**说明**：

- `.Codex/rules/` 和 `.catpaw/rules/` 中的同名规则文件（如 `testing.md`）正文必须完全一致，仅 frontmatter 格式不同
- `.catpaw/rules/base.md` 是全局基线规则，对应根 `AGENTS.md` 的内容，使用 `ruleType: Always`
- 横切规则在 `.catpaw/rules/` 中使用 `ruleType: Auto Attached` + `globs` + `paths`，且 `globs` 与 `paths` 使用同一组 glob；在 `.Codex/rules/` 中仅使用 `paths`

## 常见错误

- 把整个仓库的细节都塞进根 `AGENTS.md`
- 给每个叶子目录都生成一个规则文件
- 用 `@...` 导入大段内容，误以为实现了懒加载
- Codex 规则文件没有 `paths`，导致启动时广泛加载
- CatPaw 横切规则设置了 `ruleType: Auto Attached` 但没有填写 `globs`（必填字段）
- CatPaw 的 `globs` 与 `paths` 写成了两套不同的匹配范围，导致规则作用域漂移
- `.Codex/rules/` 和 `.catpaw/rules/` 中同名规则的正文内容不一致，导致不同工具行为不同
- 把以 `km-`、`km-web-`、`km-rn-` 为前缀的既有规则文件当成项目自身规则去改写、迁移或清理
- 局部规则只是把父级规则再抄一遍
- 仓库已经有 `.catpaw/rules/readme.md` 体系，却又并行手写另一套目录真相源

## 默认行为

除非用户明确只想了解概念，否则默认按“分析仓库 -> 设计分层 -> 直接落地文件 -> 汇报原因”的方式执行。

## 示例触发语句

- “请把这个项目重构成适合 Codex 的渐进式规则架构。”
- “根据目录功能，帮我创建不同的 `AGENTS.md` 和规则文件。”
- “根规则太重了，帮我拆成根规则、目录规则和路径规则。”
- “按照 Codex 持久化指令的加载机制改造当前仓库。”
- “检查这个 monorepo 应该在哪些目录放局部 `AGENTS.md`。”
