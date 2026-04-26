# 旧 Flow 架构退役

> 类型：feature
> 创建日期：2026-04-21
> 状态：finish
> 负责人：Claude Opus 4.7 (1M context)
> 完成日期：2026-04-21

## 背景 / 问题描述

线程树架构（`kernel/src/thread/*`）已默认启用并通过体验验证（参见迭代 `20260421_feature_工具调用title参数.md` 和 `20260421_feature_统一title参数清理child_title.md`）。但上一轮调研发现旧 `Flow` 架构并未真正退役——它被线程树架构反向依赖，构成四个解耦点：

1. **Session 落盘格式**：`world.ts:565 _wrapThreadTreeResult` 用 `Flow.load` 作为兼容层，所有 `_talkWithThreadTree` 最终返回 `Flow` 实例给 HTTP/SSE。
2. **ReflectFlow**：对象常驻自我对话机制（经验沉淀核心），线程树只有 `deliverToSelfMeta` 回调，无等价实现。
3. **Server debug 接口**：`server.ts:253, 313` 的 `/pending-output`、`/debug-mode` 依赖 `Flow.load`。
4. **World.talkToSelf / replyToFlow**：这两条路径还完全走旧 Flow。

后果：
- `kernel/src/flow/*` + `kernel/src/world/scheduler.ts` 持续占用 ~1500+ 行死/半死代码。
- 测试里 1 个已 skip（`tests/flow.test.ts` 的 ThinkLoop pause/resume）+ 1 个 partial skip（inline_before 正则错误）只能等到退役时删除。
- `world.ts` 里 `_useThreadTree` 双分支（3 处 if）让每次新功能都要考虑"旧路径怎么办"，拖慢后续迭代。
- `MockLLMClient.responses: string[]` 在 TOML 删除后已半失效——它设计上是给旧 Flow 的 TOML parser 喂字符串用的。

## 目标

彻底退役旧 Flow 架构。完成后：

1. `kernel/src/flow/` 目录被删除。
2. `kernel/src/world/scheduler.ts` 被删除。
3. `kernel/src/world/world.ts` 去除 `_useThreadTree` 开关，只保留线程树路径。总行数从 ~1581 降到 ~800-900。
4. `kernel/src/world/session.ts` 去除双模式分支。
5. 四个解耦点各自有线程树等价实现：
   - Session 落盘：用线程树原生 `threads.json + threads/{id}/thread.json` 作为主格式；`Flow.load` 调用点改为直接读 `threads.json`。
   - ReflectFlow：设计并实现线程树版本的常驻自我对话机制。
   - Server debug：`/pending-output`、`/debug-mode` 删除（旧 Flow 的混淆概念）；用 `/api/debug/enable`（写 debug 文件）和 `/api/global-pause/enable`（暂停执行）替代。
   - talkToSelf / replyToFlow：改走线程树 scheduler。
6. 前端 `Flow` 相关组件（如果存在）同步适配。
7. 测试失败数保持 0（1 skip 随旧 Flow 测试一并删除）。

## 方案

### 阶段 0 — 前置调研（必须先做，可能推翻后续阶段）

**先写一份详细调研报告**（写入本文档"执行记录"），回答：

1. **ReflectFlow 详查**：
   - 读 `kernel/traits/reflective/reflect_flow/*`。
   - `Flow.ensureReflectFlow()` 在 `kernel/src/flow/*` 里具体做什么？数据存在 `stones/{name}/reflect/`，结构是什么？
   - 有多少对象当前在用 ReflectFlow？（grep `reflect` + 看 stones 目录）
   - 线程树等价物应该是什么形态？建议：用一个常驻 root thread 代替 ReflectFlow，落盘在 `stones/{name}/reflect/threads.json`。
2. **Server debug 接口用途**：
   - `/pending-output`、`/debug-mode` 谁在调用？前端是否有相关 UI？
   - 线程树的 pause 机制（`engine.ts` 里的 `llm.input.txt`/`llm.output.txt`）是否已覆盖这个用途？
