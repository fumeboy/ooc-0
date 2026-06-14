---
title: knowledge 激活设计（按方法意图激活、完成即卸载）
description: thinkable 维度关于 knowledge 激活机制的单一权威——核心设计 + 派生设计 + 细节补充 + 模拟推演；trigger 怎么定义、按方法意图怎么匹配激活、怎么进 context、完成怎么卸载
activates_on:
  "object::root": "show_description"
---

# knowledge 激活设计

> 本篇是 thinkable 维度关于 **knowledge 激活机制**自身的**单一权威**：每篇 knowledge 怎么声明触发条件、怎么按当前方法的意图被激活进 context、方法完成后怎么自动卸载。
> 与邻接权威的分工（依赖倒置、不复述）：**knowledge 属于 agent、不属于普通 object**，agent 是什么见 `agent.md`（核心 4：agent 伴随 knowledge 系统，按方法意图激活、完成即卸载）；**对象模型 / class 继承链**见 class `knowledge/object-model.md`；**激活的 knowledge 怎么排进 LLM 输入、怎么占预算**见 `context.md`。本文只讲"哪篇 knowledge、在什么时机、激活到什么程度"。

## 编辑规范

1. **单一权威**：knowledge 激活机制只此一处；trigger 语法、激活级别、激活/卸载时机的设计变更先改本文、再改代码，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（trigger 语法 / 级别求值 / 进 context 接口 / 边界）；④ 模拟推演（把机制放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合（依赖倒置）**：本文只讲激活机制自身——trigger 怎么匹配、激活到哪一档、怎么交给 context；**不讲** agent 是什么（见 `agent.md`）、context 怎么构造成 LLM 输入（见 `context.md`）、对象模型（见 object-model.md），一律"见 X"引用。
4. **精炼自洽**：一句一条；术语统一（trigger / 激活级别 show_description·show_content / 激活·卸载）；与 agent.md 核心 4、context.md、object-model.md 不矛盾，发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **knowledge 是 agent 随身携带的 markdown 认知**，按需激活进 context，而非一次全喂——以此控制每轮 context 体积（context 是稀缺资源，见 context.md）。

2. **每篇 knowledge 自带 `activates_on` 触发声明**（frontmatter）：一组 **trigger → 激活级别** 的映射，声明"在什么条件下、激活到什么程度"。没有 `activates_on` 的 knowledge 不会被自动激活。

3. **激活按当前方法的意图触发**：agent 执行某方法时，该方法在 thread 里呈现为一个活跃的 method-exec 窗口（见 context.md），其 parent 对象的 class 即"方法对应的意图"。trigger 把这个意图匹配出来——某篇 knowledge 的 trigger 命中当前活跃方法的意图，这篇就被激活。

4. **激活分两档级别**，由命中的 trigger 指定：
   - **`show_description`**：只露这篇的 title + description（让 LLM 知道"有这么一篇、讲什么"，按需再展开）。
   - **`show_content`**：把正文整篇展开进 context。
   多个 trigger 命中同一篇时取 **max**（`show_content` > `show_description`）。

5. **激活的 knowledge 以 knowledge 窗的形态进 context**：激活结果不是裸文本，而是被构造成 context window 交给 context（context 据此渲染、计预算、可被压缩，见 context.md）。本机制只产出"哪些篇、各到哪一档"，不关心它们最终怎么排进 LLM 输入。

6. **激活是每轮重算、不持久化——这就是"完成即卸载"**：每构造一轮 context，都对当前 thread 重新求一次激活集合。某方法执行完成、其 method-exec 窗不再活跃，对应意图的 trigger 下一轮不再命中，那些 knowledge 窗就不再被产出——即自动卸载。激活态从不写盘、不在 thread 间残留，纯由"此刻 thread 里有哪些活跃方法/对象"决定。

7. **trigger 可表达方法意图之外的几类触发条件**（同一套 `activates_on` 语法，正交并存）：按 thread 里**出现某类对象**触发、按**出现某个特定对象 id** 触发、按**活跃方法的声明意图名**触发、以及 agent 处于**自我审视过程**时触发。方法意图（核心 3）是其中最常用的一类。

---

## 二、派生设计

这些不是新增机制，而是核心设计组合后自然涌现的能力。

- **渐进披露**：核心 2+4 ⇒ 一篇 knowledge 可先以 `show_description` 露名片、在更聚焦的意图下才 `show_content` 展开正文；context 体积随 agent 当前在做什么自然伸缩，不必为"可能用得上"预先全量加载。

