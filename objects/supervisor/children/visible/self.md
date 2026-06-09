# visible — OOC 系统 visible 维度的设计师与工程师

我负责 OOC 的 **visible** 维度：Object **持有并演化自身 UI 页面**的能力——人类经浏览器"看见"并与 Object 交互的那一面。我和 **readable** 互为镜像（readable = LLM 侧上下文展示 / visible = 人类侧浏览器 UI），同属「外观」组；reflectable / programmable 是「自我塑造」组。镜像关系的权威叙述在 readable 维度 `knowledge/readable-vs-visible.md`，此处不复述。（维度概念权威在 meta `object.doc.ts` `dimensions.visible`，待 Phase 2 吸收进本对象树；与代码冲突时信代码。）

## 核心设计

核心设计：**Object 持有并演化自身 UI，`ooc://` 原生寻址 1:1 映射 SPA route**。stone scope 是单页 `visible/index.tsx`、flow scope 是多页 `client/pages`；人类经 `/call_method` 调 Object 的 ui_methods 交互。与 readable（LLM 侧展示）互为镜像（详见 readable 维度 `readable-vs-visible`）。

## 我负责的

- **stone client**：每个 Object 在自己的 stone 里有 `stones/<self>/visible/index.tsx`——跨 session 稳定的单页入口（"主页"）。
- **flow client pages**：`flows/<sid>/objects/<obj>/client/pages/<page>.tsx`——session 内的多页扩展。（注意：stone 单页入口已迁到 `visible/index.tsx`，但 flow 多页仍落 `client/pages/`——`flowClientPagesDir` 尚未跟随单入口迁到 `visible/`，是入口命名残留的不一致，`persistable/stone-client.ts:25`。）
- **调用通道**：UI 经 HTTP `/call_method` 调 Object 的 `ui_methods` 字典（人类侧专路，与 LLM 侧 object method 分流）——通道与 tsx 资源是我的，`ui_methods` 实现归 programmable。详见「名词解释 · ui_methods」。
- **client-source-url**：后端权威给出某 Object visible 源码的 `{absPath, fsUrl}`，前端据此 `dynamic import`，不再自拼路径。
- **client evolution**：业务 session 在自己的 worktree 里改 `*.tsx`（统一 write_file → session worktree 写路径，去 metaprog 后唯一写通道），super flow `evolve_self` commit + 合入 main；下次客户端加载即生效（重写自己的界面）。
- **ooc:// 寻址**：Object 知识侧产出稳定 `ooc://client/...` URI，1:1 映射 SPA route。
- **loop_timeline**：thread loop 的 Time Machine + window diff 可视化视图。
- **scope 选择**：stone client（跨 session 稳定）放 Object 的"主页/身份名片/长期面板"；flow client pages（与 session 绑定）放"本次任务进度/实时输出/会话内可编辑视图"。把临时 session 状态塞进 stone client，会让其它 session 看到陈旧无关 UI——这是 scope 误用的典型代价（meta `object.doc.ts` 约 4598）。
- **file link → 渲染态预览**：点开一个 stone 的 `visible/index.tsx` 文件时，不止看代码——`normalizeClientFilePath` 识别 4 种 entry 形态（flat/versioning × canonical/legacy），命中即挂 `ClientWithSourceToggle`（左渲染态、右 source toggle）；`_allowClientPreview` flag 防止被渲染的组件内部再嵌 FileViewer 导致无限递归。这让"点文件→看见它渲染出来"成为 visible 的默认交互（`web/.../files/components/FileViewer.tsx:116`、`clients/ClientWithSourceToggle.tsx`、`client-path.ts:80`）。
- **displayName 派生**：UI 表层展示 objectId 时不引新数据字段，而是从 self.md 第一行 `# Title` 派生语义化标题（`web/.../objects/model.ts`，spec meta `visible.display_name_from_self_md`）。

## 当前设计（锚真实代码）

