---
title: loop-level debug 落盘 —— 每轮思考的可回放产物
description: LlmObservation + loop_NNNN.{input,output,meta}.json + windowsSnapshot
activates_on: {"object::root": "show_description"}
---

# loop-level debug 落盘

observable 在 thinkloop 周围加观测点，把每一轮 LLM 调用的输入/输出/元数据落盘，供控制面回放与前端 Time Machine 做 window diff。**所有写盘动作委托 `packages/@ooc/core/observable/debug-file.ts`**，observable 只决定「何时写 / 写什么」。

## LlmObservation（内存最近一次）

`~~packages/@ooc/core/observable/index.ts:87~~（已删除）-118`：
- `writeLatestLlmInput` / `writeLatestLlmOutput`：thinkloop 在请求前后调用；有 persistence 时同步落盘 `llm.input.json` / `llm.output.json`（始终落盘，与 debug 开关无关）。
- `getLatestLlmObservation`：测试与控制面读取最近一次 input/output/provider/model。

**单例约束**：LlmObservation 是模块顶层变量，同进程只反映最近一次调用；并发多 thread 谁后写谁覆盖。要按 thread 区分历史，请用下面的 loop-level debug 文件。

## loop_NNNN 三类文件（默认关闭，enableDebug 开启）

`~~packages/@ooc/core/observable/index.ts:126~~（已删除）-221` 的 `beginLlmLoop` / `finishLlmLoop` 分配 loopIndex（4 位 0 padding）、计时、字节统计，开启后写 `<threadDir>/debug/`。落点路径由 `~~packages/@ooc/core/observable/debug-file.ts:154~~（已删除）` 的 `debugDir(ref)` = `threadDir(ref)/debug` 解析，`threadDir`（`persistable/common.ts:72`）= `objectDir/threads/<tid>`、`objectDir`（同文件:61）= `flows/<sid>/objects/<nestedObjectPath>`——即运行时统一落 `flows/<sid>/objects/<id>/threads/<tid>/debug/`，与 stone identity 同落 `objects/<id>/`。三类文件：
- `loop_NNNN.input.json`：本轮 inputItems + contextSnapshot。
- `loop_NNNN.output.json`：normalized outputItems + provider/model。
- `loop_NNNN.meta.json`：provider / model / latencyMs / messageCount / toolCount / toolCallCount / contextBytes / status / error / **windowsSnapshot**（每条 entry `{id, class, contentHash, parentWindowId?, status?, fileDiff?}`）。

loopIndex 由 `~~packages/@ooc/core/runtime/observable-store.ts:94~~（已删除）-110` 的 `loopKey` + `allocateLoopIndex` 分配。

**为何按 persistence 分两套 key**（observable-store.ts:94-98）：
- 有 persistence：key = `{baseDir}:{sessionId}:{objectId}:{threadId}`——同一 thread 跨进程（worker 重启 / 多进程）共享计数，loopIndex 连续。
- 无 persistence（测试 fixture / ephemeral）：key = `ephemeral:{thread.id}`——加 `ephemeral:` 前缀隔离，避免不同测试线程 id 偶然相同互踩同一个计数器。ephemeral 线程不落 loop_NNNN.*.json，只维护单进程内的轮次连续性。

## ContextSnapshot（与 XML 同源的结构化快照）

`captureContextSnapshot`（`packages/@ooc/core/observable/debug-file.ts`）从 ThreadContext 抽取调用 LLM 时刻的子集：id / status / plan / contextWindows / inbox / outbox / events / creatorThreadId / parentThreadId。

**关键取舍——同源而非二次解析**：同一份 thread 状态先 render 成 system message XML 喂给 LLM，再 capture 成 JSON 给 UI。两条路同源，所以 UI 拿到的是 LLM 真正看到的那一份，且**不必 re-parse XML**——直接渲染结构化字段。contextSnapshot 字段附在 LlmInputDebugRecord 上，写进 `llm.input.json` / `loop_NNNN.input.json`；旧文件无此字段，UI 做兼容判断。

## windowsSnapshot（window content hash）

`packages/@ooc/core/observable/window-hash.ts` 的 `buildWindowsSnapshot`：type-agnostic 算每个 ContextWindow 的 contentHash——`Bun.hash(JSON.stringify(stripVolatile(window), sortedKeys)).toString(36)`。sorted key 防 V8 字段顺序漂移；剥 volatile 与 persist 同款规则。每条 entry 形如 `{id, class, contentHash, parentWindowId?, status?, fileDiff?}`——`fileDiff?` 仅 file_window 计算，含 path + previousContent/currentContent，是前端 CodeMirror Merge 双侧渲染的来源（previousContent 由 finishLlmLoop 从上一 loop meta 拿，二进制 / >200KB 时两侧置 ""）。前端拿 loop N + loop N-1 的 windowsSnapshot 算 added/changed/removed/unchanged 四态 diff（渲染属 visible，observable 只产数据）。
