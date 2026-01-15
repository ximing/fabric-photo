---
paths:
  - "packages/*/src/**/*.test.ts"
  - "packages/*/src/**/*.test.tsx"
---

# 测试规则

- 测试框架 vitest；测试文件与源文件同目录平铺（`*.test.ts` / `*.test.tsx`），不使用 `__tests__` 目录
- `packages/core`：node 环境，用无头 Editor（不传 container/renderer）即可测全部 state / step / transaction 语义
- `packages/react`：jsdom + `@testing-library/react`，只测组件渲染与交互，编辑行为一律经 core 公开 API 驱动
- 新 Step 必须附 `apply`/`invert` 成对语义的测试，undo/redo 行为一并覆盖
- 运行：`pnpm test`（root 跑全部 workspace）；改动后须同时通过 `pnpm typecheck`
