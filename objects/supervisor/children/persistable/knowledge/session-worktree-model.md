---
title: stone identity = session-worktree 统一模型
description: main = canonical / session worktree 试验层 / evolve_self 合入闸门，五通道全接入
activates_on: {"window::root": "show_content"}
---

# stone identity = session-worktree 统一模型

stone identity 文件（`self.md` / `readable.*` / `executable/**` / `visible/**` / `knowledge/**`）遵循 worktree 统一模型（设计权威 `docs/2026-06-05-stone-flow-overlay-versioning-design.md`，取代旧 plain overlay/shadow）。

## 三态

- **main = canonical stone**：Object 已提交的权威自我，唯一默认读源（`stones/main/objects/<id>/`，main git worktree；stoneDir 默认即此）。
- **session worktree = 会话内试验层**：普通业务 session（非 super、非控制面）对 identity 文件的 write_file / file_window.edit **不即时改 main**，落该 session 从 main HEAD lazy 派生的 git 分支 `stones/session-<sid>/objects/<id>/`（完整工作副本，plain write、不走 versioning、不 commit）。本 session 即时生效，main 不变、别 session 读旧版。worktree 是完整副本——读写收敛同一目录，无 shadow，裸读（program shell `$OOC_SELF_DIR`）看得到完整 identity。
- **super-flow evolve_self = 身份合入闸门**：把某业务 session worktree 改动正式合入 main——commit `session-<sid>` 分支 → rebase → self-scope ff-merge 回 main（署名 objectId，非 bootstrap）→ GC（移除 worktree + 删分支）。**session 分支即演化单元**（整个 session 的 identity 改动一并合入），是身份从「试验」到「提交」的唯一自我演化通道。

## 为什么取代 overlay

旧 plain overlay 用 shadow 叠加部分文件：裸读路径（program shell、visible endpoint）看不到完整 identity，多通道各自手拼路径，一漏接就读到旧版/裸 main。worktree 是完整副本，读写收敛同一目录，结构上消除 shadow 漏接。

## 五通道全接入 `resolveStoneIdentityDir`

统一访问原语 `resolveStoneIdentityDir(ref, mode)`：business session → worktree（write 模式 lazy 建、read 模式已建才走否则透传 main）；super flow / 控制面直走 canonical main。接入点：

1. `write_file` / `file_window.edit` 写 — `@ooc/builtins/file/executable/index.ts`。
2. `loadSelfInstructions` 读 — `packages/@ooc/core/thinkable/context/index.ts`。
3. executable/visible/readable loader 读。
4. program shell `$OOC_SELF_DIR` — `packages/@ooc/core/executable/program/self-env.ts`。
5. 控制面 visible endpoint — `packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts`。

锚点：`packages/@ooc/core/persistable/stone-worktree.ts:89` resolveStoneIdentityDir / `:105` resolveStoneIdentityRef / `:61` ensureSessionWorktree / `:25` sessionStoneBranch / `:42` sessionUsesWorktree；合入在 `packages/@ooc/core/programmable/evolve-self.ts:124` evolveSelfMerge / `:98` evolveSelfDiff。

## 两条进入 canonical 的合法通道（互不经过对方）

- **Object 自我演化**：业务 session worktree → super-flow `evolve_self` 合入 main。
- **外部权威写入**：控制面 HTTP（putSelf / putServerSource）直写 main 经 versioning（不走 worktree）。

## 例外与边界

- **executable 命令集 / 注册的 readable** 全局 main-canonical（类型系统全局共享），loader 通道不 per-session 路由（per-session 改命令集本就走 evolve_self → main → 重注册）。
- **pool sediment**（`pools/<id>/knowledge/**`）不在 worktree 模型内：独立、直写、不进 git；super flow 反思写 memory 直接落 main。
- 硬约束：identity 必须已 git-commit 到 main 才被新 worktree 看到（低层 writeSelf 只写文件不 commit）。
- 生命周期：worktree 随 session 存在，evolve_self 合入后 GC（`evolve-self.ts:169`）、session 清理即消亡；未合入的改动不进 canonical——「试验不污染身份」。
- metaprog worktree（控制面 HTTP putSelf/putServerSource 经 versioning 写 main 用的 `stones/metaprog/<id>/<token>`）的清理：`gitWorktreeRemove` 后由 `gcEmptyWorktreeParents` 逐级删空父目录；启动期 `pruneStaleWorktrees` 调 `gcEmptyMetaprogTree` 后序清扫整棵 `stones/metaprog/` 残留（2026-06-07 补，`programmable/versioning.ts`）——杜绝「worktree 已删但空父目录 `stones/metaprog/<id>/` 长期堆积」。**未决**：业务 session 的 abandoned worktree（异常未清理）仍缺独立 orphan 回收器。
