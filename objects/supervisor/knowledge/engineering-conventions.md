---
title: OOC 工程惯例 — fail loud / reuse before / perception as contract / verify-as-you-go
description: 跨维度通用工程惯例。每条惯例独立成段, 含触发条件 + 反模式 + 正模式。
activates_on:
  "object::root": "show_description"
---

# OOC 工程惯例 (Engineering Conventions)

> 收编自 `docs/solutions/conventions/` 5 篇 (2026-05 期):4 条 evergreen 跨维度惯例 +
> 1 条已 obsolete (meta concept graph,meta/ 包退役)。**2026-06-29 由 issue
> 2026-06-28-docs-legacy-sweep 吸收进对象树**,作 supervisor 跨维度共享知识。
>
> 这些惯例是 supervisor 哲学根「克制熵增、警惕新增名词」的具体执行手册。

## 1. LLM tool handlers must fail loudly

**核心主张**:LLM 无 compiler,**唯一反馈通道是 JSON response**。任何 tool handler 接受 malformed
输入而不抱怨 = **正向强化错误**。LLM 学会重复同样的错误 shape,失败被推迟到下游 opaque 错误。

**反模式** (常见):
- Schema/protocol naming drift:声明字段 `args`,代码读 `form_args`,handler 返 `{ok: true, message: "..."}`
  → LLM 继续用错误 shape
- Empty/missing required field 不抱怨:returnno-op success → LLM "学会"提交空参数

**正模式**:
- handler 入口**精确 schema 校验** + fail-loud throw `{ ok: false, error: { code: ..., message: ... }}`
- error message **包含**:期望什么,收到什么,建议下一步 (refine which field)

**触发条件**:实现或修改任何 LLM-callable tool handler;新加字段到 input schema;review 「agent 重复同样错误调用」类问题。

**OOC 内体现**:
- `## executable × thinkable` 交叉契约:method/guide name **不可重名**注册期 fail-loud (issue A)
- `## readable × executable` 交叉:window decl 的 `object_methods` 引用悬空注册期 fail-loud (issue M)
- `## thinkable` adapter 在 think 入口 fail-loud 断言 `deps.worldDir + deps.onDataEdit` 必备 (issue H)

## 2. Reuse before introducing — solve problems with existing primitives first

**核心主张**:OOC 叙事是「上下文由一组 window 组成、LLM 用 4 个原语作用其上」。每多一种概念,
**叙事复杂度 + 1**。所有 「为解决 X 我们需要新增 Y」 类提案,**先停下问 3 个问题**:

1. **能不能用现有原语 (4 tool + thread + window + transcript + method) 表达?**
2. **如果不能,是这 X 不该被表达,还是现有原语真的不足?**
3. **如果原语不足,新增的最小成本是什么? 必须是新概念还是新字段够?**

**反模式**:
- 「permission_ask」机制 (issue S10 已退役):新增 event 类型 + decide endpoint + UI card,实际可用现有 `talk(super)` 表达
- 「user.root.talk_window」容器 (issue S5 重设计):新增容器概念,实际 `user.root = thread (skip_scheduling=true)` 即足

**正模式** (S 系列实证):
- user.root 直接复用 thread + 新增一个 boolean 字段 `skip_scheduling` → 0 新概念
- callMethod 复用 visible/server 模块槽 (Class 协议已有) → 0 新机制
- on_reload 复用 hot-reload 链路 (已有 fs.watch + invalidateStone) → 仅新增一个 hook

**触发条件**:看到自己写下"为了解决 X 我们需要新增 Y" — 先暂停。

**OOC 内体现**:
- 04-30 issue O 实施:`stones/<branch>/objects/` 单目录靠 `ooc.class` 字段区分,而非 class/ 与 object/ 双目录
- 06-26 issue D 实施:reflectable 不发明新机制,只在 super flow 下编排 collaborable + persistable + thinkable 现有设施

## 3. Treat the LLM's perception surface as an API contract

**核心主张**:LLM 看见的 context、看到的 schema、收到的 tool response、events 渲染等,
**都是 LLM 与系统之间的 API 契约**。这些 surface 上任何**字段缺失 / 字面值乱漂移 / 状态不可见**,
都等同于 API 契约破坏。

**调试 LLM 行为问题先问**:「它看到的世界是不是完整、是不是不撒谎?」**再问** 「我有没有教它对的事?」

**反模式**:
- "为什么 agent 不调那个 method?" → 实际 method 在 thread context 内不可见 (readable.window decl 漏)
- "为什么 agent 重复说一样的话?" → context 看不到 LLM 自己的输出 (event 渲染缺)
- "为什么 agent 拿不到结果?" → tool response shape 与 schema 不一致

**正模式**:
- 设计 schema 时**就考虑 LLM 渲染**:字段名要清楚,description 要触达 LLM 的执行直觉
- 任何状态变更同步反映在 context (next-tick context rebuild) — 让 LLM 「看到」事实
- error response 含 actionable suggestion (next-step hint)

**触发条件**:设计 schema 时,设计 context 渲染时,调研 LLM 行为漂移时。

**OOC 内体现**:
- `## readable`:Object 投影 view + content,context window 是 LLM 看到的「世界」单元
- `## thinkable × readable`:context 渲染 + `## persistable × thinkable` 数据一致性
- issue N:intent 信号产 + scanIntents 聚合 → knowledge 激活,「上下文有什么 → LLM 看见什么知识」契约化

## 4. Verify each link as you create it (agent doc-graph work)

**核心主张**:agent 做 batched 文档迁移 / codemod / 跨文件 link 时,**每加一条 link 当场 verify**,
不要 batch 累积到最后一次性验。原因:link 是 graph 的一条边,**graph 是非局部的**,
错误在批的中间出现时无法局部反馈,反向追溯极慢。

**反模式**:
- 改 50 个文件加 import,最后跑 tsc 看哪些挂 → 错位 hash 难定位
- 写 100 条 self.md 锚 `file:line`,完事后跑 anchor-drift check 报 30 处漂 → 哪一处导致 cascade 不清

**正模式**:
- 每加一条 link 立刻**真跑一次** (tsc / grep / link resolver) 确认可达
- 加 link 时同时加一条断言 (test case / assert),把 "link 可达" 转为 hard contract
- 在 git pre-commit hook / verify gate 拦截:link 漂移 = commit fail

**触发条件**:agent 做 batched migration (含 import / 锚 / schema binding 跨文件改动);
agent 写 meta concept docs 时 source-link 引用;codemod / templated batch edit。

**OOC 内体现**:
- `scripts/check-doc-anchor-drift.sh`:守门设计文档锚 `file:line` 物理可达,挂 verify gate
- `scripts/check-no-deprecated-symbols.sh`:防退役符号回流
- `scripts/check-doc-deprecated-drift.sh`:防退役概念在文档当 live 教

---

## 历史

- 2026-06-29: 由 issue 2026-06-28-docs-legacy-sweep Step 1 吸收。原 `docs/solutions/conventions/`
  5 篇散落 .md 被本文档覆盖 + 删除。4 条 evergreen 惯例进对象树作 supervisor 跨维度知识。
- meta-concept-graph 已 obsolete (meta/ 包 2026-06-08 退役,文档绑定模型不存在),不收录。
