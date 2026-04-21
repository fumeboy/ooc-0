# 认知栈 API 重构（段落标记式）

<!--
@ref docs/meta.md — extends — G13 认知栈
@referenced-by kernel/src/types/process.ts — implemented-by — NodeType、ProcessNode.type、ProcessNode.plan、HookTime.reflect
@referenced-by kernel/src/flow/parser.ts — implemented-by — 新增段落标记解析逻辑
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 移除旧 API 注册、新增 stackFrameOperations 执行逻辑、inline_before/inline_after 自动创建
@referenced-by kernel/src/process/render.ts — implemented-by — 内联节点格式渲染、plan 字段展示
@referenced-by kernel/traits/computable/readme.md — updated-by — 移除旧 API、新增段落标记格式
@referenced-by kernel/traits/plannable/readme.md — updated-by — 移除旧 API、新增段落标记格式
@referenced-by kernel/traits/cognitive-style/readme.md — updated-by — 移除旧 API、更新 hook 内容
-->

## 变更概述

**日期**: 2026-03-31

**变更类型**: API 重构 + 架构优化

**影响范围**:
- 移除 14 个旧的函数调用式 API
- 新增 5 个段落标记式 API
- `before`/`after` hooks 触发时机变更
- Hook 执行方式变更（从 Context 注入改为内联节点）

---

## 背景与动机

### 问题 1: API 调用方式不一致

原设计中存在两种不同的调用方式：

| 方式 | 示例 | 适用场景 |
|------|------|----------|
| 函数调用式 | `createPlan("任务", "描述")` | 认知栈操作 |
| 段落标记式 | `[talk/user] 消息 [/talk]` | 消息发送 |
| 段落标记式 | `[action/readFile] {"path": "x"} [/action]` | 工具调用 |

这种不一致增加了 LLM 的学习成本，需要记住两套不同的语法。

### 问题 2: API 过于复杂

旧的认知栈 API 包括：
- `createPlan`、`create_plan_node`、`finish_plan_node`
- `add_stack_frame`、`stack_return`
- `addStep`、`completeStep`、`go`、`compress`
- `isPlanComplete`、`removeStep`、`editStep`
- `stack_catch`、`stack_throw`、`summary`、`create_hook`
- 多线程 API、TodoList API

超过 20 个相关函数，难以记忆和正确使用。

### 问题 3: Hook 触发时机不明确

原 `before` hooks 在每轮思考开始时注入 Context：
- 语义模糊："进入新节点" vs "每轮思考"
- 追踪困难：Hook 执行结果不可见
- 结构化遗忘：Hook 执行的 actions 可能被遗忘

### 解决方案

1. **统一调用方式**：所有认知栈操作改为段落标记式，与 `[talk]`、`[action]` 保持一致
2. **简化 API**：从 14 个函数减少到 5 个段落标记
3. **Hook 语义明确化**：
   - `before` hooks 只在 `cognize_stack_frame_push` 时触发
   - `after` hooks 只在 `cognize_stack_frame_pop` 时触发
4. **Hook 可追踪**：通过 `inline_before`/`inline_after` 内联节点记录执行过程

---

## 具体变更

### 1. 移除的旧 API

| API 名称 | 替代方案 |
|----------|----------|
| `createPlan(title, description?)` | `[cognize_stack_frame_push]` |
| `create_plan_node(parentId, title, description?, traits?, outputs?, outputDescription?)` | `[cognize_stack_frame_push]` |
| `finish_plan_node(summary, artifacts?)` | `[cognize_stack_frame_pop]` |
| `add_stack_frame(parentId, title, description?, traits?, outputs?, outputDescription?)` | `[cognize_stack_frame_push]` |
| `stack_return(summary?, artifacts?)` | `[cognize_stack_frame_pop]` |
| `addStep(parentId, title, deps?, description?)` | 无替代（已废弃） |
| `completeStep(nodeId, summary)` | 无替代（已废弃） |
| `go(nodeId)` | 无替代 |
| `compress(actionIds)` | 无替代 |
| `isPlanComplete()` | 无替代 |
| `removeStep(nodeId)` | 无替代 |
| `editStep(nodeId, title)` | 无替代 |
| `stack_catch(handler)` | `create_hook("when_error", "inject_message", handler)` |

### 2. 保留的 API

以下 API 仍可在 `[program]` 段落中使用：

