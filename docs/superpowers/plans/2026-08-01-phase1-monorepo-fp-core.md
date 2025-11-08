# Phase 1：Monorepo 骨架 + @gmi/fp-core 完整内核 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仓库改造为 pnpm workspace monorepo，并交付功能完整的 `@gmi/fp-core`（ProseMirror 式 state/step/transaction 内核 + fabric 6 渲染层 + 全部旧功能移植 + vitest 单测 + playground 冒烟页）。

**Architecture:** EditorState 不可变文档为唯一事实源；一切修改经 Transaction（Step 序列 + selection/mode/viewport 变更 + meta）dispatch；history 插件靠 step 反转与 before/after 快照实现 undo/redo；fabric 6 只是 state 的渲染投影（`FabricRenderer` + 每模式一个 controller，拖拽预览直改 fabric、结束提交 Step）。

**Tech Stack:** pnpm 10 workspace、TypeScript strict、fabric ^6、vitest 3、tsup 8、Vite 8（仅 playground）。

**Spec:** `docs/superpowers/specs/2026-08-01-monorepo-prosemirror-redesign-design.md`

## Global Constraints

- 包管理器统一 pnpm；Node 20
- TypeScript strict；每个任务结束 `pnpm --filter @gmi/fp-core typecheck` 必过；Phase 末 `pnpm -r typecheck` 必过
- **旧 CI 链路不可断**：root 的 `dev` / `build` / `build:demo` / `preview:demo` / `typecheck` scripts、root `vite.config.ts` / `tsup.config.ts`、旧 `src/`、旧 `demo/` 在 Phase 1 全程保持可用；Task 1 提交前必须验证 `pnpm typecheck && pnpm build && pnpm build:demo` 无回归
- fabric 锁定 6.x（`^6`），只作为 core 的渲染实现；core 公共 API（`src/index.ts` 导出）不得暴露 fabric 类型（Controller/Renderer 为内部实现，不导出）
- core 运行时依赖仅 `fabric`（dependencies）；vitest/vite/tsup/typescript 为 devDependencies
- 测试：vitest，node 环境（纯数据层），测试文件与源码同目录（`*.test.ts`），零配置（vitest 默认 glob）
- 浏览器验证统一使用 kimi-webbridge（playground，`pnpm --filter @gmi/fp-core dev`，端口 9877）；session 名 `fp-core-playground`
- 主 Agent 只做调度；实现由 SubAgent 完成

## fabric 6 API 速查（所有接触 fabric 的任务必读）

fabric 1.7.3 → 6.x 的关键变化。**写代码前必须先查 `node_modules/fabric/dist/index.d.ts` 核对签名**，以下为已知要点：

- 命名导入：`import { Canvas, FabricImage, FabricObject, IText, Rect, Ellipse, Triangle, Circle, Line, Path, Group, ActiveSelection, Point, PencilBrush, classRegistry, util } from 'fabric'`
- Promise 化：`FabricImage.fromURL(url, { crossOrigin: 'anonymous' })` 返回 `Promise<FabricImage>`；`util.loadImage(url, { crossOrigin: 'anonymous' })` 返回 `Promise<HTMLImageElement>`
- 背景：直接赋值 `canvas.backgroundImage = img`（赋值后 `canvas.requestRenderAll()`），不再用 1.x 的 `setBackgroundImage(url, cb)` 签名
- 多选：`canvas.getActiveObject()` 可能返回 `ActiveSelection`；`canvas.discardActiveObject()` 替代 `discardActiveGroup`；事件 `selection:created / selection:updated / selection:cleared`
- 自定义类：原生 `class Cropzone extends Rect { static type = 'cropzone'; ... }`，并 `classRegistry.setClass(Cropzone, 'cropzone')`；禁止 `fabric.util.createClass`（已删除）
- 事件指针：`mouse:down` 等回调参数 `opt.scenePoint`（文档坐标）、`opt.viewportPoint`（屏幕坐标）；不要沿用 1.x 的 `canvas.getPointer(e)` 语义假设
- 自由绘制：`new PencilBrush(canvas)`；`canvas.freeDrawingBrush = brush`；`canvas.isDrawingMode = true`；完成事件 `'path:created'`（`e.path`）
- IText：`new IText(text, options)`；`enterEditing() / exitEditing()`；事件 `editing:entered / editing:exited`；`isEditing` 属性
- 导出：`canvas.toDataURL({ format, quality, multiplier, left, top, width, height })` 对象参数签名
- 视口：`canvas.setViewportTransform([a,b,c,d,e,f])`；`canvas.zoomToPoint(point, zoom)`；`canvas.viewportTransform`
- 尺寸：`canvas.setDimensions({ width, height }, { cssOnly: true })` / `{ backstoreOnly: true }`

## 架构决策补充（spec 之外的落地决策，实现时以此为准）

1. **doc 坐标系 = 背景图片像素坐标系**（对象 left/top 都是图片像素单位）；viewport 变换（fit scale × zoom + pan）负责映射到屏幕
2. **canvas 铺满容器**（Figma 模式），灰底由容器 CSS 负责；`cssMaxWidth/cssMaxHeight` 语义保留为「fit 计算的上限」：fit scale = `min(cssMaxW/imgW, cssMaxH/imgH, 1)`
3. **BackgroundImage 带 `angle` 字段**；旋转后 width/height 存旋转后的外接框尺寸
4. **viewport（zoom/pan）不是 Step**：Transaction 可直接 `setViewport`；history entry 记录 viewportBefore/After——zoom 事务 `addToHistory: true`（可撤销，对齐现状），pan 事务 `addToHistory: false`（瞬时，对齐现状）
5. **SetBackground step 语义**：apply 时 objects 清空（对齐现状「加载新图/裁剪后对象清除」）；invert 恢复完整旧 doc（background + objects），两条裁剪路径统一为可撤销
6. **缩放范围** clamp 到 `[0.05, 8]`（Figma 式，替代现状 [fit, 2]）；缩放以指针为中心（`zoomToPoint`）
7. **pan 不做边界 clamp**（Figma 行为，替代现状的边界限制）
8. **插件形态**：`filterTransaction / appendTransaction / onTransaction / destroy`；history 与 keymap 是默认注册的两个插件；插件不接触 fabric（渲染层在插件之下）

## 文件结构（Phase 1 完成时）

```
pnpm-workspace.yaml                       # Task 1
tsconfig.base.json                        # Task 1
package.json                              # Task 1 改写（private workspace root，旧 scripts 保留）
packages/core/
├── package.json                          # Task 1
├── tsconfig.json                         # Task 1
├── tsup.config.ts                        # Task 1
├── playground/                           # Task 1 起步，Task 9 可用，Task 18 补全
│   ├── index.html
│   ├── main.ts
│   └── images/demo.jpeg
├── README.md                             # Task 19
└── src/
    ├── index.ts                          # Task 6（公共导出面）
    ├── editor.ts                         # Task 6（Editor 主类 + 高级 API）
    ├── events.ts                         # Task 6（事件类型 + emitter）
    ├── model/
    │   ├── id.ts                         # Task 2
    │   └── doc.ts                        # Task 2（+ doc.test.ts）
    ├── state/
    │   └── editor-state.ts               # Task 4（+ editor-state.test.ts）
    ├── steps/
    │   ├── step.ts                       # Task 3
    │   ├── object-steps.ts               # Task 3（+ object-steps.test.ts）
    │   └── doc-steps.ts                  # Task 3（+ doc-steps.test.ts，含 TransformDoc 旋转数学）
    ├── transform/
    │   └── transaction.ts                # Task 4（+ transaction.test.ts）
    ├── plugins/
    │   ├── plugin.ts                     # Task 5
    │   ├── history.ts                    # Task 5（+ history.test.ts）
    │   └── keymap.ts                     # Task 6
    └── render/                           # 内部实现，不从 index.ts 导出
        ├── renderer.ts                   # Task 7（Renderer 接口）
        ├── fabric-renderer.ts            # Task 7（canvas/背景/sync/尺寸/vpt）
        ├── object-factory.ts             # Task 7（EditorObject ↔ fabric 对象）
        ├── exporter.ts                   # Task 8
        ├── controllers/
        │   ├── controller.ts             # Task 10（Controller 接口 + ControllerContext）
        │   ├── select.ts                 # Task 10
        │   ├── pan.ts                    # Task 11
        │   ├── draw.ts                   # Task 12（freedraw）
        │   ├── line.ts                   # Task 12
        │   ├── arrow.ts                  # Task 12
        │   ├── shape.ts                  # Task 13
        │   ├── text.ts                   # Task 14
        │   ├── mosaic.ts                 # Task 15
        │   └── crop.ts                   # Task 16
        └── shapes/
            ├── cropzone.ts               # Task 16（蚂蚁线，extends Rect）
            └── mosaic-shape.ts           # Task 15（extends FabricObject）
```

