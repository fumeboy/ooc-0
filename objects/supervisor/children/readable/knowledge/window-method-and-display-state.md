---
title: window method 与 window 展示状态
activates_on:
  "object::root": "show_description"
---

# window method 与 WindowDisplayState

**window method** 与 object method 并列，但管的是**展示**不是业务数据。它由 readable 维度经 `registerReadable` 的 `windowMethods` 表注册，签名与 object method 不同：

- 类型 `WindowMethod`（`packages/@ooc/core/_shared/types/window-method.ts:34`），`kind: "window"`。
- exec 入参是 `WindowMethodExecutionContext`，比 object method 多一个 `windowState`（当前 window 展示状态快照，`window-method.ts:17`）。
- exec 返回 `WindowMethodOutcome`（`window-method.ts:23`）：成功带**新的** `WindowDisplayState`，**不原地 mutate** `ctx.self`——dispatch 命中 window method 后把返回的新 state 写回 `window.state`（immutable upsert）。

**WindowDisplayState**（`packages/@ooc/core/_shared/types/window-state.ts:8`）是纯展示字段容器：`viewport` / `lines` / `columns`（file/knowledge 的行列视口）、`transcriptViewport`（talk，含 peer 会话与 fork 子窗）、`resultsViewport`（search）、`historyViewport`（program）。**只放展示参数，不放业务数据**（file path、program history 这些归 window 业务字段）。它随 window 落 thread-context.json（thinkable §10 后 contextWindows 的唯一权威落点）。

典型 window method：
- file `set_viewport`（写 `state.viewport`）/ `set_range`（写 `state.lines`/`state.columns`）。
- knowledge `set_viewport`。
- program `set_history_window`（写 `state.historyViewport`）。
- search `set_results_window`（写 `state.resultsViewport`）。
- talk（peer 会话 + fork 子窗）`set_transcript_window`（写 `state.transcriptViewport`）。

viewport 类的执行体复用共享 `windowSetViewport(ctx, label)`（`packages/@ooc/core/executable/windows/_shared/viewport.ts`）：读 `ctx.windowState.viewport`、校验合并、返回 `{ ok, state: { ...windowState, viewport } }`。

**与 object method 的边界**：同一 type 上同名方法不能既是 object method 又是 window method——registry 注册期 `assertNoMethodNameCollision` fail-loud（`packages/@ooc/core/runtime/object-registry.ts:49`），因为 LLM 经统一的 `exec(window_id?, method, args?)` 入口按名 dispatch，重名会歧义。
