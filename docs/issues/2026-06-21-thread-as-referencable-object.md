---
title: thread 成为一等可引用 object——peer-ref 投影 + unactive 通知模型 + refcount 订阅语义
status: draft
date: 2026-06-21
---

# thread 成为一等可引用 object

> 从 `2026-06-21-thread-kernel-boundary-reconciler-hooks`（收敛重建为 [[2026-06-21-thread-builtin-business-retreat]]）**拆出**的 substrate 主题：让 caller 像引用任何 object 一样**引用并投影 callee thread**（say 单写「读侧」的底座）。
>
> **⚠️ 范围收窄（2026-06-21）**：unactive 通知模型（原 B）+ refcount 订阅语义（原 C）**已折入 retreat issue 本批落地**（它们不依赖 peer-ref、是纯 thread-class policy + 生命周期改动）。本 issue **只剩 A（peer-ref 投影 + say 读侧：caller 投影 callee thread + 删 caller outbox 镜像 + worker.ts:263 退役）**。下方 B/C 节作背景保留，实施归 retreat。backlog 认领收窄为「扩 **peer**」（member 已由 split P1 落地）。

## 背景 / 动机

「thread builtin 业务退出 core」（retreat issue）把 thread 的业务逻辑退回 builtin，但暴露一个更深的底座缺口：**thread 还不能像普通 object 那样被另一个 thread「引用并投影」**——
- caller 与 callee 的一场对话，文档设计是「一个 thread 实例、两方按视角投影」，但代码是双写镜像（retreat issue ③），根因是 caller 的会话窗**不是对 callee thread 的 ref**（`referencedObjectId` 对 peer 窗返 undefined）。
- 「context window 即引用」+ 引用计数生命周期对 peer 关系尚未自洽（caller 关窗不该杀 running 的平等 callee）。

把这三件（peer-ref 投影 / unactive 通知 / refcount 订阅语义）合一处收口，因它们是同一件事的三面：**thread = 可被引用、可被投影、引用归零有通知的一等 object**。

## 现状

- `referencedObjectId`（object-lifecycle.ts:34-44）：识 objectRef 独立对象窗 + fork 窗；**peer 会话窗一律 undefined**（line 43）。
- `WindowManager.instantiate` 的 objectRef 只给 inline=false 独立对象窗，**不给 inline 的 thread/talk**（window-manager.ts:161）。
- caller 会话窗渲染读**自己 thread** 的 outbox/inbox（talk-render.ts:40-46），非 callee thread。
- thread.unactive（thread/index.ts:210-236）= `cancelSubtree`：refcount→0 切 canceled + 级联（`canceled` 唯一产生点 thread/index.ts:214）。
- refcount 引擎 `countSessionReferences`（object-lifecycle.ts:69-78）：session 内非终态线程中数 `referencedObjectId===target` 的窗，self 门面窗不计。

split issue（`2026-06-21-object-contextwindow-split`，**已 verified 合入 main**）裁决 II 与 lifecycle issue（`2026-06-21-object-activation-lifecycle`，**landed**）backlog 都列了「referencedObjectId 扩 member/peer」却都留作 backlog——本 issue 是三方收口落点。

## 改动提案

**A. peer-ref 投影（R4）**

- `referencedObjectId` 扩展：识别 peer 会话窗 → 解析到 callee thread id（合并 split/lifecycle 的「扩 member/peer」backlog）。
- context builder 投影期：对 peer-ref 窗，加载被引用的 callee thread 并 peer-POV 投影（翻转 in/out：callee.inbox=「我发出的」/callee.outbox=「我收到的」）。投影机制本就在 readable 层（readable/index.ts:62-87 computeProjectionClass + filterTalkMessages），扩输入源即可。
- **诚实边界**：peer callee 默认派进 caller session 但落独立 flow object、不在 caller 内存树（talk-delivery.ts:135-159）→ caller 投影 callee = **readThread 磁盘快照**，非 live 共享（peer 对话本异步，快照可接受，但须写明防虚假 live 安全感）。

**B. unactive 通知模型（R3 —— 前序 issue 已裁决，移入本 issue 实施）**

- refcount **保持统一**（peer 窗照样计数），差异从「算不算引用」挪到「unactive 做什么」：
  - **non-terminal（running/paused/waiting）refcount→0**：thread.unactive **不切 canceled / 不级联**，改往**该 thread 自己 inbox** 发系统消息「creator 已关闭对话窗口，当前已无消息订阅者」（refcount=0 = 无订阅者）。thread 下一轮自决（通常优雅 `end`）；waiting 因 inbox 增长被泛型 wakeup 自然唤醒。
  - **terminal（done/failed）refcount→0**：仅清理 + `{delete?}` 自决。
- **退役 `canceled` + `cancelSubtree`**：改通知后 canceled 无产生者，全树退役（ThreadStatus union/TERMINAL/scheduler.ts:75/worker.ts:303/flows model.ts:71/thread index.ts）；thread 终结一律走 `end`（done）。
- 分层：core 泛型 refcount→派发 unactive 机制不动，只改 thread class unactive policy body。
- 接受「running 但 refcount=0、无观众」宽限态（无强制兜底，契合无强制 destruct）。

**C. refcount 订阅语义统一**

- refcount = thread 的**订阅者计数**（多少个窗在投影/订阅它）；归零 = 无订阅者 → 触发 B 的通知。
- peer 平等天然保住：caller 关窗 = 撤一个订阅，不杀对端（对端自决）。多方对话 = 多订阅者，最后一个撤销才触发通知。

## 受影响设计元素

- `## OOC Class/Object Model` 核心 10：「context window 即引用」+ unactive 语义（通知 vs cancel）+ `canceled` 退役 + `{delete?}`。
- `## thread`（E 区）：thread 作可引用 object（peer-ref）+ unactive policy 改写。
- `## collaborable` / `## collaborable × thinkable`：caller 经 peer-ref 投影 callee thread（say 单写读侧）。
- `## readable` / `## readable × thinkable`：peer-POV 投影输入源 = 被引用 callee thread；磁盘快照语义。
- `## persistable × thinkable`：跨 thread readThread 投影读时机。
- **协调** `2026-06-21-object-activation-lifecycle`（landed，改其 close→cancel→级联契约）+ `2026-06-21-object-contextwindow-split`（verified，承接其 referencedObjectId 扩 member/peer backlog）。

## 风险与权衡

- 改 landed 的 lifecycle 契约（canceled 退役 / unactive 语义）——须协调，非独立可改。
- peer-ref 投影 = 磁盘快照，跨 session readThread 成本 + 非 live（须文档化）。
- refcount 跨 session 算不出（countSessionReferences 只扫本树）——peer 跨 session 时订阅计数语义需界定。

## 待裁决点

- referencedObjectId 扩 peer 与 split/lifecycle backlog 的合并落点与推进顺序。
- 跨 session refcount/订阅计数语义（同 session 本地、跨 session 如何算）。
- unactive 通知消息的精确归属窗（self 门面窗 inbox？）与格式。

## review 记录 / 裁决 / 落地验收

（依赖 retreat issue 推进节奏；本 issue 待 retreat 收口后或并行发起 fan-out）
