## G2: 对象分为两种基础形态——Stone 和 Flow

<!--
@referenced-by kernel/src/types/object.ts — implemented-by — StoneData
@referenced-by kernel/src/types/flow.ts — implemented-by — FlowData, FlowStatus
@referenced-by kernel/src/stone/stone.ts — implemented-by — Stone 静态形态
@referenced-by kernel/src/flow/flow.ts — implemented-by — Flow 动态形态
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — ThinkLoop 执行引擎
@referenced-by kernel/src/world/session.ts — implemented-by — 同一任务中 Flow 复用
@referenced-by kernel/src/world/scheduler.ts — referenced-by — Flow 状态驱动调度
@referenced-by kernel/web/src/features/FlowDetail.tsx — rendered-by
@referenced-by kernel/web/src/features/EffectsTab.tsx — rendered-by
@referenced-by kernel/web/src/store/flows.ts — referenced-by
-->

并非所有对象都需要思考能力。OOC 定义了两种基础形态：

**Stone（石头）**是纯粹的数据与逻辑载体。
它拥有 G1 中列出的所有组成部分，可以持有数据、定义方法、被其他对象调用。
但它不会主动做任何事——它没有思考能力，不会调用 LLM，不会自主行动。
Stone 就像一块刻了字的石头：信息在那里，但石头不会自己读出来。

**Flow（流）**是 Stone 在执行任务时的动态派生。
当一个 Stone 接收到任务时，系统在其 `effects/` 目录下创建一个 Flow 对象。
Flow 额外拥有：
- **思考能力**：可以调用 LLM 进行推理
- **执行能力**：可以输出程序并在沙箱中运行
- **行为树（Process）**：结构化的计划与执行跟踪（详见 G9）
- **状态机**：running → waiting → pausing → finished / failed
- **消息（messages）**：按时间顺序记录收到（in）和发出（out）的所有消息

Flow 是 OOC 中「做事情」的核心单元。
所有主动行为——思考、决策、执行、对话——都通过 Flow 完成。

**Stone 和 Flow 的关系不是「低级 vs 高级」，而是「静态 vs 动态」。**
一个复杂的工具对象（如文件系统扩展）可能是 Stone，因为它只需要被调用，不需要自主思考。
一个简单的助手对象可能需要 Flow，因为它需要理解指令并自主行动。

**一个 Stone 可以同时拥有多个 Flow**——每个任务对应一个 Flow，
它们在 `effects/` 目录下并行存在，互不干扰。

### 对象视角：Self、Session、SelfMeta

Stone 和 Flow 是系统内部术语。对对象自身而言，它感知到的是三个概念：

| 系统概念 | 对象视角 | 含义 |
|---------|---------|------|
| Stone 持久化目录 | **Self**（自我） | "我是谁"——跨越所有任务的持久身份、记忆、能力 |
| Flow 持久化目录 | **Session**（此刻） | "我现在在做什么"——当前任务的工作空间，任务结束即消散 |
| `_selfmeta` Flow | **SelfMeta** | "自我的管理者"——维护 Self 长期数据的常驻 Flow |

**Session 只能写自己的目录。** `setData`、会话记忆、文件操作都在 Session 目录下。
Session 中的一切，任务结束后不再加载到新任务的 context 中（除非写了 flow summary）。

**Self 只能通过 SelfMeta 修改。** 普通 Flow 没有任何直接写 Self 目录的 API。
想把 Session 中的收获沉淀到 Self，唯一的方式是 `talkToSelf(message)` —— 向 SelfMeta 发消息。

**SelfMeta 是同一个对象的常驻 Flow**，不是独立对象。它：
- 共享同一个 Stone 的身份（whoAmI、traits）
- 是唯一拥有写 Self 目录权限的 Flow（memory.md、data.json、traits/）
- 收到消息后，用 LLM 判断：值得沉淀吗？沉淀到哪里？
- **可以反向回复发起方**，形成双向的"自我对话"——追问、确认、拒绝

这个设计的哲学意义：**沉淀不是机械的数据搬运，而是一次自我对话。**
对象在 Session 中经历了什么、学到了什么，需要经过 SelfMeta 的审视才能成为 Self 的一部分。
就像人类的反思：不是所有经历都会变成长期记忆，只有经过"内心对话"的才会。

---

