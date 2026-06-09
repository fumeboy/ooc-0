---
title: e2e 测试策略（A/B 两观察孔、Good/OK/Bad 三档、backend/frontend 入口）
description: OOC 作为 CodeAgent "是不是真能用"怎么验；问"e2e 怎么评分""体验官按什么基线判 Good/OK/Bad"时看这篇
activates_on:
  "object::root": "show_content"
---

# e2e 测试策略

体验官的发现要落成 e2e 场景才不漂回去；裁决"某行为算通过还是不算"要回到这套基线。这篇沉淀策略骨架；具体场景表 S1-S6 / F1-F7 的可执行实现在 `tests/e2e/`，能力级 rubric 已归属各维度对象 `children/<dim>/knowledge/tests.md`。

本维度回答的不是"单元正确"，而是"**OOC 作为 CodeAgent 是不是真的能用**"——端到端同时验用户体验与 OOC 机制。单元测试不归这套管（各模块 `__tests__/` 下 bun:test）。

## 两个观察孔（A + B）—— 必须同时通过

- **A. User story（用户视角）**：任务是否完成、文件是否真改、对话是否回到 user。
- **B. OOC 机制（设计者视角）**：LLM 走了什么 methods / 创建了什么 windows / talk-delivery 双写是否对 / form 状态是否正常流转。

只看 A 会漏 OOC 自身退化（任务完成了但用 shell sed 而非 file_window.edit）；只看 B 会漏"机制都对了但用户看不到回复"。**两孔同时过才叫 e2e 通过。**

## 三档评分基准（Good / OK / Bad）

- **Good**：按设计最优路径完成（thread.status=done、用户看到回复、用 OOC 推荐命令而非 shell、无 form 重启 / talk_window 误关）。
- **OK**：完成但有可观察的浪费或绕行（多开 form 又关 / shell 改文件 / talk_window 被 close 又重开 / 命令重试多次才成功）。**OK 是容忍区但不是放行**——需趋势观察。
- **Bad**：没完成，或完成但用户看不到结果，或机制状态错乱（thread 卡 running/waiting、user.root 收不到回复、文件没变、form 一直 executing、callee.inbox 与 caller.outbox 不一致）。

判定要点：每个场景显式列 Good/OK/Bad 条件；判定基于"**测试结束时观察到的事实**"（thread.json / 文件系统 / outbox），不基于 LLM 中间表达；Good 应是"任意一次跑都成立"的最低保证，不是"理想 LLM 一次完成"。通过门槛 **>= OK**（Bad → 失败）。

## 不稳定性政策（LLM 有方差）

- 不强求 Good；门槛 >= OK。
- **Bad 是真信号**——几乎一定是 OOC 真错了（协议文本误导 / 命令实现 bug / 通路断），不是 LLM 一次发挥。
- **OK 多发是黄信号**——连续 N 次都 OK 不到 Good，说明 OOC 引导力某处不够，回看协议文本。
- CI 单场景允许重试 1 次；两次都 Bad 才算失败。OK/Good 命中档 + 关键观察值打到 stdout 留趋势。

## 入口分离

- **backend e2e**：HTTP API + worker + LLM + 文件系统 + thread.json。不开浏览器，经 Elysia `app.handle(new Request(...))` 直调，对副作用断言。gate `RUN_BACKEND_E2E=1`，位于 `tests/e2e/backend/*.e2e.test.ts`。
- **frontend e2e**：Web UI → 前端 HTTP → 后端 worker → 真 LLM → 回到前端渲染。真开浏览器（Chromium via Playwright），键鼠级操作完成用户故事。gate `RUN_FRONTEND_E2E=1`，位于 `tests/e2e/frontend/*.pw.ts`（注意：文件后缀是 `.pw.ts` 不是 `.spec.ts`）。
- **两端关系**：同一用户故事应能在 backend 与 frontend 互相映射——backend 先绿 → frontend 才有底气。调试失败：先看 backend 同场景；backend 绿 + frontend Bad → 锁 UI；两端都 Bad → 后端/LLM/协议层。

## 触发模式（LLM 真假）

- **真 LLM e2e**：env 配齐，env-gated 默认 skip；CI 在 `RUN_E2E=1` 下跑；**主线 e2e 形态**。
- **mock LLM e2e**：脚本化 tool call 序列，默认跑，仅验"机制通"的快速回归；**不能替代真 LLM e2e**。
- **半真 e2e**：真 LLM + mock 工具，仅探查不进 CI（临时定位是 LLM 误判还是工具实现错）。

## 显式不写（out of scope）

性能/压测、多用户并发/多 session 隔离、跨浏览器兼容、thread.json schema 迁移——都不在本策略范围。

> 落地实现：backend / frontend 完整场景表与各自 Good/OK/Bad 条件、fixture、scoreScenario 裁判在 `tests/e2e/`；能力级 rubric 已归属各维度对象 `children/<dim>/knowledge/tests.md`（体验官 orchestrate 读它）。三层测试边界（storybook 能力目录 / tests/e2e 用户场景 / tests/harness 体验官深评）见 storybook framework-design。
