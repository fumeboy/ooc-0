---
title: OOC 名词词典（root 级跨维度术语）
description: OOC 概念的统一命名权威；裁决某个词指什么、新旧叫法是否同义、术语跨维度漂移时看这篇
activates_on:
  "object::root": "show_description"
---

# OOC 名词词典

这篇收 **root 级、跨维度** 的术语——三主张/9 维度/三子树/对象关系三轴/agent-native parity 的论证已在 self.md 与 ooc-philosophy.md，这里只做命名归一化的权威：哪个词指什么、新旧叫法是否同义、跨维度复用同一个词时不要漂。各维度内部的深术语在对应 child 对象里，不在此重复。

## 核心实体

- **OOC** — Object Oriented Context。以面向对象的方式组织上下文、构建 MultiAgent 系统。
- **OOC Agent** — OOC 中 Object 模式的 Agent，持有数据字段 + 程序方法。一个 Agent 就是一个 Object。
- **Object** — OOC 系统中唯一的一等实体。系统里任何东西，要么是一个 Object，要么是 Object 之间的一条关系。

## ContextWindow —— Object 出现在 context 中的形态

- **ContextWindow** 指 **Object 出现在 context 中的形态**：既是信息展示单元、又是行动挂载点。它不是独立于 Object 的临时数据结构——每个 window 背后都对应一个 Object（builtin 或 user-defined），window 上挂的 method 就是 Object 的 method，window method 与 object method 合并统称 **Method**。thread 持有一组 `contextWindows`。
- **不要用 ContextObject 这个词**：它把「Object（实体本身）」和「ContextWindow（实体在 context 中的形态）」揉成一个名，反而把两者搅浑。按语境拆开说——指实体时写 **ooc object / Object**，指它在 context 里的窗口形态时写 **ContextWindow**。（代码里 `ContextObject` 仍作 `ContextWindow` 的历史别名残留，以代码为准；但文档表意一律不用它。）
- **Context 是视角不是归属**：同一个 ooc object 可同时出现在多个 thread 的 context（状态只存一份），每个 thread 持自己的视角参数。详见 ooc-philosophy.md「Context = 视角」。

## 知识两源：seed vs sediment

同样叫 knowledge，按来源分两种，性质不同（不要混用）：

- **seed knowledge** — 人类在 stone 中预置的初始知识库（`stones/<self>/knowledge/`）。进 git review，可挂 eval gate。本词典与各 child 的 knowledge/ 都是 seed。
- **sediment knowledge** — Agent 运行时由 reflectable / collaborable 沉淀的知识（`pools/<id>/knowledge/memory` + relations）。写就生效，不进 git。深术语见 reflectable child。

## extendable —— 非维度的外接集成层

- **extendable** **不是**第 10 个能力维度。它是把外部世界（飞书 / notion / slack / github 等）按统一模板接入为可调用的 ooc object 与 method 的扩展层。
- 排除理由（按 self-constitutive 判据）：它够的是**外部世界**，外部系统不构成 Agent 的「自我」，所以是外接集成层而非维度。注意「寄生于 executable」**不是**真正的排除理由（reflectable 也寄生于多个维度），真正判据是「是否构成自我」。
- 物理上隔离在 `packages/@ooc/core/extendable/`，避免外部 OAPI 细节污染 executable 核心。

## 横切设计（一行锚，详见 self.md / ooc-philosophy.md）

- **self-constitutive（自我构成性）** — 维度判定轴：一个能力是否构成 Agent 的「自我」；是则为维度，否则为外接层/协议。9 维度全过此判据，extendable 不过。
- **agent-native parity** — 横切公理：用户（人类）能做的事 agent 也应能做；每个维度都有「人类面 / agent 面」两个消费方。对称的是「能不能做」，不是「看到的体量」；agent 全量自观测换场所到 super flow 做。
- **对象关系三轴** — 自我(super) / peer 平等(talk/exec) / parent-child 层级，三种不同权力语义的关系。Supervisor 即这棵 object 树的 root parent。
- **修改权 = feat-branch PR + reviewer 冒泡** — 进 canonical 的 stone 变更一律走 feat 分支 PR，reviewer 集按变更触及路径冒泡（顶层领地 owner ∪ supervisor，rule A），全 approve 经 `prAutoMerge` 闸合入 main；author 不自审，supervisor 恒在 reviewer 集。session worktree 永不合入，是纯运行时派生物。

## 已退役概念（不要重新引入）

- **issue 看板**（session 级共享议题 + issue_window + create_issue/open_issue/@mention 唤醒）：2026-05-26 整套移除，原因是协作语义未想清楚。**注意区分**：stone-versioning 内部的 **PR-Issue**（feat 分支变更转交 reviewer 集评审的请求记录）是另一回事，保留。
- **prototype chain**（self.md frontmatter `prototype:`）：2026-06-07 彻底剔除，继承统一收敛到 **class**（`package.json` 的 `ooc.class`）。详见 class child。
