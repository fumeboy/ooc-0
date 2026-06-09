---
title: sediment knowledge —— 运行时沉淀的记忆与关系
description: super flow 写哪些路径、frontmatter write contract、写错为何 silently 断裂；问沉淀协议时看这篇
activates_on:
  "window::root": "show_content"
---

# sediment knowledge

**sediment** 是 Object 运行时由 reflectable / collaborable 自动沉淀的事实型知识，落 **pool**（持久 + 不进 git，写就生效），与 stone 里人类设计的 seed knowledge 配对。reflectable 默认只动 sediment，不动 seed（先天能力基底走 PR-Issue + eval gate）。

## super flow 写入面（只直写 sediment）

super flow 自己**直写**的只有 pool 侧 sediment（不进 git、写就生效），落点见 `packages/@ooc/core/persistable/pool-object.ts:68,73`：
- `pools/objects/<self>/knowledge/memory/<slug>.md` —— 长期记忆，一条一个文件，slug 用 kebab-case。
- `pools/objects/<self>/knowledge/relations/<peer>.md` —— long_term relation 文件。

身份/身体（stone 侧 `self.md` / `readable.md` / `executable/` / `visible/`）**不在 super flow 直写**——super flow 只直写 sediment、用 `evolve_self` 合入业务 session 的身体改动（职责切分详见 `knowledge/super-flow.md`）。

super flow 禁止动：业务 thread.json / pool 的 data/ 与 files/（运行时业务态，不是反思沉淀）。

写入方式：`open(method="write_file", path="pools/objects/<self>/knowledge/memory/<slug>.md", content="...")`；已存在文件用 open_file + edit 增量更新。

## sediment write contract（自演化闭环关键）

所有 super flow 写入的 memory / relations markdown **必须含 frontmatter**：`title` / `description` / `activates_on`（trigger map）。其中 `super` trigger 匹配反思场景（`packages/@ooc/core/thinkable/knowledge/triggers.ts:61` parse / `:179` evaluate，sessionId==="super"）。

- 没有 frontmatter / 写错 schema 的 sediment 会被 synthesizer 加载，但**永远无法被 activator 激活**——下轮新 thread 完全看不见这篇，自演化闭环 silently 断裂（协议级缺口）。
- loader parse error → console.warn 含路径 → 跳过该篇（fail-loud，不静默吞错）；但**无写入期 deny gate**，仍依赖 LLM 自觉。这是当前主要待办：把校验前移到 write_file 期。

## 反思结论必须落文件

不要只在 endSummary「嘴上沉淀」——下次的你看不到。caller 要记下的要点，end 之前确认是否真有一个 `memory/<slug>.md` 落地；没有先写再 end。这是 reflectable 沉淀闭环（业务线程 → talk(super) → super flow write_file 落 pool → 下轮 frontmatter activates_on 自动召回）的最短回路。
