---
title: thinkloop（thread 怎么运行：单轮循环 + 调度）
description: thinkable 维度关于 thread 运行机制的权威——单轮 thinkloop（build→LLM→dispatch→finish）、3 原语、scheduler 逐 tick、wait 唤醒、可恢复
activates_on:
  "object::root": "show_description"
---

# thinkloop

> 本篇是 thinkable 维度关于 **thread 怎么运行**的权威（运行机制层）。分工（不复述）：**thread 是什么 / 有什么数据与行为**见 `thread.md`；**agent 为何 talk→thread→thinkloop 即智能**见 `agent.md`；**单轮里 context 怎么构造成 LLM 输入**见 `context.md`。本文只讲单轮循环与调度。

## 编辑规范

1. **单一权威**：thread 运行机制（单轮 + 调度）只此一处；与 thread / agent / context 的边界按上面分工，不越界复述。
2. **四段结构**：① 核心设计；② 派生设计；③ 细节补充；④ 模拟推演。
3. **高内聚低耦合**：只讲"单轮怎么跑、多 thread 怎么调度、怎么等/醒/恢复"；thread 的数据/行为归 thread.md、context 构造归 context.md。
4. **精炼自洽**：一句一条；代码锚点只在高漂移处给（优先锚 `export`/函数名）。

---

## 一、核心设计

1. **单轮 thinkloop**：一条 `running` thread 跑一轮 = **build**（构造 context，见 context.md）→ **LLM**（调模型拿输出）→ **dispatch tool**（分派 LLM 发起的 tool call）→ **finish**（写 event、推进状态）。

2. **3 原语 `exec` / `close` / `wait`**：LLM 的全部行动入口。`exec(window_id?, method, args?)` 是唯一「调 method」原语（`window_id` 即目标 object 的窗、缺省为 agent 自己的 self 窗；args 齐全立即执行，不齐则系统建 method_exec form 供补齐）；`close` 关窗 / 移除引用；`wait` 声明等待 IO。

3. **scheduler 逐 tick 推进**：`runScheduler()` 逐 tick 推进 Thread Tree 中 `running` 的 thread；thread 在 `wait` 时让出，让多条 thread 可被分别推进。

4. **wait → 唤醒**：thread `wait` 进 `waiting`；新 inbox 消息（对端 `say` 派送 / end auto-reply / 控制面 resume）把它翻回 `running`、重入调度。

5. **可恢复**：thinkloop 在 `wait` 让出 + thread 持久化 ⇒ crash / 重启后可续跑（启动期兜底把 orphan `running` thread 重新入队）。

---

## 二、派生设计

---

## 三、细节补充

### llm item 模型（Responses-first）

OOC 内部用 Responses-first 的 item 模型表达消息，把 tool call / tool result 当一等结构（而非拼回 transcript 文本），让 debug / resume / provider 适配更稳定：
- `message`（system/user/assistant 文本）/ `function_call`（LLM 发起的 tool 调用）/ `function_call_output`（结果）/ `reasoning`（thinking 记录，**只用于 debug/回放、不反复喂回**——否则 meta-thinking、transcript 膨胀、旧推理干扰当前判断）。

入口 `createLlmClient()`（`packages/@ooc/core/thinkable/llm/client.ts:8`）统一 provider；llm 只管「如何请求模型」，「模型能做什么」由 executable 的 method 决定。
---

## 四、模拟推演

TODO