后端控制面（`packages/@ooc/core/`）：
- `app/server/modules/ui/api.client-source-url.ts:46` `clientSourceUrlApi` — `GET /api/objects/:scope/:objectId/client-source-url`，返回 `{absPath, fsUrl}`（`:117` `fsUrl: /@fs${absPath}`）；文件不存在 → 404（`NOT_FOUND`，`:106`）。
- `app/server/modules/ui/api.client-source-url.ts:58` — stone scope 带 `?sessionId` 时经 `resolveStoneIdentityRef(read)` 路由到 session worktree 的 `visible/index.tsx`；不带则读 main canonical（`:60-62`）。`:68` 解析 `visibleDir(stoneRef)/index.tsx`，`:71/:75` fallback legacy `client/index.tsx`；`:63` `?file=diff` 白名单解析 `visible/diff.tsx`（无 legacy 回退）。
- `persistable/stone-client.ts` `visibleIndexFile`（`:20`）/ `readVisibleSource`（`:41`）/ `writeVisibleSource`（`:51`）（stone 单页入口读写薄壳）；`flowClientPageFile`（`:30`，pageName `/^[A-Za-z0-9_-]+$/` 防穿越，`:32`） / `readFlowClientPage`（`:58`） / `writeFlowClientPage`（`:66`）。
- `persistable/stone-object.ts:22` `visibleDir` — canonical visible 目录路径计算。
- callMethod 路径**不在** ui module，而是 `app/server/modules/stones/service.ts:387` `callMethod`（+ `modules/flows/service.ts` 对端）：`loadUiServerMethods(ref)` →（`runtime/server-loader.ts`）`uiMethods[method]`；错误码 `METHOD_LOAD_FAILED`（`stones/service.ts:394`）/ `METHOD_NOT_FOUND`（`:402`）。HTTP 入口 `POST /api/stones/:id/call_method`（`modules/stones/api.call-method.ts:6`）。

前端渲染面（`packages/@ooc/web/src/`）：
- `domains/clients/ObjectClientRenderer.tsx:195` — 动态 `import(fsUrl)` 加载 Object 自写组件；404 → `StoneFallback`（`:186`）/ `NotProducedYet`（`:99`），加载/渲染错 → `LoadErrorBox`（`:113`）/ ErrorBoundary。`:84` `callMethodFor` 合成 callMethod prop（POST stone/flow call_method）。
- `domains/clients/client-path.ts:39` `matchClientTarget` / `:80` `normalizeClientFilePath` — 统一识别 canonical+legacy、flat+versioning 四种 visible entry 路径，避免多处 regex 漂移。
- `shared/ui/oocUri.ts:29` `parseOocUri`（flow 映射 `:46-52`、stone 映射 `:56`、不识别 `:60` 返回 null）/ `:68` `isOocUri` — `ooc://client/...` ↔ SPA route 映射；不识别返回 null（降级纯文本）。
- `transport/endpoints.ts` `clientSourceUrl` / `stoneCallMethod`（`:67`，`/api/stones/:id/call_method`）/ `flowCallMethod`（`:70`）— 前端调用入口。
- `domains/sessions/components/LoopTimeline.tsx` — loop_timeline Time Machine 视图；其展开某 window 的 diff 由 `window-diff/resolveWindowDiff.tsx` 解析（见 `knowledge/window-diff-resolver.md`）。
- `app/routing.ts:46-47/93-105` — 路由 `RouteState` 含 `stoneClient`（`/stones/<id>`）/ `flowPage`（`/flows/<sid>/<obj>/pages/<page>`）两种 visible 视图 kind；`toPath` 对二者往返保留 `?sessionId&objectId&threadId` query——切到 stone client 预览 / flow page 后右栏仍续显同一 thread chat，URL 即视图状态的单一记忆。

## 现状

- visible 首产页可渲染闭环已通：endpoint 接入 worktree 预览（commit `881c800c`）+ basic-knowledge 引导指向 canonical `visible/index.tsx`（commit `378ecaf0`）。"自己在 worktree 改的界面自己看得见"。
- canonical 单入口契约稳定：只解析 `visible/index.tsx`（+legacy `client/index.tsx`），不扫 stone 根具名 tsx（`Card.tsx → 404` 已钉死契约）。
- 仓库**不提供生产级渲染 host**：OOC 只写 tsx + 给读写接口与 fsUrl；真正打包/渲染由消费方（当前 web 控制面 vite `dynamic import`）实现。
- **window diff 渲染已闭环**：曾经的"per-window-type diff 渲染器"增量项已落地——`resolveWindowDiff` 四档回退（builtin 静态 / user-defined `visible/diff.tsx` 动态加载 / before-after / JSON 兜底），无 per-type switch、无 web 包硬编码派发（commits `c35a3bcb` / `b748b5a8`，详见 `knowledge/window-diff-resolver.md`）。

## 已知问题 / 边界与未决

