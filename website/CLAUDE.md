# website 目录说明

## 这个目录负责什么

基于 dumi 的文档与演示站，发布到 GitHub Pages（`ximing.github.io/fabric-photo`）。

## 放置约束

- 这是独立的 npm 包（独立 `package.json` 与 `pnpm-lock.yaml`），依赖安装、构建都在本目录内单独进行，不要与根目录依赖混用
- `docs/` 放文档 markdown；`src/demo/` 放演示组件；`public/images/` 放演示图片
- 不要把库源码复制进来，演示通过包名引用根目录构建产物

## 开发入口

- 安装依赖：`pnpm install`（或根目录 `pnpm install:website`）
- 本地起站：`pnpm start`（dumi dev）
- 构建：`pnpm docs:build`（或根目录 `pnpm build:website`）
- 部署：`pnpm deploy`（docs:build + gh-pages 发布到 `dist`）

## 开发偏好

- 库 API 变更后需同步两处：`docs/` 中的文档和根目录 `readme.md`
- 演示用的示例图片放 `public/images/`，保持小体积
