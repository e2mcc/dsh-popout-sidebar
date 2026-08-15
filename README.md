# 具有独立标签页的侧边栏 · Standalone Tab Sidebar

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web UI 增加一个展示**产物（artifacts）**的侧边栏，并支持把侧边栏内容弹出为**独立网页标签页**，拖到另一块显示器上观看。

> A sidebar for the DeepSeek Harness Web UI that shows the agent's **artifacts** (files created/edited by `write` / `edit`), with the ability to pop the sidebar out into a **standalone web tab** viewable on another monitor.

## 特性 / Features

- 🗂 **产物侧边栏**：实时列出代理通过 `write` / `edit` 工具创建或修改的文件。
- 👀 **点击预览**：点击文件即可在面板内预览内容（超长内容自动截断）。
- ↗️ **独立标签页**：一键把侧边栏弹出为独立网页标签页（`/artifacts-panel`），每 1.5s 自动刷新，可拖到另一块显示器。
- 🎨 **主题一致**：面板与标签页都跟随主界面浅色 / 深色主题（使用 `--dsw-alias-*` 主题变量）。
- 🧹 **清空 / 关闭**：面板内一键清空列表或关闭面板。

## 工作原理 / How it works

- **Host（Node 进程）**
  - 监听 `tools/result` 事件，追踪 `write` / `edit` 的成功调用并提取 `file_path`。
  - 通过 `harness.handle` 暴露三个包私有 RPC：`artifacts.list`、`artifacts.read`、`artifacts.clear`。
  - 通过 `webServer.register` 提供三个路由：`/artifacts-panel`（页面）、`/artifacts-panel/data`（JSON）、`/artifacts-panel/content`（预览）。
- **Client（浏览器）**
  - 在 `conversation.session.header.utilities` 注册「产物」按钮（顶部最右侧）。
  - 在 `shell.overlay` 渲染浮动侧边栏面板。
  - 通过 `host.call` 拉取数据，并读取当前主题把 `scheme` 传给独立标签页。

## 目录结构 / Layout

```
.
├── README.md
├── LICENSE
├── package.json
└── src
    ├── host.js     # Host 半：产物追踪 + RPC + webServer 路由（独立标签页）
    └── client.js   # Client 半：按钮 + 浮动侧边栏面板
```

## 使用 / Usage

这是一个面向 DeepSeek Harness 的**动态 Cordis 插件**。`src/host.js` 与 `src/client.js` 的内容分别是传给
`cordis_define` 的 `code.host` 与 `code.client`（「返回 Cordis Plugin 的纯 JavaScript 函数体」）。

加载方式：

1. 在 Harness 会话中调用 `cordis_define`，`code.host` 填入 `src/host.js` 的 `return { ... }` 主体，`code.client` 填入 `src/client.js` 的 `return { ... }` 主体。
2. 调用 `cordis_run` 激活返回的 `pluginId` / `packageId`。
3. 在会话顶部最右侧点击「产物」按钮打开侧边栏；点面板右上角 ↗ 打开独立标签页。

> 注意：动态插件是进程级、临时的；重启 Harness 进程后需重新 `cordis_define` / `cordis_run`。

## 主题 / Theming

面板与标签页使用与主界面相同的主题色值（来自 `@deepseek-ai/dsh-client-ui-theme` 的 `design-platform.css`）。
标签页通过 `?scheme=dark|light` 参数跟随主界面当前配色方案。

## License

[MIT](./LICENSE)
