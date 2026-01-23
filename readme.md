# Fabric Photo

🎨 基于 Canvas 的纯前端图片编辑器，无需后端支持，提供丰富的图片编辑功能。

新一代架构：ProseMirror 式内核（state / step / transaction）+ fabric 6 渲染投影 + Figma 式 React 组件。

![截图](./assets/main.png)

**在线演示**：[https://ximing.github.io/fabric-photo/](https://ximing.github.io/fabric-photo/)

## 📁 Monorepo 结构

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| `packages/core` | `@gmi/fp-core` | 编辑器内核：ProseMirror 式 state / step / transaction，UI 无关，fabric 6 仅作渲染投影 |
| `packages/react` | `@gmi/fp-react` | Figma 式 React 组件包：顶栏 / 工具栏 / 属性面板 / 画布，零编辑逻辑 |
| `demo` | `fabric-photo-demo` | 演示站（Vite + React），GitHub Pages 部署源 |

## ✨ 功能特性

- ✂️ **图片裁剪**：蚂蚁线裁剪框 + 矩形直裁
- 🔄 **旋转**：任意角度旋转，对象随转
- ✏️ **绘图工具**：涂鸦、直线、箭头
- 🔲 **形状绘制**：矩形、圆形、三角形
- 📝 **文本编辑**：原地编辑、样式切换
- 🧩 **马赛克**：涂抹打码保护隐私
- 🔍 **缩放 / 平移**：视口自由操控
- ↩️ **撤销/重做**：完整的操作历史管理
- 📤 **导出功能**：导出为 PNG/Blob 格式

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/ximing/fabric-photo.git
cd fabric-photo

# 安装依赖
pnpm install

# 启动 demo 开发服务器
pnpm dev
```

打开 http://localhost:9876 体验完整功能。

## 🛠️ 开发命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 demo 开发服务器（Vite，端口 9876） |
| `pnpm build` | 构建全部包（core + react + demo） |
| `pnpm build:demo` | 构建 demo 站点（输出 `dist-demo/`，即 GitHub Pages 内容） |
| `pnpm preview:demo` | 本地预览 demo 构建产物 |
| `pnpm test` | 运行全部测试（vitest） |
| `pnpm typecheck` | 全部包 TypeScript 类型检查 |

core 内核自带独立 playground（无 React，直连内核调试）：

```bash
pnpm --filter @gmi/fp-core dev   # 端口 9877
```

## 📦 包使用

> ⚠️ 暂未发布到 npm，目前仅在 monorepo 内通过 workspace 引用使用。

```bash
npm install @gmi/fp-core @gmi/fp-react
```

```tsx
import '@gmi/fp-react/style.css';
import { FabricPhotoEditor } from '@gmi/fp-react';

function App() {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <FabricPhotoEditor src="/photo.jpg" />
        </div>
    );
}
```

只要内核不要 UI 时，可单独使用 `@gmi/fp-core`（无头模式亦可跑通全部编辑语义），详见各包 README。

## 📖 文档

- [packages/core/README.md](./packages/core/README.md) — 内核架构与公开 API 清单
- [packages/react/README.md](./packages/react/README.md) — React 组件 / Hooks / 快捷键 / 样式说明
- [docs/superpowers/specs/](./docs/superpowers/specs/) — 设计规格文档

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🔒 安全说明

`pnpm audit` 中 fabric 6.x 存在 2 条已知漏洞，经评估为**接受风险**，不计划通过升级 fabric 修复：

- [GHSA-hfvx-25r5-qc3w](https://github.com/advisories/GHSA-hfvx-25r5-qc3w)（high，修复于 7.2.0）— SVG 导出存储型 XSS
- [GHSA-w22m-hvvm-xmwx](https://github.com/advisories/GHSA-w22m-hvvm-xmwx)（moderate，修复于 7.4.0）— Gradient colorStops 在 SVG 序列化中转义不当导致 XSS

接受理由：

1. **不触及 SVG 攻击面**：两条漏洞均只存在于 fabric 的 SVG 导出/序列化路径。本项目导出仅走位图（PNG/Blob，见「导出功能」），代码中不调用 `toSVG` / `toObject` SVG 序列化相关 API，攻击面不可达。
2. **锁 6.x 是架构决定**：fabric 仅作为内核 state 的渲染投影被封装在 `@gmi/fp-core` 内部（公开 API 不暴露任何 fabric 类型），升级到 fabric 7 属于主版本迁移，收益仅为消除两条不可达告警，风险/收益不匹配。

其余依赖漏洞通过 root `package.json` 的 `pnpm.overrides` 钉版修复（`tar >=7.5.21`、`esbuild >=0.28.1`），新增依赖时请复查 `pnpm audit`。

## 📄 License

[MIT](./LICENSE)

## 🙏 致谢

- [Fabric.js](http://fabricjs.com/) - 强大的 Canvas 库
- [ProseMirror](https://prosemirror.net/) - 可逆操作栈架构灵感
