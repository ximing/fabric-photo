---
ruleType: Always
description: 构建产物规则（dist / dist-demo 不要手改、不入库）
---

# 构建产物规则

- `packages/core/dist/`、`packages/react/dist/`：各包 tsup 产物（cjs + esm + d.ts），由 `pnpm --filter <pkg> build` 或 root `pnpm -r build` 生成；不要手改，不入库（gitignored）
- `dist-demo/`：demo 站点产物（`pnpm build:demo`，Vite，GitHub Pages 部署源）；不要手改，不入库
- 改源码后重新构建对应包即可；CI 在 typecheck/test 前会先 `pnpm -r build`（dist 类型依赖）
