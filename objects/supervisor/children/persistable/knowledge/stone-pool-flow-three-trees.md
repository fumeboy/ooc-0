---
title: stone / pool / flow 三分
description: OOC world 持久层的设计 / 事实 / 运行三棵子树及其边界
activates_on: {"object::root": "show_content"}
---

# stone / pool / flow 三分

OOC world 是一棵统一文件树 `{baseDir}/`，分三棵子树。三分是 **World 级别**的（不是 Agent 级别）。

| 层 | 内容 | 形态 | git | review |
|----|------|------|-----|--------|
| stone | 设计 | 身份 + 源码 + seed knowledge | 是 | PR-Issue |
| pool | 事实 | csv 表 + markdown + 文件 | 否 | 写就生效 |
| flow | 运行 | thread.json + debug | 否 | 即用即弃 |

## stone — 设计层（持久 + git）

`stones/<branch>/objects/<id>/` 持有 per-Object 长期身份与设计源码**五件套**（逻辑契约）：

- `self.md` — 对内身份，buildInputItems 时注入 `LlmGenerateParams.instructions`。
- `readable.md` | `readable.ts` — 对外公开介绍（原 readme.md，ooc-6 重命名）。
- `executable/index.ts` — stone executable 方法源码（原 server/index.ts）。
- `visible/index.tsx` — stone visible UI 源码（原 client/index.tsx）。
- `knowledge/<slug>.md` — **seed knowledge**：人类预置的先天能力基底，进 git review，可挂 eval gate。

stone = 设计（code）不是数据（data）：低频、要 review。物理骨架只预创 3 件可见小文件（`.stone.json` + 空 self.md + 空 readable.md），其余 lazy mkdir（`stone-object.ts:createStoneObject`）。

**建新对象骨架 = `create_object` root method**（`stone-create-object.ts:93 createObjectInSession`，2f4456f9）：仅 business session 可调（super/无 session fail-loud 提示走 HTTP），`resolveStoneIdentityRef(write)` 拿 session worktree ref → 复用 createStoneObject + writeSelf + writeReadable 建骨架（package.json + self + readable + knowledge）**不 commit**，`enqueueSessionWrite` 锁内做 main + worktree 双重 ALREADY_EXISTS 校验。落 `flows/<sid>/objects/<newId>/`，main 不变，合入仍走 evolve_self cross-scope。口诀：**建新对象 = create_object；改已存在对象文件 = write_file/edit**（write_file 靠 package.json 判 owner，接不上「无 package.json 的新对象骨架」）。

## pool — 事实层（持久 + 不 git）

`pools/<id>/`（嵌套 child 走 `pools/<a>/children/<b>/`，无 `objects/` 中间层；`pool-object.ts:54` poolDir）挂 per-Object 事实。（`pools/repos/<name>/` 共享外部 git repo 是设计预留——core 代码暂无落点。）

- `data/<name>.csv` — 结构化数据，一张表一个文件（csv 替代 sql，无 migration runner；`pool-object.ts:54` poolDir）。
- `knowledge/memory/<slug>.md` + `knowledge/relations/<peer>.md` — **sediment knowledge**：运行时由 reflectable / collaborable 自动沉淀，写就生效。与 stone 的 seed 配对，synthesizer 双源扫描。
- `files/` — 任意 blob。

pool **不进 git / 不走 worktree 模型**：事实单向积累，写就生效。

## flow — 运行层（ephemeral）

`flows/<sessionId>/`（`flow-object.ts`）：

- **session worktree 根**：`flows/<sid>/` 本身是从 `stones/main` 派生的 git worktree（分支 `session-<sid>`，物理路径 `flows/<sid>`、名路径解耦），session 创建即 eager checkout main 全量 stone 文件。LLM 在 session 内的所有 stone 写直接落此目录，合入经 super flow evolve_self。
- **身份与运行时同落 `objects/<objectId>/`**（a4d11bf1）：一个 `objects/<id>/` 目录同时容纳该对象 tracked stone 身份（worktree checkout）+ untracked 运行时轨迹，物理不分离、靠 `.gitignore` 分离语义。main 根 gitignore（`programmable/bootstrap.ts:56` `STONE_MAIN_GITIGNORE`）= 白名单 + 黑名单：`/*` 排除顶层运行时 → `!/objects/` `!/.gitignore` 放行 → `objects/**/threads/` + `objects/**/.flow.json` + `objects/**/state.json` 再黑掉任意深度（含 nested children/）的运行时产物。`ensureMainGitignore` 内容不一致即覆盖更新（旧 world 升级）。
- 运行时轨迹：`.flow.json` / `threads/<tid>/thread.json`（线程元数据）/ `threads/<tid>/thread-context.json`（**§10 已完整退役 thread.json.contextWindows[]**，b24ba0ef——thread-context.json 是 contextWindows 唯一权威，`thread-json.ts:69 writeThread` 是唯一持久化入口、单点刷、自动覆盖所有绕过 WindowManager 的写路径；entries 由 `flow-thread-context.ts:51 buildThreadContextEntries` 唯一规则产出）/ `debug/` / `data.json`（session-scoped，ProgramSelf.getData/setData 载体）/ `knowledge/relations/<peer>.md`（session 层关系）。

## 边界

所有路径计算 / IO 集中在 `packages/@ooc/core/persistable/`；其它维度只通过 ref + 函数调用访问磁盘，**绝不直接拼路径**。