---

### Task 1: Monorepo 骨架 + fp-core 空壳

**Files:**
- Create: `pnpm-workspace.yaml`、`tsconfig.base.json`
- Modify: `package.json`（全量替换）
- Create: `packages/core/package.json`、`packages/core/tsconfig.json`、`packages/core/tsup.config.ts`、`packages/core/src/index.ts`、`packages/core/playground/index.html`、`packages/core/playground/main.ts`、`packages/core/playground/images/demo.jpeg`

**Interfaces:**
- Produces: workspace 结构；`pnpm --filter @gmi/fp-core build|typecheck|test|dev` 四个 script；root 旧 scripts（`dev/build/build:demo/preview:demo/typecheck`）保持可用——后续所有任务依赖。

- [ ] **Step 1: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'demo'
```

（`demo/` 当前无 package.json，pnpm 会忽略该 glob 命中；Phase 3 给它补 package.json 后自动成为成员。）

- [ ] **Step 2: 全量替换 root `package.json`**

变更要点（在原文件基础上改，不要丢字段）：
- 加 `"private": true`
- 删除 `main` / `module` / `types` / `exports` / `files` / `publishConfig`（旧包退役，不再发布）
- scripts 保留不动：`i` / `dev` / `build` / `build:demo` / `preview:demo` / `typecheck` / `tsc`
- scripts 新增：`"test": "pnpm -r test"`、`"build:packages": "pnpm -r --filter @gmi/* build"`、`"typecheck:all": "pnpm -r typecheck"`
- `dependencies` / `devDependencies` / `onlyBuiltDependencies` / `packageManager` 全部不动（旧 src/demo 仍依赖 fabric 1.7.3 与 vite/tsup）

- [ ] **Step 3: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

（root `tsconfig.json` 是给旧 src 用的，**不要动**。）

- [ ] **Step 4: 创建 `packages/core/package.json`**

```json
{
  "name": "@gmi/fp-core",
  "version": "0.1.0",
  "description": "ProseMirror-style state/step/transaction driven canvas image editor core",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "vite playground --port 9877 --strictPort"
  },
  "dependencies": {
    "fabric": "^6"
  },
  "devDependencies": {}
}
```

- [ ] **Step 5: 创建 `packages/core/tsconfig.json` 与 `packages/core/tsup.config.ts`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "playground/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist'
});
```

（fabric 在 dependencies → tsup 默认 external，6.x 是正规 ESM 包，无需 1.x 的打桩。）

- [ ] **Step 6: 创建占位 `packages/core/src/index.ts` 与 playground 起步页**

```ts
export const VERSION = '0.1.0';
```

`playground/index.html`：最小 HTML，含 `<div id="editor" style="width:900px;height:600px;background:#e5e5e5;"></div>` 与 `<script type="module" src="./main.ts"></script>`；`playground/main.ts` 暂时只 `import { VERSION } from '../src/index'; console.log(VERSION);`；把 `demo/public/images/demo.jpeg` 复制为 `packages/core/playground/images/demo.jpeg`。

- [ ] **Step 7: 安装依赖**

```bash
pnpm install
pnpm --filter @gmi/fp-core add fabric@^6
pnpm --filter @gmi/fp-core add -D vitest vite
```

Expected: 安装成功；`node_modules/fabric/package.json` 的 version 为 6.x。

- [ ] **Step 8: 全链路验证（新旧并存）**

```bash
pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core build && pnpm --filter @gmi/fp-core test
pnpm typecheck && pnpm build && pnpm build:demo
```

Expected: 全部成功（core test 暂无测试文件，vitest 报 "No test files found" 退出码非 0 属预期——把 core 的 test script 改为 `vitest run --passWithNoTests` 后重跑须通过）。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "build: pnpm workspace 骨架 + @gmi/fp-core 包空壳（旧构建链路保留）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 文档模型 + id + 序列化

**Files:**
- Create: `packages/core/src/model/id.ts`
- Create: `packages/core/src/model/doc.ts`
- Test: `packages/core/src/model/doc.test.ts`

**Interfaces:**
- Produces（后续全部任务依赖这些类型，签名逐字固定）:

```ts
// id.ts
export function createId(): string;

// doc.ts
export interface BaseObject {
    id: string;
    left: number;            // 背景图片像素坐标系
    top: number;
    angle: number;           // 度
    scaleX: number;
    scaleY: number;
}
export interface ShapeObject extends BaseObject {
    kind: 'shape';
    shapeType: 'rect' | 'circle' | 'triangle';
    width: number;
    height: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
}
export interface TextObject extends BaseObject {
    kind: 'text';
    text: string;
    fontSize: number;
    fontFamily: string;
    fill: string;
    fontWeight: string;
    fontStyle: string;         // '' | 'italic'
    textDecoration: string;    // '' | 'underline' | 'line-through'
    textAlign: string;
}
export interface PathObject extends BaseObject {
    kind: 'path';
    tool: 'freedraw' | 'line' | 'arrow';
    path: string;              // SVG path data
    stroke: string;
    strokeWidth: number;
    fill: string;
}
export interface MosaicRect { x: number; y: number; size: number; color: string }
export interface MosaicObject extends BaseObject {
    kind: 'mosaic';
    width: number;
    height: number;
    rects: MosaicRect[];
}
export interface ImageObject extends BaseObject {
    kind: 'image';
    src: string;               // dataURL 或跨域 URL
    width: number;
    height: number;
}
export type EditorObject = ShapeObject | TextObject | PathObject | MosaicObject | ImageObject;
export interface BackgroundImage {
    src: string;               // dataURL 或跨域 URL
    width: number;             // 当前外接框像素（旋转后可能互换/扩大）
    height: number;
    name: string;
    angle: number;             // 度，0 为原始方向
}
export interface Doc {
    background: BackgroundImage | null;
    objects: EditorObject[];   // 数组序即 z 序
}
export function createDoc(background?: BackgroundImage | null): Doc;
export function docToJSON(doc: Doc): string;
export function docFromJSON(json: string): Doc;   // 形状校验，非法抛 Error
export function cloneDoc(doc: Doc): Doc;          // structuredClone
```

- [ ] **Step 1: 写测试 `doc.test.ts`**

覆盖：`createDoc()` 默认 `{background: null, objects: []}`；`docToJSON`/`docFromJSON` 往返相等（构造含 4 种 kind 各一 + background 的 doc）；`docFromJSON('{}')` 抛错（缺 objects 数组）；`docFromJSON` 对 objects 中缺 `id`/`kind` 的项抛错；`cloneDoc` 深拷贝（改副本不影响原 doc）；`createId()` 两次调用不相等。

测试用工厂函数构造对象，例如：

```ts
import { describe, expect, it } from 'vitest';
import { cloneDoc, createDoc, docFromJSON, docToJSON } from './doc';
import { createId } from './id';

function makeText(id: string): TextObject {
    return {
        kind: 'text', id, left: 10, top: 20, angle: 0, scaleX: 1, scaleY: 1,
        text: 'hello', fontSize: 50, fontFamily: 'sans-serif', fill: '#000',
        fontWeight: 'normal', fontStyle: '', textDecoration: '', textAlign: 'left'
    };
}
// ...describe/it 断言上述每条
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gmi/fp-core test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `id.ts` 与 `doc.ts`**

`createId`：自增计数 + 随机后缀（`fp_<counter36>_<random6>`）。`docFromJSON`：`JSON.parse` 后校验 `background`（null 或含 src/width/height/name/angle 字段）与 `objects`（数组，每项有字符串 `id` 与合法 `kind`），不满足抛 `Error('invalid doc JSON')`。

- [ ] **Step 4: 测试通过 + typecheck**

Run: `pnpm --filter @gmi/fp-core test && pnpm --filter @gmi/fp-core typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 文档模型 Doc/EditorObject + 序列化

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Step 体系（对象/背景/恢复 + 旋转数学）

**Files:**
- Create: `packages/core/src/steps/step.ts`
- Create: `packages/core/src/steps/object-steps.ts`
- Create: `packages/core/src/steps/doc-steps.ts`
- Test: `packages/core/src/steps/object-steps.test.ts`、`packages/core/src/steps/doc-steps.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Doc` / `EditorObject` / `BackgroundImage` / `createDoc`。
- Produces（Task 4/5 与渲染层 controller 依赖）:

