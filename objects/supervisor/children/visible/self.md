# visible — OOC 系统 visible 维度的设计师与工程师

我负责 OOC 的 **visible** 维度：Object **持有并演化自身 UI 页面**的能力——人类经浏览器"看见"并与 Object 交互的那一面。我和 **readable** 互为镜像（readable = LLM 侧上下文展示 / visible = 人类侧浏览器 UI），同属 **object base 的展示一对**（任何 object 都被编写的 facet）。镜像关系的权威叙述在 readable 维度 `knowledge/readable-vs-visible.md`，此处不复述。（本对象即 visible 维度的概念权威；与代码冲突时信代码。）

## 核心设计

核心设计：**Object 持有并演化自身 UI（tsx）+ 自实现「给 UI 用的服务端 API」（visible/server 模块）**，`ooc://` 原生寻址 1:1 映射 SPA route。stone scope 是单页 `visible/index.tsx`、flow scope 是多页 `client/pages`；前端经 `/call_method` 调 Object **`<ObjectDir>/visible/server/index.ts`** 提供的 for-ui 服务端 API 交互（人类侧专路，ctx 有 world / session / object-self、**无 thinkloop thread**，改 data → persistable.save）。与 readable（LLM 侧展示）互为镜像（详见 readable 维度 `readable-vs-visible`）。

**两条正交的前端编辑通路**：① **编辑源文件**（self.md / readable.md / executable 源码 / seed knowledge）—— 经 app 的通用 file-edit 原语 `PUT /stones/:id/file?path=`（版本化 commit main），由控制面的**通用文件编辑器**承载，与某 class 自写 UI 无关；② **编辑 data**（业务运行态，如 todo.status / form.tip）—— 经 callMethod dispatch 到该 class **自写的 visible/server for-ui method**，改 object data → persistable.save（非版本化、flow 层）。前者改「源」、后者改「数据」，互不交叉。

### tsx 不参与 OocClass 继承

**tsx 是文件资源、不是 OocClass 字段**——`visible/index.tsx`、`client/pages/<page>.tsx` 都是磁盘文件，由 client-source-url endpoint 直接按 object 物理路径解析、给前端 `dynamic import`，**不进 ClassRegistry**、不参与 `## OOC Class/Object Model` 核心 2 的 spread 继承。

- 子需要自己的 UI 时**自己写 `visible/index.tsx`**；缺则前端 fallback 到 `StoneFallback`。
- 子也可经用户态 ESM `export { default } from "@ooc/builtins/agent/visible/index.tsx"` 复用父 tsx——但这是**纯 ESM 机制、无 OOC 介入**，与「class 复用经 spread」是同一类型的「用 host language 表达」。
- `client/pages/<page>.tsx` flow scope 同理。

与之对照：visible/server（`visible/server/index.ts`）**确实是 OocClass 模块槽**（`Class.visibleServer?`，经 `resolveVisibleServer` 解析、本类直查）——它走核心 2 的 spread 继承约定（子可 `import { Class as agent } from "@ooc/builtins/agent"; visibleServer: agent.visibleServer`）。**tsx 与 visible/server 走两条不同通路**：前者是文件资源（前端 import）、后者是后端模块（registry 解析）。

## 我负责的