| API | 说明 |
|-----|------|
| `moveFocus(nodeId)` | 手动移动注意力 |
| `stack_throw(error)` | 抛出异常，触发 `when_error` hook |
| `summary(text)` | 设置当前节点摘要 |
| `create_hook(when, type, handler)` | 注册栈帧级 hook |
| 多线程 API | `create_thread`、`go_thread`、`send_signal` 等 |
| TodoList API | `addTodo`、`removeTodo` 等 |

### 3. 新增的段落标记 API

#### `[cognize_stack_frame_push]` - 创建普通子栈帧

**支持的属性段落**：

| 属性段落 | 类型 | 必填 | 说明 |
|----------|------|------|------|
| `[cognize_stack_frame_push.title]` | string | 是 | 子栈帧标题 |
| `[cognize_stack_frame_push.description]` | string | 否 | 子栈帧详细描述 |
| `[cognize_stack_frame_push.traits]` | string | 否 | trait 名称列表，逗号分隔 |
| `[cognize_stack_frame_push.outputs]` | string | 否 | 输出 key 列表，逗号分隔（契约式编程） |
| `[cognize_stack_frame_push.outputDescription]` | string | 否 | 输出描述 |

**使用示例**：
```
[cognize_stack_frame_push.title]
获取文档内容
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.description]
从飞书知识库获取指定文档的完整内容
[/cognize_stack_frame_push.description]

[cognize_stack_frame_push.traits]
lark-wiki
[/cognize_stack_frame_push.traits]

[cognize_stack_frame_push.outputs]
docContent, docTitle
[/cognize_stack_frame_push.outputs]

[/cognize_stack_frame_push]
```

#### `[cognize_stack_frame_pop]` - 完成并退出当前子栈帧

**支持的属性段落**：

| 属性段落 | 类型 | 必填 | 说明 |
|----------|------|------|------|
| `[cognize_stack_frame_pop.summary]` | string | 否 | 完成摘要 |
| `[cognize_stack_frame_pop.artifacts]` | string | 否 | JSON 格式的输出数据（合并到父节点 locals） |

**使用示例**：
```
[cognize_stack_frame_pop.summary]
已成功获取文档内容，共 15000 字
[/cognize_stack_frame_pop.summary]

[cognize_stack_frame_pop.artifacts]
{
  "docContent": "文档完整内容...",
  "docTitle": "飞书产品设计文档"
}
[/cognize_stack_frame_pop.artifacts]

[/cognize_stack_frame_pop]
```

#### `[reflect_stack_frame_push]` - 进入 reflect 内联子栈帧

用于主动调整 plan、traits 或审视上文。属性段落与 `[cognize_stack_frame_push]` 相同。

在 reflect 环节可以使用 `create_hook` 注册 `when_error` hook：
```
[program]
create_hook("when_error", "inject_message", "分析错误原因并尝试修复")
[/program]
```

#### `[reflect_stack_frame_pop]` - 退出 reflect 内联子栈帧

属性段落与 `[cognize_stack_frame_pop]` 相同。

#### `[set_plan]` - 更新当前节点的 plan 文本

**使用示例**：
```
[set_plan]
重新规划当前任务：
1. 先激活 lark-wiki trait 获取访问能力
2. 调用 wiki API 获取文档内容
3. 解析文档结构并提取关键信息
[/set_plan]
```

### 4. 类型扩展（`kernel/src/types/process.ts`）

#### 新增 `NodeType` 类型

```typescript
/** 节点类型（区分普通子栈帧和内联子节点） */
export type NodeType =
  | "frame"           // 普通子栈帧（默认）
  | "inline_before"   // before 内联子节点（hook 自动触发）
  | "inline_after"    // after 内联子节点（hook 自动触发）
  | "inline_reflect"; // reflect 内联子节点（主动触发）
```

#### 扩展 `ProcessNode` 接口

```typescript
export interface ProcessNode {
  // ... 现有字段 ...

  /** 节点类型（区分普通子栈帧和内联子节点） */
  type?: NodeType;

  /** plan 文本（当前节点的计划/目标，set_plan 写入） */
  plan?: string;
}
```

#### 扩展 `HookTime` 类型

```typescript
/** Hook 触发时机 */
export type HookTime =
  | "when_stack_push"
  | "when_stack_pop"
  | "when_yield"
  | "when_error"
  | "reflect";  // 新增：reflect 内联子节点 hook
```

### 5. Hook 触发机制重构

#### 触发时机变更

| Hook 事件 | 原触发时机 | 新触发时机 |
|-----------|------------|------------|
| `before` | 每轮思考开始时（Context 注入） | `cognize_stack_frame_push` 时（内联节点） |
| `after` | 从未触发 | `cognize_stack_frame_pop` 后（内联节点） |
| `when_stack_push` | 无变化 | 无变化 |
| `when_stack_pop` | 无变化 | 无变化 |
| `when_yield` | 无变化 | 无变化 |
| `when_error` | 无变化 | 无变化 |

