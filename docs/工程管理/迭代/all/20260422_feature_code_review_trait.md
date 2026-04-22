# Code Review Trait — 自动阅读 diff 出审查意见

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 负责人：P1-CodeAgent
> 优先级：P1

## 背景 / 问题描述

当前 `kernel/reviewable` trait 只是个角色定义，LLM 能"按规则审查"但缺基础设施：
- 不能直接读 PR diff
- 不能生成结构化 review（file:line 级评论）
- 不能综合多轮审查（多 reviewer 视角投票）
- 不能把 review 意见反推为改动建议

## 目标

1. **`read_diff({ref1?, ref2?, pr?})` llm_method**：拿到结构化 diff（含 file / hunk / context line）
2. **`post_review({findings})` llm_method**：产出 review 报告到文件 / PR 评论
3. **`multi_perspective_review({persona})`**：以指定视角（安全 / 性能 / 可读性 / 架构）各审查一遍
4. **`suggest_fixes({findings})`**：review finding → edit plan（与多文件 transaction 迭代联动）

## 方案

### Phase 1 — read_diff

- 基于 git / gh 输出
- 返回结构化数据：`{files: [{path, hunks: [{header, oldLines, newLines, context}]}]}`

### Phase 2 — review 报告生成

- Markdown 模板（含 severity / location / suggestion）
- 输出到 `flows/{sid}/reviews/{timestamp}.md`

### Phase 3 — 多视角

- 一个父线程 fork 多个子线程，每个激活不同 bias trait（security-reviewer / perf-reviewer / readability-reviewer）
- return 时合并到主 review

### Phase 4 — suggest_fixes 集成

- findings → plan_edits 联动（前置依赖：多文件 transaction 迭代）

## 影响范围

- `kernel/traits/reviewable/` 扩展为 trait tree（review_api / review_personas）
- 与"多文件 transaction"迭代有联动

## 验证标准

- 对现有 PR 跑一次 multi-perspective review，输出读起来合理
- suggest_fixes 产出的 plan 人肉验证无明显错误

## 执行记录

### 2026-04-22 · P1-CodeAgent

**新增 `kernel/traits/reviewable/review_api/`** — 4 个 llm_methods：

1. `read_diff({ref1?, ref2?, pr?})` — 调 `git diff` 或 `gh pr diff`，返回结构化 `{files: [{path, mode, hunks: [{header, oldStart, newStart, addedLines, removedLines, contextLines}]}]}`
2. `post_review({findings, summary?, prNumber?, filePath?, rootDir?})` — 三种输出模式：
   - `prNumber` → 发 PR 评论（gh pr comment）
   - `filePath` → 写 markdown 文件
   - 都没传 → 返回渲染好的 markdown 文本（target 字段）
3. `multi_perspective_review({personas?, ...})` — **返回编排配方**，不自己 fork 线程。默认 4 视角（security/performance/readability/architecture），每个给出 `{biasPrompt, forkTitle, forkDescription}`。配套 `mergeHint` 告诉调用者怎么合并去重。
   - 设计决策：kernel trait 不反向依赖 thread/engine——fork 行为由调用 LLM 通过 `[create_sub_thread]` 自行发起
4. `suggest_fixes({findings})` — 把 review findings 翻译为 `edit_plan` 骨架（path/line/change/priority），按 priority 升序（critical=1 在最前），供后续"多文件 transaction"迭代消费

**辅助 export**（单测友好）：
- `parseUnifiedDiff(raw)` — unified diff → 结构化
- `renderReviewMarkdown(summary, findings)` — severity 分组 markdown
- `buildMultiPerspectiveRecipes(personas)` — 视角 → 配方

**测试**：`kernel/tests/trait-reviewable-review-api.test.ts` — 17 用例
- parseUnifiedDiff 5 用例（空/modified/added/deleted/renamed/多文件）
- renderReviewMarkdown 2 用例（空 findings / severity 分组）
- buildMultiPerspectiveRecipes 2 用例（默认 4 视角 / 未知 persona 回退）
- llm_methods 契约 + 异常路径 8 用例
- 全 pass

**TRAIT.md 文档**：`reviewable/TRAIT.md` 末尾添加"相关子 trait"表链接新 subtree

**Phase 4 联动**：`suggest_fixes` 产出的 `EditPlanStep[]` 已按多文件 transaction 迭代能消费的结构设计（后者实现后只需直接读取 steps 数组）
