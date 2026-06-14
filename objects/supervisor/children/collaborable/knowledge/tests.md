---
activates_on: {"object::root": "show_description"}
---

# tests —— 验证我 collaborable 维度的测试规格

我这条维度的对外承诺是：Object 间只以「消息 + 持续会话窗口」协作，跨 thread 影响必经显式 inbox/outbox（peer 平等轴）。下面是守住这条承诺的测试规格——分两层：控制面只断**通道是否接通**（零真 LLM、可进 CI），agent-native 断**对端是否真用自己的 thinkloop 回应**（真 LLM、env-gated）。具体代码在 `packages/@ooc/storybook`，本文只持有规格与索引，不复制实现。

## Tier A —— 控制面确定性

seed 一次 `user→talk→target` 的派送后，只验通道，不验对端回应（那归 Tier B）：

- **TC-COLLAB-01 · talk-delivery**：target 的 callee thread inbox 真实收到 user 那条消息（消息双写已落到 callee 的 inbox/）。
- **TC-COLLAB-02 · 路由表**：user.root 上挂了一个指向 target 的 talk_window（cross-object talk 的路由表条目，`class==="talk"` 且 target 命中）。

> **talk 双形态（do→talk 合并，2026-06-14）**：talk window 现统一 **peer 会话**（target=别的对象，上面 TC 覆盖）与 **fork 子线程**（target=自己 objectId ⇒ `isForkWindow=true`，旧 do 并入）两形态。fork 形态的不变量（建窗即知子线程 id、`say` 走内存树派送、close 即 archive 子线程）目前由 **core 测试**守（`executable/windows/__tests__/sharing.test.ts`、`thinkable/__tests__/context.test.ts`）；storybook gate 的 fork 形态 TC 待补（与 class-dynamic 弧一起落，见 `docs/2026-06-14-context-redesign-impl-plan.md`）。

单元 catalog（`L4_collaborable.stories.ts`）把同一组通道拆得更细，并对需要 worker/真 LLM 的部分诚实 skip：

- **L4-USER-TALK** — seedSession 在 user 线程上建对 target 的 talk_window。
- **L4-DELIVER-INBOX** — 初始消息以 per-message append-only 落 callee 线程的 inbox（`inbox/msg_*.json`）。
- **L4-TALK-BUILTIN-FEATURE** — talk window 是 `isBuiltinFeature`：状态 inline 进 thread-context，不写独立 dir。
- **L4-CROSS-OBJECT-TALK** — agent 主动 talk 别的对象、双方各落 thread；需 worker/LLM thinkloop，控制面不可确定性验证，**归 Tier B（skip）**。
- **L4-PR-ISSUE-FILE** — feat 分支 `create_pr_and_invite_reviewers` 开 PR-Issue 待 reviewer 评审；需 super flow worker 编排，**归 Tier B/e2e（skip）**。
- **L4-RELATION-POOL** — 对象关系沉淀进 `pools/<id>/knowledge/relations/<peer>.md`；由运行流触发，需 worker，**归 Tier B（skip）**。

控制面通道接通 ≠ 协作真的发生：上面三个 skip 正是 Tier A 摸不到的边界，必须由 Tier B 补。

## Tier B —— agent-native（真 LLM，env-gated）

supervisor 创建一个新对象，经 talk 联系它、请它自我介绍，新对象跑**自己的 thinkloop** 回应（轮询 callee 出现 say）。这一档原样保留 rubric：

- **Good**：talk 投递、callee 真实回应、messageId 双写一致、A outbox 有回报。
- **OK**：回应迟缓 / talk_window 误关又重开。
- **Bad**：callee 无回应 / inbox≠outbox / 跨 thread 影响绕过显式通道。

收编自 `playbooks/collaborable.playbook.md` + `_demo_session.ts` Step 2。

## stories 索引（代码在 packages/@ooc/storybook）

| story id | tier | expectation |
|----------|------|-------------|
| TC-COLLAB-01 | A (`stories/collaborable.story.ts`) | talk-delivery：target callee thread inbox 真实收到 user 消息 |
| TC-COLLAB-02 | A (`stories/collaborable.story.ts`) | user.root 挂了指向 target 的 talk_window（cross-object talk 路由表） |
| TC-COLLAB-B | B (`stories/collaborable.story.ts` `runAgentNative`) | supervisor 经 talk 让新对象用自己的 thinkloop 回应（按上方 Good/OK/Bad rubric 评） |
| L4-USER-TALK | A (`stories/L4_collaborable.stories.ts`) | seedSession 在 user 线程上建对 target 的 talk_window |
| L4-DELIVER-INBOX | A (`stories/L4_collaborable.stories.ts`) | 初始消息投递到 callee 线程的 inbox（inbox/msg_*.json） |
| L4-TALK-BUILTIN-FEATURE | A (`stories/L4_collaborable.stories.ts`) | talk window 是 isBuiltinFeature（inline 进 thread-context，不写独立 dir） |
| L4-CROSS-OBJECT-TALK | B-skip (`stories/L4_collaborable.stories.ts`) | agent 主动 talk 别的对象 → 双方各落 thread（需 worker） |
| L4-PR-ISSUE-FILE | B-skip (`stories/L4_collaborable.stories.ts`) | feat 分支 `create_pr_and_invite_reviewers` 开 PR → `flows/super/issues/issue-<id>.json` 出现 |
| L4-RELATION-POOL | B-skip (`stories/L4_collaborable.stories.ts`) | relation 落 `pools/<id>/knowledge/relations/<peer>.md` |

跑法：Tier A 进 `bun run test:storybook`（CI gate，应 0 FAIL）；Tier B 经 `RUN_STORYBOOK_AGENT=1` 对运行中的 world 派任务。改我这条维度的 method/window 协议时，先回这里核对 TC，再同步 specs。