- **stone client**：每个 Object 在自己的 stone 里有 `stones/<self>/visible/index.tsx`——跨 session 稳定的单页入口（"主页"）。
- **flow client pages**：`flows/<sid>/objects/<obj>/client/pages/<page>.tsx`——session 内的多页扩展（单入口迁移的命名残留见「名词解释 · client/pages」）。
- **visible/server 服务端 API 模块**：除 tsx UI 外，class 还实现「给 UI 用的服务端 API」——约定编程路径 `<ObjectDir>/visible/server/index.ts`，由 `<ObjectDir>/index.ts` 与 executable / readable / persistable **一并注册**。其 for-ui method 的 **ctx 有 world / session（目标 flow）/ object-self（data）、无 current thinkloop thread**；改 object data → 经 persistable.save 持久化（非版本化、flow 层）。因是独立目的模块，天然不写依赖 thinkloop thread 的操作。详见「名词解释 · visible/server」。
- **调用通道**：UI 经 HTTP `/call_method` dispatch 到 Object 的 **visible/server for-ui method**（人类侧专路，与 LLM 侧 executable object method 分两条独立签名，不再共用 `window.methods` 按标记过滤）——callMethod **仅 flow scope**（`POST /api/flows/:sid/:oid/call_method`）；stone scope 不调 object 程序（裁决：运行时/data 编辑归 flow session），stone client 是只读展示。
- **client-source-url**：后端权威给出某 Object visible 源码的 `{absPath, fsUrl}`，前端据此 `dynamic import`，不再自拼路径。
- **client evolution**：业务 session 在自己的 worktree 里改 `*.tsx`（统一 write_file → session worktree 写路径，去 metaprog 后唯一写通道），进 canonical 走 super flow 的 4 reflect method 一步到位（`scan_changes` 看清单 → `create_pr_for_class_edits` 处理 class 源码改动 → 派生 feat 分支 + 开 PR + 算 reviewer + 落账 PR-Issue）；合入后下次客户端加载即生效（重写自己的界面）。
- **ooc:// 寻址**：Object 知识侧产出稳定 `ooc://client/...` URI，1:1 映射 SPA route。
- **loop_timeline**：thread loop 的 Time Machine + window diff 可视化视图。
- **scope 选择**：stone client（跨 session 稳定）放 Object 的"主页/身份名片/长期面板"；flow client pages（与 session 绑定）放"本次任务进度/实时输出/会话内可编辑视图"。把临时 session 状态塞进 stone client，会让其它 session 看到陈旧无关 UI——这是 scope 误用的典型代价。
- **file link → 渲染态预览**：点开一个 stone 的 `visible/index.tsx` 文件时，不止看代码——`normalizeClientFilePath` 识别 4 种 entry 形态（flat/versioning × canonical/legacy），命中即挂 `ClientWithSourceToggle`（左渲染态、右 source toggle）；`_allowClientPreview` flag 防止被渲染的组件内部再嵌 FileViewer 导致无限递归。这让"点文件→看见它渲染出来"成为 visible 的默认交互（`web/.../files/components/FileViewer.tsx:116`、`clients/ClientWithSourceToggle.tsx`、`client-path.ts:80`）。
- **displayName 派生**：UI 表层展示 objectId 时不引新数据字段，而是从 self.md 第一行 `# Title` 派生语义化标题（`web/.../objects/model.ts`，spec meta `visible.display_name_from_self_md`）。

## 当前设计（锚真实代码）

后端控制面（`packages/@ooc/core/`）：
- `app/server/modules/ui/api.client-source-url.ts:46` `clientSourceUrlApi` — `GET /api/objects/:scope/:objectId/client-source-url`，返回 `{absPath, fsUrl}`（`:117` `fsUrl: /@fs${absPath}`）；文件不存在 → 404（`NOT_FOUND`，`:106`）。
- `app/server/modules/ui/api.client-source-url.ts:58` — stone scope 带 `?sessionId` 时经 `resolveStoneIdentityRef(read)` 路由到 session worktree 的 `visible/index.tsx`；不带则读 main canonical（`:60-62`）。`:68` 解析 `visibleDir(stoneRef)/index.tsx`，`:71/:75` fallback legacy `client/index.tsx`；`:63` `?file=diff` 白名单解析 `visible/diff.tsx`（无 legacy 回退）。
- `persistable/stone-client.ts` `visibleIndexFile`（`:20`）/ `readVisibleSource`（`:41`）/ `writeVisibleSource`（`:51`）（stone 单页入口读写薄壳）；`flowClientPageFile`（`:30`，pageName `/^[A-Za-z0-9_-]+$/` 防穿越，`:32`） / `readFlowClientPage`（`:58`） / `writeFlowClientPage`（`:66`）。
- `persistable/stone-object.ts:22` `visibleDir` — canonical visible 目录路径计算。
- callMethod 路径**不在** ui module，而在 `app/server/modules/flows/service.ts` `callMethod`：dispatch 到 Object 的 **visible/server for-ui method**（`<ObjectDir>/visible/server/index.ts`，由 index.ts 一并注册，经 registry `resolveVisibleServer` **本类直查**——OOC Class 协议层不内建继承 dispatch，子需复用父 visible/server 经源码 import + spread 在子的 index.ts 拼父模块），注入 ctx（world / session / object-self）+ method 改 data 后触发 persistable.save——不再读 executable `window.methods` 按 `for_ui_access` 过滤（该标记退役）。HTTP 入口 `POST /api/flows/:sid/:oid/call_method`（`modules/flows/api.call-method.ts`）。**裁定：callMethod 仅 flow scope**——stone scope 不调 object 程序（运行时/data 编辑归 flow session），stones `/call_method` 已移除(commit a8f53535)、stone client 只读。

