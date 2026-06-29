---
title: 应用例 —— OOC 拿来干嘛（外部场景收编）
description: OOC 被用于外部场景的例证（因子开发助手、飞书集成）；问"OOC 能拿来做什么""外部业务/SaaS 怎么用 OOC 表达"时看这篇
activates_on:
  "object::root": "show_description"
---

# OOC 应用例

这篇收 OOC **被应用于外部场景的例证**——不是 OOC 自身定义，而是「拿 OOC 怎么表达一个真实场景」的范例。每个 case 也是反推 OOC 设计是否够用的输入：遇到表达不出来的点，回到对应维度补设计，而不是在 case 里塞 workaround。建/写对象的具体步骤见 `knowledge/authoring-objects.md`。

## Case 1 — 哨兵平台因子开发助手（业务 skill → Agent + skill）

把一堆零散业务 skill（原 `plugins_with_agent` 项目 15 个 Claude Code SKILL.md）收编为 OOC 形态：

- **3 个 Agent**（各有 stone 身份）：`sentry_factor_dev`（流程编排、对外门面，持跨 session 需求状态）/ `sentry_event_factor`（事件因子领域 All-in-One：API 查询 + 知识 + 开发）/ `sentry_factor_group`（因子组领域，go / offline 两种实现）。
- **1 个 branch 级 skill** `psm-query`：无状态接口检索脚本，任意 Agent 经 `skill_index` 发现即用。

要点：

- **拆分粒度准则**——有跨 session 状态 / 领域专属知识 / 会被 talk 频繁调用 → 当 Agent；无状态脚本 / 「输入→输出」/ 多 Agent 通用 → 当 skill。拒绝 1 个巨石 Agent（领域知识互相干扰、改一处重载整石），也拒绝把无状态工具强行做成 Agent（徒增 stone/talk 负担）。一个工作流阶段（如安全评估）只是某 Agent 的一段流程，不拆。
- **协作只走 talk + talk_window.share**：上游 `sentry_factor_dev` 不直接调下游 method，而是 talk 派任务 + fork 子窗的 `share(mode="readonly-ref")` 把方案 file 作只读快照共享；下游阻塞反向 talk 回上游（不硬猜、不直接 talk 用户）。拓扑非循环。
- 例证：OOC 用「领域 Agent + 流程编排 Agent + 通用 skill」的层次，把平铺的 skill 集合表达成有边界、可协作、可演化的对象图。

## Case 2 — 飞书集成（外部 SaaS → ContextWindow，而非 Agent）

把飞书群聊 / 文档作为 OOC Object 引入，让 LLM 在 thread 里直接打开、刷新、搜索、发送、追加：

- `feishu_chat` Window（refresh / search / send / reply / subscribe / close）+ `feishu_doc` Window（read / search_in_doc / append / patch_block / share_link / attach_to_chat / close）；root 入口 `open_feishu_chat` / `open_feishu_doc`。
- OAPI 调用收口到 `extendable/lark/` 经子进程调官方 lark-cli（凭证由 cli 用 OS keychain 管，OOC 不存 secret）。

要点：

- **单层 Window，不建 Adapter 对象**：飞书群/文档不上升为 OOC 对象——它没有自己的 self.md 身份、没有跨 session 沉淀（凭证 cli 已管）、不被其它 Agent talk。这正是「该不该建对象」准则的反例：外部世界不构成 Agent 自我，做成 extendable Window 即可。出现配额监控 / 多 Agent 协商发消息策略等真实需求时，再升级为两层（建 Adapter 对象）。
- **写类命令强制 dry-run gate**：send/reply/append/patch_block 等首次 submit 只预览，`refine(confirm=true)` 后才真发；给 LLM/人类一个「看→想→确认」间隙。社交/文档撤销成本高于多走一轮 form。
- 例证：OOC「吃下外部世界」的标准模板——extendable Window + 共用 helper + dry-run gate；新接 notion/slack/github 照同模板建 `extendable/<name>/`，不碰核心维度。

## 两个 case 的共性

OOC 表达外部场景的两条主路：**业务能力 → Agent + skill 的对象图**（case 1）、**外部 SaaS → extendable Window**（case 2）。判据始终是「是否构成 Agent 自我」——构成则为对象/维度，不构成则为 skill / extendable 外接层。

## Case 3 — OOC 自举:agent 经 talk(super) 真改自己源码 + PR 合入 main (issue C1, 2026-06-29 verified)

这是 OOC **哲学层最关键的兑现** — 「OOC 是否足以自迭代」从设计承诺转为机制层既成事实。

agent 真实自我迭代完整链路 (经 mock LLM + 真生产代码 e2e 实证, `tests/c1-dogfood-e2e.test.ts`):

1. **agent 在业务 flow 改自己** — `flows/<sid>/objects/agent_dogfood/data.json` 持新 `self` (versioned field)
2. **talk(target="super") 进 super flow** — caller=callee=agent 自己;reflectable 维度的入口
3. **scan_changes** (super flow self-view method) — 扫 caller flow 暂存,看见 `versioned_dirty` 含 `self`
4. **create_pr_for_versioned** — 经 `createFeatBranchPr` 起 git feat branch worktree + 写 new self.md + commit + 落账 PR-Issue (`stones/.stones_repo/.pr-issues/<id>.json`)
5. **reviewer (supervisor) approve** — 经 `resolvePrIssueByHuman` 触发 `mergeFeatBranch` ff-merge 进 main
6. **mergeFeatBranch → notifyAllWorldRuntimes** (C1 Phase 2 接通) — 当前 WorldRuntime.reloadTable 真记录 mark
7. **next agent active** — ThreadRuntime.maybeDispatchOnReload 真看到 cursor 越界,调 agent 的 `lifecycle.on_reload` 钩
8. **agent 经新版本继续** — 后续 method 调用拿到 new self

要点:
- **零新机制**:整链路全部经现有 reflectable / persistable / lifecycle / mergeFeatBranch / lifecycle.on_reload 设施,**仅 wiring 闭合一段** (C1 Phase 2: `notifyAllWorldRuntimes`)
- **设计权威完整**:8 维度齐 + index.md + knowledge/ 全 + 各 self.md 锚源码
- **机制层闭合**:184 pass / 0 fail / 6 个 check gate 全 OK,verify gate 守护无回归
- **真 LLM dogfood demo** 留 Tier B (本 case 用 mock LLM 验机制充足)

例证:OOC 不是设计、不是规划、不是承诺 — 它是一个**已经在转的、可以自我迭代的、对象化的 agent 生态系统底座**。

## 三个 case 的递进

case 1+2 展示 OOC **吸纳现实**的两种模式 (业务能力 / 外部世界)。case 3 展示 OOC **自我演化**的机制完整闭合 — 这是 OOC 区别于一切 agent framework 的根本 — agent 不只是被部署、被驱动,而**就在系统内、用系统提供的设施改自己**。
