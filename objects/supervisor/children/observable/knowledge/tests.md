---
title: observable 测试规格 —— 验证我可观测性的 stories 与判据
description: Tier A 控制面确定性 TC + Tier B agent-native rubric + 验证我能力的 story 索引
activates_on: {"object::root": "show_description"}
---

# observable 测试规格

我在 thinkloop 周围加观测点：每轮 LLM 输入输出 / tool / context 可记录、可查、可暂停、可回放。这份知识记录用来验证这件事是否成立的规格——下面的 TC 与 rubric 即「我的可观测面板是否真的可观测」的判据。代码在 `packages/@ooc/storybook`，下文只锚定 id 与期望，不复述实现。

## Tier A —— 控制面确定性（零真 LLM，可进 CI）

只验**可观测面板的结构**，不需要真 thinkloop。判据：

- **TC-OBS-01**：系统活动快照 `GET /api/runtime/activity` 返回 `{now, runningCount, logPatterns}`（`now`/`runningCount` 为 number，`logPatterns`/`jobs` 为数组）。
- **TC-OBS-02**：debug 开关 `POST /api/runtime/debug/enable` → `GET /api/runtime/debug/status` 反映已启用（`enabled === true`）。

## Tier B —— agent-native（真 LLM，env-gated）

派任务后开 debug，断每轮 `GET .../debug/loops` 有 loop-debug 记录（context windows / budget / tool dispatch）；pause 被尊重。`processTrace` 本身即我可观测性的演示。

**rubric（原样保留，收编 `playbooks/observable.playbook.md`）：**

- **Good**：debug 记录完整可回放、pause/resume 行为正确。
- **OK**：记录有缺漏但可定位。
- **Bad**：thinkloop 不可观测 / pause 被无视。

## 验证我的 stories（索引）

代码在 `packages/@ooc/storybook/stories/`，跑法见根 `CLAUDE.md` 的 storybook 段。

### story 维度档：`observable.story.ts`

- `runControlPlane()` —— Tier A，覆盖 TC-OBS-01 / TC-OBS-02。
- `runAgentNative()` —— Tier B，派任务后断 `debug/loops` 至少落盘 1 轮（可查可回放）。

### 单元 catalog：`L5_observable.stories.ts`

| id | expectation | 备注 |
|----|-------------|------|
| L5-DEBUG-TOGGLE | debug enable 后 `/api/runtime/debug/status` 返回 `enabled=true` | Tier A |
| L5-ACTIVITY | `/api/runtime/activity` 返回 `now` / `runningCount` / `jobs` 结构 | Tier A |
| L5-GLOBAL-PAUSE | global-pause enable→status enabled，disable→status disabled | Tier A，对应 pause 协议 |
| L5-JOB-STATUS | 发起 session 产生的 job 经 `/api/runtime/jobs/:id` 可查 status | 归我（observable）测清单的理由：job 调度语义本属 app-server 控制面，但此 TC 验的是**借观测面把 job 状态暴露成可见**（status 可查 = 运行态可观测），故收在我这片 |
| L5-DEBUG-SNAPSHOT | 跑一轮 thread 后 `llm.input.json` + `llm.output.json` 落盘 | skip→Tier B：LLM 快照需 worker 真跑 thinkloop |
| L5-LOOP-DEBUG | 多轮 loop 各自落 `loop_<N>.{input,output,meta}.json` | skip→Tier B：loop 快照需 worker 多轮 thinkloop |

## 边界

storybook 是能力目录（验证我「能否被观测」），与 `tests/e2e`（用户任务场景）、`tests/harness`（体验官深度评估）分层。skip 档（L5-DEBUG-SNAPSHOT / L5-LOOP-DEBUG）的真实落盘验证归 Tier B agent-native，控制面无 LLM 不覆盖。
