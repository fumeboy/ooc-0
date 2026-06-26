---
title: ooc agent 设计（智能 object：thinkable + collaborable + reflectable）
description: thinkable 维度关于 ooc agent 的单一权威——agent=继承 object base 的 ooc class，额外具三智能维度，talk→thread→thinkloop 实现智能
activates_on:
  "object::root": "show_description"
---

# ooc agent 设计

> 本篇是 thinkable 维度关于 **ooc agent** 的**单一权威**：agent 是什么、它凭什么"智能"。
> 与邻接权威的分工（依赖倒置、不复述）：**对象模型**（class/object、单例/非单例、agent 是叠加 thinkable/collaborable/reflectable 三维的 object）见 class `self.md` 核心 1-11；**context 怎么构造成 LLM 输入**见 `context.md`；**thread 是什么 / 数据 / 行为**见 `thread.md`；**thread 怎么调度、单轮 thinkloop、三原语**见 `thinkloop.md`。本文只讲 agent 这一抽象本身。

## 编辑规范

1. **单一权威**：ooc agent 的设计只此一处；与对象模型 / context / thread 机制的边界严格按上面分工，不越界复述。
2. **四段结构**：① 核心设计（原子原则，逐条编号、正交）；② 派生设计；③ 细节补充；④ 模拟推演。
3. **高内聚低耦合**：只讲"agent 是什么 + 三智能维度的契约"，三维度各自的实现归各维度对象，本文只声明 agent 持有它们。
4. **精炼自洽**：一句一条；与 object-model / context.md / thread / thinkloop 不矛盾。

---

## 一、核心设计

1. **ooc agent = 智能 object**：agent 是一个继承 **ooc object base class** 的 ooc class；在 object 的 readable / executable / visible / persistable 之上，额外具备三条**智能维度**——**thinkable**（思考）、**collaborable**（协作）、**reflectable**（自我迭代）。

2. talk 是 agent 的入口，thread 是 agent 运行过程的载体，thinkloop 是运行过程的程序实现。agent 具有 `talk` object method；执行 `talk` 创建一个 **thread** 对象，thread 内运行 **thinkloop**——「构造 context → 喂给 LLM → LLM 经 tool use 行动 → 再构造下一轮」。

3. **thread 是 agent 运行过程的载体**：thread 持有 **context**；context 是 **LLM 的输入**，由一组 **context window** 组成。

4. **agent 伴随 knowledge 系统，按方法意图激活、完成即卸载**：agent 执行某个方法时，knowledge 系统按该**方法对应的意图**自动**激活**相关 knowledge 进入 context；该方法执行完成后，被激活的 knowledge **自动卸载**。

5. **thread 间相互通信，`say` 按视角双实现**：thread 持 **`say`** 方法发送消息、持 **inbox / outbox** 字段存储消息数据。构造 context window 时按**自己视角 / 对方视角**构造**不同的 window**，对应不同的 `say` 实现——**对方视角**：`say` = 向自己发消息；**自己视角**：`say` = 向对方发消息。由此表达出 ooc agent 的 collaborable 能力。

6. **reflectable —— 自我迭代**：agent 能自我审视——审视自己的**执行过程**、自己的**存在**、自己的**程序文件**与**数据文件**——并对它们**计算、编辑**，从而**自我迭代**。这就是 agent 的 **reflectable** 能力。

---

## 二、派生设计

*(待核心设计定稿后补。)*

---

## 三、细节补充

*(待核心设计定稿后补。)*

---

## 四、模拟推演

*(待核心设计定稿后补。)*