```ts
// step.ts
export interface StepResult { doc?: Doc; failed?: string }
export abstract class Step {
    abstract apply(doc: Doc): StepResult;
    abstract invert(): Step;   // 在 apply 之后调用；apply 时捕获逆操作所需数据
}

// object-steps.ts
export type ObjectAttrs = Record<string, unknown>;  // 运行期过滤 'id'/'kind'
export class AddObject extends Step { constructor(readonly object: EditorObject) }
export class RemoveObject extends Step { constructor(readonly id: string) }
export class RestoreObject extends Step { constructor(readonly object: EditorObject, readonly index: number) }
export class UpdateObject extends Step { constructor(readonly id: string, readonly attrs: ObjectAttrs) }
export class ClearObjects extends Step { constructor() }

// doc-steps.ts
export class SetBackground extends Step { constructor(readonly background: BackgroundImage | null) }
export class RestoreDoc extends Step { constructor(readonly doc: Doc) }
export class TransformDoc extends Step { constructor(readonly targetAngle: number) }   // 绝对角度，%360
export function rotatePointAround(p: { x: number; y: number }, center: { x: number; y: number }, radians: number): { x: number; y: number };
```

语义（全部可在旧代码找到原型，见各 Step 的移植注记）：
- `AddObject.apply`：id 已存在 → `{failed}`；否则追加到 objects 末尾（z 序顶）。invert → `RemoveObject(id)`
- `RemoveObject.apply`：找不到 → failed；捕获被删对象与原下标。invert → `RestoreObject(obj, index)`
- `UpdateObject.apply`：找不到 → failed；先捕获 attrs 涉及 key 的旧值（`before`），再合并（过滤 `id`/`kind`）。invert → `UpdateObject(id, before)`
- `ClearObjects.apply`：捕获 `{object, index}[]`，清空。invert → 依序 `RestoreObject` 的组合（用 `RestoreDoc` 简化也可以，但必须恢复原 z 序）
- `SetBackground.apply`：捕获完整旧 doc；返回 `{ background: this.background, objects: [] }`（对齐现状：换图/裁剪清空对象）。invert → `RestoreDoc(旧doc)`
- `TransformDoc.apply`：无 background → failed；`delta = ((target - prev) % 360 + 360) % 360`；delta===0 → failed；捕获 prevAngle 与 prevObjects；新 background：`angle = ((target % 360) + 360) % 360`，width/height 换为旋转后外接框尺寸；objects 逐一映射（见下）。invert → `RestoreDoc`
- `rotatePointAround`：`x' = cx + (x-cx)cosθ - (y-cy)sinθ`，`y' = cy + (x-cx)sinθ + (y-cy)cosθ`

**TransformDoc 对象映射算法**（移植自旧 `src/modules/rotation.ts` 的 `_rotateForEachObject`，写代码前先读它）：

```
rad = delta * PI / 180
oldCenter = { x: oldBg.width / 2, y: oldBg.height / 2 }
newW = |oldW·cos rad| + |oldH·sin rad|      // 旋转后外接框
newH = |oldW·sin rad| + |oldH·cos rad|
newCenter = { x: newW / 2, y: newH / 2 }
对每个对象：
  p' = rotatePointAround({ x: obj.left, y: obj.top }, oldCenter, rad)
  obj.left = p'.x + (newCenter.x - oldCenter.x)
  obj.top  = p'.y + (newCenter.y - oldCenter.y)
  obj.angle = (obj.angle + delta) % 360
```

- [ ] **Step 1: 写测试**

`object-steps.test.ts` 覆盖：AddObject 成功/重复 id 失败/往返 invert；RemoveObject 成功/不存在失败/invert 后恢复原下标（objects 长度为 3 删中间再 invert，顺序不变）；UpdateObject 合并与 invert（只还原被改 key）；ClearObjects invert 恢复原 z 序。

`doc-steps.test.ts` 覆盖：SetBackground 清空 objects 且 invert 完整还原（background+objects）；TransformDoc 无背景失败、同角失败、90° 旋转后 background.width/height 互换、位于 (100, 100) 的对象在 100x200 图旋转 90° 后的坐标符合上述公式、invert 完整还原。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gmi/fp-core test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现三个文件**

- [ ] **Step 4: 测试通过 + typecheck**

Run: `pnpm --filter @gmi/fp-core test && pnpm --filter @gmi/fp-core typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): Step 体系（对象/背景/TransformDoc 旋转）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Transaction + EditorState

**Files:**
- Create: `packages/core/src/transform/transaction.ts`
- Create: `packages/core/src/state/editor-state.ts`
- Test: `packages/core/src/transform/transaction.test.ts`、`packages/core/src/state/editor-state.test.ts`

**Interfaces:**
- Consumes: Task 2 `Doc`/`createDoc`；Task 3 `Step`。
- Produces（Task 5/6 与全部后续任务依赖，签名逐字固定）:

```ts
// editor-state.ts
export type EditorMode = 'normal' | 'crop' | 'freedraw' | 'line' | 'arrow' | 'mosaic' | 'text' | 'shape' | 'pan';
export interface Viewport { zoom: number; panX: number; panY: number }
export interface EditorStateConfig {
    doc?: Doc;
    selection?: readonly string[];
    mode?: EditorMode;
    viewport?: Viewport;
}
export class EditorState {
    readonly doc: Doc;
    readonly selection: readonly string[];     // 对象 id，数组序即选中序
    readonly mode: EditorMode;
    readonly viewport: Viewport;               // 默认 { zoom: 1, panX: 0, panY: 0 }
    constructor(config?: EditorStateConfig);
    apply(tr: Transaction): EditorState;       // step 失败抛 StepError
    get backgroundImage(): BackgroundImage | null;   // doc.background 便捷访问
    getObject(id: string): EditorObject | undefined;
}
export class StepError extends Error {}

// transaction.ts
export class Transaction {
    readonly steps: Step[];
    constructor(readonly state: EditorState);
    addStep(step: Step): this;
    setSelection(ids: readonly string[]): this;
    setMode(mode: EditorMode): this;
    setViewport(partial: Partial<Viewport>): this;
    setMeta(key: string, value: unknown): this;
    getMeta(key: string): unknown;
    get docChanged(): boolean;                 // steps.length > 0
    get selectionSet(): boolean;
    get modeSet(): boolean;
    get viewportSet(): boolean;
    get selectionValue(): readonly string[] | undefined;
    get modeValue(): EditorMode | undefined;
    get viewportValue(): Partial<Viewport> | undefined;
    get addToHistory(): boolean;               // getMeta('addToHistory') !== false && (docChanged || viewportSet)
}
```

- `EditorState.apply`：依次 `step.apply(doc)`，`failed` 时抛 `StepError(failed)`；然后按 transaction 的 set 标记合成新 state（selection/mode 整体替换，viewport 浅合并）
- `Transaction.addToHistory`：`meta addToHistory !== false && (steps.length > 0 || viewportSet)`——pan 事务会 `setMeta('addToHistory', false)`，zoom 事务默认 true

- [ ] **Step 1: 写测试**

`transaction.test.ts`：addStep 链式返回 this；setSelection/setMode/setViewport 后对应 `xxxSet` 为 true 且 getter 返回原值；`addToHistory` 三种情况（纯 pan+meta false → false；纯 viewportSet 无 meta → true；空 transaction → false）。

`editor-state.test.ts`：默认 state（`createDoc()`、selection `[]`、mode `'normal'`、viewport `{zoom:1,panX:0,panY:0}`）；apply 一个 AddObject 事务后 doc 变更且原 state 不变（不可变）；apply 带失败 step 的事务抛 `StepError`；apply 合并 viewport（`setViewport({zoom:2})` 后 panX 保持）；`getObject(id)` 命中/未命中。

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-core test && pnpm --filter @gmi/fp-core typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): Transaction 与 EditorState

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 插件接口 + History 插件

**Files:**
- Create: `packages/core/src/plugins/plugin.ts`
- Create: `packages/core/src/plugins/history.ts`
- Test: `packages/core/src/plugins/history.test.ts`

**Interfaces:**
- Consumes: Task 3 `Step`；Task 4 `Transaction`/`EditorState`/`Viewport`。
- Produces（Task 6 Editor 依赖）:

```ts
// plugin.ts
export interface Plugin {
    readonly name: string;
    filterTransaction?(tr: Transaction, state: EditorState): boolean;
    appendTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): Transaction | null;
    onTransaction?(tr: Transaction, oldState: EditorState, newState: EditorState): void;
    destroy?(): void;
}

