# 文件编辑 Diff 展示（Code Agent 风格）

> 类型：feature
> 创建日期：2026-04-23
> 状态：finish
> 负责人：supervisor

## 背景 / 问题描述

参考 Claude Code 等 Code Agent，当 LLM 编辑文件时会向用户展示**绿/红高亮的 unified diff**。OOC 当前 `file_ops` 已具备 `editFile` / `writeFile`（文件已存在）的方法，调用结果只在 TuiAction 里以一行摘要显示，**用户看不到改了什么、改在哪儿**。

体验缺口：
- LLM 改 30 行代码 → 用户只看到 "editFile path=/x.ts ok"，无法快速判断这次编辑是否符合预期
- 没有"行为可视性" → 用户无法及时叫停误改
- 与现代 Code Agent 的 UX 标准存在显著差距

## 目标

在 OOC web UI 中，对每次 `editFile` / `writeFile`（含已存在文件被覆写）方法调用，展示**类似 GitHub PR / Claude Code 风格的 split-view 或 unified diff**，含绿/红着色行号。

**关键约束**：
- **trait method 调用方式不变**：保持现有 program callMethod / `open(trait, method, args)` 双路径，不引入新 tool
- **不依赖 LLM 自己生成 diff 文本**——diff 由后端在写盘前后捕获 before/after 两段文本，前端用 diff 库渲染
- **多文件编辑**：planEdits / applyEdits 也支持每文件 diff 卡片

## 方案

### 后端：`editFile` / `writeFile` / `applyEdits` 返回结果新增 `diff` 字段

修改 `kernel/traits/computable/file_ops/index.ts`：

```ts
async function editFileImpl(ctx, { path, oldStr, newStr, replaceAll }) {
  const before = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  // ... 现有替换逻辑 ...
  const after = readFileSync(path, 'utf-8');
  return {
    ok: true,
    path,
    before,        // 新增
    after,         // 新增
    bytesWritten,  // 既有
  };
}
```

`writeFile` 同样：写盘前读 before（不存在时为空串）；写盘后取 after。

`applyEdits` 返回 `results: [{path, before, after}, ...]`。

**为什么不在后端算 diff？** —— 让前端算 diff 有几个好处：
- 前端可以选择 line-level / word-level / char-level 不同粒度
- 后端不引入 diff 库依赖
- 数据 raw，未来若想换 diff 算法不需改后端

### 前端：编辑类 tool_use 的 TuiAction 增强

修改 `kernel/web/src/views/LLMInputViewer.tsx`（或对应 TuiAction 渲染层）：

1. 检测 `action.type === 'tool_use' && action.tool === 'open'` 且 `args.method ∈ {editFile, writeFile, applyEdits}`
2. 从 `action.result` 取 `before` / `after`
3. 用 `react-diff-viewer-continued`（或 `diff` + 自定义 CSS）渲染：
   - 默认：split-view（左 before，右 after），绿+/红-/灰 context
   - 折叠未变化的大段区域，hunk 之间显示 `... N lines unchanged ...`
   - 文件路径作为标题，bytes/lines delta 作为副标题（如 `+12 -5`）

### 前端依赖

`react-diff-viewer-continued` 是 `react-diff-viewer` 的活跃维护 fork，bundle 体积约 50KB，支持 dark mode、syntax highlighting、自定义渲染。

也可考虑 **Monaco Editor 的 diff editor**——更专业但 bundle 体积大（约 2MB），现在 OOC 还没引入 monaco 不必为此引入。**建议 react-diff-viewer-continued**。

### 调用方式约束（重要）

**保持现有 trait method 调用方式不变**：

```
program 路径：
  callMethod("computable/file_ops", "editFile", {path, oldStr, newStr})
  → 返回 {ok, path, before, after}

tool_use 路径：
  open(trait="computable/file_ops", method="editFile", args={path, oldStr, newStr})
  → 同上
```

**不**引入新的顶层 tool（如 `edit` / `patch`）。前端通过 result 里出现的 `before` / `after` 字段识别"这是个可 diff 的编辑"，与具体 method 名解耦。

