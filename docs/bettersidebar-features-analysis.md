# better-sidebar 功能分析：哪些值得并入本项目

> 分析对象：[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（一个服务化的 DSH 侧边栏工作台）
> 分析基准：本仓库 `dsh-standalone-tab-sidebar` v1.0.0（产物侧边栏 + 独立标签页）
> 可行性依据：DSH Host / Client 当前实际暴露的 Cordis 服务（`cordis_inspect_*` 实测目录）

---

## 0. 一句话结论

better-sidebar 是「**重工作台**」（文件管理器 + 编辑器 + 终端 + Git + 子代理 + 生态 API），你的插件是「**轻产物面板**」（追踪代理产出的文件 + 弹出独立标签页）。不要整体照搬，而是**挑选与「产物」场景强相关、且 DSH 现有服务足以支撑的 8 个功能**，按三个优先级分阶段加入；终端 / Git / 后台任务这三块建议独立成插件，不要并入。

---

## 1. 定位对比

| 维度 | better-sidebar | 本项目 |
|---|---|---|
| 定位 | 右侧栏 + 底部面板双工作台，7 tab + 6 viewer 的完整 IDE | 产物侧边栏 + 独立网页标签页 |
| 核心数据 | 工作区文件 / 网页 / 终端 / Git / 子代理 | 代理 `write`/`edit` 产出的文件 |
| 服务化 | `ctx.betterSidebar` 开放给所有插件 | 无 |
| 预览 | CodeMirror 编辑 + 图片/Markdown/HTML/PDF/Office 内联 | 纯文本 `<pre>`（200KB 截断） |
| 持久化 | 布局/Tab/面板按会话持久化 | 无（host 内存态，刷新即丢） |
| 设置 | 声明式设置 + 齿轮弹窗 | 无（刷新间隔/截断上限硬编码） |
| 多语言 | zh/en 跟随 DSH | 中英混杂硬编码 |

---

## 2. 功能逐项分析

评级说明：**S** = 直接强化现有「产物」核心，强烈推荐；**A** = 值得新增，性价比高；**B** = 架构级升级，价值大投入大；**C** = 不建议并入。

### S 级 · 直接强化现有核心

#### S1. 多类型内联预览（Markdown / 图片 / HTML）⭐ 最推荐

- **现状**：预览永远是 `<pre>` 纯文本，而代理最常产出 `.md`、`.png/.jpg`、`.html`（better-sidebar 的内置 viewer 正是图片 / Markdown / HTML 三件套）。
- **可行性（已实测）**：Host `fs` 服务提供 `readBytes(target, signal, maxBytes)`（图片）、`readText`（文本）；`webServer.register` 加一条 `/artifacts-panel/media?path=...` 路由返回原始字节即可喂给 `<img>`；HTML 走沙箱 `iframe sandbox="allow-scripts"`（better-sidebar 的做法：内容跑在沙箱 iframe，外链按协议分流）。
- **落点**：host.js 扩展 `readFile` 分支 + 新增 media 路由；client.js 按扩展名分发渲染器，Markdown 渲染库懒加载（见 A8）。
- **工作量**：中（约 2–3 天，含懒加载）。

#### S2. 「编辑」产物的 Diff 视图（改动片段）⭐ 高性价比

- **现状**：host 已区分 `create`/`edit`，但只存了最终文件内容——`edit` 到底改了什么看不出来。better-sidebar 的 Git 面板主打真 diff，但你的场景**不需要 Git**：`edit` 工具参数里就带 `old_string` / `new_string`。
- **可行性**：host 在 `tools/result` 里已有 `exec.arguments`（见 host.js:45），只需在 `recordFile` 时把 edit 的 old/new 片段一并记录；client 预览区渲染成「红-删 / 绿-增」的片段对比，就是 VSCode 式 diff 的轻量子集。
- **落点**：host.js 数据模型加 `before`/`after` 字段；client.js 预览加 diff 视图；独立标签页同步受益。
- **工作量**：小–中（1–2 天）。这是整个清单里性价比最高的一项。

#### S3. 复制路径 / 「@文件」引用进输入框

- **现状**：better-sidebar 快捷键表：右键行 → 复制相对/绝对地址；悬浮行尾 `@文件` 按钮 → 引用到输入框。
- **可行性**：复制路径是纯 client 工作（`navigator.clipboard`，零依赖）；「@文件 插入输入框」需要 DSH 的输入框注入点——better-sidebar 已实现同类功能，说明存在路径，但本项目需先调研 DSH client 是否公开 message-input API / slot（未在 Client 服务目录中直接看到，可能走 DOM 或私有 RPC，标注为**需调研项**）。
- **工作量**：复制路径 小；@引用 小–中（取决于注入点）。

### A 级 · 值得新增

#### A4. 文件工作台（工作区目录树浏览）

- **现状**：只能看「代理碰过的文件」；better-sidebar 的资源管理器是懒加载目录树。
- **可行性**：Host `fs.listDir(target)` 直接可用；更省事的是 Client `workspaces.listDirectory(path)`（已实测存在，返回 `DirectoryListing`）——**client 侧无需新增任何 host 路由**即可实现目录树。做成产物列表旁的第二个视图（Tab 切换），复用现有读取路由。
- **工作量**：中（2–3 天）。

#### A5. 会话隔离与持久化

- **现状**：host 的 artifacts 是进程内存态，浏览器刷新/切换会话即丢；better-sidebar 布局/Tab/面板按会话持久化、陈旧状态自动净化。
- **可行性**：host 已存 `sessionId`（host.js:50）——可增加「按当前会话过滤 / 清空陈旧会话产物」；client 把面板开合、选中项、预览模式按 `sessionId` 存 localStorage（无需服务端改动）。
- **工作量**：小–中（1 天）。

#### A6. 声明式设置（面板内设置弹窗）

- **现状**：刷新间隔 2000ms、截断 200KB、宽度 380px 全部硬编码。
- **可行性**：Host `settings` 服务（`register`/`get`/`update`，已实测存在）可做全局默认值；轻量做法直接 localStorage。至少暴露：自动刷新开关与间隔、预览模式（纯文本/Markdown/图片/HTML）、截断上限、默认面板宽度。
- **工作量**：中（走 host `settings`）或 小（仅 localStorage）。

#### A7. 多语言（zh/en 跟随 DSH）

- **现状**：client 中英混杂硬编码（「产物 Artifacts」「暂无产物 — …」）。
- **可行性**：Client `locale` 服务（`register(ns, dicts)` + `bind(ns)`，已实测存在）实时跟随 DSH 语言，与 better-sidebar 完全同机制。
- **工作量**：小（半天）。

#### A8. 按需加载（lazy chunks）

- **现状**：零依赖，无所谓；但 S1（Markdown/高亮）一旦引入重依赖就必须定策略——better-sidebar 启动只拉 ~325KB 核心，终端/编辑器按需拉取。
- **落点**：把 Markdown 渲染器 / diff 渲染器放到独立脚本，点击对应文件时才 `import()`（动态模式下 `host.call` 拉内容、浏览器端 lazy import 渲染库）。
- **工作量**：小–中（工程约束，随 S1 一起做）。

### B 级 · 架构升级（价值大、投入大，择机做）

#### B9. 服务化 API（`registerTab` / `registerFileViewer`）

- better-sidebar 的核心理念：`ctx.betterSidebar` 服务开放给所有插件，**内置的 7 tab + 6 viewer 与第三方插件通过同一 API 注册，能力对等**（含能力探测、状态订阅、tab 角标、生命周期回调、`meta` 跨刷新持久化、插件自有设置）。
- 对项目的意义：从「一个产物面板」变成「侧边栏生态平台」，第三方插件可注册新 Tab 与新的文件预览器。
- **落地代价**：需要 host 注册一个 Cordis Service，把注册表通过私有 RPC / 状态同步分发到 client 渲染——跨 host/client 的服务分发机制是本项目目前完全没有的，工作量最大。
- **工作量**：大（1–2 周）。建议在 S/A 级功能稳定、架构清晰后再做，且可以先做**只读子集**：`registerFileViewer`（第三方注册「某扩展名文件怎么预览」）比完整 tab 注册 API 简单得多、对产物场景价值更直接。

#### B10. 内嵌浏览器（沙箱 iframe + 多开网页 tab）

- 完整版（多开 tab、后退/前进/刷新、外链按协议分流 HTTP 走侧边栏 / HTTPS 走系统浏览器）是独立功能，与产物场景弱相关。
- **轻量子集已包含在 S1**（HTML 产物用沙箱 iframe 预览），建议只做这个子集，完整浏览器不并入。

### C 级 · 不建议并入（建议独立插件）

| 功能 | 技术可行性（已实测） | 不建议并入的原因 |
|---|---|---|
| **真实终端**（xterm.js + PTY） | Host 有 `subprocess.spawnTerminal`、`terminals` 服务、`webServer.registerUpgrade`（WebSocket），better-sidebar 即 `/sidebar/ws/terminal` 路由 | 与「产物」定位无关；node-pty 构建重（better-sidebar 自己也在 Windows 遇到构建问题）；维护成本高 |
| **Git 面板**（真 diff/历史/暂存/提交/还原） | Host `shell` 或 `subprocess` 可跑 git | 完整版是 IDE 级功能；你的场景用 S2 的 edit 级 diff 即可覆盖 80% 诉求；完整面板适合独立插件 |
| **后台任务页**（subagent 拓扑 + 任务输出/强杀） | Host `subagents.listChildren/listDescendants`、`jobs` 服务齐全 | 与产物场景不同域；DSH 本体已有子代理视图，重复建设；适合独立插件 |

> 另注：better-sidebar 的「右侧栏 + 底部面板双工作台」「拖 Tab 拆分/合并分栏」是工作台级交互，与你「轻量产物 + 独立标签页」的定位冲突，不建议引入；若想增强布局，先做面板宽度可拖拽调整即可。

---

## 3. 推荐路线图

### Phase 1 · 快赢（1–2 天，纯增量、无新依赖）
- **S2** edit 产物 diff 片段视图（host 记录 old/new，client 渲染红绿对比）
- **S3** 右键/悬浮复制路径（clipboard）；调研并实现「@文件」插入输入框
- **A5** 面板开合 / 选中项按 sessionId 持久化（localStorage）
- **A7** 接入 client `locale` 服务，抽离全部文案

### Phase 2 · 预览升级（2–4 天，引入第一个新依赖）
- **S1** 图片 / Markdown / HTML 内联预览 + `/artifacts-panel/media` 路由 + 沙箱 iframe
- **A8** 渲染库懒加载（与 S1 同时落地，保持启动轻量）
- **A4** 产物列表旁加「工作区」Tab：`workspaces.listDirectory` 懒加载目录树
- **A6** 面板内设置弹窗（自动刷新开关/间隔、预览模式、截断上限；先 localStorage，后续可迁 host `settings`）

### Phase 3 · 架构（1–2 周，择机）
- **B9** 服务化：先 `registerFileViewer`（第三方注册扩展名预览器），再考虑完整 `registerTab`
- 若确有需要，再评估 Git / 终端 / 后台任务是否以独立插件形态与侧边栏联动

---

## 4. 技术落点速查（对本仓库代码）

| 功能 | host.js | client.js | 独立标签页（/artifacts-panel） |
|---|---|---|---|
| S1 多类型预览 | `readFile` 分支 + 新增 `/artifacts-panel/media` 路由（`fs.readBytes`） | 按扩展名分发渲染器；HTML 沙箱 iframe | 同步支持（页面已复用同一路由） |
| S2 edit diff | `recordFile` 记录 `before`/`after` 片段 | 预览区 diff 视图 | 同步支持 |
| S3 复制/@引用 | 无需改动 | clipboard + 输入框注入（待调研） | 无需改动 |
| A4 工作区树 | 无需改动（用 client `workspaces.listDirectory`）或加 `fs.listDir` 路由 | 新增视图 Tab | 可选 |
| A5 会话持久化 | artifacts 按 sessionId 过滤/净化 | localStorage 按 sessionId | 可选 |
| A6 设置 | （可选）`settings` 服务注册命名空间 | 设置弹窗 | 读取同一配置 |
| A7 多语言 | 无需改动 | `locale.register` + `bind` | 页面内文案同样可读 locale |
| B9 服务化 | 注册 Cordis Service + RPC 分发 | 消费注册表渲染 | — |

---

## 5. 参考

- [omdsh-dev/DSH-better-sidebar（GitHub）](https://github.com/omdsh-dev/DSH-better-sidebar) —— 功能清单 / 架构（`/sidebar/api/*` JSON API、`/sidebar/ws/terminal` WebSocket、`ctx.betterSidebar` 服务化 API）
- [DSH-better-sidebar README（raw）](https://raw.githubusercontent.com/omdsh-dev/DSH-better-sidebar/main/README.md)
- 本仓库：`src/host.js`、`src/client.js`、`src/index.js`