// history.ts
export interface HistorySizes { undoSize: number; redoSize: number }
export interface HistoryEntry {
    inverse: Step[];                 // tr.steps 逆序的 invert()
    redo: Step[];                    // 原 step 实例
    selectionBefore: readonly string[];
    selectionAfter: readonly string[];
    viewportBefore: Viewport;
    viewportAfter: Viewport;
}
export class History implements Plugin {
    readonly name = 'history';
    constructor(onSizesChange: (sizes: HistorySizes) => void);
    onTransaction(tr: Transaction, oldState: EditorState, newState: EditorState): void;  // 收账入 undoStack，清 redoStack
    popUndo(): HistoryEntry | null;
    pushUndo(entry: HistoryEntry): void;
    popRedo(): HistoryEntry | null;
    pushRedo(entry: HistoryEntry): void;
    makeTransaction(state: EditorState, entry: HistoryEntry, direction: 'undo' | 'redo'): Transaction;
    clear(): void;                   // 清两栈（clearUndoStack/clearRedoStack 用）
    clearUndo(): void;
    clearRedo(): void;
    get undoSize(): number;
    get redoSize(): number;
}
```

收账规则：
- `tr.addToHistory === false` → 跳过（不清 redoStack——对齐现状：pan 不影响 redo）
- 否则构造 entry：`inverse = [...tr.steps].reverse().map(s => s.invert())`（step 实例在 apply 时已捕获逆数据）；`redo = tr.steps`；selection/viewport 的 before/after 取自 oldState/newState
- undo 事务：`new Transaction(state)` + 逐个 `addStep(inverse[i])` + `setSelection(entry.selectionBefore)` + `setViewport(entry.viewportBefore)` + `setMeta('addToHistory', false)` + `setMeta('history', 'undo')`；redo 对称（用 `entry.redo` + after 值 + `setMeta('history', 'redo')`）
- 栈迁移 API（签名固定，Editor 驱动）：History 暴露 `popUndo(): HistoryEntry | null`、`pushUndo(entry: HistoryEntry): void`、`popRedo(): HistoryEntry | null`、`pushRedo(entry: HistoryEntry): void`。Editor.undo()：`entry = history.popUndo()` → 用 entry 构造并 dispatch undo 事务 → `history.pushRedo(entry)`；Editor.redo() 对称。每次栈操作后触发 onSizesChange

- [ ] **Step 1: 写测试 `history.test.ts`**

用真实 `EditorState` + `Transaction` + Task 3 steps 驱动，覆盖：
1. 记一笔 AddObject 事务 → undoSize 1 / redoSize 0，onSizesChange 回调触发
2. `popUndo()` 取 entry → `makeTransaction(state, entry, 'undo')` 应用到 state 后对象消失、selection/viewport 回到 before
3. undo 后再记新事务 → redoStack 被清空
4. 两笔事务连做两次 undo → 逆序还原（先还第二笔）
5. `addToHistory: false` 的 viewport 事务（pan）不入栈、不影响 redo
6. zoom 事务（`setViewport({zoom:2})`）入栈，undo 后 zoom 回 1
7. clear/clearUndo/clearRedo 行为
8. 栈空时 `popUndo()`/`popRedo()` 返回 null

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-core test && pnpm --filter @gmi/fp-core typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 插件接口与 History 插件（undo/redo 栈）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Editor 主类 + 事件系统 + keymap 插件

**Files:**
- Create: `packages/core/src/events.ts`
- Create: `packages/core/src/render/renderer.ts`（Renderer 接口，供测试注入 fake）
- Create: `packages/core/src/editor.ts`
- Create: `packages/core/src/plugins/keymap.ts`
- Modify: `packages/core/src/index.ts`（公共导出面）
- Test: `packages/core/src/editor.test.ts`

**Interfaces:**
- Consumes: Task 4 `EditorState`/`Transaction`/`EditorMode`；Task 5 `Plugin`/`History`。
- Produces（渲染层 Task 7+ 与 fp-react 依赖，签名逐字固定）:

```ts
// events.ts
export type EditorEventMap = {
    change: { state: EditorState; prev: EditorState };
    'change:mode': { mode: EditorMode; prevMode: EditorMode };
    'change:selection': { selection: readonly string[] };
    'change:viewport': { viewport: Viewport };
    loadImage: { name: string; width: number; height: number };
    clearImage: Record<string, never>;
    historyChange: { undoSize: number; redoSize: number };
    objectAdded: { object: EditorObject };
    objectRemoved: { id: string };
};

// render/renderer.ts
export interface Renderer {
    syncState(state: EditorState, prev: EditorState): void;
    setMode(mode: EditorMode, prevMode: EditorMode): void;
    destroy(): void;
}

// editor.ts
export interface EditorOptions {
    plugins?: Plugin[];            // 追加插件（history/keymap 始终默认注册）
    renderer?: Renderer;           // 缺省由 Task 7 改为 new FabricRenderer(...)
}
export class Editor {
    constructor(options?: EditorOptions);
    get state(): EditorState;
    get history(): History;
    dispatch(tr: Transaction): void;
    newTransaction(): Transaction;                 // new Transaction(this.state)
    subscribe(listener: (state: EditorState, prev: EditorState) => void): () => void;
    on<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void;
    once<K extends keyof EditorEventMap>(name: K, handler: (payload: EditorEventMap[K]) => void): void;
    off<K extends keyof EditorEventMap>(name: K, handler?: (payload: EditorEventMap[K]) => void): void;
    // —— 以下高级 API 在本任务中实现「数据层完整」的部分，渲染行为由后续任务的 controller/renderer 补全 ——
    undo(): void; redo(): void;
    clearUndoStack(): void; clearRedoStack(): void;
    isEmptyUndoStack(): boolean; isEmptyRedoStack(): boolean;
    isEdited(): boolean;                            // undoSize > 0
    getCurrentState(): EditorMode;
    getImageName(): string;                         // doc.background?.name ?? ''
    endAll(): void;                                 // dispatch setMode('normal')
    destroy(): void;
}
```

- `dispatch` 流程（顺序固定）：① 各插件 `filterTransaction`，任一 false → 整体丢弃；② `newState = state.apply(tr)`；③ 各插件 `appendTransaction`，返回值继续 apply；④ `this.state = newState`；⑤ `history.onTransaction`（仅当 `tr.addToHistory`）；⑥ `renderer?.syncState(newState, oldState)`，mode 变化时另调 `renderer?.setMode`；⑦ 触发 `change` + 具体变化事件（mode/selection/viewport 按字段对比触发）；⑧ 其余插件 `onTransaction`
- `undo()`：`entry = history.popUndo()`（null 则 return）→ `history.makeTransaction(state, entry, 'undo')` → dispatch → `history.pushRedo(entry)`；`redo()` 对称（pop/push 后 sizes 变化触发 `historyChange` 事件，由 History 构造时注入的回调桥接到 emitter）
- keymap 插件：监听 `document.documentElement` 的 keydown；`Mod+Z`（metaKey||ctrlKey）→ `editor.undo()`；`Mod+Shift+Z` 或 `Ctrl+Y` → `editor.redo()`；`Delete`/`Backspace` → 由 Task 10 接 `removeActiveObject`（本任务先留空调用 `editor` 上尚不存在的方法前必须加存在性守卫）。守卫：目标为 input/textarea/contenteditable 或 `(editor as any)` 处于文本编辑态时不触发。`destroy()` 移除监听
- `index.ts` 导出：`Editor`、`EditorState`、`EditorMode`、`Viewport`、`Transaction`、`Step`、全部 step 类、`Doc`/`EditorObject`/`BackgroundImage` 等模型类型、`Plugin`、`History`、`EditorEventMap`、`VERSION`。**不导出** Renderer/controllers/任何 fabric 类型
- `loadImage`/`clearImage`/`objectAdded`/`objectRemoved` 事件由后续任务在对应高级 API 中 fire，本任务只定义类型

- [ ] **Step 1: 写测试 `editor.test.ts`（注入 fake renderer）**

fake renderer：`{ syncState: vi.fn(), setMode: vi.fn(), destroy: vi.fn() }`。覆盖：
1. dispatch AddObject → state.doc.objects 增加；fake.syncState 被调且参数为新/旧 state
2. `subscribe` 监听器被调；退订后不再调
3. mode 切换触发 `change:mode` 与 fake.setMode；selection 变化触发 `change:selection`
4. `filterTransaction` 返回 false 的插件使 dispatch 无效（state 不变）
5. `appendTransaction` 返回额外 AddObject → 两对象都入 doc
6. undo/redo 端到端：add → undo（对象消失、isEmptyUndoStack true）→ redo（对象回来）；`historyChange` 事件随之触发
7. `endAll()` 后 mode 回 normal；`isEdited()` 在有/无可撤销事务时的取值；`destroy()` 调 renderer.destroy 与 keymap destroy

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 通过 + typecheck**

Run: `pnpm --filter @gmi/fp-core test && pnpm --filter @gmi/fp-core typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): Editor 主类、事件系统与 keymap 插件

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: FabricRenderer 基础（canvas / 背景 / sync / 尺寸 / viewport）

**Files:**
- Create: `packages/core/src/render/object-factory.ts`
- Create: `packages/core/src/render/fabric-renderer.ts`
- Modify: `packages/core/src/editor.ts`（`renderer` 缺省值改为 `new FabricRenderer(...)`，Editor 构造增加 `container`/`cssMaxWidth`/`cssMaxHeight`）

