---
title: pause 协议 —— tool call 前的人工介入点
description: PauseChecker + permission decider，在不改 Object 行为前提下允许暂停/介入
activates_on: {"window::root": "show_content"}
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
- **silent-swallow ban**：permission 决策不允许静默吞——与 observable 整体的 silent-swallow ban 一致（permission 模型条款 object.doc.ts:1058；observable silent_swallow_ban 节点 object.doc.ts:2400）。

## 控制面端点

把上述内存观测暴露给 UI（`packages/@ooc/core/app/server/modules/runtime/`）：
- `api.enable-global-pause` / `api.disable-global-pause` / `api.get-global-pause-status`：全局暂停开关与状态。
- `api.permission-decision`：人工对 pending tool call 下决策。
- `api.enable-debug` / `api.get-loop-debug` / `api.list-loop-debug`：loop debug 开关与读取。

## 状态复位

`clearDebugState()`（observable-store.ts:156-162）一并清 latest 快照 / debugEnabled / loopCounters / pauseChecker / permissionDecider，供测试间隔离，避免污染。
