---
title: 划清 core ↔ builtin class 边界——thread 强耦合逐点退潮（增量 issue）
status: draft
date: 2026-06-22
---

# 划清 core ↔ builtin class 边界（thread 案例）

> **增量 issue**：目标是把 OOC core 与 builtin class 的边界划分清楚——core 出泛型机制、builtin 出 policy/业务（范本 `core/runtime/object-lifecycle.ts:8`「本模块泛型、零 thread builtin import……policy 活在 thread builtin 的钩子 body」）。本轮聚焦 **thread** 这个跨维度最密、与 core 耦合最深的 builtin。
>
> 工作方式：用户**逐点**提出要拆的耦合处，Supervisor 逐点更新本 issue「改动提案」→ 视不可逆性拉 review → 在 worktree 分支 `feat/thread-core-boundary` 落地。每点落地后回流一致性。

## 背景 / 动机

OOC 朝 OOP 哲学推进——系统概念以 builtin class/object 表示在 `packages/@ooc/builtins`。但部分 builtin（尤以 thread）的逻辑仍**寄居 core**，core 反过来内联读 builtin 的业务字段，边界糊成一团。范本（object-lifecycle.ts）证明正确分层可行：core 泛型协调器只读骨架结构字段、经 registry/接口调 class policy，零 builtin import。本 issue 把 thread 剩余的越界处逐一退潮。

## 现状（thread ↔ core 耦合的已了与未了）

**已退潮并合入 main**（[[2026-06-21-thread-builtin-business-retreat]]，verified）：
- **A. compress 退潮**：compress policy（触发/spawn/seed/force-wait/harvest）搬入 thread builtin `compress.ts`，`CompressV2Win`→`ThreadWin`；core 留框架（budget/WindowManager/compress-trigger/snapRangesToToolPairs）经 blessed import 调。
- **B. onChildTerminal 退潮（relocate 形态）**：`emitChildEndNotifications`（含 endSummary/endReason/isSummarizer 业务字段读）搬入 thread builtin `child-notify.ts`，core scheduler 经 blessed import 只调、零业务字段读；保留 marker→inbox→wake 既有唤醒。
- **E. unactive 改通知 + canceled 退役**：thread.unactive non-terminal→发自身 inbox「无订阅者」通知、不 cancel/不级联；退役 `canceled` 全树 + `cancelSubtree`；refcount 保持统一计数。

**尚未退潮**（前序 draft [[2026-06-21-thread-as-referencable-object]] 持有，本 issue 为 thread-only clean restart、与该 draft 并存，落点冲突时本 issue 优先并回收该 draft 相关条目）：
- **peer-ref 投影**：`referencedObjectId`（object-lifecycle.ts:43）对 peer 会话窗返 undefined；caller 会话窗还不是对 callee thread 的 ref。
- **say 单写（读侧）**：caller/callee 双写镜像（talk-delivery.ts:198-199）未收敛为单写 + caller 经 ref 投影。
- **say inline 写对端 status**：talk-delivery.ts:206-210 + session-methods.ts:104-109 仍内联写 peer.status，未归框架调度。
- **`enqueueThread`（runtime，泛化 notifyThreadActivated）+ 终态复活**。
- **onChildTerminal 零副本重投影 + 消费游标**：B 落地为 relocate（保留 marker），未改「调度 creator + 重投影」。
- **D check 规则**：扫 scheduler/compress 禁读 thread 业务字段（retreat 已使 scheduler 零业务读，未钉成 enforceable check）。

**index.md 锚点**：`## thinkable` / `## thread`（E 区）/ `## collaborable` / `## executable` / `## OOC Class/Object Model` 核心 10。

## 改动提案

> 逐点填充——用户每提一处耦合，在此追加一节（`### 点 N · <标题>`：现状锚点 / 改法 / 受影响元素 / 是否需 fan-out）。

（待用户提出第一点。）

## 受影响设计元素

> 随每点改动提案在此累积；对照 `knowledge/index.md` 的 `##` 元素清单逐一列出。

（待填充。）

## 风险与权衡

- **触发模型锁 level-triggered**（continue-重启唤醒 + 崩溃重扫恢复的前提），不改 edge-triggered。
- **观测漂移**（[[feedback_e2e_observation_drift]]）：删/改事件 producer，visible/observation helper 读死 event kind 易静默漂移——列入落地验收硬约束。
- **大重构延后修测试**（[[feedback_refactor_defer_test_fixes]]）：中间增量坏测试只登账本、全改完统一跑绿。
- **与前序 draft 的范围交叠**：本 issue thread-only clean restart，须显式声明哪些条目从 [[2026-06-21-thread-as-referencable-object]] 回收，避免两 issue 双头落地。

## 待裁决点

- 与 [[2026-06-21-thread-as-referencable-object]] draft 的收口：本 issue 推进的 thread 条目落地后，该 draft 是否标 superseded。
- 各点 fan-out 重量：按「删/退役/可逆/grep 可验回归 → 轻流程；加机制/动核心 loop/不可逆 → fan-out」逐点判。

## review 记录

（逐点 fan-out 后由 Supervisor 汇总。）

## 裁决

（逐点裁决 + 落地与一致性回流清单；worktree 分支 `.worktree/thread-core-boundary`〔`feat/thread-core-boundary`〕。）

## 落地验收

（`landed` 后由 Supervisor 汇总验收 reviewer 意见。）