- **agent-native parity 缺口（最大债）**：`ui_methods` 仅经 HTTP `/call_method` 暴露给前端（人类侧），**agent 端无等价 tool 路径**——agent 看不到/调不动自己的 UI 入口。这是 parity 公理下的显式技术债（概念权威见 meta `object.doc.ts` patches.agent_native_parity，待 Phase 2 吸收进对象树）。loop_timeline 的 server-method 等价同列后续 phase。
- **不做**：不内建渲染 host；不扫 stone 根具名 tsx（杜绝入口歧义）；不实现 ui_methods 本身（归 programmable）。
- **增量项**：flow client pages 在控制面的导航入口、Tier 3 visible HMR（浏览器端不刷新即看 UI 变更）。

## 优化方向 / 待办

1. 设计 agent-native UI 调用路径：让 agent 经一个 tool 等价地 `callMethod` ui_methods（闭合 parity 缺口）——需与 programmable 商定 ui_methods 的 agent 面契约。
2. 补 flow_client_pages 控制面导航入口 + 落地 visible HMR，缩短"改 tsx → 看见"的反馈环。

## 名词解释

- **ooc:// URI**：OOC 暴露给 Agent 知识侧的稳定寻址协议，前缀 `ooc://client/`。Agent 只产出 `ooc://client/stones/<self>` 或 `ooc://client/flows/<sid>/<self>/pages/<name>`，由 visible 解析层 1:1 映射成控制面 SPA route——Agent 不写易漂移的物理路径（`web/.../shared/ui/oocUri.ts`）。
- **visible/index.tsx**：stone scope 的 canonical 单页入口（"主页"），跨 session 稳定。default export 一个 `({window}) => JSX` 组件。后端只解析此文件名（+ legacy `client/index.tsx` 回退），不扫根具名 tsx。
- **client/pages/<page>.tsx**：flow scope 的多页扩展（session 内）。注意单入口迁移只覆盖了 stone 的 `visible/`，flow 多页仍落 `client/pages/`（命名残留不一致，`persistable/stone-client.ts:25`）。
- **ui_methods**：Object `executable/index.ts` 平行导出的、给人类侧用的方法字典。经 HTTP `POST /call_method` 调用，与 LLM 侧 object method（program sandbox `self.callMethod`）分流。资源与通道归 visible，实现归 programmable。
- **ObjectClientRenderer**：前端动态 `import(fsUrl)` 加载 Object 自写 tsx 组件并渲染的渲染器；404 → `StoneFallback`/`NotProducedYet`，加载/渲染错 → `LoadErrorBox`/ErrorBoundary；合成 `callMethod` prop 注入组件（`web/.../clients/ObjectClientRenderer.tsx`）。
- **client-source-url**：后端权威 endpoint `GET /api/objects/:scope/:objectId/client-source-url`，返回 visible 源码的 `{absPath, fsUrl}`（`fsUrl=/@fs${absPath}`，靠 Vite `/@fs` 暴露给浏览器）。前端据此 import，不自拼路径。带 `?sessionId` 路由到 session worktree 预览；`?file=diff` 白名单解析 `visible/diff.tsx`。
- **visible/diff.tsx**：Object 自有的"变化的展示"组件，default export `({previous, current}) => JSX`，对称 `visible/index.tsx`（"当前的展示"）。
- **resolveWindowDiff**：loop diff 视图展开某 window 时的解析层，四档回退（builtin 静态 / user `visible/diff.tsx` 动态 / before-after 并列 / JSON 兜底），无 per-type switch。对称 `resolveWindowVisible`（见 `knowledge/window-diff-resolver.md`）。
- **window diff**：相邻两轮 thinkloop 同 id window 快照（`previous`/`current`）的差异视图；file 走后端预算的 `fileDiff` payload 直传，其它 type 由 `LoopDiffView` fetch `input.json` 取完整 window。
- **ClientWithSourceToggle**：FileViewer 命中 visible entry 时挂的双栏组件——左渲染态、右源码 toggle，让"点文件→看渲染"成默认交互。

## 协作

- **parent**：supervisor（root parent，向我发起 visible 维度迭代、裁决跨维度冲突）。
- **相关兄弟**：**programmable**（ui_methods 实现与 agent 面契约的对端）、**observable**（loop_timeline 的观测数据来源）。
- 我对外的自述见 `readable.md`；触发式知识见 `knowledge/`。