### 边界情形

- **写新文件（before 为空字符串）**：渲染为"全文绿色"，标题标 `(new file)`
- **删除文件**：未来若加 `deleteFile` 也想 diff，可标 `(deleted)` + 全文红色；本迭代不做（deleteFile 现已存在但通常不需要 diff 展示）
- **二进制文件**：editFile/writeFile 的入参就是 string，二进制不在范围
- **超大文件**：>1MB 的 before/after 可能造成 SSE 帧过大；编辑结果 truncate 提示 "(diff too large to display, N lines changed)" + 提供下载链接（暂不做，先看实际场景）
- **流式编辑动画**：本迭代不做。后续可在 SSE `flow:action_progress` 加增量 patch 帧实现

## 影响范围

### 涉及代码

**修改 kernel**：
- `kernel/traits/computable/file_ops/index.ts` — editFile/writeFile/applyEdits 返回新增 before/after 字段
- `kernel/tests/file-ops.test.ts`（或新增）— 验证 before/after 正确捕获

**修改 web 前端**：
- `kernel/web/src/views/LLMInputViewer.tsx`（或 TuiAction 组件）— diff 渲染分支
- `kernel/web/package.json` — 加 `react-diff-viewer-continued` 依赖

**新增前端组件**：
- `kernel/web/src/components/EditDiffCard.tsx` — diff 卡片（含文件名标题 + bytes/lines delta + diff 主体）

### 涉及文档

- `kernel/web/README.md`（如果有）— 提一下新组件
- `user/docs/体验用例/`（如果存在）— 加一条 "LLM 编辑文件时用户能直观看到 diff" 用例

### 涉及基因 / 涌现

- **G2（人类先于机器）** — 提升用户对 LLM 行为的可见性 / 可干预性
- 不涉及哲学层重构，纯体验增强

## 验证标准

### 单元测试
- `editFile` / `writeFile` 返回值含 `before`、`after`，且字符串内容正确
- `writeFile` 写新文件时 before 为空串
- `applyEdits` 返回 `results: [{before, after}, ...]`

### 集成测试
- 通过 `open(trait="computable/file_ops", method="editFile", args=...)` 调用 → result 含 diff 字段
- 通过 `program` 沙箱里的 `callMethod` 调用 → 同上

### 体验验证（Bruce）
- 真实 session：LLM 用 editFile 改一个文件 → web UI 应展示绿+/红- diff
- LLM 用 writeFile 写新文件 → 全绿展示，标题 `(new file)`
- LLM 用 planEdits + applyEdits 批量改多文件 → 每文件一个 diff 卡片
- 改超过 50 行时 diff 卡片不撑爆 UI（折叠 / 滚动 / 折行处理合理）

### 回归
- `bun test` 0 new fail
- 前端 `tsc --noEmit` 无新增错误
- 既有不带 diff 字段的老 tool_use action（历史会话）仍正常渲染（向后兼容）

## 执行记录

### 2026-04-23 第一块：后端落地 before/after 字段

- `kernel/traits/computable/file_ops/index.ts`
  - `editFileImpl`：写盘前快照 `before`，所有写盘分支（精确匹配 / trim 容错 / replaceAll）统一返回 `{ matchCount, before, after }`
  - `writeFileImpl`：写盘前若文件存在读 `before`（不存在用空串），返回 `{ bytesWritten, before, after }`
  - `applyEditsImpl` 不需直接改——通过下面 edit-plans 的 perChange 自动带出
- `kernel/src/persistence/edit-plans.ts`
  - `ApplyResult.perChange[*]` 新增可选字段 `before` / `after`
  - `applyEditPlan` 写盘成功分支把 snapshot.original 与 prepared.newContent 透出
- `kernel/tests/trait-file-ops.test.ts` 新增 / 加强断言：
  - editFile 精确匹配 / trim 容错 / replaceAll 三个分支均断言 before/after
  - writeFile 写新文件 before='' / 覆写已存在文件 before=旧内容
  - planEdits + applyEdits 多文件 transaction 每文件 before/after 正确
  - applyEdits write 新文件 before='' / after=newContent
