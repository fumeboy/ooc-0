---
title: stone identity = session 永不合入 + feat-branch PR 沉淀
description: main canonical / session worktree 纯运行时(永不合入) / feat-branch PR 沉淀闸；session-aware 读全接入
activates_on: {"object::root": "show_description", "method::root::evolve_self": "show_content"}
---

# stone identity = session 永不合入 + feat-branch PR 沉淀

stone identity 文件（`self.md` / `readable.*` / `executable/**` / `visible/**` / `knowledge/**`）遵循三种工作树形态（设计权威 `docs/2026-06-11-reflectable-feat-branch-pr-flow-design.md`，在 `docs/2026-06-09-remove-metaprog-unify-session-worktree-design.md` / `docs/2026-06-05-stone-flow-overlay-versioning-design.md` 基础上完成）。

## 三态

- **main = canonical stone**：Object 已提交的权威自我，**无 session 上下文（super / HTTP 无 sid / bootstrap）时的默认读源**（`stones/main/objects/<id>/`，main git worktree；裸 `stoneDir(ref)` 默认即此）。注意：**main 不是 session 内的读源**——session 内读须经 `resolveStoneIdentityRef` 路由到该 session 的 worktree（见下「读纪律」），否则读不到本 session 新建/改动的对象。
- **session worktree = 纯运行时派生物（永不合入）**：业务 session（非控制面）对任意 stone 文件的 write_file / file_window.edit **不即时改 main**，落该 session 从 main HEAD **eager** 派生的 git 分支（`session-<sid>`），物理路径 **`flows/<sid>/`**（session 一创建即 `git worktree add flows/<sid>` checkout main 全量文件；plain write、不 commit）。本 session 即时生效，main 不变、别 session 读旧版。worktree 是完整副本——读写收敛同一目录，无 shadow，裸读（program shell `$OOC_SELF_DIR`）看得到完整 identity。**`session-<sid>` 分支永不合并回 main（2026-06-11 用户拍板）**——它只为取得完整对象配置+工作区用于运行，session 归档即弃。session 内新建/改动当场可用靠 session-aware 读，与「进 canonical」是两件事。
- **feat 分支 worktree = 沉淀闸**：要让改动成为 canonical，由 super(foo) 经 reflectable 的 feat-branch PR 流程——`new_feat_branch` 从 main 派生 `feat/<slug>` 分支（worktree 落 `stones/<branch>/`，与 main / session worktree 并列）绑进 thread → 直接编辑 → `evolve_self` finalizer commit + 开 PR + reviewer 冒泡审批 → 合入 main（机制权威在 reflectable）。与 session 分支正交、互不相碰。合入复用 `resolvePrIssue`（ff-merge + archive）+ `gitWorktreeUnregister`（解 `.git` link、保留运行时数据）等底层原语。

## 为什么取代 overlay

旧 plain overlay 用 shadow 叠加部分文件：裸读路径（program shell、visible endpoint）看不到完整 identity，多通道各自手拼路径，一漏接就读到旧版/裸 main。worktree 是完整副本，读写收敛同一目录，结构上消除 shadow 漏接。

## 读纪律：所有身份/配置读一律经 `resolveStoneIdentityDir/Ref`

统一访问原语 `resolveStoneIdentityDir(ref, mode)` / `resolveStoneIdentityRef(ref, "read")`：business session → worktree（session 创建时 eager 建，统一走 `flows/<sid>/`）；super flow / 控制面 / 无 sid → canonical main。**不变量：任何对象身份/配置（self / readable / executable / visible / knowledge / 存在性）的读，绝不自建裸 `{baseDir, objectId}` ref 直读——后者硬落 main、对 session 内未合入对象不可达。新增读点必过这一关。**

`resolveStoneIdentityRef` 路由顺序（`stone-worktree.ts:169`）：**feat 分支绑定（`stonesBranch`）覆盖优先，放在 sessionId 路由最前面**（`:178-182`，经 `ensureFeatBranchWorktreeReady` 确保 worktree 就绪）——绑定缺省的绝大多数 thread 整段跳过、下方 session 解析逐字节不变（回归不变量）；绑定存在则 super(foo) 读写自然落 feat worktree。其后 `sessionUsesWorktree` → session worktree / canonical main。

