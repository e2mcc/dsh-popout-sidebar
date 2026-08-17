# 可弹出式侧边栏 · Popout Sidebar

**可弹出式侧边栏**：侧边栏展示产物与文件树，支持多种文件预览形式；并可弹出为独立浏览器标签页（可拖至另一显示器上更大更清晰的观看）；兼容其他 sidebar 插件，可以同时显示。

> **Popout Sidebar**: a sidebar that lists the agent's artifacts and a file tree, with multiple preview formats, and pops out into a separate browser tab (drag it to another monitor for a larger, clearer view) — coexisting with other sidebar plugins at the same time.

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web UI 增加一个展示**产物（artifacts）**与**文件树**的侧边栏，并可一键弹出为**独立浏览器标签页**。

## 已上线 / Now available

本插件已收录进 DeepSeek Harness 插件生态：

| 渠道 | 入口 |
|---|---|
| 插件精选列表 | [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com/) · [详情页](https://awesome-dsh-plugin.com/zh/p/e2mcc/dsh-popout-sidebar/) |
| 插件市场 | [dsh-market](https://github.com/dsh-market/dsh-market)（DSH 内：设置 → Plugin Market） |

### 一键安装（推荐）

先装市场：

```sh
dsh plugin --profile web add dshmarket
```

重启 `dsh web` 后，打开 **设置 → Plugin Market**，搜索 **popout** 或 **sidebar**，点「安装」。

或直接按注册表命令安装：

```sh
dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar
```

装完**重启 `dsh web`** 并**硬刷新浏览器**（Cmd/Ctrl+Shift+R），界面右上角出现常驻「产物」图标按钮（无会话时也可见）。

## 特性 / Features

- ↗️ **弹出为独立标签页**：一键把侧边栏弹出为独立网页标签页（`/popout-sidebar`），每 1.5s 自动刷新，可拖到另一块显示器上更大、更清晰地观看。
- 🗂 **产物侧边栏**：实时列出代理通过 `write` / `edit` 创建或修改的文件，以及 `bash` / `pwsh` 命令在工作区里产生的文件（如脚本生成的图片）；列表与预览区之间的分界线可拖动调整。
- 🌳 **文件树**：侧边栏与独立标签页内都有「文件树」，可浏览当前工作区目录（懒加载展开，点击文件即预览），并**实时跟随工作区切换**。
- 👀 **多类型预览**：按文件类型预览——代码 / 纯文本（语法高亮 + 行号）、Markdown 渲染、图片、HTML（沙箱 iframe），超长内容自动截断。
- 📝 **编辑差异**：`edit` 修改过的文件在预览里展示「删除 / 新增」改动片段对比。
- 🔗 **复制 / 引用**：一键复制文件路径，或把 `@path` 引用写入会话输入框（悬浮在列表行）。
- 🧭 **与其他 sidebar 兼容**：其他「侧边卡片」打开时，本侧边栏自动让位到其左侧，两者同时可见。
- ⚙️ **设置面板**：DSH 设置里新增「Popout Sidebar」选项卡，可开关默认展开、自动刷新、文件树，设置最短面板宽度（存于 `localStorage`）；面板更宽可通过拖动左边缘调整。
- 🗑 **清除模式**：右上角进入清除模式后，点击产物将其标红，再点红色 × 移除列表条目（仅移除条目，不动磁盘文件）。
- ✖️ **关闭**：点击右上角「产物」图标按钮收起面板。

## 工作原理 / How it works

- **Host（Node 进程）**
  - 监听 `tools/result` 事件，追踪 `write` / `edit` 的成功调用并提取 `file_path`（`edit` 额外记录 `old_string`/`new_string` 改动片段，并按扩展名标注预览类型）。
  - 监听 `tools/execute` 事件，对 `bash` / `pwsh` 这类「不透明」执行器做工作区前后快照对比（`fs.listDir` 递归 + 版本 token 指纹，跳过 `node_modules`/`.git` 等大目录），把命令间接新增/改写的文件并入产物列表。
  - 通过 `harness.handle` 暴露 RPC：`artifacts.list`、`artifacts.read`、`artifacts.remove`、`artifacts.listDir`。
  - 通过 `webServer.register` 提供路由：`/popout-sidebar`（页面）、`/popout-sidebar/data`（JSON）、`/popout-sidebar/content`（文本预览）、`/popout-sidebar/media`（二进制图片）、`/popout-sidebar/remove`（移除条目）、`/popout-sidebar/listdir`（目录列表）。
- **Client（浏览器）**
  - 在 `shell.overlay`（root 作用域）注册一个固定于**右上角**的常驻「产物」图标按钮，无会话时依然可见。
  - 在 `shell.overlay` 渲染浮动侧边栏面板。
  - 订阅 session store、并通过跨标签页 `localStorage` 同步当前会话，让侧边栏与独立标签页的**文件树实时跟随工作区切换**（行为一致）。

## 目录结构 / Layout

```
.
├── README.md
├── LICENSE
├── package.json          # 静态 bundle 元数据（main / exports ./client / dsh.bundle / dsh.client）
├── cordis.patch.yml      # bundle 挂载补丁（dsh plugin add 自动识别）
├── scripts
│   ├── build.js          # 组装脚本：把 src/{shared,host,client} 拼成下面的两个单文件 bundle
│   └── precommit.sh      # 提交前守护：自动重建 bundle，产物过期则拦截提交
└── src
    ├── index.js          # 静态 Host 入口（ESM）：求值 host.js 主体并导出给 loader
    ├── host.js           # ⚙️ 生成产物：Host 单文件（由 scripts/build.js 生成，勿手改）
    ├── client.js         # ⚙️ 生成产物：Client 单文件 bundle（由 scripts/build.js 生成，勿手改）
    ├── shared/           # 两端共享的可复用纯函数（可移植 JS，无模板字符串）
    │   ├── ext.js        #   扩展名 → 预览类型（extType / fileExt）
    │   ├── markdown.js   #   极简 Markdown → HTML（含代码块高亮）
    │   └── highlight.js  #   零依赖语法高亮器（tok-* token）
    ├── host/             # Host 半模块（Node 进程）
    │   ├── body.js       #   骨架：inject / apply + 占位符
    │   ├── core.js       #   常量 + 产物追踪 + 文件操作 + RPC
    │   ├── page.js       #   独立标签页 HTML（内联 script 引用 shared）
    │   └── routes.js     #   /popout-sidebar/* HTTP 路由
    └── client/           # Client 半模块（浏览器）
        ├── body.js       #   骨架：__ModuleLoader__ 工厂 + 占位符
        ├── core.js       #   store / settings / 会话辅助
        ├── styles.js     #   注入的 CSS
        ├── icons.js      #   内联 SVG 图标
        ├── preview.js    #   renderPreview / CodeView / diff
        └── components.js #   FileTree / ArtifactsPanel / 设置面板
```

> 修改 `src/shared/`、`src/host/`、`src/client/` 里的源码后，运行 `npm run build`（或 `node scripts/build.js`）重新生成 `src/host.js` 与 `src/client.js`，再提交。运行时 DSH 只加载这两个生成产物。
>
> 建议安装提交前守护（一次即可）：`ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit`。之后每次 `git commit` 会自动重建 bundle，若产物与源码不同步会直接拦截提交，杜绝「源码新、产物旧」。

## 使用 / Usage

本插件同时支持**静态安装**（推荐，持久生效）与**动态加载**（临时）。

### 静态安装（推荐）

前置：DSH 已装好（`dsh web` 能正常运行）。

```sh
# 通过注册表（GitHub 源码）
dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar

# 或通过 dsh-market 市场：装好市场后在 设置 → Plugin Market 里一键安装
```

装完**重启 DSH 服务**（host 半加载）并**硬刷新浏览器**（Cmd/Ctrl+Shift+R），界面右上角即出现常驻「产物」图标按钮。

- 包内 `cordis.patch.yml`（`dsh.bundle.patch`）让 CLI 自动把它挂进 `dsh.profile.bundles`；
- client 半由 `package.json` 的 `dsh.client.platform: "web"` + `exports["./client"]` 自动发现并加载；
- 本地开发用 `dsh plugin --profile web add /绝对路径/dsh-popout-sidebar` 会安装为符号链接，改 `src/` 后重启服务 / 硬刷新即可生效。

### 动态加载（临时，进程级）

`src/host.js` 与 `src/client.js` 的 `return { ... }` 主体仍可直接传给 `cordis_define`：

1. 在 Harness 会话中调用 `cordis_define`：`code.host` 填 `src/host.js` 的 `return { ... }` 主体；`code.client` 填 `src/client.js` 的 `return { ... }` 主体。
2. 调用 `cordis_run` 激活返回的 `pluginId` / `packageId`。
3. 点击「产物」按钮；点面板右上角 ↗ 打开独立标签页。

> 两种模式下 host 与 client 都通过 `/popout-sidebar/*` HTTP 路由通信（动态模式另保留 `harness.handle` RPC 兼容），因此行为一致。

## 设置 / Settings

在 DSH 设置面板（左下角 ⚙️）里会多出一个「**Popout Sidebar**」选项卡：

| 设置 | 默认 | 说明 |
|---|---|---|
| 默认展开 | 开 | 页面加载后侧边栏默认展开；关闭则默认收起 |
| 自动刷新 | 开 | 面板打开时每 2s 拉取最新产物列表 |
| 文件树 | 开 | 在侧边栏显示「文件树」标签页，浏览工作区目录 |
| 最短面板宽度 | 20% | 面板最小宽度（占窗口宽度的百分比，20–60%）；更宽可拖动面板左边缘调整 |

> 右上角的「产物」图标按钮、独立标签页按钮（↗）、以及「自动让位到其他侧边栏左侧」均为常驻行为，无需开关。

设置保存在浏览器 `localStorage`（键 `dsh-popout-sidebar:settings`），刷新后仍然生效。

## 主题 / Theming

- 侧边栏**面板**跟随主界面浅色 / 深色主题（使用 `--dsw-alias-*` 主题变量）。
- 独立**标签页**刻意固定为浅色配色（保证在另一显示器上内容清晰稳定）；如需深色，可在地址后手动加 `?scheme=dark`。

## 更新 / Updates

- 本插件从 **GitHub 源码**安装（未发布 npm），更新按 **commit 比对**：`dsh-market` 的「更新」会自动比对本地锁定的 commit 与仓库当前 HEAD，检测到新提交即提示「更新可用」，点一下即可升级。
- 命令行更新：`dsh plugin --profile web update dsh-popout-sidebar`（或重新 `add`），随后重启 `dsh web` 并硬刷新浏览器。

## License

[MIT](./LICENSE)
