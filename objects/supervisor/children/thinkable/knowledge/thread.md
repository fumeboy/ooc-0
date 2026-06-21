---
title: thread（agent 运行过程的载体）
description: thinkable 维度关于 thread 的权威——thread 是什么、持有什么数据、有什么行为；thread 是 agent 运行过程的载体、本身是 ooc object
activates_on:
  "object::root": "show_description"
---

# thread

> 本篇是 thinkable 维度关于 **thread** 的权威：thread 是什么、有什么数据、有什么行为。分工（不复述）：**thread 怎么被调度、单轮怎么跑**见 `thinkloop.md`；**agent 为何 `talk`→thread 即智能**见 `agent.md`；**thread 持有的 context 怎么构造成 LLM 输入**见 `context.md`；**thread 作为 ooc object / builtin class 的对象模型**见 class `knowledge/object-model.md`。

## 编辑规范

1. **单一权威**：thread 是什么、有什么数据/行为，只此一处；与 thinkloop / agent / context / object-model 的边界按上面分工，不越界复述。
2. **四段结构**：① 核心设计；② 派生设计；③ 细节补充；④ 模拟推演。
3. **高内聚低耦合**：只讲 thread 这个对象（数据 + 行为 + 关系 + 投影）；运行机制归 thinkloop、context 构造归 context.md。
4. **精炼自洽**：一句一条；代码锚点只在高漂移处给（优先锚 `export`/函数名）。

---

## 一、核心设计

1. **thread 是 agent 运行过程的载体**：agent 执行 `talk` 创建一条 thread，thread 承载这一次运行的全部过程；thread 本身是 ooc object（builtin class `thread` 的实例）。

2. **thread 的数据**（它持有什么）：
   - **context** —— 一组 **context window**，即 LLM 的输入（构造见 context.md）。
   - **inbox / outbox** —— 收 / 发的消息数据。
   - **events** —— 过程轨迹（这条 thread 经历过什么：tool call、状态变化、收消息…）。
   - **status** —— `running` / `waiting` / `done` / `failed` / `paused` / `canceled`。
   - **identity** —— 自己的 thread id + `creator`  thread 引用（它从属于谁、向谁负责）。

3. **thread 的 object method**（它能做什么）：
   - **`say`** —— 向对端发消息（按视角双实现：自己视角 = 向对方发，对方视角 = 向自己发）。
   - **`end`** —— 结束本 thread（标记 done、记 endReason/endSummary，可选 result 经 creator 窗 say 回报父级）。从 agent agency 迁入——thread 作用域操作，**改 thread 自身 Data**（status→done）。
   - **`todo`** —— 在**当前 thread context 内登记一个 todo 子对象**。从 agent agency 迁入——thread 作用域操作；**不改 thread 自身 Data**，而是造 `_builtin/agent/todo` 子对象进入本 thread 的 context（与 `end` 改 Data 区分）。
   - **`new_feat_branch`** / **`create_pr_and_invite_reviewers`** —— 两条 reflectable 沉淀 method（仅在 super 反思 session 的 `reflect_request` 投影窗 surface）。详见 reflectable `self.md`。
   - （`wait` / `close` 是 tool 原语、作用于窗，不是 thread 的 object method；wait 语义见 thinkloop.md。）关一个会话窗 = 撤回对其对象的一次引用；关一个 fork 子线程的会话窗 → 该子线程及其随之无人引用的子树一并 **canceled**（停用、保留在盘可观测，同 done / failed）；thread 与 creator 的自我门面窗是恒在通道、不可关。

4. **一个 agent 可并行持多条 thread**：与不同对端对话、跑并行子任务，彼此 context 独立。thread 之间可通过（`talk(target=自己)` ）派生形成一棵 **Thread Tree**。

5. ooc agent 的 talk 函数，在构造 thread 时，可以提供初始的 context 成员，例如初始 thread context 具有 terminal、filesystem 等 object

6. **thread 的生命周期**：一条 thread 诞生→承载一次运行→在不再被引用时停用为 **canceled**。`canceled` 与 `done` / `failed` 同属终态：thread 走到终态后不再运行，但记录保留在盘、仍可观测。停用是即时落盘的——reload 不会让已 canceled 的 thread 复活；父线程会经 child-end 通知被唤醒、看见子线程已退出。

---

## 二、派生设计

- **create sub-thread**（`talk(target=自己 objectId)`）

---

## 三、细节补充

### 持久化

thread 具有自定义持久化逻辑。thread 的 context（窗的展示状态）/ inbox / outbox / events / status 落盘——其中 context 落 `thread-context.json`，其余信息落 `thread.json`。

---

## 四、模拟推演

TODO