3. **Session 落盘迁移复杂度**：
   - `Flow.load` 返回的对象形状 vs 线程树 `threads.json` 形状。
   - HTTP / SSE 消费者（`server.ts`、`kernel/web/src/`）对 Flow 字段的依赖清单。
4. **旧 Flow 测试清单**：完整列出 `kernel/tests/` 里依赖旧 Flow 的所有测试文件和用例。

**阶段 0 产出决策**：
- **方案 A（推荐，如果 ReflectFlow 替代清晰）**：分 Phase 1-4 顺序清理。
- **方案 B（保守）**：仅清理不涉及 ReflectFlow/debug 的部分（如 `_useThreadTree` 分支 + `world/scheduler.ts`），ReflectFlow 单独一轮迭代。
- **方案 C（停下来汇报）**：调研发现有超预期依赖，向 Alan Kay 汇报等指示。

调研完成后选一个方案，写入执行记录再推进。

### 阶段 1 — 解耦点 4：talkToSelf / replyToFlow（最简单的先拆）

- 把 `world.ts` 里 `talkToSelf` / `replyToFlow` 改走线程树路径。
- 这两个是入口层，不涉及 Flow 内部数据结构，最容易迁移。

### 阶段 2 — 解耦点 1：Session 落盘兼容层

- 新增一个薄包装（或直接在 HTTP 层转换）：把线程树 `threads.json + threads/{id}/thread.json` 转为 Flow 兼容的 JSON 形状给前端/SSE 使用。
- 删除 `world.ts:565 _wrapThreadTreeResult` 对 `Flow.load` 的调用。

### 阶段 3 — 解耦点 2：ReflectFlow 线程树化

- 根据阶段 0 调研的设计，实现线程树版 ReflectFlow。
- 迁移 `reflect_flow` trait 和 `ensureReflectFlow` API 的调用点。

### 阶段 4 — 解耦点 3：Server debug 接口

- 删除旧 Flow 的 `/pending-output` / `/debug-mode` 端点（混淆了 debug 写文件与 pause 暂停的概念）。
- 已由 `/api/debug/enable`（写 debug 文件）和 `/api/global-pause/enable`（暂停执行）的两个独立端点替代。
- 如果前端 UI 依赖 Flow 字段，同步改 Web UI。

### 阶段 5 — 清理

- 删除 `kernel/src/flow/` 目录。
- 删除 `kernel/src/world/scheduler.ts`。
- 删除 `world.ts` 中 `_useThreadTree` 分支（3 处 if + 旧 `_createAndRunFlow`/`_resumePausedFlow`/`_runFlow` 方法约 500 行）。
- 删除 `world/session.ts` 双模式分支。
- 删除所有旧 Flow 测试。
- 前端 grep `FlowView` / `_useThreadTree` / `OOC_THREAD_TREE` 相关遗留。
- 更新 `docs/meta.md`：删掉所有"旧 Flow 架构" / "过渡期回退" 相关文字。

### 阶段 6 — MockLLMClient 精简（顺带）

- `kernel/src/thinkable/client.ts` 里的 `MockLLMClient`：删除 `responses: string[]` 字段，或标记 deprecated。
- 检查测试是否还有用 `responses` 的地方——按上一轮迭代（`20260421_feature_统一title参数清理child_title.md` Phase C），大部分已迁移到 `responseFn + toolCalls`。剩下的一并迁移。

## 影响范围

- **后端代码**：
  - `kernel/src/flow/*` — 全部删除
  - `kernel/src/world/world.ts` — 去除 `_useThreadTree` 分支，总行数减半
  - `kernel/src/world/scheduler.ts` — 删除
  - `kernel/src/world/session.ts` — 双模式分支清理
  - `kernel/src/server/server.ts` — debug 接口改写
  - `kernel/src/thinkable/client.ts` — MockLLMClient 精简
  - `kernel/traits/reflective/reflect_flow/*` — ReflectFlow 线程树化
- **测试**：
  - `tests/flow.test.ts` / `tests/meta-programming.test.ts` / `tests/exp045-fixes.test.ts` / `tests/concurrent-focus.test.ts` / `tests/parser.test.ts` — 删除旧 Flow 测试
  - 1 个 skip + 1 个 partial skip（`tests/flow.test.ts`）一并删除
  - 新增线程树 ReflectFlow 测试
