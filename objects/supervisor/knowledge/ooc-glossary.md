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

## ContextObject = ContextWindow（命名归一化，2026-05-28 ooc-6）

- **ContextWindow** 与 **ContextObject** 是**同义词**，指同一件东西：**Object 出现在 context 中的形态**。`ContextWindow` 是 2026-05-28 归一化前的旧称，新代码/新文档统称 **ContextObject**；遇到 `ContextWindow` 字面量视作 ContextObject 的历史别名，不要当成两个概念。
- 归一化主张：window 不再是独立于 Object 的临时数据结构——每个 window 背后都对应一个 Object（builtin 或 user-defined），window 上挂的 method 就是 Object 的 method，window method 与 object method 合并统称 **Method**。
- **Context 是视角不是归属**：同一个 ContextObject 可同时出现在多个 thread 的 context（状态只存一份），每个 thread 持自己的视角参数。详见 ooc-philosophy.md「Context = 视角」。

## 知识两源：seed vs sediment

同样叫 knowledge，按来源分两种，性质不同（不要混用）：

- **seed knowledge** — 人类在 stone 中预置的初始知识库（`stones/<self>/knowledge/`）。进 git review，可挂 eval gate。本词典与各 child 的 knowledge/ 都是 seed。
- **sediment knowledge** — Agent 运行时由 reflectable / collaborable 沉淀的知识（`pools/<id>/knowledge/memory` + relations）。写就生效，不进 git。深术语见 reflectable child。

## extendable —— 非维度的外接集成层

- **extendable** **不是**第 10 个能力维度。它是把外部世界（飞书 / notion / slack / github 等）按统一模板接入为可调用的 ContextObject 与 method 的扩展层。
- 排除理由（按 self-constitutive 判据）：它够的是**外部世界**，外部系统不构成 Agent 的「自我」，所以是外接集成层而非维度。注意「寄生于 executable」**不是**真正的排除理由（reflectable 也寄生于多个维度），真正判据是「是否构成自我」。
- 物理上隔离在 `packages/@ooc/core/extendable/`，避免外部 OAPI 细节污染 executable 核心。

## 横切设计（一行锚，详见 self.md / ooc-philosophy.md）

- **self-constitutive（自我构成性）** — 维度判定轴：一个能力是否构成 Agent 的「自我」；是则为维度，否则为外接层/协议。9 维度全过此判据，extendable 不过。
- **agent-native parity** — 横切公理：用户（人类）能做的事 agent 也应能做；每个维度都有「人类面 / agent 面」两个消费方。对称的是「能不能做」，不是「看到的体量」；agent 全量自观测换场所到 super flow 做。
- **对象关系三轴** — 自我(super) / peer 平等(talk/exec) / parent-child 层级，三种不同权力语义的关系。Supervisor 即这棵 object 树的 root parent。
- **修改权 = self-scope 自治** — object 改自己子树（含自己 seed）自治 ff-merge 无需 review；cross-object（改别人子树）才走 PR-Issue review。user 闸门 = git 本身（history / review / rollback 兜底），非 OOC 内的 PR gate。

## 已退役概念（不要重新引入）

- **issue 看板**（session 级共享议题 + issue_window + create_issue/open_issue/@mention 唤醒）：2026-05-26 整套移除，原因是协作语义未想清楚。**注意区分**：stone-versioning 内部的 **PR-Issue**（self-scope vs cross-scope merge 决策的命名）是另一回事，保留。
- **prototype chain**（self.md frontmatter `prototype:`）：2026-06-07 彻底剔除，继承统一收敛到 **class**（`package.json` 的 `ooc.class`）。详见 class child。
