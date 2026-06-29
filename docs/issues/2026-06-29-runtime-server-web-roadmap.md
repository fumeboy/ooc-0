---
title: runtime/server/web 系统现状盘点 + 完整运行路线图（基于新 object 设计的实施总规划）
status: draft
date: 2026-06-29
---

# runtime/server/web 系统现状盘点 + 完整运行路线图

## 背景 / 动机

用户提案（2026-06-29）：**基于新的 object 设计（lifecycle 维度落地、5+3 维度模型），调整 runtime/server/web 模块的设计与实现，使整体系统可以完整地运行；梳理和更新 storybook 作验证思路。**

新 object 设计 = 6-26 一轮契约收口（issue A~P 落地：persistable 三层 / reflectable as flow dispatcher / object 模型核心 11 项 / lifecycle 维度等）+ 06-28 lifecycle 维度落地。系统设计权威极完整，但**实现远未覆盖设计面**——本 issue 作系统差距盘点 + 总规划，**不动任何代码**，等 supervisor 裁决具体推进路径。

## 现状（实勘代码）

### 1. server 现状（`packages/@ooc/core/app/server/`）

**实际跑得通**：`bun run packages/@ooc/core/app/server/index.ts --world ./.ooc-world --port N` 起得来；`/health` 与 `/api/runtime/*` 端点都响应。

**实际模块清单**（2 个）：
- `modules/health` — `/health` 健康检查
- `modules/runtime` — 6 个 endpoint：
  - `GET  /api/runtime/threads/:sessionId`
  - `POST /api/runtime/threads`
  - `POST /api/runtime/threads/:threadId/messages`
  - `GET  /api/runtime/observation`
  - `POST /api/runtime/pr-issues/:id/resolve`
  - `GET  /api/runtime/pr-issues/:id`

**设计权威说应有**（`app/self.md`、`knowledge/index.md` §B `## app`）：
- **7 个 module**：health / runtime / **stones / pools / ui / flows / world-config**
- 通用 file-edit 原语 `PUT /stones/:id/file?path=` （A1 已立规、未实现）
- pool sediment 端点 `/api/pools/`（未实现）
- flow callMethod `POST /api/flows/:sid/:oid/call_method`（dispatch 到 visible/server，未实现）
- client-source-url `GET /api/objects/:scope/:objectId/client-source-url`（未实现）
- world-config / runtime debug / pause-resume / loop debug（未实现）
- onError 统一错误模型 `AppServerError` → `{error:{code,message,details}}`（未实现）

**差距**：缺 5 个 module（stones / pools / ui / flows / world-config）+ 通用错误模型 + WorldRuntime 集成。

### 2. runtime 现状（`packages/@ooc/core/runtime/`）

**已落地**：
- `world-runtime.ts:createWorldRuntime` —— stoneRegistry / serverLoader / serialQueue / reloadTable / hot-reload watcher（dev 模式）齐备
- `object-registry.ts` —— session-level inst registry，resolve* 全套（active/unactive/on_reload/method/guide/window-method/readable/persistable/thinkable/visibleServer）
- `reload-table.ts`（issue lifecycle 2026-06-28）—— 进程级 invalidate 标记
- `hot-reload.ts` —— fs.watch 监听 stones/ 树
- `refcount.ts` / `gc.ts` —— 通用 refcount + GC
- `app/server/runtime/worker.ts` —— enqueueScheduler

**未接通**：
- **生产 server 不构造 `WorldRuntime`** —— 直接用 module-level `defaultServerLoader`、`stoneRegistry` 是手动初始化、reloadTable 未存在于生产 server。**lifecycle.on_reload 在生产 server 内永远不会被派发**（即使用户改了 class 源码，热更新流到 invalidateStone 就断了，没有 on_reload 钩派发）。
- worker.ts 内 `enqueueScheduler` 不持 `WorldRuntime` 引用 → 无法传 `reloadTable` 给 scheduler/thinkloop。
- 设计权威里的 **job-manager / pause-store / resume / thread-query** runtime 编排层完全不存在。

**差距**：生产 server 启动模型需重构为经 `createWorldRuntime`；worker 拿 WorldRuntime 引用透传 reloadTable；可选恢复 job-manager / pause-resume。

### 3. web 现状（`packages/@ooc/web/`）