- **前端**：
  - 如果有 FlowView 等依赖 Flow 字段的组件，适配或删除
- **文档**：
  - `docs/meta.md` — 删除旧 Flow 相关段落
  - `kernel/traits/reflective/reflect_flow/TRAIT.md` — 按新实现更新
  - `docs/哲学/discussions/README.md` — 追加退役决策记录

## 验证标准

1. **阶段 0 产出**：调研报告 + 选定方案 + 依赖清单，写入执行记录。
2. **每阶段**：
   - `bun test` 全绿（0 fail，跑全量）
   - 前端 tsc 0 error
   - 阶段 1/2 完成后做一次 E2E：普通对话 + 子线程 + 跨对象 talk
   - 阶段 3 完成后做一次 E2E：ReflectFlow 触发路径
   - 阶段 4 完成后做一次 E2E：pause/resume debug
3. **终态**：
   - `rg 'Flow\.load|_useThreadTree|OOC_THREAD_TREE'` 全仓无匹配
   - `ls kernel/src/flow/` 不存在
   - `world.ts` 行数 < 900
   - `bun test` 0 fail / 0 skip（skip 全部随旧 Flow 测试一并删除）

## 失败处理

- **阶段 0 调研发现 ReflectFlow 没有清晰的线程树等价方案** → 切换方案 B：本迭代只做阶段 1-2 + 5 的部分（`_useThreadTree` 分支 + `world/scheduler.ts`），ReflectFlow/debug 单独迭代。**不要硬推**。
- **阶段 2 Session 落盘迁移发现前端依赖 Flow 的字段太多** → 停下来汇报，拆前端适配为独立 task。
- **任何阶段后测试失败数不降反增** → 立刻回滚当前 commit 并汇报。

## 执行记录

### 2026-04-21 测试基线

- `bun test` 全量：**577 pass / 1 skip / 0 fail**（其中 1 个 skip 为 `tests/flow.test.ts` 的 ThinkLoop pause/resume，归入本迭代一并删除）。
- 前端 `bunx tsc --noEmit`：预存 4 个错误（OocLogo、@codemirror/merge），与本迭代改动无关。

### 2026-04-21 阶段 0 调研

**调研 1：ReflectFlow 实际使用情况**

- 目录检查：`stones/*/reflect/data.json` 全部是 **空 stub**（messages=[], data={}, status=waiting）——没有任何对象真正向 ReflectFlow 发过消息。
- 历史 flow grep 只有两个 flow（`s_mo1u40h2_*` 和 `s_mo2aple1_*`）在 thread.json 里提到过 `reflect` 字符串，且都是早期实验。
- **关键发现**：`kernel/src/thread/engine.ts` 根本没有给 `CollaborationContext` 传 `deliverToSelfMeta` 回调——这意味着线程树路径下的 `talkToSelf()` 会返回 `"[错误] talkToSelf 不可用（未配置 ReflectFlow）"`。**线程树架构下 ReflectFlow 已经是"未启用功能"**。
- 旧 Flow 路径下 `Flow.ensureReflectFlow` 只创建 stub，`_ensureReflectFlow` 注册到 session——但因为普通 ThinkLoop 调用 `collaboration.talkToSelf` 只写 pendingMessages，而 ReflectFlow 的 `runThinkLoop` 实际消费消息的链路没有测试覆盖，历史数据也是空。

**调研 2：Server debug 接口的前端依赖**

