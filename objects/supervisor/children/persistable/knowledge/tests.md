---
title: persistable 测试规格
description: 验证「身份/事实/产物落 stone/pool/flow 三子树且离内存可恢复」的两层判据——Tier A 控制面 TC + Tier B agent-native rubric + stories 索引
activates_on: {"object::root": "show_description"}
---

# persistable 测试规格

我这一维度的能力判据收在这里：身份/事实/产物落到 stone(持久+git) / pool(持久+不git) / flow(运行层) 三子树，离开内存仍可恢复。两层验证——控制面确定性（无 LLM，进 CI）与 agent-native（真 LLM，env-gated）。代码在 `packages/@ooc/storybook`，本文件只归属判据，不复制实现。

## Tier A —— 控制面确定性（无 LLM）

零真 LLM、可进 CI 的落点与版本化判据。逐条对应一个断言：

- **TC-PERS-01** —— createStone 落 `stones/main/objects/<id>/` 且进 git（package.json 落盘 + self.md 至少 1 个 commit）。持久 + 可审计。
- **TC-PERS-02** —— 经 HTTP PUT 改 self 在 `stones/main` 多出一个 commit（worktree 版本化、可审计可回滚）。
- **TC-PERS-03** —— 三子树落点各就位：stone(持久+git) / pool(持久+不git) / flow(运行层)。一次建对象 + 发起 session 后三棵子树同时存在。

## Tier B —— agent-native rubric（真 LLM，env-gated）

业务 session 内 agent 改 self → 落 `flows/<sid>/` session worktree（`stones/main` canonical 不变、session 永不合入）；要沉淀经 feat-branch PR：`new_feat_branch` → feat worktree 编辑 → `evolve_self` 开 PR → approve → merge 后 main 有非 bootstrap 署名 commit；重读 HTTP 证明可恢复。

rubric（规格已就地收编进本 tests.md；story 代码在 `packages/@ooc/storybook/stories/`）：

- **Good**：session worktree 落对（`flows/<sid>/`）、main canonical 不变；feat-branch PR 合入后 main 有署名 commit、可恢复。
- **OK**：落对但 PR 未合入 / 残留 uncommitted。
- **Bad**：落错层 / 离开内存丢失。

## Stories 索引

规格已就地收编进本 tests.md；story 代码在 `packages/@ooc/storybook/stories/`。下列只列 id + 预期。

### `stories/persistable.story.ts` —— 维度 story

- `runControlPlane()` —— Tier A：覆盖 TC-PERS-01 / 02 / 03（createStone 落点进 git、HTTP 改 self 新 commit、三子树落点）。
- `runAgentNative()` —— Tier B：supervisor 建对象写 self.md 身份；create_object 落 session worktree（永不合入），经 feat-branch PR 合入 main 后经 HTTP 重读 self.md 证明可恢复。

### `stories/L0_world.stories.ts` —— World 子树落点单元 catalog

逐条 id + 预期：

- **L0-STONE-REPO** —— ensureStoneRepo 后 `stones/main/` 是 git 工作区（`.git` 存在）。
- **L0-CREATE-STONE** —— 建对象后 `stones/main/objects/<id>/` 出现 package.json + self.md。
- **L0-STONE-GIT** —— 建对象的 self.md 进 git（至少 1 个 commit，可审计）。
- **L0-SELF-COMMIT** —— 经 HTTP PUT 改 self 在 `stones/main` 多出一个 commit。
- **L0-POOL-NOGIT** —— 建对象同时建 `pools/<id>/` 骨架，且 pool 是独立于 stones 的子树（不误落进 stone 子树）。
- **L0-THREE-SUBTREES** —— 一次会话后 stone(git) / pool(持久) / flow(运行) 三子树各就位。
- **L0-GITIGNORE** —— `stones/main/.gitignore` 白名单 `objects/`、黑名单运行时（`threads/`）。

### `stories/L1_session.stories.ts` —— Session / Flow 生命周期单元 catalog

逐条 id + 预期：

- **L1-SESSION-DIR** —— 发起 session 后 `flows/<sid>/` 目录出现。
- **L1-SEED-RESPONSE** —— POST `/api/sessions` 返回 sessionId 与 targetThreadId。
- **L1-SESSION-WORKTREE** —— `flows/<sid>/` 是 `stones/main` 派生的 git worktree（`.git` 是 link 文件，不是目录）。
- **L1-SESSION-META** —— `flows/<sid>/.session.json` 存在且记录 sessionId。
- **L1-THREAD-JSON** —— 和某对象会话后 `flows/<sid>/objects/<oid>/threads/<tid>/thread.json` 出现。
- **L1-THREAD-CONTEXT** —— 同一 thread 下 `thread-context.json` 出现（contextWindows 唯一权威）。
- **L1-THREAD-NO-WINDOWS** —— `thread.json` 不含 contextWindows 字段（§10 退役，单点权威分离）。
- **L1-WORKTREE-GITIGNORE** —— session worktree 继承 main 的 `.gitignore`（运行时产物不进 git）。
