---
title: sediment knowledge —— 运行时沉淀的记忆与关系
description: super flow 写哪些路径、frontmatter write contract、写错为何 silently 断裂；问沉淀协议时看这篇
activates_on:
  "object::root": "show_description"
---

# sediment knowledge

**sediment** 是 Object 运行时由 reflectable / collaborable 自动沉淀的事实型知识，落 **pool**（持久 + 不进 git，写就生效），与 stone 里人类设计的 seed knowledge 配对。reflectable 默认只动 sediment，不动 seed（先天能力基底走 feat-branch PR + eval gate）。

## 两条沉淀通道必须选对（互斥）

super flow 有两条**互斥**的沉淀通道，选错会静默失败：

- **pool sediment（直写）**：仅运行时事实记忆（memory / relations）。write-through、**不分支/不 PR**、立即生效。落点见 `packages/@ooc/core/persistable/pool-object.ts:68,73`：
  - `pools/<self>/knowledge/memory/<slug>.md` —— 长期记忆，一条一个文件，slug 用 kebab-case。
  - `pools/<self>/knowledge/relations/<peer>.md` —— long_term relation 文件。
- **feat-branch PR**：任何 stone 变更（身份 `self.md` / `readable.md` / 身体 `executable/` / `visible/` / seed knowledge）。**必须** `new_feat_branch` 开分支 → 在 feat worktree 直接编辑 → `create_pr_and_invite_reviewers` 开 PR（机制详见 `knowledge/feat-branch-pr.md`）。

**陷阱（体验官 #2 实证）**：feat 分支绑定生效时 `write_file pools/...` 仍静默落 pool（feat 绑定覆盖路由只管 stone 路径，pool 不在 worktree 模型内）→ `create_pr_and_invite_reviewers` NO_CHANGES、PR 开不出。要沉淀身份/身体务必写 stone 路径（`self.md` 等），不要误写进 pool。

super flow 禁止动：业务 thread.json / pool 的 data/ 与 files/（运行时业务态，不是反思沉淀）。

写入方式：`open(method="write_file", path="pools/<self>/knowledge/memory/<slug>.md", content="...")`；已存在文件用 open_file + edit 增量更新。

## sediment write contract（自演化闭环关键）

所有 super flow 写入的 memory / relations markdown **必须含 frontmatter**：`title` / `description` / `activates_on`（trigger map）。其中 `super` trigger 匹配反思场景（`packages/@ooc/core/thinkable/knowledge/activator.expr.ts:60` parseTrigger super 特判 / `:179` evaluateTrigger case "super"，sessionId==="super"）。

- 没有 frontmatter / 写错 schema 的 sediment 会被 synthesizer 加载，但**永远无法被 activator 激活**——下轮新 thread 完全看不见这篇，自演化闭环 silently 断裂（协议级缺口）。
- loader parse error → console.warn 含路径 → 跳过该篇（fail-loud，不静默吞错）；但**无写入期 deny gate**，仍依赖 LLM 自觉。这是当前主要待办：把校验前移到 write_file 期。

## 反思结论必须落文件

不要只在 endSummary「嘴上沉淀」——下次的你看不到。caller 要记下的要点，end 之前确认是否真有一个 `memory/<slug>.md` 落地；没有先写再 end。这是 reflectable 沉淀闭环（业务线程 → talk(super) → super flow write_file 落 pool → 下轮 frontmatter activates_on 自动召回）的最短回路。