- `/api/stones/:name/flows/:flowId/pending-output`（GET）：读 `flow.data._pendingOutput` + `debugMode` + `status`。
- `/api/stones/:name/flows/:flowId/debug-mode`（POST）：写 `flow.data.debugMode`。
- `/api/stones/:name/flows/:flowId/step`（POST）：调 `world.stepOnce(...)`。
- 前端唯一使用方：`kernel/web/src/features/FlowDetail.tsx`——`pendingOutput` / `pausedContext` / `debugMode` / `handleResume` 都挂在 `PausedPanel` 组件。FlowDetail 是旧 Flow 形态的详情视图，用户现在主要看 `ThreadsTreeView`（线程树视图），FlowDetail 被 SubTab 包起来，日常不常用。
- **结论**：`/pending-output` / `/debug-mode` 在线程树架构下**没有等价实现**——线程树有两套独立机制：
  1. **Debug 模式**（通过 `/api/debug/enable`）：写 debug 文件到 `threads/*/debug/` 目录，**不暂停执行**。
  2. **全局暂停 + 单步模式**（通过 `/api/global-pause/enable` 或 `stepOnceWithThreadTree`）：暂停执行，**不写 debug 文件**。
  
  旧 Flow 的 `/debug-mode` 混淆了这两个概念。线程树中文件调试（llm.input.txt/llm.output.txt）只是 debug 模式的一部分，与 pause 机制无关。FlowDetail 的 PausedPanel 在线程树模式下永远不会触发，因为线程树不走 `Flow.setStatus("pausing")`。

**调研 3：Session 落盘迁移**

- 前端通过 `/api/flows/:sessionId` 获取 flow 详情，server 直接用 `readFlow(dir)` 读 `data.json`（不是 `Flow.load`）。
- `_wrapThreadTreeResult`（world.ts:565-610）和 `_talkWithThreadTree`（world.ts:525-559）的唯一作用：把线程树执行结果写入 `session/objects/{name}/data.json` 作为兼容格式。最终返回 `Flow.load(flowDir)` 给 `world.talk()` 的调用者（仅 `server.ts:resumeFlow` 使用 `flow.sessionId/status/actions/messages`）。
- 迁移方案：把 `_wrapThreadTreeResult` 改为直接写 `data.json` + 返回一个「薄返回值结构」（sessionId、status、messages、actions），不再经 `Flow` 类。HTTP 层保持消费 `data.json`。

**调研 4：旧 Flow 测试清单**

| 测试文件 | 用途 |
|---------|-----|
| `tests/flow.test.ts` | Flow 类 + runThinkLoop 的单元测试（1 skip + 1 partial skip 在此文件） |
| `tests/meta-programming.test.ts` | Flow.ensureReflectFlow 测试 |
| `tests/exp045-fixes.test.ts` | exp045 旧 Flow 行为回归测试 |
| `tests/concurrent-focus.test.ts` | 并发 focus 机制（基于 Flow.recordActionAt） |
| `tests/parser.test.ts` | 旧 TOML parser 测试（43 tests） |
| `tests/world.test.ts:118` | 仅显式 `useThreadTree: true`，其余部分不依赖旧 Flow |

**调研 5：`_useThreadTree` 双分支规模**

- world.ts 1581 行，3 处 `if (this._useThreadTree)` 判断（line 439/637/701），其后紧跟 "旧 Flow else 分支"。
- 旧 Flow 相关私有方法：`_createAndRunFlow`（line 920-1048, 128 行）、`_resumeAndRunFlow`（1056-1193, 137 行）、`_resumePausedFlow`（1201-1329, 128 行）、`_autoResumeSession`（1427-1517, 90 行）、`_loadExistingSubFlows`（1525-1542）、`_ensureReflectFlow`（1550-1560）——合计约 500+ 行。
- `_talkWithThreadTree`（461-559）+ `_wrapThreadTreeResult`（565-610）约 150 行是新架构的 Flow 包装，删掉 `Flow` 需要用纯 `writeFileSync` 替代。

**调研 6：`kernel/src/flow/*` 和 `world/scheduler.ts` 的引用面**

| 文件 | 被谁引用 |
|------|---------|
| `flow/flow.ts` → `Flow` | world.ts / session.ts / scheduler.ts / server.ts:253,313 / flow.test / meta-programming.test / exp045-fixes.test / concurrent-focus.test |
| `flow/thinkloop.ts` → `runThinkLoop` | world/scheduler.ts:141,171 / flow.test / meta-programming.test |
| `flow/parser.ts` | parser.test only（已在上一迭代从 thread/ 侧删除兼容入口，但旧 Flow 仍在用） |
| `world/scheduler.ts` | world.ts:998,1143,1281,1476（全在旧 Flow 路径） |

