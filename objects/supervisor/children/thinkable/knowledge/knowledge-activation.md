---
title: knowledge 激活设计（按方法意图激活、完成即卸载）
description: thinkable 维度关于 knowledge 激活机制的单一权威——核心设计 + 派生设计 + 细节补充 + 模拟推演；trigger 怎么定义、按方法意图怎么匹配激活、怎么进 context、完成怎么卸载
activates_on:
  "object::root": "show_description"
---

# knowledge 激活设计

> 本篇是 thinkable 维度关于 **knowledge 激活机制**自身的**单一权威**：每篇 knowledge 怎么声明触发条件、怎么按当前方法的意图被激活进 context、方法完成后怎么自动卸载。
> 与邻接权威的分工（依赖倒置、不复述）：**knowledge 属于 agent、不属于普通 object**，agent 是什么见 `agent.md`（核心 4：agent 伴随 knowledge 系统，按方法意图激活、完成即卸载）；**对象模型 / class 复用经源码 spread**见 class `self.md` 核心 1-11；**激活的 knowledge 怎么排进 LLM 输入、怎么占预算**见 `context.md`。本文只讲"哪篇 knowledge、在什么时机、激活到什么程度"。

## 编辑规范

1. **单一权威**：knowledge 激活机制只此一处；trigger 语法、激活级别、激活/卸载时机的设计变更先改本文、再改代码，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（trigger 语法 / 级别求值 / 进 context 接口 / 边界）；④ 模拟推演（把机制放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：本文只讲激活机制自身——trigger 怎么匹配、激活到哪一档、怎么交给 context；**不讲** agent 是什么（见 `agent.md`）、context 怎么构造成 LLM 输入（见 `context.md`）、对象模型（见 class `self.md` 核心 1-11），一律"见 X"引用。
4. **精炼自洽**：一句一条；术语统一（trigger / 激活级别 show_description·show_content / 激活·卸载）；与 agent.md 核心 4、context.md、class `self.md` 不矛盾，发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **knowledge 是 agent 随身携带的 markdown 认知**，按需激活进 context，而非一次全喂——以此控制每轮 context 体积（context 是稀缺资源，见 context.md）。

2. **每篇 knowledge 自带 `activates_on` 触发声明**（frontmatter）：一组 **trigger → 激活级别** 的映射，声明"在什么条件下、激活到什么程度"。没有 `activates_on` 的 knowledge 不会被自动激活。

3. **激活按当前在执行的方法意图触发**：method 声明了 `route` 时经填表式渐进执行（见 executable `self.md`），在 thread 里呈现为一张活跃的 method-exec form 窗（见 context.md）；其**目标对象的 class + 方法名 + route 算出的 intents** 共同标识"此刻在做什么意图"。某篇 knowledge 的 trigger 命中这个意图，这篇就被激活。（一次直执行、无 `route` 的方法不产 form，由对象在场等其它 trigger 覆盖——见核心 7。）

4. **激活分两档级别**，由命中的 trigger 指定：
   - **`show_description`**：只露这篇的 title + description（让 LLM 知道"有这么一篇、讲什么"，按需再展开）。
   - **`show_content`**：把正文整篇展开进 context。
   多个 trigger 命中同一篇时取 **max**（`show_content` > `show_description`）。

5. **激活的 knowledge 以 knowledge 窗的形态进 context**：激活结果不是裸文本，而是被构造成 context window 交给 context（context 据此渲染、计预算、可被压缩，见 context.md）。本机制只产出"哪些篇、各到哪一档"，不关心它们最终怎么排进 LLM 输入。

6. **激活是每轮重算、不持久化——这就是"完成即卸载"**：每构造一轮 context，都对当前 thread 重新求一次激活集合。某方法执行完成、其 method-exec-form 窗不再活跃，对应意图的 trigger 下一轮不再命中，那些 knowledge 窗就不再被产出——即自动卸载。激活态从不写盘、不在 thread 间残留，纯由"此刻 thread 里有哪些活跃方法/对象"决定。

7. **trigger 可表达方法意图之外的几类触发条件**（同一套 `activates_on` 语法，正交并存）：按 thread 里**出现某类对象**触发、按**出现某个特定对象 id** 触发、按**活跃方法的声明意图名**触发、以及 agent 处于**自我审视过程**时触发。方法意图（核心 3）是其中最常用的一类。


knowledge example:
```md
---
title: knowledge title
description: knowledge description
activates_on:
  "intent::program.shell": "show_content"
---

knowledge content

```

---

## 二、派生设计

这些不是新增机制，而是核心设计组合后自然涌现的能力。

- **渐进披露**：一篇 knowledge 可先以 `show_description` 露名片、在更聚焦的意图下才 `show_content` 展开正文；context 体积随 agent 当前在做什么自然伸缩，不必为"可能用得上"预先全量加载。

- **意图局部的认知**：knowledge 与方法的"意图"绑定，只在执行该意图期间在场、完成即退场。agent 在不同方法间切换时，看到的 knowledge 随之切换——每个交互面只看到与之相关的认知切片，互不干扰、不长期累积。

- **零激活默认安全**：没写 `activates_on` 的 knowledge 永不自动激活——不会因为新增一篇就静默膨胀每轮 context；要让一篇参与激活，必须显式给它写触发条件。