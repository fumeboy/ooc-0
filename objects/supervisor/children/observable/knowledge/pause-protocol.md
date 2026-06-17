---
title: pause 协议 —— tool call 前的人工介入点
description: PauseChecker + permission decider，在不改 Object 行为前提下允许暂停/介入
activates_on: {"object::root": "show_description"}
---

# pause 协议

observable 提供 runtime 可注入的**暂停判定器**，在 tool call 执行**之前**生效，让人工（或上层）介入而不改变 Object 自身的行为逻辑。这是「可暂停、可介入」的观测点，不是业务调度。

## PauseChecker

`packages/@ooc/core/runtime/observable-store.ts:90,122-127`：
- `setPauseChecker(checker)`：runtime 注入 `(thread) => boolean | Promise<boolean>` 判定器。
- `isPausing(thread)`：thinkloop 在 tool call 前查询；返回 true 则暂停等待介入。

默认 `() => false`（不暂停）。module-level 导出 `setPauseChecker` / `isPausing` 薄委托 `defaultObservableStore`。

## permission decider

`packages/@ooc/core/runtime/observable-store.ts:91,129-134`：
- `setPermissionDecider(decider | null)` / `getPermissionDecider()`：注入 tool call 的权限决策器。
- **silent-swallow ban**：permission 决策不允许静默吞——与 observable 整体的 silent-swallow ban 一致（permission 模型见 executable child；silent-swallow ban 是本 observable 能力的核心条款）。

## 控制面端点

把上述内存观测暴露给 UI（`packages/@ooc/core/app/server/modules/runtime/`）：
- `api.enable-global-pause` / `api.disable-global-pause` / `api.get-global-pause-status`：全局暂停开关与状态。
- `api.permission-decision`：人工对 pending tool call 下决策。
- `api.enable-debug` / `api.get-loop-debug` / `api.list-loop-debug`：loop debug 开关与读取。

## 两类 paused 的区分（消费方必读）

`thread.status === "paused"` 是**两条语义不同路径**的共同落点，单看 status 无法区分：

1. **HITL 审批 pause**（`packages/@ooc/core/thinkable/thinkloop.ts:280-301`）：permission decider 返回 `ask` → **先 push 一个 `category:"permission", kind:"permission_ask"` event，再** `thread.status="paused"`。靠 reviewer 在决议卡 approve/reject 推进。
2. **系统级 pause**（`thinkable/thinkloop.ts:437-440` 的 `isPausing`，来源 session pause 或 global pause）：**不写任何 permission event**，直接 `thread.status="paused"`。靠 resume（清 pause 标记 + 重新入队）推进。

**唯一可靠判别信号 = 是否存在「未决 permission_ask」**：HITL 必先写 permission_ask 才 pause、系统级必不写，故「有未决 permission event」⟺「HITL 等审批」是协议层 sound invariant。消费方（前端等）**不得**仅凭 `status==="paused"` 推断为 HITL——否则系统级 pause 会被误显示「等待审批中」却找不到决议卡。前端落点：`packages/@ooc/web/src/domains/chat/formatter.ts` 的 `threadHasPendingPermission`（formatThread 结果里 `kind==="permission_card" && !decided`）。

## 内存/落盘失配陷阱

`pause-store`（`packages/@ooc/core/app/server/runtime/pause-store.ts`）是**纯内存**（`Set`+`boolean`），而 `thread.status="paused"` 是**落盘**事实。进程重启 / global-pause 切换后内存标记丢失，但 thread 仍落盘 paused → footer 的 session-pause 状态（读内存 `isSessionPaused`，service.ts:344）显示「未暂停」、thread pill 却是 paused，三处自相矛盾且无恢复入口，thread 永久搁浅。

- 后端正解：resume 的正确性只依赖 `thread.status="paused"` 落盘事实而非 pause 来源（`runtime/resume-orchestration.ts` 已据此设计）；根治内存失配应在 worker 启动 recovery 把落盘 paused thread 纳入恢复扫描。
- 前端兜底：系统级 pause（status=paused 且无未决 permission）须**无条件**给恢复入口，即使内存 `sessionPaused=false`（见 `web/src/app/layout/RightPanel.tsx` RightFooter `systemPaused` 分支）。

## 状态复位

`clearDebugState()`（observable-store.ts:156-162）一并清 latest 快照 / debugEnabled / loopCounters / pauseChecker / permissionDecider，供测试间隔离，避免污染。