**决策：方案 A（完整退役，但省去 ReflectFlow 线程树化）**

理由：
1. ReflectFlow 是"死 stub"——线程树 engine 根本没接通 `deliverToSelfMeta`，所有 `stones/*/reflect/data.json` 是 messages=[] 的空模板，历史 flow 里只有 2 个早期实验提过 `reflect` 字符串。这不是"活功能需要迁移"，而是"未启用功能需要先退栈"。
2. `Flow.ensureReflectFlow` 保留为"空目录+空 data.json stub"的纯持久化函数（留在 writer.ts 里），world.ts 里去掉所有 ReflectFlow 调度逻辑。未来若真要做线程树版 ReflectFlow，作为独立迭代重新设计（反正现在也没人用）。
3. server.ts 的 `/pending-output` / `/debug-mode` / `stepOnce` 接口在线程树模式下**本来就不工作**（没有 `_pendingOutput` 字段存在的途径）——直接删掉这些端点和前端 `PausedPanel`。线程树用 `/api/debug/enable`（写 debug 文件到 llm.input.txt/llm.output.txt）和 `/api/global-pause/enable`（暂停执行）的两个独立端点替代，概念更清晰。
4. 前端 `FlowDetail.tsx` 的 PausedPanel 和 `debugMode` 相关 UI 可以简化为"不再展示"——因为线程树模式下永远不会进入 pausing 状态。

因此阶段映射：
- **阶段 1**：talkToSelf / replyToFlow → 保留为 stub（返回错误消息"未启用"），删除 world.ts 的 `deliverToSelfMeta` / `deliverFromSelfMeta` / `_ensureReflectFlow`。
- **阶段 2**：Session 落盘 → `_wrapThreadTreeResult` 改为 `writeFileSync`，`talk()` 返回类型从 `Flow` 改为 `TalkResult`（含 sessionId/status/messages/actions 字段）。
- **阶段 3**：**跳过**（ReflectFlow 不做线程树版，作为未来独立迭代）。
- **阶段 4**：Server debug 接口 → 删除 `/pending-output` / `/debug-mode` / `step`；删除前端 `PausedPanel`；`resumeFlow` 简化。
- **阶段 5**：清理 `kernel/src/flow/*`、`world/scheduler.ts`、`session.ts`、world.ts 的双分支。
- **阶段 6**：MockLLMClient 精简（移到迭代 2）。

**E2E 门禁**（每阶段后必须通过）：
1. 阶段 1 后：服务起来 + POST `/api/talk/bruce` 简单对话（不触发 sub_thread）→ 返回正常。
2. 阶段 2 后：同上 + 触发 create_sub_thread → 前端 SSE 能接到事件，落盘 data.json 存在。
3. 阶段 4 后：全量测试 + 启服测试 talk。
4. 阶段 5 后：`bun test` 0 fail，`world.ts < 900 行`，`rg Flow\\.load` 全仓无匹配。

### 2026-04-21 接手状态核对

进入本轮执行时发现 kernel submodule 已含 commit `64d68ab`（阶段 2a — 线程树路径去 Flow 依赖）。核对结果：

- **阶段 1（talkToSelf/replyToFlow）已由该 commit 顺带完成**：`world.ts` 已无 `talkToSelf` / `replyToFlow` 方法，也无 `deliverToSelfMeta` / `deliverFromSelfMeta` / `_ensureReflectFlow`。
- **阶段 2（Session 落盘兼容层）已由该 commit 完成**：`_talkWithThreadTree` / `_wrapThreadTreeResult` 通过 `writeThreadTreeFlowData` 落盘 + 返回 `TalkReturn`（纯数据对象），不再 `Flow.load`。
- **阶段 3（ReflectFlow 线程树化）**：按方案 A 跳过（ReflectFlow 是未启用功能，独立迭代处理）。
- **阶段 4（Server debug 接口）**：**待做**。`server.ts` 仍有 `/pending-output`（line 253）和 `/debug-mode`（line 313）两处 `await import("../flow/index.js")` + `FlowClass.load`；前端 `FlowDetail.tsx` 仍有 `PausedPanel` 依赖 `flow.data._pendingOutput`（线程树模式下永远不触发）。
- **阶段 5（清理）**：**待做**。`kernel/src/flow/*` 目录、`world/scheduler.ts`、`world/session.ts`、`world/router.ts` 仍存在；5 个旧 Flow 测试文件仍跑。
- **阶段 6（MockLLMClient）**：移到迭代 2。