#### 内联节点工作流程

**`inline_before` 流程**：
```
第 N 轮:
  - LLM 执行 [cognize_stack_frame_push]
  - 检查 before hooks
  - 如果有，创建 inline_before 内联节点
  - 记录 hook inject 内容为 action
  - focus 移动到 inline_before
  - 原始 addNode 延迟执行

第 N+1 轮:
  - Context 包含 inline_before 的 inject action
  - LLM 处理 hook 内容
  - LLM 执行 [cognize_stack_frame_pop]
  - 完成 inline_before 节点
  - 执行延迟的 addNode
  - 创建真正的子节点
  - focus 移动到子节点
```

**`inline_after` 流程**：
```
第 N 轮:
  - LLM 执行 [cognize_stack_frame_pop]
  - 完成当前节点
  - advanceFocus 到父节点
  - 检查 after hooks
  - 如果有，创建 inline_after 内联节点
  - 记录 hook inject 内容为 action
  - focus 移动到 inline_after

第 N+1 轮:
  - Context 包含 inline_after 的 inject action
  - LLM 处理 hook 内容
  - LLM 执行 [cognize_stack_frame_pop]
  - 完成 inline_after 节点
  - focus 回到父节点
```

### 6. 渲染格式变更

#### 内联节点渲染格式

```
[inline/before_start]

[10:30:15] [inject]
>>> [系统提示 — before | 认知栈评估]
你刚进入一个新的任务节点...

[inline/before_end]
  summary: 已评估任务复杂度
```

**支持的内联节点类型**：
- `inline_before` → `[inline/before_start]` / `[inline/before_end]`
- `inline_after` → `[inline/after_start]` / `[inline/after_end]`
- `inline_reflect` → `[inline/reflect_start]` / `[inline/reflect_end]`

#### plan 字段展示

如果当前节点有 `plan` 字段，在【认知栈】区域展示：

```
══════════════════════════════════════════════════════════
【认知栈】当前帧: 获取文档内容 [* doing]
══════════════════════════════════════════════════════════

【当前计划】
1. 先激活 lark-wiki trait 获取访问能力
2. 调用 wiki API 获取文档内容
3. 解析文档结构并提取关键信息

【聚焦路径】（按时间顺序排列）
...
```

---

## 类型扩展详解

### NodeType 语义

| 类型值 | 触发方式 | 生命周期 | 用途 |
|--------|----------|----------|------|
| `"frame"` | 显式 `[cognize_stack_frame_push]` | 独立生命周期，有独立 focus | 普通子任务、步骤 |
| `"inline_before"` | 自动（有 before hooks 时） | 依附于父节点，完成后继续原始操作 | hook 执行追踪 |
| `"inline_after"` | 自动（有 after hooks 时） | 依附于父节点，完成后回到父节点 | hook 执行追踪 |
| `"inline_reflect"` | 显式 `[reflect_stack_frame_push]` | 依附于父节点 | 主动反思、调整 |

### 内联节点与普通节点的区别

| 特性 | 内联节点 | 普通节点 |
|------|----------|----------|
| 触发方式 | 自动或显式 | 显式 |
| 加入 todo 队列 | 否 | 是 |
| 默认 hooks | 无（绕过 addNode） | 有（when_stack_pop、when_yield 等） |
| 渲染格式 | `[inline/{type}_start]` | `[push]` |

---

## 文档更新

### 1. `kernel/traits/computable/readme.md`

- 移除所有旧 API 的描述和示例
- 新增 5 个段落标记式 API 的完整说明
- 新增属性段落表格
- 新增完整使用示例

### 2. `kernel/traits/plannable/readme.md`

- 移除旧的 `createPlan`、`create_plan_node`、`finish_plan_node`、`add_stack_frame`、`stack_return` 等示例
- 新增段落标记式 API 示例
- 保留契约式编程概念、YAGNI 原则、Red Flags 等内容

### 3. `kernel/traits/cognitive-style/readme.md`

- 更新 `hooks.before.inject` 内容：
  - 旧：`请先用 createPlan 拆解为子节点`
  - 新：`请先用 [cognize_stack_frame_push] 拆解为子节点`

---

## 设计哲学

### 为什么选择段落标记式？

1. **一致性**：与 `[talk]`、`[action]` 保持相同的调用方式，降低 LLM 学习成本

