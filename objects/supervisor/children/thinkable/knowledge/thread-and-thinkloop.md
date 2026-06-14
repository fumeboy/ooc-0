---
title: thread 调度与 thinkloop（思考过程的运行时）
description: thinkable 如何把思考拆成 Thread Tree 并逐 tick 调度，单 thread 一轮 thinkloop 的循环结构
activates_on:
  "object::root": "show_description"
---

# thread + thinkloop：思考过程怎么运行

思考过程被拆成一棵 **Thread Tree**——每个 thread 可派生子 thread、可并行、可等待、可恢复。这是 OOC 的类 SubAgent 模式底座。

## 为什么要 Thread Tree（设计理由）

一个 Object 一次 session 不是一条线性对话。拆成树拿到四件事：
1. **焦点隔离**：主任务不被子任务细节污染。
2. **作用域隔离**：不同子任务激活不同 knowledge / windows。
3. **并行执行**：多个 running thread 由 scheduler 分别推进。
4. **协作显式化**：跨 thread 信息流必须过 message / transcript，**不共享内存**——所有协作痕迹可观察、可回放、可 debug。唯一例外是 do_window.move 提供的跨 thread window ref/移交。

thread 状态语义：running（可被调度跑下一轮）/ waiting（等 talk/do window 上的 IO）/ done（任务完成，但新 inbox 消息可重新唤醒）/ failed（严重错误，新消息也可重入 running）/ paused（控制面暂停待人工 resume）。

## sub-thread vs child Agent —— 委派任务时分的是什么

「让别的执行体替我干活」有两种机制，性质和代价完全不同：
- **fork sub-thread**（同 object，do method + do_window）：把自己「分身」成并行子线程，子 thread **共享我这个 object 的 seed / pool**，只有 session / thread-local 状态独立；临时，session 结束即归档，无独立身份。分的是**算力**。
- **建 child Agent**（跨 object，物理嵌套 `children/<child>/`）：独立 object，有自己的 seed/sediment/super/self.md，经 talk 协作；持久、跨 session、可被独立发现引用。分的是**身份与经验**。

固化触发器：同一类 sub-thread 任务在多个 session 反复出现、每次都要重喂同样领域知识时，就该固化成 child Agent——把反复用的领域知识沉淀进 child 的 seed knowledge（接 knowledge 的 inheritable 继承）。

## llm item 模型（Responses-first）

思考的核心是与 LLM 交互。OOC 内部用 Responses-first 的 item 模型表达消息：

- `message`：普通 system / user / assistant 文本
- `function_call`：LLM 发起的 tool 调用
- `function_call_output`：tool 调用结果
- `reasoning`：模型 thinking 记录（只用于 debug/回放，**不作为普通上下文反复喂回**——否则 LLM 会 meta-thinking、transcript 膨胀、旧推理干扰当前判断）

把 tool call / tool result 当一等结构（而非拼回 transcript 文本），让 debug / resume / provider 适配更稳定。入口 `createLlmClient()`（`packages/@ooc/core/thinkable/llm/client.ts:8`）统一 provider；llm 只管「如何请求模型」，「模型能做什么」由 executable 的 tool/method 决定。

## LLM 的 3 个基础 tool（`thinkable/llm/types.ts:5`）

稳定原语**恒为 3 个**：`exec` / `close` / `wait`。`compress`（信息压缩）不是原语——它是 window method，经 `exec(method="compress")` 调。

- `exec(window_id?, method, args?)`：唯一的「调 method」原语；`window_id` 缺省为 root（root 上的全局 method）。Object Unification 后 window.id = objectId，故 `window_id` 即目标 object。args 齐全立即执行，不齐则系统创建 method_exec form 供后续补齐。`compress` 作为 window method 也经此入口调用。
- `close`：关 window / 从 context 移除 object 引用
- `wait`：等 IO

`compress`（window method，经 exec 调）压上下文：已实现 `scope=windows`（按 target_ids 切 window compressLevel）与 `scope=events`（LLM 提供 summary 折叠事件段，`executable/tools/compress.ts:376`）；仅 `scope=auto` 抛 not-implemented（`compress.ts:372`）：旧 `applyEmergencyGuard` 自动降级已删；scope=auto 预留紧急压缩、策略未定（≠复活旧 guard）。

## 调度器（`packages/@ooc/core/thinkable/scheduler.ts:131`）

`runScheduler()` 逐 tick 推进 Thread Tree 中可运行的 thread。

## 单轮 thinkloop（`packages/@ooc/core/thinkable/thinkloop.ts:362`）

`think(thread, llmClient)` 跑单 thread 一轮（只接受 `status==="running"`，否则抛错视为调用方错误）：

1. **build**：`buildInputItems()` 合成 LLM 输入（窗口快照 + instructions + knowledge + paths）
2. **LLM**：调模型拿输出
3. **dispatch tool**：分派 LLM 发起的 tool call（exec/close/wait；compress 经 exec 拦截分派）
4. **finishLlmLoop**：写事件、推进状态

调度器与 thinkloop 共同实现「可并行 / 可等待 / 可恢复」——thread 在 wait 时让出，可被持久化后恢复继续思考。