当前剩余增量 = 阶段 4 + 阶段 5。

### 2026-04-21 阶段 4 执行

**代码改动**
- `kernel/src/server/server.ts`：删除三个仅在旧 Flow 架构下工作的调试端点：
  - `GET /api/stones/:name/flows/:flowId/pending-output`
  - `POST /api/stones/:name/flows/:flowId/step`
  - `POST /api/stones/:name/flows/:flowId/debug-mode`
  以注释块替代，说明线程树架构的 pause/step 走 `llm.input.txt`/`llm.output.txt` 文件级调试。
- `kernel/web/src/features/FlowDetail.tsx`：删除 `PausedPanel` 组件和 `resumeFlow` import，组件头文档注明线程树架构下没有 pending state。

**验证**
- `bun test`：577 pass / 1 skip / 0 fail（不变）。
- 启动服务 + `POST /api/talk/bruce "你好"`，session `s_mo8kpggc_t9jjg5` 正常走完，status=finished，bruce 返回自我介绍。

**commit**：`7f8acf8` refactor: 阶段 4 — 删除 Server debug 接口和前端 PausedPanel（2 files, +17 -192）。

### 2026-04-21 阶段 5a 执行

**接手时发现**：commit `64d68ab`（阶段 2a）之后，上一轮 session 在工作树上继续编辑了 world.ts / cli.ts，完成了 `_useThreadTree` 分支清理但未 commit。此次直接整合提交。

**代码改动**
- `kernel/src/world/world.ts`：1512 → 665 行。
  - 删除 `useThreadTree` 配置字段 + `_useThreadTree` 实例字段。
  - 删除 `implements Routable`。
  - 删除 `_activeSessions` / `_createAndRunFlow` / `_resumeAndRunFlow` / `_resumePausedFlow` / `_autoResumeSession` / `_loadExistingSubFlows` / `_ensureReflectFlow` / `deliverMessage` / `deliverToSelfMeta` / `deliverFromSelfMeta` / `talkToSelf` / `replyToFlow` 等旧 Flow 路径方法。
  - 不再 import Flow / Session / Scheduler / createCollaborationAPI。
  - `talk()` / `resumeFlow()` / `stepOnce()` 全部改为 TalkReturn 返回类型，直接经 thread/engine 执行。
- `kernel/src/cli.ts`：删除 `OOC_THREAD_TREE` 环境变量读取和 `useThreadTree` 配置传递。

**验证**
- `bun test`：577 pass / 1 skip / 0 fail（不变，旧 Flow 测试还没删）。

**commit**：`2786509` refactor: 阶段 5a — world.ts 去除 _useThreadTree 分支与旧 Flow 调度逻辑（2 files, +82 -931）。

### 2026-04-21 阶段 5b 执行

**文件删除**
- `kernel/src/flow/` 整个目录（flow.ts / index.ts / parser.ts / thinkloop.ts）
- `kernel/src/world/scheduler.ts`
- `kernel/src/world/session.ts`
- `kernel/src/world/router.ts`
- 6 个旧 Flow 测试：`tests/flow.test.ts`、`tests/meta-programming.test.ts`、`tests/exp045-fixes.test.ts`、`tests/concurrent-focus.test.ts`、`tests/parser.test.ts`、`tests/collaboration.test.ts`

**小修**
- `kernel/src/world/index.ts`：移除 Session / createCollaborationAPI / Routable / CollaborationAPI 导出。
- `tests/world.test.ts:118`：删除 `useThreadTree: true` 参数。

