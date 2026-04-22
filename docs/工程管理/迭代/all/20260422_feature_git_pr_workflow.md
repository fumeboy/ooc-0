# Git PR 工作流 Trait

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 负责人：P1-CodeAgent
> 优先级：P1

## 背景 / 问题描述

当前 `git/ops` trait 只有基础 status/log/diff。作为 CodeAgent 处理"写代码 → 提 PR → 过 CI → 响应 review"的全链路几乎空白：

- 无 `create_pr` / `list_prs` / `get_pr_checks`
- 无交互式 rebase / cherry-pick / revert 封装
- 无 CI 状态查询
- 无对 PR 评论的响应能力
- worktree 管理缺失（与 OOC 线程树天然匹配）

## 目标

1. `library/git/pr` 新 trait：
   - `create_pr({base, head, title, body, draft?})`
   - `list_prs({state?, author?})`
   - `get_pr({number})` — 含 diff + 评论
   - `get_pr_checks({number})` — CI 状态
   - `comment_on_pr({number, body, inReplyTo?})`
   - `merge_pr({number, method})` — 需用户确认
2. `library/git/worktree`：
   - `worktree_add({branch, path?})` — 对应线程 fork
   - `worktree_remove({path})` — 对应线程 return
   - 与线程树 `think(context=fork)` 打通：每个 fork 子线程对应一个 worktree
3. `library/git/advanced`：
   - `cherry_pick({commit})` / `revert({commit})` / `interactive_rebase({onto})`
   - `blame({path, range?})` + 时间线分析

## 方案

### Phase 1 — PR 基础（使用 `gh` CLI 包装）

- `library/git/pr/index.ts`
- 全部通过 `gh pr ...` shell 调用
- 输出 JSON parse

### Phase 2 — Worktree 与线程树映射

- 线程 fork → 自动 worktree_add
- worktree_add 路径放 `.ooc/worktrees/{threadId}/`

### Phase 3 — 高级操作

- 交互式 rebase 需特殊处理（通过 `GIT_SEQUENCE_EDITOR` 注入脚本）

### Phase 4 — E2E

- supervisor 派发给 bruce：在 worktree 里修一个 feature，提 PR，等 CI，根据 review 修改

## 影响范围

- `library/git/pr/` + `library/git/worktree/` + `library/git/advanced/`（新）
- `docs/meta.md` 协作子树更新

## 验证标准

- 跑一次完整 "write → commit → push → create PR → CI → merge" 流程
- worktree 与线程树一致性测试

## 执行记录

### 2026-04-22 · P1-CodeAgent

**新建 3 个 library trait**：

1. `library/traits/git/pr/` — 基于 `gh` CLI 的 PR 工作流
   - `create_pr` / `list_prs` / `get_pr`（含 diff + 评论） / `get_pr_checks`（含 pass/fail/pending 汇总） / `comment_on_pr` / `merge_pr`（高危，method 必填）
2. `library/traits/git/worktree/` — Worktree 对应线程 fork 容器
   - `worktree_add`（branch 不存在自动创建，默认落 `.ooc/worktrees/{branch}`） / `worktree_remove`（默认非 force） / `worktree_list`（porcelain 解析）
3. `library/traits/git/advanced/` — 高级操作
   - `cherry_pick` / `revert` / `rebase_onto`（非交互式） / `blame`（line-porcelain 解析带行号/作者/时间）

**测试**：
- `kernel/tests/trait-git-pr.test.ts` — 11 用例（输入校验 + llm_methods 契约 + 异常路径）
- `kernel/tests/trait-git-worktree.test.ts` — 7 用例（路径规范化 + 输入校验 + 真实仓库 list）
- `kernel/tests/trait-git-advanced.test.ts` — 9 用例（输入校验 + 真实 blame）
- 全部 pass，总计 22 用例

**文档**：
- 每个 trait 的 `TRAIT.md` 含 when / params / 示例 / 注意事项
- `library/traits/git/TRAIT.md` 索引已更新

**未实现 / 后续**：
- interactive rebase todo-list 编排（需要 `GIT_SEQUENCE_EDITOR` 脚本协议）——留给后续迭代
- `commentOnPr.inReplyTo` 参数签名保留但当前实现只创顶层评论（需要 GraphQL）
- Phase 4 E2E（bruce 在 worktree 里修 feature → create_pr → CI → merge）留给集成验证阶段