**Interfaces:**
- Consumes: Task 6 `Renderer` 接口、`Editor`；Task 2 模型。
- Produces（Task 8-17 依赖）:

```ts
// object-factory.ts（内部）
export function createFabricObject(obj: EditorObject): FabricObject;   // 按 kind 分派
export function updateFabricObject(fObj: FabricObject, obj: EditorObject): void;

// fabric-renderer.ts（内部）
export interface FabricRendererOptions {
    container: HTMLElement;
    cssMaxWidth?: number;     // 默认 700
    cssMaxHeight?: number;    // 默认 400
}
export class FabricRenderer implements Renderer {
    constructor(options: FabricRendererOptions);
    get canvas(): Canvas;                       // 仅供 controllers 使用
    get container(): HTMLElement;
    get cssMax(): { width: number; height: number };
    syncState(state: EditorState, prev: EditorState): void;
    setMode(mode: EditorMode, prevMode: EditorMode): void;   // 本任务仅切换 selection 开关；controller 机制 Task 10 接入
    fitScale(state: EditorState): number;       // min(cssMaxW/imgW, cssMaxH/imgH, 1)，无图返回 1
    destroy(): void;
}

// editor.ts 变更
export interface EditorOptions {
    container?: HTMLElement;    // 传入时自动创建 FabricRenderer；缺省 + renderer 缺省 = 无头模式（测试）
    cssMaxWidth?: number;
    cssMaxHeight?: number;
    plugins?: Plugin[];
    renderer?: Renderer;
}
```

渲染模型（与「架构决策补充」1/2 一致）：
- canvas 元素铺满 container；container 由调用方给定尺寸与灰底背景
- 背景图加载：`util.loadImage(src, { crossOrigin: 'anonymous' })` → `new FabricImage(img)`；`img.angle = bg.angle`；canvas backstore 尺寸 = `{ width: bg.width, height: bg.height }`（当前外接框像素），CSS 尺寸 = backstore × fitScale（`setDimensions(..., { cssOnly: true })` 与 `{ backstoreOnly: true }`）
- viewport：`vpt = [s,0,0,s,tx,ty]`，其中 `s = fitScale × viewport.zoom`，`tx/ty` 使图片以 fit 居中后再叠加 `viewport.panX/panY`（容器中心与图片中心的差值 + pan）。居中计算以 container 的 CSS 尺寸为参照
- 对象同步：`syncObjects` 按 id diff——state 有 canvas 无 → `createFabricObject` + `canvas.add`；canvas 有 state 无 → `canvas.remove`；两边都有但引用不同（不可变更新）→ `updateFabricObject`；z 序按 state.doc.objects 数组序重排（fabric 6 用 `canvas.moveObjectTo` 或移除重加，以 d.ts 为准）。对象 fabric 实例的 `data` 属性挂 `{ fpId: obj.id }` 做映射
- 背景同步：`background` 引用变化 → 重设 backstore/CSS 尺寸、backgroundImage、viewport
- `syncState` 末尾统一 `canvas.requestRenderAll()`
- selection 同步：state.selection 变化 → 对映射到的 fabric 对象做 `setActiveObject` / `discardActiveObject`（多选用 `ActiveSelection`）
- normal 模式下 `canvas.selection = true`、对象 `selectable/evented = true`；其他模式关闭（`setMode` 里做，controller Task 10 接管后与此协调）

- [ ] **Step 1: 实现 `object-factory.ts`**

kind 映射：`shape.rect` → `Rect`；`shape.circle` → `Ellipse`（`rx: width/2, ry: height/2`，对齐旧 shape.ts 用 Ellipse 伪造 circle）；`shape.triangle` → `Triangle`；`text` → `IText`（`editable: false` 初始，编辑由 text controller 控制）；`path` → `Path`（`new Path(obj.path, {...})`）；`image` → `FabricImage`（从 `obj.src` 同步创建：调用方需保证 src 已预加载——用 `util.loadImage` 缓存后创建，缓存放在 object-factory 模块内）；`mosaic` → 本任务先抛 `Error('mosaic renderer not implemented')`（Task 15 补）。`updateFabricObject`：`fObj.set({...})` 全量覆盖可变字段 + `fObj.setCoords()`。

- [ ] **Step 2: 实现 `fabric-renderer.ts` 与 Editor 接线**

- [ ] **Step 3: typecheck + 全量测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS（renderer 无单测，Task 9 浏览器验证）

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): FabricRenderer 基础（背景/对象同步/viewport）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 导出（toDataURL / toBlobData / getViewPortImage / getViewPortInfo）

**Files:**
- Create: `packages/core/src/render/exporter.ts`
- Modify: `packages/core/src/editor.ts`（挂高级 API）

**Interfaces:**
- Consumes: Task 7 `FabricRenderer`。
- Produces（Editor 公开 API，playground/demo/react 依赖）:

```ts
// editor.ts 新增方法
toDataURL(type?: string): string;                 // type 如 'image/png'，默认 'image/png'
toBlobData(type?: string): Promise<Blob | null>;  // fabric 6 toBlob 为 Promise
getViewPortImage(): string;                       // 当前视口可见区域的 dataURL
getViewPortInfo(): { width: number; height: number; left: number; top: number };
```

实现要点（移植自旧 `src/modules/main.ts` 的 toDataURL/toBlob/getViewPort*，写前阅读）：
- `toDataURL`：临时 `setViewportTransform([1,0,0,0,1,0])` → `canvas.toDataURL({ format, left: 0, top: 0, width: bg.width, height: bg.height, multiplier: 1 })` → 恢复 vpt（保证导出图片原始像素而非缩放视觉，对齐现状）；无背景时导出整 canvas
- `toBlobData`：同上进制，用 `canvas.toBlob({...})`
- `getViewPortImage`：保留当前 vpt，`toDataURL` 裁剪容器可见区域（left/top = 0,0，width/height = 容器 CSS 像素），multiplier 1
- `getViewPortInfo`：返回容器可见区域在 doc 坐标系下的矩形（用 vpt 逆变换：`(screenPt - t) / s`）

- [ ] **Step 1: 实现 exporter + Editor 挂接**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core
git commit -m "feat(core): 导出 API（toDataURL/toBlob/viewport 区域）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 图片加载 API + playground 起步 + 首次浏览器冒烟

**Files:**
- Modify: `packages/core/src/editor.ts`（`loadImageFromURL` / `loadImageFromFile` / `addImageObject` / `clearImage` 路径）
- Modify: `packages/core/playground/index.html`、`packages/core/playground/main.ts`

**Interfaces:**
- Consumes: Task 3 `SetBackground`；Task 7 renderer。
- Produces（Editor 公开 API）:

```ts
loadImageFromURL(url: string, imageName: string): Promise<void>;
loadImageFromFile(imgFile: File, imageName?: string): Promise<void>;   // FileReader → dataURL → loadImageFromURL
addImageObject(imgUrl: string): Promise<void>;                          // 贴一张新图片对象到画布中心
```

- `addImageObject`：`util.loadImage` 探测宽高 → dispatch `AddObject(ImageObject { kind:'image', src, width, height, left/top = 画布中心, angle: 0, scaleX/scaleY: 1 })`（对齐旧 `src/index.ts` 的 `addImageObject` 语义）

- 加载流程：`util.loadImage` 探测原始宽高 → dispatch `SetBackground({ src: url, width, height, name, angle: 0 })` → 成功后 fire `loadImage { name, width, height }`；失败 reject 且 state 不变
- `SetBackground(null)` 时 fire `clearImage`
- playground：`new Editor({ container: document.getElementById('editor')! })` 挂到 `window.editor`；页面加「加载示例图」「undo」「redo」「导出（console.log dataURL 长度）」按钮；启动自动 `loadImageFromURL('./images/demo.jpeg', 'demo')`

- [ ] **Step 1: 实现加载 API 与 playground**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: kimi-webbridge 冒烟**

```bash
pnpm --filter @gmi/fp-core dev > /tmp/fp-core-playground.log 2>&1 &
```

用 kimi-webbridge（session `fp-core-playground`，标签组「fp-core playground」）打开 `http://localhost:9877`，verify：
1. 控制台无报错；`window.editor` 存在
2. 示例图显示在灰底容器中央（截图 + evaluate 读 `editor.state.doc.background` 非 null）
3. 点 undo → 图片消失（SetBackground 被反转）；redo → 图片回来
4. 导出按钮 console 输出非 0 长度

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): 图片加载 API 与 playground 起步

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Controller 机制 + Select controller（选择/拖拽/缩放提交/删除/清空）

**Files:**
- Create: `packages/core/src/render/controllers/controller.ts`
- Create: `packages/core/src/render/controllers/select.ts`
- Modify: `packages/core/src/render/fabric-renderer.ts`（接入 controller 激活/停用）
- Modify: `packages/core/src/editor.ts`（`removeActiveObject` / `clearObjects` / `deactivateAll`；keymap Delete 接线）
- Modify: `packages/core/src/plugins/keymap.ts`（Delete/Backspace → `editor.removeActiveObject()`）