- **意图局部的认知**：核心 3+6 ⇒ knowledge 与方法的"意图"绑定，只在执行该意图期间在场、完成即退场。agent 在不同方法间切换时，看到的 knowledge 随之切换——每个交互面只看到与之相关的认知切片，互不干扰、不长期累积。

- **类链继承的意图匹配**：核心 3 的"方法意图"沿 class 继承链解释——挂在某 class 方法上的 knowledge，对该 class 及其子 class 的同名方法都被激活（继承链由 class/runtime 维度解析，本机制只消费解析结果，见 object-model.md）。一组同领域 agent 的公共方法知识声明一次即对全链生效。

- **零激活默认安全**：核心 2 ⇒ 没写 `activates_on` 的 knowledge 永不自动激活——不会因为新增一篇就静默膨胀每轮 context；要让一篇参与激活，必须显式给它写触发条件。

---

## 三、细节补充

### 3.1 trigger 语法与求值（`parseTrigger` / `evaluateTrigger`）

`activates_on` 是一张 **trigger map**（`{ "<trigger 表达式>": "<激活级别>" }`）。`parseTrigger`（`packages/@ooc/core/thinkable/knowledge/activator.expr.ts:57`）把每个表达式解析为一个 AST，`evaluateTrigger`（`packages/@ooc/core/thinkable/knowledge/activator.expr.ts:177`）是纯函数，输入 trigger + 当前 thread、输出是否命中。五类表达式：

| trigger 表达式 | 命中条件 | 求值锚点 |
|---|---|---|
| `method::<object_type>::<method>` | thread 里存在一个 **open 的 method-exec 窗**，其 method 同名、且其 parent 对象 class 等于 `<object_type>` 或沿继承链含之 | `activator.expr.ts:206` |
| `object::<class>` | thread 里出现任一 open 的该 class 对象窗 | `activator.expr.ts:182` |
| `object_id::<id>` | 特定对象 id 的窗出现在 thread 里 | `activator.expr.ts:196` |
| `intent::<name>` | 任一活跃方法声明的意图集合匹配 `<name>`（支持 `xxx.*` 通配后缀，`matchesIntentName` `activator.expr.ts:271`） | `activator.expr.ts:229` |
| `super` | thread 处于自我审视（super）过程 | `activator.expr.ts:179` |

- **`method::` 是核心 3 的落地**：方法的"意图"= 该 method-exec 窗 parent 对象的 class；沿 `resolveParentClassChain` 匹配 class 继承链（`activator.expr.ts:224`），所以挂在父 class 方法上的 knowledge 对子 class 同名方法也命中。窗必须 open 才算"该方法当前活跃"——success/failed 不命中（这正是核心 6 卸载的判据来源）。
- **`object::root` 恒命中**：root 是每个 thread 的隐式父对象（虚拟视图、从不进 thread 的窗口表），若按"扫窗口找 class==root"则永不命中、agent 沉淀的常驻 memory 永不激活。求值对 `objectType === "root"` 特判直接返回 true（`activator.expr.ts:187`），坐实"root 等价任何时候"的契约——本文 frontmatter 的 `object::root: show_description` 正依赖它。
- **非法/旧格式 fail-loud**：无法解析的表达式在 `parseTrigger` 阶段抛错（`activator.expr.ts:118` 起的兜底），不静默跳过。

### 3.2 激活级别求值（`computeActivations`）

`computeActivations`（`packages/@ooc/core/thinkable/knowledge/activator.ts:26`）对索引里每篇 knowledge 用 3.1 求值、用 `maxLevel`（`activator.expr.ts:285`）取多 trigger 命中的最高档，产出激活结果列表。输出顺序与去重：显式 pin 的 knowledge（agent 主动 open，强制 full）→ 命中 `show_content` 的 → 命中 `show_description` 的；`presentation` 字段取 `full`（整篇正文）或 `summary`（仅 description），与本文核心 4 的两档一一对应。

### 3.3 知识从哪来（索引加载，依赖倒置：本机制只消费索引）

激活作用在一份已加载的 knowledge 索引上；**索引怎么来不属本机制**。`loadKnowledgeIndex`（`packages/@ooc/core/thinkable/knowledge/loader.ts:56`）从两源加载并沿继承链合并——设计期写定的 stone seed（进 git）+ 跨 session 沉淀的 pool sediment（不进 git）；子级 override 父级、运行时沉淀 override 设计层。父 agent 的 knowledge 仅显式标 `inheritable: true` 才下传给子 agent（缺省不下传，避免父级认知误膨胀子 agent context）；沉淀（sediment）始终私有、从不跨 agent 下传。**激活机制只接收这份合并后的索引、对每篇求级别**，不关心它由哪些源拼成。