**实际有**（git untracked，3 个 ts/tsx 文件）：
- `src/App.tsx` — 一个 1 页 React 简化 demonstrator：sessionId 输入 + 列 thread + 创 thread + 推消息 + observation
- `src/main.tsx` — ReactDOM 入口
- `package.json` — `@ooc/web` 工作区 + vite 脚本

**设计权威说应有**（`visible/self.md`、`app/self.md`、`knowledge/index.md` §B `## visible`、`## app`）：
- **AppShell + URL 单向真相**：react-router URL 派生 `scope/sessionId/objectId/threadId/path`
- **ooc:// 寻址**：`parseOocUri` / `isOocUri` ↔ SPA route 双向映射
- **ObjectClientRenderer**：动态 `import(fsUrl)` 加载 Object `visible/index.tsx`，404 fallback `StoneFallback`
- **stoneClient / flowPage 两种 visible 视图 kind**
- **通用 file-edit UI**：FileViewer 编辑态 → `PUT /stones/:id/file?path=` (A1 通路)
- **flow callMethod UI**：经 `/api/flows/:sid/:oid/call_method` 调 visible/server (A2 通路)
- **LoopTimeline + window-diff 视图**：thread loop 的 Time Machine
- **chat polling-job 模型**（无 SSE）
- **client-path 4 形态识别**（flat/versioning × canonical/legacy）
- **transport/endpoints.ts** 统一登记端点

**差距**：99% 设计未实现。当前 1 个 App.tsx 仅 cover 「创 thread + 列 thread + 推消息」最小动线，**完全不实现 ooc:// 寻址 / visible/server callMethod / file-edit / LoopTimeline / scope 区分**。

### 4. visible/server 现状（`packages/@ooc/builtins/*/visible/server/`）

**未在任何 builtin 实现**。`OocClass.visible: VisibleServerModule` 槽位定义存在（`core/types/visible-server.ts`），`ObjectRegistry.resolveVisibleServer` 存在（`object-registry.ts:306`），但**所有 builtin 的 `Class` 装配都不传 visible 字段**——人类侧 data 编辑通路（A2）完全没接通。

**差距**：选择代表性 builtin（如 thread / todo / agent.self）实现 visible/server，作 A2 通路的范例。

### 5. storybook 现状（`packages/@ooc/storybook/`）

**不存在**。`docs/ooc-6/storybook/` 有设计文档（framework-design.md / stories-outline.md / dashboard.md / stories-report.md），但代码侧无 storybook package。当前测试 = `packages/@ooc/tests/` 25 + 1 = 26 个 `.test.ts`（含本 issue 后 lifecycle-on-reload.test.ts）+ `web-e2e.test.ts`（轻量代 storybook）。CI gate = `bun run verify`（tsc + tests + 4 个 check 守门）。

**设计权威**（`docs/ooc-6/storybook/framework-design.md`）：
- 9 特性 × 2 Tier：
  - Tier A 控制面确定性（`app.handle` 进程内、零真 LLM、CI gate）
  - Tier B agent-native（真 LLM、env-gated、过程可见）
- 单元化 story（`stories-outline.md`：L0 World 子树 / L1 Session 生命周期 / L<n> ...）
- 实现位置：`packages/@ooc/storybook/stories/<cap>.story.ts` + `_harness/control-plane.ts`
- 输出：`stories-report.md` 覆盖矩阵

**差距**：storybook 框架本身不存在；当前 26 个 `tests/*.test.ts` 实质承担「单元化 stories」角色，但无覆盖矩阵 / 无能力目录视角 / 无 Tier B agent-native 演示能力。

### 6. lifecycle on_reload 接通现状（紧急前置）

刚落地的 issue 2026-06-28-lifecycle-module-and-reload Stage B 透传链路：
- ✅ `WorldRuntime.reloadTable` 注入完整
- ✅ `ThinkableDeps.reloadTable` / scheduler / thinkloop / ThreadRuntime.maybeDispatchOnReload 链路完整
- ❌ **生产 server 不经 createWorldRuntime → reloadTable 永远不被构造 → on_reload 永远不派发**
- ✅ 测试场景全覆盖（lifecycle-on-reload.test.ts 6 case）

**这是设计与实现脱节最尖锐处**——新 issue 落地了机制，但生产 server 没用上。本路线图的**第一步**应该是修这个。

## 改动提案（路线图：4 个 follow-up issue，按依赖序）