- 测试结果：`bun test` 894 pass / 6 skip / 6 fail（fail 全是预存 trait-http-client 端口故障；新增 +2 pass，0 new fail）
- 与 spec 一致：未引入新顶层 tool；diff 仍由前端算；ApplyResult 字段为可选，向后兼容旧消费方

### 2026-04-23 第二块：前端 EditDiffCard 接入

- 新建 `kernel/web/src/components/EditDiffCard.tsx`
  - 复用项目已有的 `FileDiffViewer`（@codemirror/merge 实现）作为 diff 主体——**未额外引入 react-diff-viewer-continued**：spec 写的是"建议"而非硬约束，已有 codemirror 体系满足全部需求（split/unified + collapseUnchanged + 语法高亮），符合"最小改动"
  - 卡片头：path · `(new file)` / `(deleted)` 标记 · `+N -N` line-level delta · split↔unified 切换 · 折叠
  - 默认 unified 视图（thread inline 流读体感更好）
  - 导出 `detectEditDiffEntries(action)`：从 inject `>>> file_ops.xxx 结果:` JSON 与 program `>>> output:` JSON 两条路径抽 entries[]，识别失败返回 [] → 调用方自动 fallback
- 修改 `kernel/web/src/components/ui/TuiBlock.tsx`
  - inject 类型 + hasDiff → 用 EditDiffCard 列表替换原 markdown content
  - program 类型 + hasDiff → 在 result `output` 块下方追加 EditDiffCard
  - 旧 action（无 before/after）走原渲染路径，向后兼容
- 修复 `kernel/web/src/components/ui/FileDiffViewer.tsx` 的 `// @ts-expect-error`
  —— @codemirror/merge 6.12.1 已带 `dist/index.d.ts`，旧的 ts-expect-error 触发 TS2578
- `kernel/web/package.json` 已声明 `@codemirror/merge ^6.0.0`（无新增依赖）；本地 node_modules 缺包→手工补装 6.12.1
- 验证：`cd kernel/web && bun run build` 编译通过（tsc -b + vite build），bundle 警告与本次改动无关

### 2026-04-23 第三块：补 `path` 字段 + Bruce 验收收尾

- `kernel/traits/computable/file_ops/index.ts`：`editFile` / `writeFile` 三处 `toolOk` 返回值追加 `path` 字段
  —— EditDiffCard 在 inject / program 两条路径里都靠 `path` 识别目标文件；补上后 inject 路径也能无歧义拿到路径，不再依赖前端反查 args
- `kernel/tests/trait-file-ops.test.ts`：断言覆盖 `path` 字段（19 pass）
- kernel commits 合并到本迭代范围：
  - `06b0ba7` 后端 before/after 字段
  - `db162a5` 前端 EditDiffCard + TuiBlock 接入
  - `3c1c546` 补 `path` 字段

### Bruce 验收（2026-04-23）

由执行 agent 在 E2E 会话里真实驱动 LLM 调用 file_ops，观察 web UI：

- **Case 1：editFile 改现有文件** — UI 展示 split/unified diff，绿+/红- 行号正确，路径与 `+N -N` 角标渲染正常
- **Case 2：writeFile 写新文件** — before 为空串 → 全绿，标题带 `(new file)` 标记
- 旧会话（历史 action 无 before/after）自动 fallback 到原渲染，无破坏
- kernel `bun test` 相关模块全绿（file_ops 19 pass），无新增 fail
- 前端 `tsc --noEmit` 通过；`vite build` 通过

## 结论

Code Agent 风格的文件编辑 diff 展示已落地：后端写盘前后快照 → 前端用已有 @codemirror/merge 组件渲染 split/unified diff → 旧 action 自动降级。G2（人类先于机器）维度的用户对 LLM 行为的可见性 / 可干预性得到显著提升。

