---
title: thread 调度与 thinkloop（思考过程的运行时）
description: thinkable 如何把思考拆成 Thread Tree 并逐 tick 调度，单 thread 一轮 thinkloop 的循环结构
activates_on:
  "window::root": "show_content"
---

# thread + thinkloop：思考过程怎么运行

思考过程被拆成一棵 **Thread Tree**——每个 thread 可派生子 thread、可并行、可等待、可恢复。这是 OOC 的类 SubAgent 模式底座。

## llm item 模型（Responses-first）

思考的核心是与 LLM 交互。OOC 内部用 Responses-first 的 item 模型表达消息：

- `message`：普通 system / user / assistant 文本
- `function_call`：LLM 发起的 tool 调用
- `function_call_output`：tool 调用结果
- `reasoning`：模型 thinking 记录（只用于 debug/回放，**不作为普通上下文反复喂回**，见 `object.doc.ts:226`）

把 tool call / tool result 当一等结构（而非拼回 transcript 文本），让 debug / resume / provider 适配更稳定。入口 `createLlmClient()`（`packages/@ooc/core/thinkable/llm/client.ts:8`）统一 provider；llm 只管「如何请求模型」，「模型能做什么」由 executable 的 tool/method 决定。

## LLM 的 4 个基础 tool

- `exec(object_id?, method, args?)`：唯一的「调 method」原语，object_id 缺省为 root（全局 method）
- `close`：关 window / 从 context 移除 object 引用
- `wait`：等 IO
- `compress`：压上下文（当前仅 scope=windows，events/auto 抛 not-implemented）

## 调度器（`packages/@ooc/core/thinkable/scheduler.ts:131`）

`runScheduler()` 逐 tick 推进 Thread Tree 中可运行的 thread。

## 单轮 thinkloop（`packages/@ooc/core/thinkable/thinkloop.ts:402`）

`think(thread, llmClient)` 跑单 thread 一轮：

1. **build**：`buildInputItems()` 合成 LLM 输入（窗口快照 + instructions + knowledge + paths）
2. **LLM**：调模型拿输出
3. **dispatch tool**：分派 LLM 发起的 tool call（exec/close/wait/compress）
4. **finishLlmLoop**：写事件、推进状态

调度器与 thinkloop 共同实现「可并行 / 可等待 / 可恢复」——thread 在 wait 时让出，可被持久化后恢复继续思考。