按「最小可行 + 复用先于新引入 + 警惕新增名词」哲学，把"使整体系统完整运行"拆为 4 个独立 issue，每个独立 verify、独立合入：

### Issue F1 · 生产 server 集成 WorldRuntime（最紧急，最小）

**范围**：把 `app/server/index.ts:buildServer` 改为经 `createWorldRuntime(config)` 获取 reloadTable，传给 worker.ts，让 worker 透给 scheduler.opts。

**为什么先做**：兑现 lifecycle issue 的 follow-up（生产可用闭环），且**非常小**——`buildServer` 加 6-10 行、`worker.ts` 改 `enqueueScheduler` 签名 + 闭包透传、`modules/runtime/index.ts` 改 RuntimeModuleConfig 字段。无新 endpoint、无 web 改动、无 builtin 改动。

**验证**：
- 起 server → 改某 builtin 源文件 → 看 lifecycle.on_reload 是否在 thinkloop 路径派发
- 加 1 个 e2e test 模拟该路径

**预估 commit 数**：3-5 个，半天工作量。

### Issue F2 · server module 补全（健身房）

**范围**：按设计权威实现剩余 5 个 module：
- `modules/stones`（通用 file-edit 原语 PUT /stones/:id/file?path= + 列表/读取）
- `modules/pools`（pool sediment 读写端点）
- `modules/flows`（flow 列表/详情/callMethod 入口）
- `modules/ui`（client-source-url）
- `modules/world-config`（worldConfig.prAutoMerge 读写）

**新增**：onError 统一错误模型 `AppServerError`。

**不在范围**：runtime debug / pause-resume / job-manager（可作 future issue）。

**验证**：每个 module 独立单测；e2e test 覆盖通用 file-edit + flow callMethod 串。

**预估 commit 数**：8-12 个，1-2 天。**依赖 F1**（worker 改造完才动）。

### Issue F3 · visible/server 范例实现（A2 通路接通）

**范围**：在代表性 builtin 实现 `visible/server/index.ts`：
- `_builtin/agent/children/thread` 的 visible/server（thread 状态查询 + reply demonstrator）
- 1-2 个内容 builtin（如 `_builtin/agent/children/todo` 或文件 builtin）

**为什么**：A2 通路（人类侧 data 编辑）的代码侧实证；当前 ObjectRegistry.resolveVisibleServer 是空炮。

**验证**：HTTP `/api/flows/:sid/:oid/call_method` 调 visible/server 改 data → persistable.save → 下次 hydrate 见到改动。

**预估 commit 数**：5-8 个，1 天。**依赖 F2**（flow callMethod endpoint）。

### Issue F4 · web 控制面分阶段重建

**范围**：按 OOC 哲学，**不一次性把设计权威的所有 UI 全做**——分 phase：
- **Phase 1**：保留当前 App.tsx 作 "console 模式"，添加 **ooc:// route 解析 + ObjectClientRenderer 骨架**（最小）
- **Phase 2**：通用 file-edit UI（消费 F2 的 PUT /stones/:id/file）
- **Phase 3**：flow client page UI（消费 F3 的 visible/server）
- **Phase 4** (远)：LoopTimeline / window-diff（高复杂度，后置）

**为什么分 phase**：web 完整重建是巨大工作量，且需要随 backend 演进；当前 demonstrator 已经支撑日常调试。**先做 Phase 1+2 让人能编辑源文件、再 Phase 3 让人能改运行态 data**。

**验证**：每 phase e2e（playwright 或 bun:test app.handle 模拟）。

**预估 commit 数**：Phase 1 = 5 个 / Phase 2 = 5 个 / Phase 3 = 8 个，**每 phase 独立 verify**。

### Issue F5 · storybook 框架真造（与 F2/F3/F4 并行）

**范围**：按 `docs/ooc-6/storybook/framework-design.md` 真造 `packages/@ooc/storybook/`：
- `_harness/control-plane.ts`（mkServer + helpers）
- `stories/L0_persistable.stories.ts` ... `L<n>_*.stories.ts` 单元化
- `stories/_catalog.ts` + `stories/_catalog.test.ts`（CI gate）
- `runner.ts`（产出覆盖矩阵 + dashboard.md）
- Tier B `runAgentNative()` 留作骨架（不强求落地）

