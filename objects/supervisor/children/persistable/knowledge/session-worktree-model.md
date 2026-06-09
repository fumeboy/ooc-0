---
title: stone identity = session-worktree 统一模型
description: main = canonical / session worktree 试验层 / evolve_self 合入闸门，五通道全接入
activates_on: {"object::root": "show_content"}
---

# stone identity = session-worktree 统一模型

stone identity 文件（`self.md` / `readable.*` / `executable/**` / `visible/**` / `knowledge/**`）遵循 worktree 统一模型（设计权威 `docs/2026-06-09-remove-metaprog-unify-session-worktree-design.md`，在 `docs/2026-06-05-stone-flow-overlay-versioning-design.md` 基础上完成）。

## 三态

- **main = canonical stone**：Object 已提交的权威自我，唯一默认读源（`stones/main/objects/<id>/`，main git worktree；stoneDir 默认即此）。
- **session worktree = 会话内试验层**：业务 session（非控制面）对任意 stone 文件的 write_file / file_window.edit **不即时改 main**，落该 session 从 main HEAD **eager** 派生的 git 分支，物理路径 **`flows/<sid>/`**（session 一创建即 `git worktree add flows/<sid>` checkout main 全量文件；plain write、不 commit）。本 session 即时生效，main 不变、别 session 读旧版。worktree 是完整副本——读写收敛同一目录，无 shadow，裸读（program shell `$OOC_SELF_DIR`）看得到完整 identity。改动可跨 self / cross-object（改别人 / 建新对象），合入时由 evolve_self 分类处理。
- **super-flow evolve_self = 身份合入闸门**：把某业务 session worktree 改动正式合入 main——commit `session-<sid>` 分支 → rebase → `tryMergeSelf` 分类：self-scope ff-merge 回 main（署名 objectId）/ cross-scope 转 PR-Issue → supervisor `resolve` 评审合入。合入后 GC：`gitWorktreeUnregister` 解除 `.git` link，**保留 `flows/<sid>` 运行时数据**，session 对话历史不丢。**session 分支即演化单元**，是身份从「试验」到「提交」的唯一 LLM 演化通道。

## 为什么取代 overlay

旧 plain overlay 用 shadow 叠加部分文件：裸读路径（program shell、visible endpoint）看不到完整 identity，多通道各自手拼路径，一漏接就读到旧版/裸 main。worktree 是完整副本，读写收敛同一目录，结构上消除 shadow 漏接。

## 五通道全接入 `resolveStoneIdentityDir`

统一访问原语 `resolveStoneIdentityDir(ref, mode)`：business session → worktree（session 创建时 eager 建，五通道统一走 `flows/<sid>/`）；super flow / 控制面直走 canonical main。接入点：

1. `write_file` / `file_window.edit` 写 — `@ooc/builtins/file/executable/index.ts`。
2. `loadSelfInstructions` 读 — `packages/@ooc/core/thinkable/context/index.ts`。
3. executable/visible/readable loader 读。
4. program shell `$OOC_SELF_DIR` — `packages/@ooc/core/executable/program/self-env.ts`。
5. 控制面 visible endpoint — `packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts`。

锚点：`packages/@ooc/core/persistable/stone-worktree.ts:127` resolveStoneIdentityDir / `:143` resolveStoneIdentityRef / `:89` ensureSessionWorktree / `:30` sessionStoneBranch / `:54` sessionUsesWorktree / `:47` sessionWorktreePath；合入在 `packages/@ooc/core/programmable/evolve-self.ts:133` evolveSelfMerge / `:108` evolveSelfDiff。

## 两条进入 canonical 的合法通道（互不经过对方）

- **LLM 演化**：业务 session worktree → super-flow `evolve_self` 合入 main（self-scope ff-merge / cross-scope PR-Issue）。改已存在对象文件用 `write_file`/`edit`，建新对象骨架用 `create_object`（口诀与落点见 `knowledge/stone-pool-flow-three-trees.md`）。
- **HTTP 控制面写入**：`putSelf` / `putServerSource` / `createStone` 经 `httpDirectMainWrite`（`versioning.ts:811`）直 commit main，立即生效，不开 worktree。

## 例外与边界

- **executable 命令集 / 注册的 readable** 全局 main-canonical（类型系统全局共享），loader 通道不 per-session 路由（per-session 改命令集本就走 evolve_self → main → 重注册）。
- **pool sediment**（`pools/<id>/knowledge/**`）不在 worktree 模型内：独立、直写、不进 git；super flow 反思写 memory 直接落 pool。
- 硬约束：identity 必须已 git-commit 到 main 才被新 worktree 看到（低层 writeSelf 只写文件不 commit）。
- 生命周期：worktree 随 session 存在，evolve_self 合入后 GC（`evolve-self.ts:178`；底层 `versioning.ts:406` `gitWorktreeUnregister` 只解除 `.git` link、保留 `flows/<sid>` 运行时数据）、session 清理即消亡；未合入的改动不进 canonical——「试验不污染身份」。
- **未决**：业务 session 的 abandoned worktree（异常未清理）缺独立 orphan 回收器（GC 当前只在 evolve_self 成功路径内）。
