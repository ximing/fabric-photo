---
paths:
  - "dist/**"
---

# 构建产物规则（dist/）

- `dist/` 由 `pnpm build`（rollup）与 tsc declaration 自动生成，**禁止直接编辑**其中的任何文件
- 发现产物有问题时，改 `src/` 源码后重新执行 `pnpm build`（类型声明改动用 `pnpm tsc`）
- `dist/types/**` 的 `.d.ts` 由 `tsconfig.json` 的 `declaration` 生成，不要手写维护
- `dist/` 会随 npm 发布（`main: dist/index.js`，`module: dist/index.esm.js`），提交 PR 前如改了 `src/`，确认产物是否需要一并重新构建