**为什么**：用户明确说"梳理和更新 storybook"。但不需要先完成所有 stories——**有了框架 + L0/L1 几条样本，后续 F2/F3 落地时**新能力直接补一条 story 即可**。

**预估 commit 数**：6-10 个，1-2 天（视 stories 详细度）。

**依赖**：F1 → F2 → F3；F4 和 F5 与 F2/F3 并行。

## 建议推进顺序

**最干净的路径**（按依赖图）：
1. **F1 立即做**（半天）：兑现 lifecycle follow-up + 验证 reloadTable 闭环
2. **F5 起 framework**（1 天）：建 storybook 骨架，F2 起的 5 个 module 直接补 story
3. **F2 server module 补全**（1-2 天）：每个 module 随手补 storybook story
4. **F3 visible/server 范例**（1 天）：A2 通路接通
5. **F4 web Phase 1-3**（按需，3-5 天）

**总工作量**：5-10 天分布在 5 个 issue。每 issue 独立 verify、独立合入、随时可暂停。

## 受影响设计元素

本 issue **不动任何设计契约**——是规划文件、列差距、提路径，不重设计任何元素。所有受影响元素将由各 follow-up issue 单独提案。

但需注意：本路线图本身需 supervisor 裁决——若 supervisor 认可，则按 F1→F5 立 5 个独立 issue；若 supervisor 倾向更激进（一次性重建）或更保守（仅做 F1），路线图需重做。

## 风险与权衡

### 真实风险

1. **碎片化风险**：5 个独立 issue 可能各自落地后整体仍未完整。缓解：每 issue 落地后跑 verify + 手动起 server + 用 web 端测一次完整动线，**串起来才算 verified**。

2. **设计漂移风险**：5 个 issue 跨越时间，期间设计权威（对象树）可能因其他 issue 演进。缓解：每 issue 起时再次 sanity check 对象树 + 该域 self.md。

3. **依赖断链风险**：F2 依赖 F1、F3 依赖 F2 —— 若中途暂停，可能 F2 半落地阻塞 F3。缓解：每 issue scope 收紧到独立可 verify 的程度，断点不影响主干跑。

### 权衡选择

- **一次性 vs 分 5 issue**：一次性熵增（review 极难、易留半态）；分 5 个对接更稳。
- **F1 优先 vs F4 web 优先**：F1 修 lifecycle 跨进程闭环（小、紧急），F4 web 是工作量最大、user 感最直接但依赖 F2 完整。先做 F1+F2+F3 让后端体系完整，再补 F4 web。
- **F5 何时做**：若与 F2/F3 同时做，每补一个 module/visible 直接补 story；若先 F1+F2+F3 完再补 F5，多一道返工（要回头给已落地的能力补 story）。**推荐 F5 在 F1 之后立即起骨架**。

## 待裁决点

**1. 是否同意 5 个 follow-up issue 拆分?**
   - (a) 同意（推荐）
   - (b) 合并 F2+F3+F4 为「server+visible+web 一次性大 issue」
   - (c) 仅做 F1 + F5 框架，F2/F3/F4 暂搁

**2. F1 是否立即推进？**
   - (a) 立即（推荐）—— 这是 lifecycle issue 的 follow-up，几小时活
   - (b) 等其他 issue 一起做

**3. F5 storybook 框架优先级？**
   - (a) F1 之后立即做（让 F2/F3 随手补 story）（推荐）
   - (b) 放最后
   - (c) 暂不做、保持 `tests/*.test.ts` 现状

**4. web 的范围如何收紧？**
   - (a) Phase 1+2+3（推荐）
   - (b) 仅 Phase 1（最小）
   - (c) Phase 1-4 全做

**5. 涉及核心 runtime 改动是否走 worktree？**
   - F1 改 server 启动模型，**改动跨 server/runtime/worker** —— 推荐 worktree 隔离。
   - F2/F3/F4 类似。

## review 记录

本 issue 由 supervisor 自起，未走 sub agent fan-out（属规划文件、不动设计契约）。完整性批评层面：差距盘点经实勘代码（不是凭设计文档臆断），无明显遗漏。

## 裁决

（待 supervisor 决定推进路径后裁决；裁决后本 issue 标 landed，并起对应 F1-F5 follow-up issue）

## 落地验收

（本 issue 是规划，无具体「落地」可言。视为"路线图已立项"——landed = 后续至少有 F1 起步即可。）
