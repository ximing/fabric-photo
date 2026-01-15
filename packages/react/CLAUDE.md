# packages/react — @gmi/fp-react 组件包

## 这个目录负责什么

- Figma 式 React 组件包：顶栏 / 工具栏 / 选项条 / 画布 / 属性面板，零编辑逻辑

## 放置约束

- `src/` 扁平组织：组件（`*.tsx`）与 hooks；测试与源文件同目录平铺
- 样式 Tailwind（`fp-` 前缀，preflight 关闭），产物 `dist/style.css` 需显式 import

## 开发约束

- 组件是 state 的函数：经 hooks（`useEditorState` / `useEditorEvent`）订阅 core，所有操作走 core 的公开 API，组件内不写任何编辑逻辑
- 只允许 import `@gmi/fp-core` 的公开 API（`packages/core/src/index.ts` 导出面），不得触碰 core 内部路径
- 不得暴露 fabric 类型
- 新 UI → react 组件：hooks 订阅 state/事件，交互一律经 core 公开 API 发起
- 新公开组件 / hooks → 同步更新 `packages/react/README.md` 的组件清单
