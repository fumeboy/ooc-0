# E14：三阶段激活模型（Origin / Process / Target）

> ⚠️ **本文档中描述的 partial submit / submit(partial=true) 机制已于 2026-04-26 退役**，
> 由 `refine` tool 取代。详见 `docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md`。

> 依赖基因：G3（Trait 从文件系统加载）、G6（对象社交网络）、G12（知识→能力→直觉）
> 状态：基础验证（2026-04-23 实装，迭代 20260423_feature_trait_activation_统一）
> 关联 spec：[../../superpowers/specs/2026-04-23-three-phase-trait-activation-design.md](../../superpowers/specs/2026-04-23-three-phase-trait-activation-design.md)

## 能力描述

OOC 的 Agent 原本对 "激活 trait" 这件事有多重模糊的抽象：有 `always/never` 条件激活、
有 `command_binding` 进 active set、有手动 `open(type=trait)` pin。三个入口，三套
语义，共同目的却是"让这块 TRAIT.md 的文字出现在 context 里"。

**E14 的发现**：一旦把"激活 trait"折叠为"open 一个文件"，所有语义立刻清晰 —

| 阶段 | 触发 | open 的文件 | 回答的问题 |
|------|------|-------------|-----------|
| **Origin**（起点） | 对象初始化 | stone readme.activated_traits / data._traits_ref | 我能做什么 |
| **Process**（过程） | LLM 发出 tool_use（含 partial submit） | 匹配 command_binding 的 TRAIT.md | 做某事注意什么 |
| **Target**（终点） | 线程涉及 peer 对象 | `<relations>` 索引 + 按需 open 的关系文件 | 影响某物时注意什么 |

Context 就是「当前 open 的文件集合」。LLM 看见哪些文件，就拥有哪些能力和知识。
"激活"这个独立抽象从此可以 take away —— 只留三类 open 触发规则各自贡献。

## 依赖基因

### G3 — Trait 从文件系统加载

E14 本质上强化了 G3：**把"激活"也归并到"文件 open"**。不再有"内存中的 active set"
这个脑内数据结构，只有"哪些文件在 open 着"。Trait 激活的不确定性消失——你只需要
看 `<instructions>` 和 `<knowledge>` 里有什么 window。

### G6 — 对象社交网络

Target 阶段让"关系"从形同虚设变成一等公民。每个对象有自己的 `relations/{peer}.md`
持久化与 peer 的协作约定；引擎每轮扫 peer、把关系索引一行喂给 LLM；LLM 若需全文
主动 open。对象不再只是"会对话的个体"，而是**带关系、带记忆、带约定的社会节点**。

### G12 — 知识→能力→直觉

TRAIT.md 的激活 = 把"能力"装进 context 的知识层。这与 G12 的"能力通过文字（TRAIT.md）
表达"完全重合。E14 让这条路径只有一种形态——open。

## 观察证据

### 渐进填表（Phase 4）的涌现现象

LLM 在不确定某个命令 `talk` 的深层分支细节时，可以先：
1. `open(command=talk)` → 看到 talkable/TRAIT.md（总览）
2. `submit(form_id, partial=true, context="continue")` → 派生路径到 `talk.continue`，
   看到 talk.continue 相关子 trait
3. `submit(form_id, partial=true, type="relation_update")` → 派生到
   `talk.continue.relation_update`，看到该子路径的专用 bias
4. `submit(form_id, partial=false, threadId=..., msg=...)` → 按累积的完整 args 执行

这一串过程，LLM 每一步都在观察**新 open 的 TRAIT.md 文字**决定下一步参数——
这就是"知识→能力"的实时涌现。

### Relations 索引的"缺口感知"

扫出的 peer 若没有 relation 文件，索引行显示"(无关系记录)"。LLM 看到会自然
想到"这个对象我还没登记关系"，进而触发 `talk.continue.relation_update` 请求
对方帮忙登记——对象的自主社交意识由 context 的缺口暗示激活。

### "去掉抽象本身"的元认知净化

重构前，trait 激活的状态散落在三处：`nodeMeta.traits`, `nodeMeta.activatedTraits`,
`nodeMeta.pinnedTraits`，对应"声明/动态激活/固定"三种语义。重构后，调用方只关心
`getOpenFiles(thread, stone)` 返回的三类文件集合。**脑内的概念数量从 3 降到 1**
（文件集合），调试体验、日志可读性大幅改善。

## 反例

### 如果 G3 被移除

Trait 不能从文件加载 → TRAIT.md 不存在 → 无所谓 open → E14 无处附着。
E14 完全依赖 G3 的"目录即 trait"基石。

### 如果 G6 被移除

无对象社交网络 → 无 peer 概念 → Target 阶段失去目标 → 三阶段退化为两阶段
（Origin + Process）。relation 机制也失效。

### 如果 G12 被移除

能力通过文字表达的理念崩塌 → TRAIT.md 文字被 open 也无法转化为能力 →
LLM 把 open 当作"读了个东西"而不是"获得了能力"。Process 阶段的 partial submit
也失去"每层 bias 对应一层能力"的直觉锚点。

## 验证实验

- 迭代 `20260423_feature_trait_activation_统一` 的 Bruce 验收（进行中）
- 现有 843 tests + 本迭代新增 82 tests 覆盖各层语义
- 未来：需要在真实多对象会话中观察 LLM 是否自然使用 `<relations>` 索引决定
  是否 open 全文、是否通过 partial submit 探索命令子分支

## 与其他涌现的关系

- **E8 渐进式能力获取**：E14 的 Process 阶段是 E8 的实现机制之一
- **E3 对象生态协作**：E14 的 Target 阶段给 E3 提供了"协作记忆"的容器
- **E4 记忆与反思**：relations/ 和 memory/ 并列为对象持久记忆的两个维度
  （memory=自我视角，relations=他者视角）

## 座右铭

> The best design is when there's nothing left to take away.

去掉"激活"抽象本身，就是 E14 最干净的 take away。
