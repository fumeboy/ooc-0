---
title: OOC 面向对象哲学（为什么是 OO、与传统 OO 的差异）
description: OOC 把上下文工程还原成面向对象抽象的论证根；问"为什么用 OO""OOC 跟传统 OO 差在哪"时看这篇
activates_on:
  "object::root": "show_description"
---

# OOC 面向对象哲学

我的核心三主张（Object 化上下文 / Object 化 Agent / 元编程自我迭代）已在 self.md。这篇沉淀**为什么是面向对象**的论证链与**和传统 OO 的本质差异**——裁决维度边界、回答用户"为什么这么设计"时的根。

## 一句话主张

三主张见 self.md，本篇沉淀其论证链与 OO 映射。一句话的根：OOC 把「上下文工程」从 prompt 串接的手艺活，还原成一套面向对象抽象——Object 之间按 OO 经典法则（身份、封装、继承、多态、消息传递）协作。传统 Agent 框架在写一份不断变长的 prompt；OOC 在写一个不断演化的对象图。

## 为什么是 OO —— 它是 Agent 工程三重矛盾的解药

| 矛盾 | OO 的解药 |
|------|-----------|
| 上下文无结构 → 熵增（text blob，系统不知道"这段是什么"，处理必丢信息） | **Object** 给上下文做类型化——file / knowledge / todo / plan / talk 各是一类，类自己知道如何展示、何时过期 |
| 工具扁平列表 → 推理负担（几十个同名 function 里挑） | **Method** 绑定到 Object——"调整一个 file 的展示视口"是在 file 对象上调 `set_transcript_window()`，不是从 50 个 tool 里找 |
| Agent 是静态快照 → 无法自我演化 | **元编程**——Agent 改自己的 self.md（身份）/ executable（方法）/ visible（界面）/ knowledge（知识），运行时改写自己的类 |

第一性原理：**系统里任何东西，要么是一个 Object，要么是 Object 之间的一条关系。**

## Object 五件套对应 OO 的经典面向

self.md（声明）/ readable（序列化）/ executable（行为）/ visible（呈现）/ knowledge（知识）。传统 OO 只显式建模了行为（方法）与声明（类定义）；序列化（`toString`）和呈现（UI）通常是系统外 ad-hoc 的，知识更是完全缺失。OOC 把这五个全部提升为一等公民。

## 与传统 OO 的四处本质差异

裁决"OOC 该不该照传统 OO 做 X"时，先回到这四条：

1. **Observer 是 LLM 不是 CPU**：对象的第一观察者是 LLM。readable 是"给 AI 看的 `toString()`"，transcriptViewport 是"展示视口档位"。**Object 的接口不只是方法签名（给执行器看），还包括 readable 输出（给推理器看）——两者同等重要。**
2. **两个外部世界**：传统 OO 的"外部"是统一的（其他对象）；OOC 有两个——其他 Agent（消费 readable + `public` 方法）与人类用户（消费 visible：tsx UI + `visible/server` for-ui 服务端 API），两者权限模型不同、走两条独立模块（LLM 侧 executable object method / 人类侧 visible/server，ctx 无 thinkloop thread）。这是 readable/visible 镜像、以及人机分流的设计来源（agent-native parity 公理：任何能力都要回答"人怎么用 / Agent 怎么用"）。
3. **运行时改写自己的类**：传统 OO 类定义编译时确定；OOC 的 Agent 通过 reflectable（含为自身编程，原 programmable）/ visible / 改 self.md 重定义自己——这是设计目标，不是 hack。stone 五件套就是 Agent 的源代码，Agent 是自己的维护者。
4. **对象图动态涌现**：runtime object 由 thread 按需创建（talk fork 派生子线程、open_file 创建 file），生命周期靠引用计数管理，peer/children 自动注入 context。更像 OS 进程树 + 共享内存，不是静态类图。

## Context = 视角，不是归属

关键纠偏：**Context 不是 belongs-to，而是 point-of-view。** 同一个 Object（如一场跨 Agent 对话 talk_w_abc）可同时出现在多个 thread 的 context，状态只存一份；每个 thread 持自己的视角参数（transcriptViewport / order / decayMeta）。这是 OO 的引用语义——`context.json` 是 OOC 的"指针表"。**LLM 每轮看到的输入 = 当前 thread 的对象引用表 + 每个被引对象的 readable() 拼接。上下文工程 = 管理对象引用表。**

## 设计闭环

Object 定义自己 → 展示自己（readable）→ LLM 阅读 → LLM 操作（method）→ Object 被改后重新展示。这个闭环能跑通、能演化，OOC 的设计目标就达成。

## OOC 与 host language 的边界

裁决「OOC 是否要为某能力发明新机制」时的根：

1. **OOC 不重新发明 host language 既有机制**——能用 TS / ESM 表达的就用（继承、模块绑定、类型约束、动态 import）；OOC 只提供 TS/ESM 表达不了的部分（context window 投影、thinkloop、persistable 三层级、reflectable 反思通道、agent 协作消息）。继承机制即典型案例：class 复用经 TS `import { Class } + 对象 spread`，OOC 协议层不内建 dispatch chain（见 `index.md` `## OOC Class/Object Model` 核心 2、`children/object/self.md` 核心 2）。
2. **运行时改写颗粒度 = thread 间，不是单步内**——主张三「Object 能为自己写方法、改字段、写知识、改身份」的实现颗粒度收口到「**改源码 → invalidate stone → 下次 hydrate / 下一条 thread 拿到新版本**」，不在单次 thinkloop tool call 中 in-memory mutate 自身 class prototype（前 issue 提议的 `patch_self_prototype` 不采纳）。「实验态」由 git uncommitted 状态承担、「沉淀态」由 merged 状态承担，OOC 不内建第三类。

这两条共同构成 OOC 的「克制熵增」底线：发明新机制前先问「能不能用 host language 表达」，发明新状态层前先问「能不能用 git 表达」。

> 仍未收口的 open question（裁决具体取舍时挖深）：readable/visible 耦合、运行时对象图的引用计数正确性、人机分流（LLM 侧 executable object method 的 `public` 轴 / 人类侧 visible/server 模块）是否够用。