**Interfaces:**
- Consumes: 全部前序。
- Produces（Task 11-17 的 controller 都实现此接口）:

```ts
// controller.ts
export interface ControllerContext {
    canvas: Canvas;
    getState(): EditorState;
    dispatch(tr: Transaction): void;
    fire<K extends keyof EditorEventMap>(name: K, payload: EditorEventMap[K]): void;
}
export interface Controller {
    readonly mode: EditorMode;
    activate(ctx: ControllerContext): void;
    deactivate(): void;
}

// editor.ts 新增
removeActiveObject(): void;    // 选中对象 → RemoveObject step（ActiveSelection 多选逐个）；fire objectRemoved
clearObjects(): void;          // ClearObjects step
deactivateAll(): void;         // dispatch setSelection([])
```

Select controller（mode `'normal'`，默认激活）行为：
- fabric `selection:created/updated/cleared` → `tr.setSelection(选中对象 fpId 列表)`，`setMeta('addToHistory', false)` dispatch
- **拖拽/缩放预览**：fabric 原生拖动直改 fabric 对象（乐观预览，不产生事务）；`object:modified` → 从 fabric 对象读回最终几何（left/top/angle/scaleX/scaleY + text 特判见 Task 14）→ `UpdateObject(id, attrs)` dispatch（入历史）——「对象变换可撤销」在此落地
- 点击空白：fabric 自动清选 → `selection:cleared` 同步
- renderer 侧：mode 切出 normal → select controller deactivate（`canvas.selection = false`、所有对象 `evented = false`、`discardActiveObject`）；切回 → 恢复

- [ ] **Step 1: 实现 controller 机制 + select controller + Editor API**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 已有加载的图片；冒烟：加载图 → 此时画布上还没有对象，先通过 evaluate 调 `editor.newTransaction().addStep(new AddObject({kind:'shape', shapeType:'rect', ...}))` 造一个矩形（playground 临时引入 steps 导出）→ 用 webbridge 在矩形上按下拖动 → evaluate 确认 `editor.state` 中该对象 left/top 已更新且 `editor.history.undoSize` 增加 → undo → 矩形回到原位。
（playground/main.ts 把 `* as steps` 与 `AddObject` 等挂到 `window.fp` 便于 evaluate 驱动。）

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): controller 机制与 select controller（变换可撤销）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Zoom + Pan

**Files:**
- Create: `packages/core/src/render/controllers/pan.ts`
- Modify: `packages/core/src/editor.ts`（`setZoom` / `getZoom` / `startPan` / `endPan` / `resizeCanvasDimension` / `adjustCanvasDimension`）
- Modify: `packages/core/src/render/fabric-renderer.ts`（滚轮/指针中心缩放支持）

**Interfaces:**
- Produces（Editor 公开 API）:

```ts
setZoom(rate: number): void;    // clamp [0.05, 8]；viewport 事务，addToHistory: true（对齐现状可撤销）
getZoom(): number;
startPan(): void; endPan(): void;
resizeCanvasDimension(dimension?: { width?: number; height?: number }): void;   // 改 container 尺寸 → refit
adjustCanvasDimension(): void;   // refit（fitScale 重算 + 居中）
```

- `setZoom`：`zoomToPoint` 以容器中心为支点（renderer 内实现：`canvas.zoomToPoint(new Point(cx, cy), fitScale × zoom)` 语义对齐）；dispatch `tr.setViewport({ zoom })`，入历史
- Pan controller（mode `'pan'`）：`mouse:down` 记起点，`mouse:move` 累加偏移 → `tr.setViewport({ panX, panY }).setMeta('addToHistory', false)` dispatch（瞬时，不入历史）；`mouse:up` 结束。光标 `grab/grabbing`。不做边界 clamp（架构决策 7）
- renderer：注册滚轮 → `zoomToPoint(指针位置, newZoom)` + dispatch（入历史按 setZoom 同路径；滚轮连续触发做 200ms 防抖合并为一笔历史）

- [ ] **Step 1: 实现**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 zoom+/zoom-/pan 按钮。冒烟：`setZoom(2)` → 图片放大且 undo 后复原；startPan 拖动 → 图片平移且 `undoSize` 不增加；滚轮缩放以指针为中心。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): zoom（可撤销、指针中心）与 pan（瞬时）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 绘制三件套（freedraw / line / arrow）

**Files:**
- Create: `packages/core/src/render/controllers/draw.ts`
- Create: `packages/core/src/render/controllers/line.ts`
- Create: `packages/core/src/render/controllers/arrow.ts`
- Modify: `packages/core/src/editor.ts`（`startFreeDrawing` / `endFreeDrawing` / `setBrush` / `changeFreeDrawingPathStyle` / `startLineDrawing` / `endLineDrawing` / `startArrowDrawing` / `endArrowDrawing` / `changeArrowStyle`）

**Interfaces:**
- Consumes: Task 10 `Controller`/`ControllerContext`；Task 2 `PathObject`；Task 3 `AddObject`/`UpdateObject`。
- Produces（Editor 公开 API）:

```ts
startFreeDrawing(setting?: { width?: number; color?: string }): void;
endFreeDrawing(): void;
setBrush(setting: { width?: number; color?: string }): void;              // 按当前 mode 路由到 draw/line/arrow controller
changeFreeDrawingPathStyle(setting?: { width?: number; color?: string }): void;  // 改选中 path 对象 → UpdateObject
startLineDrawing(setting?: { width?: number; color?: string }): void;
endLineDrawing(): void;
startArrowDrawing(setting?: { width?: number; color?: string }): void;
endArrowDrawing(): void;
changeArrowStyle(setting?: { width?: number; color?: string }): void;    // 改选中 arrow → UpdateObject
```

行为（移植注记：先读旧 `src/modules/draw.ts`、`line.ts`、`arrow.ts`）：
- **freedraw**：`canvas.isDrawingMode = true`，`PencilBrush` 设置 width/color（旧默认 width 12、color `rgba(0,0,0,0.5)`）；`path:created` → 取 `e.path` 的 path data 与几何 → 从画布移除临时 path → dispatch `AddObject(PathObject { tool:'freedraw', path, stroke: color, strokeWidth: width, fill: '' })`（由 renderer 统一重建，保证 state 是唯一事实源）→ fire `objectAdded`
- **line**：`mouse:down` 建临时 `fabric.Line([x,y,x,y])` 加入画布做预览；`mouse:move` 更新 x2/y2；`mouse:up` 移除临时对象 → dispatch `AddObject(PathObject { tool:'line', path: 'M x1 y1 L x2 y2' })`。模式期间其他对象 evented=false、crosshair 光标（对齐现状）
- **arrow**：几何算法移植旧 `arrow.ts`（线 + 三角箭头 + 尾点圆的 Group 方案）——但落盘为**单个 PathObject**：预览时可用 Group，mouseup 时把线 + 箭头三角形合成一个 SVG path 字符串（`M x1 y1 L x2 y2 M tipX tipY L wing1X wing1Y L wing2X wing2Y Z`）存入 `tool:'arrow'` 的 PathObject；`calcArrowAngle` 逻辑照搬
- 三个 controller 的 mode 分别为 `'freedraw' / 'line' / 'arrow'`；`endAll()` 时全部 deactivate
- `changeFreeDrawingPathStyle` / `changeArrowStyle`：对当前选中且 kind==='path'（且 tool 匹配）的对象 dispatch `UpdateObject(id, { stroke: color?, strokeWidth: width? })`

- [ ] **Step 1: 实现三个 controller + Editor API**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 freedraw/line/arrow 按钮（带 width 4、color 红）。冒烟：各画一笔 → `editor.state.doc.objects` 增加对应 tool 的 path 对象；undo 消失、redo 回来；画完后选中该 path 调 `changeFreeDrawingPathStyle({color:'#00f'})` → 颜色变化。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): freedraw/line/arrow 绘制 controller

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Shape controller（rect / circle / triangle）

**Files:**
- Create: `packages/core/src/render/controllers/shape.ts`
- Modify: `packages/core/src/editor.ts`（`startDrawingShapeMode` / `endDrawingShapeMode` / `setDrawingShape` / `addShape` / `changeShape`）

**Interfaces:**
- Produces（Editor 公开 API）:

```ts
startDrawingShapeMode(): void;
endDrawingShapeMode(): void;
setDrawingShape(type: 'rect' | 'circle' | 'triangle', options?: { fill?: string; stroke?: string; strokeWidth?: number }): void;
addShape(type: 'rect' | 'circle' | 'triangle', options?: Partial<Pick<ShapeObject, 'left' | 'top' | 'width' | 'height' | 'fill' | 'stroke' | 'strokeWidth'>>): void;
changeShape(options: { fill?: string; stroke?: string; strokeWidth?: number }): void;   // 选中 shape → UpdateObject
```