2. **多属性支持**：通过属性段落（如 `[cognize_stack_frame_push.title]`）可以清晰地传递多个参数，而不需要记住函数签名的顺序

3. **结构清晰**：开始/结束标记形成明确的边界，LLM 更容易理解"这是一个完整的操作"

### 为什么 Hook 要改为内联节点？

#### 原方式的问题

```
旧流程:
  1. 构建 Context 时注入 hook 内容
  2. LLM 看到注入的提示
  3. LLM 执行操作
  4. Hook 执行的 actions 可能被结构化遗忘

问题:
- Hook 何时执行不明确（每轮思考 vs 进入节点）
- Hook 执行结果不可见、不可追踪
- 注入的文本与 LLM 的 own thought 混在一起
```

#### 新方式的优势

```
新流程:
  1. 创建 inline_before 内联节点
  2. Hook 内容记录为 inject action
  3. focus 移动到内联节点
  4. LLM 在独立的节点中处理 Hook
  5. 完成后执行延迟的原始操作

优势:
- 执行时机明确（stack push/pop 时）
- 执行过程可见（独立的内联节点）
- Hook 结果被正确记忆（不会被结构化遗忘）
- 可在 renderProcess 中看到 [inline/before_start] 标记
```

### 为什么移除这些 API？

| 被移除的 API | 原因 |
|-------------|------|
| `addStep` / `completeStep` | 已废弃，使用 `create_plan_node` / `finish_plan_node` |
| `go` | 过于复杂，容易误用，且触发 `when_yield` hooks 的语义不明确 |
| `compress` | 很少使用，且与结构化遗忘机制重叠 |
| `isPlanComplete` | 可通过 `[finish]` 指令替代 |
| `removeStep` / `editStep` | 很少使用，且可能破坏已有的执行历史 |
| `stack_catch` | 功能完全包含在 `create_hook` 中 |

**保留的 API 都是语义明确且必要的**：
- `moveFocus`：手动调整 focus
- `stack_throw`：错误处理
- `create_hook`：注册 hooks（替代 `stack_catch`）
- 多线程 API：并发控制
- TodoList API：手动管理待办

---

## 语义变更说明

### 重要：`before` hooks 触发时机变更

**变更前语义**：
- 在每轮思考开始时，如果有 `before` hooks，注入到 Context
- 这意味着即使不执行 `cognize_stack_frame_push`，`before` hooks 也可能触发

**变更后语义**：
- 只有在执行 `[cognize_stack_frame_push]` 时，如果有 `before` hooks，才创建 `inline_before` 节点
- 这符合 G13 认知栈的设计意图：`before` 是「进入新节点时的提示」

**影响评估**：
- 如果 LLM 不执行 `[cognize_stack_frame_push]`，`before` hooks 就不会被触发
- 这可能改变某些 trait 的行为模式

### 为什么这是正确的变更？

1. **符合设计文档**：G13 明确说「进入新节点时的提示」，而不是「每轮思考时的提示」

2. **可追踪性**：内联节点让 Hook 执行过程可见

3. **一致性**：与 `when_stack_push` hooks 保持相同的触发时机

### `after` hooks 现在生效

**注意**：`after` hooks 在之前的实现中从未被调用过（类型定义了但没有调用点）。本次重构后，`after` hooks 在节点完成后、`inline_after` 内联节点中触发。

这是一个**功能启用**，而非变更。

---

## 测试验证

### 运行测试

```bash
bun test kernel/tests/parser.test.ts
bun test kernel/tests/cognitive-stack.test.ts
bun test kernel/tests/process.test.ts
```

### 测试结果

```
✓ kernel/tests/parser.test.ts: 47 pass, 0 fail
✓ kernel/tests/cognitive-stack.test.ts: 91 pass, 0 fail
✓ kernel/tests/process.test.ts: 70 pass, 0 fail
```

### 测试覆盖的变更点

| 测试文件 | 覆盖的变更 |
|----------|------------|
| `parser.test.ts` | 段落标记解析、属性段落提取、artifacts JSON 解析 |
| `cognitive-stack.test.ts` | 栈帧操作执行、Hook 触发、内联节点创建 |
| `process.test.ts` | 类型定义、渲染格式 |

---

## 相关文档

- `docs/meta.md` — G13 认知栈
- `docs/superpowers/specs/2026-03-31-cognitive-stack-api-redesign.md` — 设计规格文档
- `docs/superpowers/plans/2026-03-31-cognitive-stack-api-redesign.md` — 实施计划
- `kernel/traits/computable/readme.md` — 最新使用说明