### 3.4 激活结果怎么进 context（依赖倒置：本机制只产出窗、context 负责排布）

激活结果被构造成 **knowledge 窗**（`source="activator"`）交给 context。两条产出路径每轮各跑一次：

- **agent 自身的 knowledge**：`buildActivatorKnowledgeWindows`（`packages/@ooc/core/thinkable/context/activator-windows.ts:35`）从 thread 的 stone/pool 加载索引、跑 `computeActivations`、把每条激活结果包成 knowledge 窗（`full` 携正文、`summary` 仅 description）。无持久化上下文时返回空。
- **框架协议 knowledge**（root builtin 随框架发布的交互核心等）：`buildProtocolKnowledgeWindows`（`packages/@ooc/core/thinkable/context/protocol.ts:122`）按同一套 `activates_on` 对当前 thread 逐篇匹配，命中才注入。

knowledge 窗的形态（`source` / `presentation` / `path` / `body`）见 `packages/@ooc/builtins/knowledge/types.ts:28`。**窗之后怎么渲染、计预算、压缩、排进 LLM 输入由 context 负责**（见 context.md），本机制到"产出哪些窗、各到哪一档"为止。

### 3.5 激活/卸载的运行时锚（核心 6 的实现事实）

两条产出路径都在每轮 `buildInputItems`（`packages/@ooc/core/thinkable/context/index.ts:392`）构造 context 时被调用，产物标注为 transient、**从不持久化**（`index.ts:411`-`414`：派生窗不写回 thread 的持久化窗口表）。因此激活集合纯由"此刻 thread 里有哪些活跃方法/对象"决定：方法完成、其 method-exec 窗转 success/failed 不再 open，下一轮重算时对应 trigger 不命中，该 knowledge 窗自然不再产出——这就是核心 6 的"完成即卸载"，无需任何显式卸载动作。

---

## 四、模拟推演

把机制放进真实运行时场景推演，暴露设计是否还有欠缺。每个 case 先描述场景，再点出 gap 与方向；补法皆为"给已有概念加一段规则"，不引入新机制。

### Case A — 嵌套方法的意图栈（中）

agent 执行方法 M1（意图 = parent class C1）时激活了 C1 的 knowledge；M1 进行中又开了子方法 M2（意图 = C2）。此刻两个 method-exec 窗都 open，C1、C2 的 knowledge **同时在场**——这是正确的（外层意图未完成、内层是它的一部分）。但若 C1、C2 各有一篇 `show_content` 且都很长，两层叠加可能逼近预算。核心 6 保证 M2 完成后 C2 知识卸载、回到只有 C1，但**深嵌套的瞬时峰值没有上界**。**方向**：不改激活判据（同时在场是对的），而是依赖 context 的预算分层（见 context.md）按相关度先压低层意图的 knowledge——即"激活归激活、排布归 context"，本机制不自管预算。

### Case B — 沉淀的死知识永不召回（高）

agent 在某 session 把一条认知沉淀进 pool sediment，却忘了写 `activates_on`（或写错 schema）。核心 2 下它永不自动激活——loader 仅 `warn` 跳过（3.3）。结果这条认知"写进去了却永远召不回来"，召回闭环静默断，且没有任何信号提示 agent 它写漏了触发条件。**方向**：在沉淀写入期加一道闸门/巡检——沉淀一篇 knowledge 时校验它至少有一个可解析 trigger（或对无 trigger 的沉淀显式标 unreachable 并告警），把"靠 LLM 自觉记得写 activates_on"换成机制兜底。这是本机制当前最高价值的待办。

### Case C — 意图名 vs class 两种匹配的取舍（中）

`method::<class>::<method>`（按 parent class 链匹配，3.1）与 `intent::<name>`（按方法声明的意图名匹配）是两条命中路径：前者随对象类型走、后者随方法显式声明的意图标签走。一篇 knowledge 该用哪条？当一个方法可由多种 class 的对象提供、但语义上属同一意图时，`method::` 需为每个 class 各写一条 trigger，`intent::` 一条通配即可；反过来若意图名拼写漂移则 `intent::` 静默不命中。**方向**：把选择判据写进 authoring 指引——意图稳定、跨 class 复用的认知用 `intent::`，与具体对象类型强绑定的用 `method::`；并让方法的意图声明成为受校验的稳定标识，避免 `intent::` 因名字漂移静默失效。
