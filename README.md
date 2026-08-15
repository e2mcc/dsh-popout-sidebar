# 具有独立标签页的侧边栏 · Standalone Tab Sidebar

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web UI 增加一个展示**产物（artifacts）**的侧边栏，并支持把侧边栏内容弹出为**独立网页标签页**，拖到另一块显示器上观看。

> A sidebar for the DeepSeek Harness Web UI that shows the agent's **artifacts** (files created/edited by `write` / `edit`), with the ability to pop the sidebar out into a **standalone web tab** viewable on another monitor.

## 特性 / Features

- 🗂 **产物侧边栏**：实时列出代理通过 `write` / `edit` 工具创建或修改的文件。
- 👀 **多类型预览**：按文件类型预览——纯文本 / Markdown 渲染 / 图片 / HTML（沙箱 iframe），超长内容自动截断。
- 📝 **编辑差异**：`edit` 修改过的文件在预览里展示「删除 / 新增」的改动片段对比。
- 🔗 **复制 / 引用**：一键复制文件路径，或把 `@path` 引用写入会话输入框（悬浮在列表行）。
- ↗️ **独立标签页**：一键把侧边栏弹出为独立网页标签页（`/artifacts-panel`），每 1.5s 自动刷新，可拖到另一块显示器。
- 🎨 **主题一致**：面板与标签页都跟随主界面浅色 / 深色主题（使用 `--dsw-alias-*` 主题变量）。
- 🧭 **与 better sidebar 并排**：当 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的「侧边卡片」打开时，本侧边栏自动让位到其左侧，两者同时可见（通过读取其 `--dsh-sidebar-width` 变量实现，默认开启）。
- ⚙️ **设置面板**：在 DSH 设置里新增「单页侧卡」选项卡，可开关顶部按钮 / 并排显示 / 自动刷新 / 独立标签页，并调整面板宽度（存于 `localStorage`）。
- 🗑 **删除模式**：面板右上角进入删除模式后，点击产物将其标红（红框），再点红色 × 删除该产物；删除仅移除列表条目，不动磁盘文件。
- ✖️ **关闭**：面板右上角一键关闭面板。

## 工作原理 / How it works

- **Host（Node 进程）**
  - 监听 `tools/result` 事件，追踪 `write` / `edit` 的成功调用并提取 `file_path`（`edit` 额外记录 `old_string`/`new_string` 改动片段，并按扩展名标注预览类型）。
  - 通过 `harness.handle` 暴露三个包私有 RPC：`artifacts.list`、`artifacts.read`、`artifacts.remove`。
  - 通过 `webServer.register` 提供路由：`/artifacts-panel`（页面）、`/artifacts-panel/data`（JSON）、`/artifacts-panel/content`（文本预览）、`/artifacts-panel/media`（二进制图片）、`/artifacts-panel/remove`（删除单条产物）。
- **Client（浏览器）**
  - 在 `conversation.session.header.utilities` 注册「产物」按钮（顶部最右侧）。
  - 在 `shell.overlay` 渲染浮动侧边栏面板。
  - 通过 `host.call` 拉取数据，并读取当前主题把 `scheme` 传给独立标签页。

## 目录结构 / Layout

```
.
├── README.md
├── LICENSE
├── package.json        # 静态 bundle 元数据（main / exports ./client / dsh.bundle / dsh.client）
├── cordis.patch.yml    # bundle 挂载补丁（dsh plugin add 自动识别）
└── src
    ├── index.js        # 静态 Host 入口：求值 host.js 主体并导出给 loader
    ├── host.js         # Host 半主体：产物追踪 + webServer 路由（独立标签页）
    └── client.js       # Client 半：按钮 + 浮动侧边栏面板（静态 client bundle）
```

## 使用 / Usage

本插件同时支持**静态安装**（推荐，持久生效）与**动态加载**（临时）。

### 静态安装（推荐）

前置：DSH 已装好（`dsh web` 能正常运行）。

```sh
dsh plugin --profile web add /绝对路径/dsh-standalone-tab-sidebar
```

装完**重启 DSH 服务**（host 半加载）并**硬刷新浏览器**（Cmd/Ctrl+Shift+R），会话顶部最右侧即出现「产物」按钮。

- 包内 `cordis.patch.yml`（`dsh.bundle.patch`）让 CLI 自动把它挂进 `dsh.profile.bundles`；
- client 半由 `package.json` 的 `dsh.client.platform: "web"` + `exports["./client"]` 自动发现并加载；
- 目录方式安装后是符号链接，改 `src/` 后重启服务 / 硬刷新即可生效。

### 动态加载（临时，进程级）

`src/host.js` 与 `src/client.js` 的 `return { ... }` 主体仍可直接传给 `cordis_define`：

1. 在 Harness 会话中调用 `cordis_define`：`code.host` 填 `src/host.js` 的 `return { ... }` 主体；`code.client` 填 `src/client.js` 中 `const plugin = (() => {` 内的 `return { ... }` 主体。
2. 调用 `cordis_run` 激活返回的 `pluginId` / `packageId`。
3. 点击「产物」按钮；点面板右上角 ↗ 打开独立标签页。

> 两种模式下 host 与 client 都通过 `/artifacts-panel/*` HTTP 路由通信（动态模式另保留 `harness.handle` RPC 兼容），因此行为一致。

## 设置 / Settings

在 DSH 设置面板（左下角 ⚙️）里会多出一个「**单页侧卡**」选项卡，包含以下开关：

| 设置 | 默认 | 说明 |
|---|---|---|
| 显示顶部按钮 | 开 | 在会话顶部右侧显示「产物」触发按钮 |
| 与 better sidebar 并排显示 | 开 | 当 better sidebar 打开时，本侧边栏让位到其左侧，避免被遮挡 |
| 自动刷新 | 开 | 面板打开时每 2s 拉取最新产物列表 |
| 独立标签页按钮 | 开 | 面板右上角显示 ↗ 弹出到独立标签页 |
| 面板宽度 | 380px | 面板宽度（260–640px） |

设置保存在浏览器 `localStorage`（键 `dsh-standalone-tab-sidebar:settings`），刷新后仍然生效。

## 主题 / Theming

面板与标签页使用与主界面相同的主题色值（来自 `@deepseek-ai/dsh-client-ui-theme` 的 `design-platform.css`）。
标签页通过 `?scheme=dark|light` 参数跟随主界面当前配色方案。

## License

[MIT](./LICENSE)
