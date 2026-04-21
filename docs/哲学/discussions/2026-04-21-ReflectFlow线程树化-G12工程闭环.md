# ReflectFlow 线程树化 — G12 沉淀循环的工程闭环（最小可用）

> 日期：2026-04-21
> 所属迭代：`docs/工程管理/迭代/finish/20260421_feature_ReflectFlow线程树化.md`
> 涉及基因：G5（注意力与遗忘）、G12（经验沉淀）

## 背景

在"旧 Flow 架构退役"迭代（2026-04-21 早）中，ReflectFlow（对象常驻自我反思机制）被保留为 backlog——旧 Flow 路径下它从未被真正启用（`deliverToSelfMeta` 未注入 + `stones/*/reflect/data.json` 是空 stub），因此没随旧 Flow 迁移到线程树架构。

但 ReflectFlow 是 **G12 沉淀循环**的工程通道：

> 经历 → 记录 → 反思 → 审视 → 沉淀为 trait → 改变下次的帧 0

没有这条通道，对象每次 session 都"从零开始"——无法把经验沉淀为长期记忆或 trait。

## 方案决策

三个候选：
- **A（最小可用）**：先把"投递 → 落盘到反思线程 inbox"这一截管道跑通；反思线程暂不触发 ThinkLoop 执行，后续迭代接入调度器。
- **B（完整实现）**：含反思专属 trait 权限、memory.md 自动注入、沉淀写入工具。
- **C（哲学优先）**：先与 Sophia 层深度对齐 G12 语义再设计。

**选 A**。理由：

1. **反思线程执行**需要跨 session 常驻调度器（当前 `ThreadScheduler` 与 session 生命周期绑定），这是比本迭代大得多的工程量。先把管道打通，能让后续迭代有明确的扩展点。
2. **LLM 做判断，代码做记账**（OOC 决策原则 4）：反思"什么值得沉淀"由 LLM 判断，代码的工作是把通道建好。管道不通时讨论 LLM 策略是空中楼阁。
3. **示例 > 规则**（决策原则 5）：跑通一次 `bruce → callMethod("reflective/reflect_flow", "talkToSelf", ...)` → `stones/bruce/reflect/threads.json` 落盘，后续实装就有具体参照物。

## 工程实现要点

1. **复用线程树基础设施**。`stones/{name}/reflect/` 用与普通 session 相同的 `threads.json + threads/{id}/thread.json` 结构。这样后续接调度器时可以直接复用 `ThreadScheduler`，只需解除"必须属于一个 session"的约束。

2. **通过 trait llm_methods 暴露 API，不改 engine 主路径**。engine 的沙箱已经集成 `MethodRegistry.callMethod`，只需给 `reflective/reflect_flow` trait 加 `llm_methods: { talkToSelf, getReflectState }`，LLM 就能在 program 里用 `await callMethod(...)` 调用。**engine.ts 零改动**——与并行的 Talk Form 迭代解耦。

3. **collaboration.ts 的 talkToSelf 走同一套实现**。虽然当前 engine 未接 CollaborationAPI，但为了保留"deliverToSelfMeta override"的语义与将来一致性，`executeTalkToSelf` 路由优先级：deliverToSelfMeta 回调 → stoneDir → 错误。

4. **线程复活自动化**。`ThreadsTree.writeInbox` 原本就有"done 线程收到消息自动 running + revivalCount +1"的逻辑——反思线程首轮反思完成后进入 done，下次投递自动复活。后续调度器只需检测 `revivalCount` 或 running 状态即可。

## 完整的 G12 闭环映射（当前状态）

| 阶段 | 当前状态 | 工程载体 |
|------|----------|----------|
| 经历 | ✅ 任意线程的日常执行 | Engine 主路径 |
| 记录 | ✅ LLM 判断 + `callMethod` 调用 | `callMethod("reflective/reflect_flow", "talkToSelf", ...)` |
| 投递到反思线程 inbox | ✅ 本迭代实装 | `reflect.ts::talkToReflect` + `ThreadsTree.writeInbox` |
| 反思线程 ThinkLoop 执行 | ❌ 待后续迭代 | 需要跨 session 常驻调度器 |
| 审视与分类 | ❌ 待后续迭代 | 反思线程的 LLM 判断逻辑 |
| 沉淀为 memory.md / trait | ❌ 待后续迭代 | `persist_to_memory` / `create_trait` 工具 |
| 下次 Context 自动注入 | ❌ 待后续迭代 | `context-builder.ts` 改造（memory 区段） |

**前半段（经历 → 投递到 inbox）现在闭环**。后半段（反思 → 沉淀 → 复用）留待未来。

## 与 G5（注意力与遗忘）的关系

G5 的"三层记忆模型"：

- **短期（Session）**：当前 session 的 inbox / actions / locals，session 结束释放
- **中期**：task / thread 完成后的 summary（仍在同一 session 中可见）
- **长期（Self）**：memory.md、readme.md、trait

反思线程的 **inbox** 现在是 G5 的一个特殊的"中期缓冲区"——跨 session 可见，但尚未沉淀到长期。调度器实装后，这个 inbox 的消息会经反思被"进一步压缩"沉淀到长期记忆，形成完整的三层流转。

## 关键的哲学承诺

- **反思是对象主动的**：`talkToSelf` 由 LLM 判断"这条值得记"后主动调用，不是系统定期扫描然后触发。这符合"LLM 做判断，代码做记账"。
- **反思是独立思考**：反思线程有自己的 root 线程、自己的上下文、自己的 inbox——它不是主线程的一个 slot，而是对象的另一个"内心独白"。这体现了对象内部的多重思考维度。
- **反思是沉淀而非重复**：调度器实装后，反思线程的工作是把"重复出现的经验"压缩为长期记忆/trait，而不是把每条投递都永久保留。inbox 的溢出机制（50 条 unread 上限 → 自动 mark ignore）本身就是这种压缩的一部分。

## 相关代码与文档

- `kernel/src/thread/reflect.ts` — 落盘 API
- `kernel/src/thread/collaboration.ts` — talkToSelf 真实现（路由到 reflect.ts）
- `kernel/traits/reflective/reflect_flow/TRAIT.md` + `index.ts` — trait 定义 + llm_methods
- `docs/meta.md` 子树 3 — 整体架构描述（本迭代后已更新）
- `docs/哲学/genes/` — G5、G12 原理（本迭代未改动 gene，映射关系在此讨论中明确）