行为（移植注记：先读旧 `src/modules/shape.ts` 与 `src/lib/shape-resize-helper.ts`）：
- `setDrawingShape` 记录当前形状类型与样式；`startDrawingShapeMode` 进入 `'shape'` mode
- `mouse:down` 记起点建预览对象（`Rect`/`Ellipse`/`Triangle`），`mouse:move` 更新宽高（**Shift 锁等比**——对齐现状 `isRegular`，用 keydown/keyup 监听 Shift），`mouse:up` 移除预览 → dispatch `AddObject(ShapeObject)`；`circle` 落盘为 `shapeType:'circle'`（渲染用 Ellipse，对齐现状）
- 拖拽起点为左上角语义；反向拖动（向左/上拖）时换算 origin——移植 shape-resize-helper 的 origin 换算
- `addShape`：left/top 缺省取画布中心（对齐现状）；直接 dispatch `AddObject`
- `changeShape`：对选中的 `kind==='shape'` 对象 dispatch `UpdateObject`
- 对象被缩放（select controller 的 object:modified）时把 scale 折算回 width/height 并归一 scale（移植 shape-resize-helper 的 scaling 处理：rect 折算 width/height，circle(ellipse) 折算 rx/ry 对应的 width/height）——这段逻辑放在 select controller 的提交函数里按 kind 分派，本任务实现 shape 分支

- [ ] **Step 1: 实现**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 rect/circle/triangle 按钮。冒烟：各画一个 → state 出现对应 ShapeObject；Shift 拖出正方形/正圆；缩放一个 rect → state 中 width/height 变化且 scaleX/scaleY 归 1；undo/redo 正常。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): shape controller（rect/circle/triangle + scale 折算）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: Text controller（IText 原地编辑）

**Files:**
- Create: `packages/core/src/render/controllers/text.ts`
- Modify: `packages/core/src/editor.ts`（`startTextMode` / `endTextMode` / `addText` / `changeText` / `changeTextStyle`）

**Interfaces:**
- Produces（Editor 公开 API）:

```ts
startTextMode(): void;
endTextMode(): void;
addText(text?: string, options?: { styles?: Partial<Pick<TextObject, 'fontSize' | 'fontFamily' | 'fill' | 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textAlign'>>; position?: { x: number; y: number } }, defaultEdit?: boolean): void;
changeText(text: string): void;          // 选中文本 → UpdateObject
changeTextStyle(styleObj?: Partial<Pick<TextObject, 'fontSize' | 'fontFamily' | 'fill' | 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textAlign'>>): void;
```

行为（移植注记：先读旧 `src/modules/text.ts`；**旧的 DOM textarea 方案整体废弃**，用 fabric 6 IText 原生编辑）：
- `'text'` mode 下点击画布空白 → 在该点 `addText('双击编辑', ...)`（对齐旧 `activateText` 事件的「点击空白新建」语义，默认文案沿用）并直接进入编辑
- 双击已有文本 → IText `enterEditing()`；`editing:exited` → 文本回读 dispatch `UpdateObject(id, { text })`；空文本（trim 后为空）→ dispatch `RemoveObject`（对齐现状「空文本自动 remove」）
- `addText`：`position` 缺省画布中心；`defaultEdit` true 时创建后立即进入编辑
- `changeTextStyle` **toggle 语义**（对齐现状）：传入值与该字段当前值相同 → 重置为该字段默认值（默认表：fontWeight `'normal'`、fontStyle `''`、textDecoration `''`、fill `'#000000'`、fontSize `50`、fontFamily `'sans-serif'`、textAlign `'left'`）；否则设为传入值
- 文本被缩放（select controller 提交）时把 scale 折算进 fontSize 并归一 scaleX/scaleY（对齐现状）——select controller 提交函数的 text 分支在本任务实现
- IText 渲染参数：隐藏中点控制点（`setControlsVisibility({ mb:false, ml:false, mr:false, mt:false })`）、`objectCaching: false`（对齐现状）

- [ ] **Step 1: 实现**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 text 按钮。冒烟：点画布空白 → 出现「双击编辑」并处于编辑态；输入文字 → `editing:exited` 后 state 中文本更新；双击再编辑清空 → 对象被删除；`changeTextStyle({fontWeight:'bold'})` 两次 → 先加粗后还原；缩放文本 → fontSize 变化、scale 归 1；undo/redo 正常。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): text controller（IText 原地编辑 + toggle 样式）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: Mosaic controller + MosaicShape 渲染

**Files:**
- Create: `packages/core/src/render/shapes/mosaic-shape.ts`
- Create: `packages/core/src/render/controllers/mosaic.ts`
- Modify: `packages/core/src/render/object-factory.ts`（补 `mosaic` 分支）
- Modify: `packages/core/src/editor.ts`（`startMosaicDrawing` / `endMosaicDrawing`）

**Interfaces:**
- Produces（Editor 公开 API）:

```ts
startMosaicDrawing(setting?: { dimensions?: number }): void;   // dimensions 默认 8
endMosaicDrawing(): void;
```

```ts
// mosaic-shape.ts
export class MosaicShape extends FabricObject {
    static type = 'mosaic';
    mosaicRects: MosaicRect[];
    protected _render(ctx: CanvasRenderingContext2D): void;   // 逐块 fillRect
}
// 模块加载时 classRegistry.setClass(MosaicShape, 'mosaic')
```

行为（移植注记：先读旧 `src/modules/mosaic.ts` 与 `src/shape/mosaic.ts`，取色算法逐行移植）：
- `mouse:down` 开始一次涂抹：克隆当前画布内容到覆盖层 canvas（或直接对 lower-canvas 用 `getImageData`，以 fabric 6 可用 API 为准）；记录 `mosaicRects: MosaicRect[]`
- `mouse:move`：取指针周围 `dimensions × dimensions`（按 backstore 像素计）区域的平均色 → push `{ x, y, size, color }` → 预览：直接画到覆盖层（对齐现状）
- `mouse:up`：清除覆盖层 → dispatch `AddObject(MosaicObject { rects, width, height })`（width/height 为涂抹区域外接框）→ renderer 用 MosaicShape 重建
- `MosaicShape._render`：对每个 rect `ctx.fillStyle = color; ctx.fillRect(x - width/2, y - height/2, size, size)`（以对象中心为原点，坐标在 add 时归一化）
- `object-factory` 补 mosaic 分支：`new MosaicShape({ left, top, width, height, mosaicRects })`；`selectable: true`（现状 MosaicShape 是 selectable:false——**新架构统一可选中**，否则无法删除马赛克，声明为有意增强）

- [ ] **Step 1: 实现**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 mosaic 按钮。冒烟：在图片上涂抹一块 → state 出现 MosaicObject 且 rects 非空；画布对应区域显示马赛克色块；undo/redo 正常。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): mosaic controller 与 MosaicShape 渲染

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 16: Crop controller + Cropzone（蚂蚁线）

**Files:**
- Create: `packages/core/src/render/shapes/cropzone.ts`
- Create: `packages/core/src/render/controllers/crop.ts`
- Modify: `packages/core/src/editor.ts`（`startCropping` / `endCropping` / `startCropByBoundInfo` / `endCropByBoundInfo`）

**Interfaces:**
- Produces（Editor 公开 API）:

```ts
startCropping(): void;
endCropping(isApplying?: boolean): void;                                  // 默认 true
startCropByBoundInfo(): void;
endCropByBoundInfo(cropInfo?: { left: number; top: number; width: number; height: number }): void;
```

```ts
// cropzone.ts
export class Cropzone extends Rect {
    static type = 'cropzone';
    isValid(): boolean;                      // 在背景图范围内
    protected _render(ctx: CanvasRenderingContext2D): void;   // 遮罩 + 蚂蚁线
}
// classRegistry.setClass(Cropzone, 'cropzone')
```

行为（移植注记：先读旧 `src/modules/cropper.ts` 与 `src/shape/cropzone.ts`，蚂蚁线渲染与 clamp 逻辑逐行移植）：
- `startCropping`：进入 `'crop'` mode；所有对象 evented=false；创建 Cropzone（画布 80%，距边 10%，对齐现状）；Shift 锁正方形（MOUSE_MOVE_THRESHOLD=10 起判，对齐现状）
- Cropzone 移动/缩放 clamp 在背景图范围内（移植 cropzone 的 moving/scaling 内部 clamp）
- `endCropping(true)`：cropzone 无效 → 直接退出；有效 → 计算 cropInfo（doc 坐标）→ `canvas.toDataURL({ left, top, width, height, format: 'image/png' })`（临时重置 vpt，同 Task 8 导出路径）→ dispatch `SetBackground({ src: dataURL, width: cropW, height: cropH, name: 原名, angle: 0 })`——**可撤销**（统一两条裁剪路径，spec 已声明）；fire `endCropping` 语义由 `change:mode` 覆盖
- `endCropping(false)`：丢弃 cropzone 退出
- `startCropByBoundInfo` / `endCropByBoundInfo(cropInfo)`：无 cropzone UI，直接按矩形走同一 `SetBackground` 路径（cropInfo 缺省 = 整图）
- cropzone 是渲染层临时对象：不进 state.doc.objects（在 renderer 的 syncObjects diff 中豁免——fabric 侧对象 `data.fpInternal === 'cropzone'` 的实例不参与 diff 删除）