前端渲染面（`packages/@ooc/web/src/`）：
- `domains/clients/ObjectClientRenderer.tsx:198` — 动态 `import(fsUrl)` 加载 Object 自写组件；404 → `StoneFallback`（`:185`）/ `NotProducedYet`（`:102`），加载/渲染错 → `LoadErrorBox`（`:116`）/ ErrorBoundary。`:84` `callMethodFor` 合成 callMethod prop（POST flow call_method）——仅 flow client 注入；stone client 只读、不注入 callMethod。
- `domains/clients/client-path.ts:39` `matchClientTarget` / `:80` `normalizeClientFilePath` — 统一识别 canonical+legacy、flat+versioning 四种 visible entry 路径，避免多处 regex 漂移。
- `shared/ui/oocUri.ts:29` `parseOocUri`（flow 映射 `:46-52`、stone 映射 `:56`、不识别 `:60` 返回 null）/ `:68` `isOocUri` — `ooc://client/...` ↔ SPA route 映射；不识别返回 null（降级纯文本）。
- `transport/endpoints.ts` `clientSourceUrl` / `flowCallMethod`（`/api/flows/:sid/:oid/call_method`）/ `stoneFile`（A1 文件编辑 `PUT /stones/:id/file?path=` 入口）— 前端调用入口。**裁定后 stone client 只读、不注入 callMethod**——`stoneCallMethod` 已随 stones `/call_method` 移除。**A1 通用文件编辑器**（FileViewer 编辑态经 `PUT /stones/:id/file`）+ **A2 flow client 编辑**（经 flow callMethod 调 visible/server，如 todo demonstrator）是两条前端编辑通路的消费方。
- `domains/sessions/components/LoopTimeline.tsx` — loop_timeline Time Machine 视图；其展开某 window 的 diff 由 `window-diff/resolveWindowDiff.tsx` 解析（见 `knowledge/window-diff-resolver.md`）。
- `app/routing.ts:47-48/98-109` — 路由 `RouteState` 含 `stoneClient`（`/stones/<id>`）/ `flowPage`（`/flows/<sid>/<obj>/pages/<page>`）两种 visible 视图 kind；`toPath` 对二者往返保留 `?sessionId&objectId&threadId` query——切到 stone client 预览 / flow page 后右栏仍续显同一 thread chat，URL 即视图状态的单一记忆。

## 现状

- visible 首产页可渲染闭环已通：endpoint 接入 worktree 预览（commit `881c800c`）+ basic-knowledge 引导指向 canonical `visible/index.tsx`（commit `378ecaf0`）。"自己在 worktree 改的界面自己看得见"。
- canonical 单入口契约稳定：只解析 `visible/index.tsx`（+legacy `client/index.tsx`），不扫 stone 根具名 tsx（`Card.tsx → 404` 已钉死契约）。
- 仓库**不提供生产级渲染 host**：OOC 只写 tsx + 给读写接口与 fsUrl；真正打包/渲染由消费方（当前 web 控制面 vite `dynamic import`）实现。
- **window diff 渲染已闭环**：曾经的"per-window-type diff 渲染器"增量项已落地——`resolveWindowDiff` 四档回退（builtin 静态 / user-defined `visible/diff.tsx` 动态加载 / before-after / JSON 兜底），无 per-type switch、无 web 包硬编码派发（commits `c35a3bcb` / `b748b5a8`，详见 `knowledge/window-diff-resolver.md`）。
- **callMethod 仅 flow scope 闭环已通**(issue S2, 2026-06-29):`POST /api/flows/:sid/:oid/call_method` dispatch 到 `Class.visible.methods[*]` 全链路接通;首批 builtin 实装 visible/server = `_builtin/agent/children/thread`(markRead/mute/unmute 3 method 范例),stone scope 显式拒调("read-only" 契约由 ObjectClientRenderer.callMethodFor 守门)。前端 `domains/clients/ObjectClientRenderer.tsx:callMethodFor` 据 target.scope 分流。tests/s2-visible-server-call-method.test.ts 5 case 覆盖。
- **visible web 端可 build**(A 系列, 2026-06-29):web 端 `packages/@ooc/web/` 经 vite build 成功(2041 modules, 10s, dist/main 925KB);所有 `@ooc/builtins/*` 旧 import 桩化为本地 Placeholder 组件,删 9 个 workspace deps,装 13 个 npm 依赖。web 真正能起来 — 但具体 builtin 的 visible/index.tsx 仍待逐个实装(目前只有 thread 有 visible/server,其他 builtin window 走 Placeholder JSON 显示)。

## 已知问题 / 边界与未决