**文档同步**
- `docs/meta.md` "架构过渡说明" 改为 "架构说明"，描述线程树是唯一路径。
- `docs/工程管理/规范/代码规范.md`：不再把 `OOC_THREAD_TREE=0` 作为永久迁移策略示例。
- `docs/工程管理/目标/当前迭代.md`：P1 线程树清理标记完成。

**验证**
- `bun test`：464 pass / 0 fail / 0 skip（从 577 pass / 1 skip 减少 113 pass + 1 skip，全部是被删测试覆盖的用例）。
- web tsc：只有预存 4 个错误（OocLogo / @codemirror/merge），无新增。
- 全仓 `rg 'Flow\.load|_useThreadTree|OOC_THREAD_TREE'`（排除 node_modules + 历史 docs）无匹配。
- E2E：`POST /api/talk/bruce "请开一个子线程做一件小事..."`，bruce 成功 `open(create_sub_thread)` → `submit` 创建子线程 `th_mo8kwkp2_ed5uwh` (title=写五言绝句)，接着 `open(await)` → `submit` → `wait`，父线程 status=waiting，子线程 status=doing，符合线程树行为（等待子线程完成回传）。

**commit**：`5bde8dd` refactor: 阶段 5b — 删除 kernel/src/flow/ 目录和旧 Flow 架构剩余文件（15 files, +4 -6988）。

## 最终总结

**kernel submodule commits**（3 个新 commits，加上接手时已有的 `64d68ab` 共 4 个阶段）
- `64d68ab`（接手时已在 HEAD）refactor: 阶段 2a — 线程树路径去 Flow 依赖
- `7f8acf8` refactor: 阶段 4 — 删除 Server debug 接口和前端 PausedPanel
- `2786509` refactor: 阶段 5a — world.ts 去除 _useThreadTree 分支与旧 Flow 调度逻辑
- `5bde8dd` refactor: 阶段 5b — 删除 kernel/src/flow/ 目录和旧 Flow 架构剩余文件

**测试基线**
- 开始：577 pass / 1 skip / 0 fail
- 阶段 4 后：577 pass / 1 skip / 0 fail
- 阶段 5a 后：577 pass / 1 skip / 0 fail
- 阶段 5b 后：**464 pass / 0 fail / 0 skip**（减少的是删除的 6 个旧 Flow 测试文件）

**代码规模变化**
- `kernel/src/world/world.ts`：1512 行 → 665 行（-847，-56%）
- 删除目录/文件：`kernel/src/flow/` 全目录 + `kernel/src/world/{scheduler,session,router}.ts`
- 总删除行数：阶段 4 +5a +5b 合计 +103 / -8111

**方案选择**
选择方案 A（完整退役，跳过阶段 3 ReflectFlow 线程树化）。原因：阶段 0 调研显示 ReflectFlow 在线程树路径下**从未启用**（`deliverToSelfMeta` 回调从未注入，所有 `stones/*/reflect/data.json` 是 messages=[] 空模板）。不值得为未启用功能写线程树等价实现，作为独立 backlog 处理即可。

**未完成项（ReflectFlow 线程树化）**
- `kernel/src/thread/collaboration.ts` 中 `talkToSelf()` / `replyToFlow()` 保留，当前返回 "未配置 ReflectFlow"（因为 world 不再注入 `deliverToSelfMeta`）。未来若要启用常驻自我对话，需独立迭代设计线程树版 ReflectFlow。
- `kernel/traits/reflective/reflect_flow/` trait 保留不动——它仍可以被对象激活，只是 talkToSelf 暂时无目的地。

**非预期发现**
1. 进入本轮时工作树里已有大量未提交的 world.ts / cli.ts 改动（显然是前一次 session 做到一半）。通过 `git diff HEAD` 分层提交，避免了误刷覆盖。
2. 阶段 1（talkToSelf / replyToFlow）、阶段 2（Session 落盘）本质上在 commit `64d68ab` 已完成，本轮实际新做的是阶段 4 / 5a / 5b。
3. `tests/world.test.ts:118` 有一个 `useThreadTree: true` 显式参数，在阶段 5a 清理 WorldConfig 后会编译错误，已在阶段 5b 同步修复。
