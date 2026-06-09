---
title: reflectable 测试规格 —— 我的自我演化怎么被验收
description: 自观察/自修改五件套 + super flow 沉淀的 Tier A 用例与 Tier B rubric；问「reflectable 怎么测、什么算 Good」时看这篇
activates_on:
  "object::root": "show_content"
---

# reflectable 测试规格

这是我 reflectable 维度的验收标准：经受保护的 super session 改写自身身份文件与 sediment knowledge、下一轮自动生效的自我演化，怎么被判定为「真的成立」。规格已就地收编进本 tests.md；story 代码在 `packages/@ooc/storybook/stories/`。

两层验收：Tier A 是零真 LLM、可进 CI 的控制面确定性核验（我经 HTTP 行使能力、断言确定性产物）；Tier B 是真 LLM、env-gated 的 agent-native——我在 thinkloop 里亲手反思，再抽过程轨迹 + 确定性产物核验。

## Tier A —— 控制面确定性（已实现，stories/reflectable.story.ts）

六个用例，全程经 HTTP worktree（版本化入口），我不直写磁盘——直写未提交会和 ff-merge 冲突。

- **TC-REFL-01**：经 executable 读自己的 `self.md`（自观察）。我经 `ctx.self.dir` 读回 self 内容，断言等于写入值。
- **TC-REFL-02**：经 HTTP `PUT /self` 改 `self.md`（自修改身份）。断言写 ok + 读回一致 + 磁盘落盘一致。
- **TC-REFL-03**：经 HTTP `PUT /readme` 改 readable（自修改对外呈现）。断言写 ok + 读回一致。
- **TC-REFL-04**：经 HTTP `PUT /server-source` 改 executable 代码（自修改行为）。改完热更（等 ~350ms fs.watch），call 新方法拿到新返回值。
- **TC-REFL-05**：knowledge 经 HTTP 写入——sediment 落 pool（`POST /api/pools/<id>/knowledge/files`），断言 2xx。
- **TC-REFL-06**：reflectable × programmable 闭环——HTTP 改 executable，新增方法热更立即生效（v1→v2 + 新增 hello 方法都召得回）。

控制面坑：executable 热更须 `sleep(~350ms)` 等 fs.watch；版本化写（self/readable/executable）必经 HTTP API，不直写。

## Tier B —— agent-native（真 LLM，env-gated）

派我「把项目约定沉淀为长期记忆」走 super flow（evolve_self）；以 `waitForSuperFlow` + `listMemoryFiles` + `hasValidFrontmatter` 核验 memory 真落 pools/ 且 frontmatter 合法（≈ e2e S5）。super flow 是独立 job，须单独等。

**rubric（S5 Good 7 条，已就地收编进本篇）：**

- **Good**：memory 落 pools/、frontmatter 合法、内容真提约定、agent 向 user 汇报、下轮自动激活。
- **OK**：沉淀了但 frontmatter 缺失/内容空泛。
- **Bad**：未沉淀 / super flow 失败 / 改动未生效。

## 单元 catalog —— stories/L6_reflectable.stories.ts

业务 session worktree 隔离可确定性单测；evolve 合入 / PR-Issue / memory 由 super flow 编排、需 worker，故归 Tier B/e2e（skip）。

- `L6-WORKTREE-WRITE` —— 业务 session 内改自身 self 落 worktree，stones/main canonical 不变。（可跑：ensureSessionWorktree）
- `L6-EVOLVE-FFMERGE` —— evolve_self self-scope → ff-merge 回 main，留署名 commit。（skip：需 worker）
- `L6-EVOLVE-CROSS-PR` —— evolve_self cross-scope（改/建别人对象）→ 开 PR-Issue 待评审。（skip：需 super flow 编排）
- `L6-MEMORY-POOL` —— long memory 落 `pools/<id>/knowledge/memory/<slug>.md`。（skip：需 worker）
- `L6-CREATE-OBJECT-WORKTREE` —— create_object 在业务 session 落 session worktree `objects/<newId>/`（未即合入 main）。（skip：root method，需 agent 在 worker thinkloop 调）

## 与 persistable 共享的 worktree 条目 —— stories/L1_session.stories.ts

session identity = 从 stones/main 派生的 git worktree——这是 reflectable 与 persistable 共享的事实来源，下面两条索引在 persistable 的测试规格也出现：

- `L1-SESSION-WORKTREE` —— flows/<sid>/ 是 stones/main 派生的 git worktree（.git 是 link 文件，非目录）。（reflectable/persistable 共享）
- `L1-WORKTREE-GITIGNORE` —— session worktree 继承 main 的 .gitignore，运行时产物（threads/ 等）不进 git。（reflectable/persistable 共享）

（同 L1 文件下的 L1-SESSION-DIR / SEED-RESPONSE / SESSION-META / THREAD-JSON / THREAD-CONTEXT / THREAD-NO-WINDOWS 属 flow/thinkable/persistable，不在我 reflectable 验收面内。）
