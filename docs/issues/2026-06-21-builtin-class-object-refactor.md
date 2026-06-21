---
title: builtin class/object 源代码泛化调整（容器 issue）
status: draft
date: 2026-06-21
---

# builtin class/object 源代码泛化调整

## 背景 / 动机

对 `packages/@ooc/builtins/` 下的 builtin class/object 做一轮**泛化**调整——逐个 builtin 找出需要抽象/统一/收敛的点，逐条 review、确认、实现。这是一个**渐进式过程**：主题在迭代中逐步填实，本 issue 作为容器收纳每一条调整及其裁决。

> slug 暂用占位 `builtin-class-object-refactor`；待主题清晰后可 rename。

## 现状

builtin 设计层骨架见 `knowledge/index.md` 的 `## builtins`；完整清单/命名空间见 supervisor `knowledge/builtins.md`；每个 builtin 家族的 class 维度权威 doc 在 `children/object/knowledge/builtins/<id>.md`。当前 builtins 目录：

```
agent / filesystem / interpreter / terminal / knowledge_base /
feishu_app / runtime / supervisor / user / example / _shared
```

分组（按 index.md `## builtins`）：agent class 家族 + tool-object（单例工具）+ 实例 object（supervisor/user）+ 样板（example）。

## 改动提案

> 逐条累积。每识别一个待调整的 builtin class/object，在此追加一个子节：
>
> ### [N] <builtin id>：<一句话调整>
> - 现状
> - 提案
> - 受影响设计元素（追加到下方总清单）
> - 裁决

### [1] terminal_process / interpreter_process：拆解 `_shared` 进程专属代码进各 class 内部

- **现状**：两进程窗 class（`terminal_process` bash / `interpreter_process` ts/js）的 history 记录、readable 投影、visible 详情/diff 经 4 个文件共享在 `@ooc/builtins/_shared/`：`executable/process-readable.ts`（ProcessWin / renderProcessHistory / `makeSetHistoryWindowMethod` 工厂）、`executable/process-record.ts`（ProcessExecRecord + 输出格式化）、`visible/process-detail.tsx`（ProcessWindowDetail）、`visible/process-diff.tsx`（ProcessWindowDiff）。core 的 `_shared/types/context-window.ts` 还从中 re-export `ProcessExecRecord`（已无人消费的死 re-export）。
- **提案**：把这 4 个进程专属文件**拆解进 terminal_process / interpreter_process 各自内部**，允许两 class 重复实现——目的：每个 builtin class 的代码自我闭环、简洁清晰易读。**仅拆进程专属 4 文件**；通用 util（`_shared/executable/utils.ts` 被 agent/plan + filesystem/file 用、`_shared/visible/utils.ts` 被 web 包用）跨多 builtin，保留在 `_shared`。
- **受影响设计元素**：`## builtins`（builtin 形态：从「进程窗共享抽象」改为「各 class 自我闭环、容忍重复」）、`## filesystem / terminal / interpreter`（terminal/interpreter 家族实施细节）。**不触** Data shape / window / window_methods / readable 输出等外部契约——纯内部代码组织。
- **裁决**：✅ 已实现（详见下方裁决段）。拆解后各 class 按自身用量裁剪（terminal 只留 `formatShellResult`+`language:"shell"`；interpreter 只留 `formatInterpreterResult`/`InterpreterExecutionResult`+`language:"ts"|"js"`），自我闭环且更精简。退役符号：`makeSetHistoryWindowMethod`（工厂塌为各 class 的 concrete `setHistoryWindowMethod`）、`ProcessWindowDetail`/`ProcessWindowDiff`、`_shared` 的 `ProcessExecRecord`/`InterpreterExecutionResult`、4 个 `_shared/process-*` 文件；core 死 re-export 删除。

## 受影响设计元素

对照 `knowledge/index.md` `##` 清单。容器级始终触及：

- `## builtins` —— 任何 builtin 形态调整都波及
- `## OOC Class/Object Model` —— class/object 模型若被触及

每条具体调整再追加其专属元素（如 `## agent` / `## thread` / `## knowledge_base / knowledge` / `## filesystem / terminal / interpreter` / `## runtime` / `## user` / `## method_exec_form` / `## pr / reflect_request`）。

## 风险与权衡

- 泛化易过度抽象（新增名词、克制熵增）——每条调整须能说清「退潮删了什么」，不只「涨潮加了什么」。
- builtin 形态调整可能波及消费方 import / class 继承链 / 命名空间约定，须随源码改动同步审计。

## 待裁决点

- **[1] 是否把「builtin class 自我闭环 > 共享抽象、容忍重复」升为设计权威**：本条把进程窗的共享抽象拆散、接受两 class 重复实现，背后是一条 builtin 形态原则。是否要在 `index.md ## builtins` / supervisor 哲学里明文 codify？暂缓——待泛化过程多积累几条、模式稳定后再统一沉淀，避免过早立法。

## review 记录

本 issue 是用户主导的渐进式重构（用户逐条找出待调整 builtin → Supervisor 审查 + 用户确认 → 实现），review 闸门由「用户 in-loop 确认」承担，不另派 fan-out（纯内部代码组织、零外部契约变更）。
- **[1]**：用户确认拆解边界＝仅 4 个进程专属文件、保留 2 个通用 util。

## 裁决

源代码变更隔离开发分支：`feat/builtin-class-object-refactor`（worktree `.worktree/builtin-class-object-refactor`，基于 `main`）。

### [1] terminal_process / interpreter_process `_shared` 拆解 —— 已实现（worktree，待合入 main）

**源码（worktree）**：
- 删 `_shared/executable/process-readable.ts`、`_shared/executable/process-record.ts`、`_shared/visible/process-detail.tsx`、`_shared/visible/process-diff.tsx`（`_shared` 仅留通用 `executable/utils.ts` + `visible/utils.ts`）。
- terminal_process 新增 `readable/history.ts`（ProcessWin/renderProcessHistory/concrete setHistoryWindowMethod）+ `executable/exec-record.ts`（formatShellResult/isOkResult/generateExecId）；`types.ts` 内联 `ProcessExecRecord`（language:"shell"）；`visible/index.tsx`+`visible/diff.tsx` 内联组件；runtime/shell/readable import 重定向。
- interpreter_process 对称（`readable/history.ts`、`executable/exec-record.ts` 含 InterpreterExecutionResult/formatInterpreterResult、`types.ts` 内联 ProcessExecRecord language:"ts"|"js"、visible 内联、executor/runtime/readable 重定向）。
- core：`_shared/types/context-window.ts` 删死 re-export；`core/executable/__tests__/process-history-viewport.test.ts` import 重定向到 `terminal_process/readable/history.js` + `terminal_process/types.js`，工厂调用改 concrete。

**一致性回流（成对）**：对象树 `children/object/knowledge/builtins/terminal.md`、`interpreter.md` 去 `_shared/process-*` / `makeSetHistoryWindowMethod` 引用，改述为各 class 自有（`readable/history.ts` / `executable/exec-record.ts` / `types.ts` / `visible/*`）。

**质量门（worktree + 主工作区对象树）**：tsc 干净 · check:deprecated-symbols / silent-swallow / doc-drift / anchor-drift 全 OK · core 全量 750 pass 0 fail · terminal/interpreter/process-viewport 27 pass。
