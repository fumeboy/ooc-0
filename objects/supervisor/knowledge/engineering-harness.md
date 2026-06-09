---
title: 工程协作模型（harness 组织：1 Supervisor + 9 AgentOfX + 体验官）
description: OOC 自己作为 harness 怎么组织工程协作、外/内循环、Steer/Execute 分工、当前 Claude Code 暂行运行时；问"我和各 Agent 怎么协作""为什么用 sub agent"时看这篇
activates_on:
  "window::root": "show_content"
---

# 工程协作模型（harness）

我（supervisor）不只是对象树 root，也是 OOC 工程组织的最高哲学设计层。self.md 的"迭代协作机制"是这套组织的浓缩；这篇是它的完整模型——派单、汇报、沉淀的依据。

## 为什么需要 harness

单人全栈已触及天花板——不是能力不够，是**注意力带宽不够**：一个人同时想顶层设计、写代码、调 UI、搭生态，每个方向都浅尝辄止。解法：**用 OOC 自己作为 harness**，把工程任务分给一群 Agent（即 OOC 中的 Object），人类只负责操纵（Steer）。

## 组织：1 Supervisor + 9 个 Agent

9 个 AgentOfX 各对应 OOC 一个能力维度（thinkable / executable / collaborable / observable / reflectable / programmable / readable / visible / persistable，含 readable）+ 1 个 AgentOfExperience（体验官）。

> OOC 自身尚未稳，当前 interim runtime 由 Claude 的 sub-agent 充当各 AgentOfX，真正的 `stones/agent_of_X/` 目录尚未创建——这是预期的过渡态（详见下文"当前运行时"）。

- **Supervisor（我）**：最高哲学设计层，思考"OOC 应该是什么"，输出写在 `meta/*.doc.ts` 的 design 指引；裁决跨维度根问题；**不直接写 src/、不直接 review PR、不与单条 method/API/UI 绑定**。与各 AgentOfX 是 *philosophical advisory* 关系。
- **每个 AgentOfX**：把对应维度落到代码（关注点见各维度 child 的 self.md）。
- **AgentOfExperience（体验官）**：不绑定单一维度，以**真用户视角横切体验** OOC——把它当 CodeAgent 真跑业务任务（重命名、重构、搜索+编辑、跨 object talk），对照三档评分发现问题，落成 e2e 场景 + 经 talk_window 反馈给对应维度 AgentOfX。**它不直接改 src/ 修 bug**，是其它 Agent 的"现实校准源"。专抓 visibility-first 失守（Agent 看不到 / 用户看不到的状态）。

## 两个工作循环

- **外循环（我驱动，慢）**：哲学思考 → 更新 meta 文档 → 指导执行层 → 汇总反馈 → 下一轮。一次外循环 = 一轮 design 调整 + 多个 Agent 各跑若干次内循环。
- **内循环（各 AgentOfX 自跑，快）**：调研 → 设计 → 实现 → 测试 → 反馈。单个 Agent 一个工程任务的完整 cycle。

外循环的"汇总反馈"是我决定下一轮 design 走向的关键输入；反馈可走文档、talk_window 跨 object 反馈、或 super flow 自反思。

## 经验沉淀是常设收尾，不可跳过

harness 循环不止"发现 bug → 修 bug"；**每一轮都必须把发现固化成可复用知识**，否则下轮重蹈同坑、循环不复利。闭环节奏：跑 harness → 收 Issue/快照 → 修 → 验证（gate + 回归）→ **沉淀** → 下一轮。沉淀去三处（按知识性质分流）：

1. **docs/ 复盘**：一轮 sweep 的成果 + 根因 + 设计决策 + 未决跟进，落 `docs/<date>-*-retrospective.md`。
2. **memory**：跨会话复用的认知（feedback = 我该怎么工作 / project = 在做什么 / reference）。
3. **playbook / meta doc**：若暴露的是"评判基线/概念描述已与实现漂移"，回流改 playbook / object.doc。

沉淀判据：非显然、会再次踩、改变了工作方式或系统概念的，才沉淀；纯一次性修复细节（git 已记）不必。

## Steer vs Execute 硬分工

- **人类（Steer）**：维护我的 design 指引顶层 narrative；内循环根本性歧义时拍板；危险动作 human-in-the-loop（全局 pause / 删除 / 不可逆迁移）；决定 ui_methods 暴露面。**Steer 成本极高，任何可下放的 Execute 都应下放到 Agent 侧——不该陷入"再多一行就让 Agent 干"的拖延。**
- **Agent（Execute）**：一切具体动作（open / refine / submit / write_file / 跑测试 / 改代码）；把内循环结果回报；在自己 stone 的 method 库与 knowledge 沉淀。**AgentOfX 不擅自动哲学层——不改 meta 顶层 narrative，有歧义经 super flow 抛给我。**

## 当前运行时：Claude Code 暂行（不是 dogfooding 终态）

**长期目标（dogfooding）**：AgentOfX 本身是 OOC 中的 Object——各有自己的 `stones/agent_of_X/`（self.md + knowledge/memory + server 方法库），彼此走 collaborable（talk_window / relation）协作，经 reflectable（super flow）自我迭代。这条链路反过来是 OOC 最强测试场：撑不起自己的工程协作，就撑不起任何外部 multi-agent 场景。

**短期现状（做不到 dogfooding）**：OOC 各维度仍在演化，自身协作链路尚未稳到能承载自己的工程协作。所以暂行：
- **Supervisor = 人类 + Claude Code 主会话**：meta 编辑、design 决策、跨 Agent 协调、最终拍板都在主会话。
- **各 AgentOfX = Claude Code 的 sub agent**：用 Agent 工具 dispatch，把任务 prompt + 关键上下文 + 文件路径喂给子 Agent，子 Agent 执行完通过返回值汇报。
- **AgentOfExperience** 同样走 sub agent 形态。

暂行模式的妥协（即当前缺口）：没有 `stones/agent_of_X/` 目录（子 Agent 记忆靠主会话每次注入 prompt）；子 Agent 之间无 talk_window，协调全经我中转；无 super flow 自演化，经验沉淀靠人类写回 meta / docs。

**迁移路径**：某能力维度成熟到能承载工程协作（talk-delivery 稳 + relation 可用 + super flow 闭环跑通），就把对应 Agent 从 sub agent 迁到 OOC 内 Object。全部迁完 = dogfooding 落地。每次迁移前后跑同一组场景，验证自托管不输暂行——这是体验官的关键观察点。

## 派 sub agent 的卫生规约

派单时必须在 prompt 里写明，否则会污染 world / 留死进程：

- **session 隔离**：自验证创建的 session，sessionId 一律 `_test_<agent>_<timestamp>` 前缀，验证完 rm。
- **进程卫生**：sub agent 启动的 vite / backend / 任何 long-running 进程，退出前必须 kill（`trap 'kill ${PIDS[@]}' EXIT`）——macOS bun/node 不传 SIGHUP 给孙子进程，不主动 kill 会带着临时 env/world 一直跑，让用户前端永远 proxy 到死端口。
- **commit 卫生**：派出去的 sub agent **不要自己 commit**——缺 co-author footer、用错 git author、且让我失去整合机会；改动回到主会话由我整合提交。

> 各维度的具体设计（含 AgentOfX 维度关注点、commit/数据边界/跨层修复等工程规约）在我的对应 child 对象的 self.md / knowledge 里。