- [ ] **Step 1: 实现**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 crop 按钮 + apply/cancel。冒烟：startCropping → 出现 80% 裁剪框带蚂蚁线；拖小后 apply → 图片被裁（state.background.width/height 变小）；undo → 原图与对象恢复；`endCropByBoundInfo({left:0,top:0,width:100,height:100})` 路径同样可撤销。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): crop controller 与 Cropzone（两条裁剪路径统一可撤销）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 17: Rotate（TransformDoc 渲染落地）

**Files:**
- Modify: `packages/core/src/editor.ts`（`rotate` / `setAngle` / `getAngle`）
- Modify: `packages/core/src/render/fabric-renderer.ts`（背景 angle 渲染）

**Interfaces:**
- Consumes: Task 3 `TransformDoc`（数学已在 Task 3 落地并测试）。
- Produces（Editor 公开 API）:

```ts
rotate(delta: number): void;      // 相对：setAngle(getAngle() + delta)
setAngle(angle: number): void;    // 绝对 %360；dispatch TransformDoc（可撤销）
getAngle(): number;               // doc.background?.angle ?? 0
```

- renderer 侧：背景 `angle` 与 `width/height`（外接框）变化已在 Task 7 的 syncBackground 覆盖——本任务验证 90/180/270 与任意角度的显示、对象随转、导出正确
- `rotateImage` 事件语义由 `change` + `change:viewport` 覆盖，不单独设事件

- [ ] **Step 1: 实现 Editor API**

- [ ] **Step 2: typecheck + 测试**

Run: `pnpm --filter @gmi/fp-core typecheck && pnpm --filter @gmi/fp-core test`
Expected: PASS

- [ ] **Step 3: playground 冒烟（webbridge）**

playground 加 rotate90 按钮。冒烟：图上画一个 rect → rotate90 → 图片旋转、rect 跟着转、state.background.angle=90 且宽高互换；undo → 全部还原；连续 4 次 rotate90 回到原状。

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core
git commit -m "feat(core): rotate/setAngle（TransformDoc 渲染落地）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 18: playground 全量操作台 + 全功能浏览器验收

**Files:**
- Modify: `packages/core/playground/index.html`（全量按钮 + 色板 + 状态显示）
- Modify: `packages/core/playground/main.ts`

**Interfaces:**
- Consumes: Task 6-17 的全部 Editor API。
- Produces: Phase 1 的功能验收界面（Phase 2/3 开发期间继续作为 core 的调试页）。

playground 操作台（纯原生 JS + 内联样式，不引框架）：
- 工具按钮：选择（endAll）、裁剪（+ Apply/Cancel）、旋转 90°、箭头、画笔、直线、矩形、圆形、三角形、文字、马赛克、平移
- 色板：红/黄/绿/蓝/灰/黑/白 7 色，对当前工具或选中对象生效（调 `setBrush` / `changeShape` / `changeTextStyle` / `changeFreeDrawingPathStyle`）
- 缩放：- / 百分比显示 / +；undo / redo（按 `historyChange` 禁用态）；清空对象；删除选中；导出（下载 PNG：`toDataURL` → a[download]）
- 状态条：当前 mode、对象数、undo/redo 深度
- `window.editor` 与常用 step 类挂 `window.fp`

- [ ] **Step 1: 实现 playground 操作台**

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @gmi/fp-core typecheck`
Expected: PASS

- [ ] **Step 3: kimi-webbridge 全功能验收（对照 spec 功能映射表逐项过）**

启动 `pnpm --filter @gmi/fp-core dev`，session `fp-core-playground`，逐项验证并截图关键步骤：

| # | 验收项 | 通过标准 |
|---|---|---|
| 1 | 加载示例图 | 图片居中显示，`loadImage` 事件触发 |
| 2 | undo/redo | 初始加载可撤销（undo 图消失、redo 恢复） |
| 3 | 画笔 | 画线显示；undo 消失 |
| 4 | 直线 | 拖出直线；入历史 |
| 5 | 箭头 | 拖出带箭头线；入历史 |
| 6 | 矩形/圆形/三角形 | 各画出；Shift 等比；缩放后 width/height 折算 |
| 7 | 文字 | 点击空白新建并编辑；双击再编辑；清空自动删除；样式 toggle |
| 8 | 马赛克 | 涂抹出马赛克块；可选中删除 |
| 9 | 裁剪 | 蚂蚁线框；apply 裁剪成功且可撤销；cancel 无效 |
| 10 | 旋转 | rotate90 图片与对象同转；4 次回原点；undo 还原 |
| 11 | 缩放 | 按钮与滚轮缩放；指针中心；可撤销 |
| 12 | 平移 | pan 拖动；不入历史 |
| 13 | 拖拽/缩放对象 | 移动后入历史，undo 回原位 |
| 14 | 删除/清空 | Delete 键删选中；清空按钮清全部；均可撤销 |
| 15 | 导出 | 下载 PNG 打开与画布内容一致（原始像素尺寸） |
| 16 | 快捷键 | Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z、Delete 生效 |
| 17 | 换图 | 上传另一张图（input file → loadImageFromFile）→ 对象清空、可撤销 |
| 18 | 贴图 | `addImageObject(url)` 把新图片加到画布中心，可选中拖动，可撤销 |

- [ ] **Step 4: 停 server + Commit**

```bash
pkill -f "vite playground" 2>/dev/null; true
git add packages/core/playground
git commit -m "feat(core): playground 全量操作台

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 19: core README + 构建产物验证 + Phase 1 收口

**Files:**
- Create: `packages/core/README.md`
- Modify: `readme.md`（仅加一节指向新包，不重写——Phase 3 统一重写）

**Interfaces:**
- Produces: Phase 1 完成标志：可 build 的 `@gmi/fp-core` 包 + API 文档。

- [ ] **Step 1: 写 `packages/core/README.md`**

内容：包定位（ProseMirror 式内核，UI 无关）；安装；最小用例（`new Editor({ container })` + `loadImageFromURL`）；公开 API 清单（对照 Task 6/8/9/10/11/12/13/14/15/16/17 的 Produces 逐条列出方法签名与一句话说明）；事件清单（EditorEventMap 每个事件 + 触发时机）；架构一句话（state/step/transaction/plugin + fabric 渲染投影）。

- [ ] **Step 2: `readme.md` 加「v2 进行中」小节**

在项目简介后插入：

```markdown
> **🚧 v2 重构进行中**：本仓库正在改造为 monorepo。新一代内核 [`@gmi/fp-core`](packages/core)（ProseMirror 式 state/step/transaction 架构 + fabric 6）已可用，React 组件包 `@gmi/fp-react` 与新 demo 在路上。当前 npm 包 `fabric-photo`（本目录 `src/`）进入维护状态，不再新增功能。
```

- [ ] **Step 3: 构建产物验证**

```bash
pnpm --filter @gmi/fp-core build
ls packages/core/dist/
node --check packages/core/dist/index.js && echo "cjs OK"
grep -c "class Editor" packages/core/dist/index.d.ts
```

Expected: `dist/` 含 `index.js/index.js.map/index.mjs/index.mjs.map/index.d.ts`；cjs 语法 OK；d.ts 含 Editor 声明；`grep -n "fabric" packages/core/dist/index.d.ts` 确认公共类型面不泄露 fabric 类型（仅允许注释中出现）。

- [ ] **Step 4: 全量收口验证**

```bash
pnpm -r typecheck && pnpm -r test && pnpm -r build
pnpm typecheck && pnpm build:demo
```

Expected: 全部通过（新链路与旧链路都绿）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(core): README 与 Phase 1 收口

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 完成定义（DoD）

1. `pnpm -r typecheck` / `pnpm -r test` / `pnpm -r build` 全绿；旧链路 `pnpm typecheck && pnpm build && pnpm build:demo` 全绿
2. playground 18 项验收清单全部通过（Task 18 Step 3）
3. spec 功能映射表中除「明确不迁移」外的每一项都有对应实现
4. `packages/core/dist` 产物齐全，公共 d.ts 不含 fabric 类型
5. master 上旧 CI（push 触发 build:demo 部署）不受影响