- **agent-native parity 缺口（最大债）**：visible/server 的 for-ui method 仅经 HTTP `/call_method` 暴露给前端（人类侧），**agent 端无等价 tool 路径**——agent 看不到/调不动自己的 UI 入口。这是 agent-native parity 公理下的显式技术债（公理见 supervisor `knowledge/ooc-glossary.md` / `ooc-philosophy.md`）。loop_timeline 的 server-method 等价同列后续 phase。
- **不做**：不内建渲染 host；不扫 stone 根具名 tsx（杜绝入口歧义）。
- **增量项**：flow client pages 在控制面的导航入口、Tier 3 visible HMR（浏览器端不刷新即看 UI 变更）。

## 优化方向 / 待办

1. 设计 agent-native UI 调用路径：让 agent 经一个 tool 等价地 `callMethod` visible/server for-ui method（闭合 parity 缺口）——需商定 visible/server 的 agent 面契约。
2. 补 flow_client_pages 控制面导航入口 + 落地 visible HMR，缩短"改 tsx → 看见"的反馈环。

## 名词解释

- **ooc:// URI**：OOC 暴露给 Agent 知识侧的稳定寻址协议，前缀 `ooc://client/`。Agent 只产出 `ooc://client/stones/<self>` 或 `ooc://client/flows/<sid>/<self>/pages/<name>`，由 visible 解析层 1:1 映射成控制面 SPA route——Agent 不写易漂移的物理路径（`web/.../shared/ui/oocUri.ts`）。
- **visible/index.tsx**：stone scope 的 canonical 单页入口（"主页"），跨 session 稳定。default export 一个 `({window}) => JSX` 组件。后端只解析此文件名（+ legacy `client/index.tsx` 回退），不扫根具名 tsx。
- **client/pages/<page>.tsx**：flow scope 的多页扩展（session 内）。注意单入口迁移只覆盖了 stone 的 `visible/`，flow 多页仍落 `client/pages/`（命名残留不一致，`persistable/stone-client.ts:25`）。
- **visible/server**：class 在 `<ObjectDir>/visible/server/index.ts` 实现的「给 UI 用的服务端 API」模块——for-ui method 经 HTTP `POST /call_method` 暴露给人类侧，与 LLM 侧 executable object method 分两条独立签名。其 ctx 有 **world / session（目标 flow）/ object-self（data）、无 current thinkloop thread**；改 object data → persistable.save（非版本化）。由 `<ObjectDir>/index.ts` 与 executable / readable / persistable 一并注册。取代旧「executable object method 标 `for_ui_access` 经 callMethod 暴露」（该标记退役）——人机分流不再靠 executable 上的标记，而靠这个独立模块。
- **ObjectClientRenderer**：前端动态 `import(fsUrl)` 加载 Object 自写 tsx 组件并渲染的渲染器；404 → `StoneFallback`/`NotProducedYet`，加载/渲染错 → `LoadErrorBox`/ErrorBoundary；合成 `callMethod` prop 注入组件（`web/.../clients/ObjectClientRenderer.tsx`）。
- **client-source-url**：后端权威 endpoint `GET /api/objects/:scope/:objectId/client-source-url`，返回 visible 源码的 `{absPath, fsUrl}`（`fsUrl=/@fs${absPath}`，靠 Vite `/@fs` 暴露给浏览器）。前端据此 import，不自拼路径。带 `?sessionId` 路由到 session worktree 预览；`?file=diff` 白名单解析 `visible/diff.tsx`。
- **visible/diff.tsx**：Object 自有的"变化的展示"组件，default export `({previous, current}) => JSX`，对称 `visible/index.tsx`（"当前的展示"）。
- **resolveWindowDiff**：loop diff 视图展开某 window 时的解析层，四档回退（builtin 静态 / user `visible/diff.tsx` 动态 / before-after 并列 / JSON 兜底），无 per-type switch。对称 `resolveWindowVisible`（见 `knowledge/window-diff-resolver.md`）。
- **window diff**：相邻两轮 thinkloop 同 id window 快照（`previous`/`current`）的差异视图；file 走后端预算的 `fileDiff` payload 直传，其它 type 由 `LoopDiffView` fetch `input.json` 取完整 window。
- **ClientWithSourceToggle**：FileViewer 命中 visible entry 时挂的双栏组件——左渲染态、右源码 toggle，让"点文件→看渲染"成默认交互。

## 协作

- **parent**：supervisor（root parent，向我发起 visible 维度迭代、裁决跨维度冲突）。
- **相关兄弟**：**persistable**（visible/server for-ui method 改 data 经 persistable.save 落盘的对端）、**app**（HTTP `/call_method` 把前端请求 dispatch 到 visible/server 的控制面通道）、**observable**（loop_timeline 的观测数据来源）。
- 我对外的自述见 `readable.md`；触发式知识见 `knowledge/`。