已接入点（非穷举——新增读点同样必接入；2026-06-11 sweep 暴露下方 6-8 曾漏接，致 session 内新对象不可达，已修 62871c50）：

1. `write_file` / `file_window.edit` 写 — `@ooc/builtins/file/executable/index.ts`。
2. `loadSelfInstructions` 读 — `packages/@ooc/core/thinkable/context/index.ts`。
3. executable/visible/readable loader 读。
4. program shell `$OOC_SELF_DIR` — `packages/@ooc/builtins/program/executable/self-env.ts`。
5. 控制面 visible endpoint — `packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts`。
6. talk target 存在性检查 — `packages/@ooc/core/executable/windows/talk/index.ts`（漏接 → session 内新 peer `target 不存在`）。
7. context self 方法注册 + peer readable/方法注册 — `packages/@ooc/core/thinkable/context/object-windows.ts`（漏接 → 新对象 executable/readable 加载不到、render 落 placeholder）。
8. readable 渲染 — `packages/@ooc/core/thinkable/context/renderers/xml.ts`。

**仍 main-anchored 的边界（残留，跟踪）**：`derivePeerObjectWindows` 的 hierarchical peer 发现（`discoverStoneHierarchicalPeers`）+ 全局 `object-type-registrar`（startup 只扫 `stones/`）——session 内新建 **child** 对象不会自动作为 hierarchical peer 出现（talk 过的 peer 走 talk_window 收集路径已 session-aware，不受影响）。

锚点：`packages/@ooc/core/persistable/stone-worktree.ts:153` resolveStoneIdentityDir / `:169` resolveStoneIdentityRef（feat 绑定覆盖 `:178-182`）/ `:131` ensureFeatBranchWorktreeReady / `:89` ensureSessionWorktree / `:30` sessionStoneBranch / `:54` sessionUsesWorktree / `:47` sessionWorktreePath；feat 分支 + PR 在 `packages/@ooc/core/persistable/stone-feat-branch.ts:163` createFeatBranchWorktree / `:238` commitAndOpenPr。

## 两条进入 canonical 的合法通道（互不经过对方）

- **LLM 沉淀（feat-branch PR）**：super(foo) `new_feat_branch` 开 feat 分支 → 直接编辑 → `evolve_self` finalizer commit + 开 PR → reviewer 冒泡审批 → 合入 main（`resolvePrIssue`，`.world.json prAutoMerge` 控自动/人工）。改已存在对象文件用 `write_file`/`edit`，建新对象骨架用 `create_object`（口诀与落点见 `knowledge/stone-pool-flow-three-trees.md`）。**session 分支不参与合入**。
- **HTTP 控制面写入**：`putSelf` / `putServerSource` / `createStone` 经 `httpDirectMainWrite`（`stone-versioning.ts:561`）直 commit main，立即生效，不开 worktree。

## 例外与边界

- **executable 命令集 / 注册的 readable** 全局 main-canonical（类型系统全局共享），loader 通道不 per-session 路由（per-session 改命令集本就走 feat-branch PR → main → 重注册）。
- **pool sediment**（`pools/<id>/knowledge/**`）不在 worktree 模型内：独立、直写、不进 git；super flow 反思写 memory 直接落 pool（write-through，不分支/不 PR）。注意：feat 绑定生效时 `write_file pools/...` 仍落 pool 不进 feat worktree，两通道须选对（见 reflectable `knowledge/sediment-knowledge.md`）。
- 硬约束：identity 必须已 git-commit 到 main 才被新 worktree（session 或 feat）看到（低层 writeSelf 只写文件不 commit）。
- 生命周期：session worktree 随 session 存在、清理即消亡，**永不合入**；feat 分支 worktree 在 PR 决议后 GC（`stone-feat-branch.ts:342` `unregisterFeatWorktree`，底层 `gitWorktreeUnregister` 只解 `.git` link、保留运行时数据）。
- **未决**：abandoned worktree（session 异常未清理 / PR 半途弃置）缺独立 orphan 回收器（`stone-versioning.ts:505` `pruneStaleWorktrees` 仅启动 hygiene）。
