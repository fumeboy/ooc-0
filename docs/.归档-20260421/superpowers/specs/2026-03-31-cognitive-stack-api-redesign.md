---
name: 认知栈 API 重新设计
description: 删除旧的函数调用式 API，改用段落标记式 API，支持多段落属性配置
type: design
---

# 认知栈 API 重新设计文档

## 背景

根据 `/Users/bytedance/x/ooc/简化认知栈设计.txt`，认知栈 API 需要进行以下重构：

### 当前问题

1. **API 过于复杂**：当前有 `createPlan`、`create_plan_node`、`add_stack_frame`、`finish_plan_node`、`stack_return` 等多个函数，不易理解
2. **调用方式不一致**：函数调用方式与 `[talk]`、`[action]` 等段落标记方式不一致
3. **LLM 学习成本高**：需要记住多个函数名和参数顺序

### 新设计目标

1. **统一调用方式**：使用段落标记格式，与 `[talk]`、`[action]` 保持一致
2. **支持多段落属性**：允许通过多个段落配置不同属性
3. **删除旧 API**：移除 `[program]` 中的函数调用方式，不需要考虑向后兼容

---

## 一、删除范围

### 代码层面删除

从 `kernel/src/flow/thinkloop.ts` 中移除以下 API 的注册：

| 旧 API | 替代方案 |
|--------|----------|
| `createPlan(title, description?)` | `[set_plan]` 段落标记 |
| `create_plan_node(parentId, title, description?, traits?, outputs?, outputDescription?)` | `[cognize_stack_frame_push]` 段落标记 |
| `finish_plan_node(summary, artifacts?)` | `[cognize_stack_frame_pop]` 段落标记 |
| `add_stack_frame(parentId, title, description?, traits?, outputs?, outputDescription?)` | `[cognize_stack_frame_push]` 段落标记 |
| `stack_return(summary?, artifacts?)` | `[cognize_stack_frame_pop]` 段落标记 |
| `addStep(parentId, title, deps?, description?)` | 无替代（已废弃） |
| `completeStep(nodeId, summary)` | 无替代（已废弃） |
| `go(nodeId)` | 无替代 |
| `compress(actionIds)` | 无替代 |

### 文档层面更新

从以下 trait 文档中移除旧 API 的描述和示例：

- `kernel/traits/computable/readme.md`
- `kernel/traits/cognitive-style/readme.md`
- `kernel/traits/plannable/readme.md`

---

## 二、新增段落标记 API

### 2.1 普通子栈帧操作

#### `[cognize_stack_frame_push]` - 创建普通子栈帧

用于压入一个新的普通子栈帧（非内联）。

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

[cognize_stack_frame_push.outputDescription]
文档内容（字符串）和元数据（对象）
[/cognize_stack_frame_push.outputDescription]

[/cognize_stack_frame_push]
```

#### `[cognize_stack_frame_pop]` - 完成并退出当前子栈帧

用于弹出当前子栈帧，执行 `when_stack_pop` hooks，focus 回到父节点。

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
  "docTitle": "飞书产品设计文档",
  "docMeta": {
    "author": "产品团队",
    "updatedAt": "2026-03-31"
  }
}
[/cognize_stack_frame_pop.artifacts]

[/cognize_stack_frame_pop]
```

---

### 2.2 Reflect 内联子栈帧操作

#### `[reflect_stack_frame_push]` - 主动进入 reflect 内联子栈帧

用于主动进入 reflect 类型的内联子栈帧，用于：
- 调整 plan
- 调整 traits
- 审视上文

**支持的属性段落**：与 `[cognize_stack_frame_push]` 相同

**使用示例**：

```
[reflect_stack_frame_push.title]
审视与调整
[/reflect_stack_frame_push.title]

[reflect_stack_frame_push.description]
重新审视当前计划，判断是否需要调整
[/reflect_stack_frame_push.description]

[/reflect_stack_frame_push]
```

#### `[reflect_stack_frame_pop]` - 退出 reflect 内联子栈帧

**支持的属性段落**：与 `[cognize_stack_frame_pop]` 相同

---

### 2.3 Plan 文本操作

#### `[set_plan]` - 更新当前节点的 plan 文本

用于更新当前栈帧的 plan 字段。plan 是当前节点的计划/目标文本，会在 renderProcess 中展示。

**使用示例**：

```
[set_plan]
重新规划当前任务：
1. 先激活 lark-wiki trait 获取访问能力
2. 调用 wiki API 获取文档内容
3. 解析文档结构并提取关键信息
4. 整理成结构化的分析报告
5. 通过 talk 回复用户
[/set_plan]
```

---

## 三、类型扩展

### 3.1 ProcessNode 新增字段

```typescript
// src/types/process.ts

/** 节点类型 */
export type NodeType =
  | "frame"           // 普通子栈帧（默认）
  | "inline_before"   // before 内联子节点（hook 自动触发）
  | "inline_after"    // after 内联子节点（hook 自动触发）
  | "inline_reflect"; // reflect 内联子节点（主动触发）

export interface ProcessNode {
  // ... 现有字段 ...

  /** 节点类型（区分普通子栈帧和内联子节点） */
  type?: NodeType;

  /** plan 文本（当前节点的计划/目标，set_plan 写入） */
  plan?: string;
}
```

### 3.2 HookTime 新增

```typescript
// src/types/process.ts

/** Hook 触发时机 */
export type HookTime =
  | "when_stack_push"
  | "when_stack_pop"
  | "when_yield"
  | "when_error"
  | "reflect";  // 新增
```

---

## 四、解析器扩展

### 4.1 新增正则表达式

```typescript
// 开始标记
const STACK_FRAME_PUSH_RE = /^\s*\[cognize_stack_frame_push\]\s*$/;
const STACK_FRAME_POP_RE = /^\s*\[cognize_stack_frame_pop\]\s*$/;
const REFLECT_PUSH_RE = /^\s*\[reflect_stack_frame_push\]\s*$/;
const REFLECT_POP_RE = /^\s*\[reflect_stack_frame_pop\]\s*$/;
const SET_PLAN_RE = /^\s*\[set_plan\]\s*$/;

// 结束标记
const STACK_FRAME_PUSH_CLOSE_RE = /^\s*\[\/cognize_stack_frame_push\]\s*$/;
const STACK_FRAME_POP_CLOSE_RE = /^\s*\[\/cognize_stack_frame_pop\]\s*$/;
const REFLECT_PUSH_CLOSE_RE = /^\s*\[\/reflect_stack_frame_push\]\s*$/;
const REFLECT_POP_CLOSE_RE = /^\s*\[\/reflect_stack_frame_pop\]\s*$/;
const SET_PLAN_CLOSE_RE = /^\s*\[\/set_plan\]\s*$/;

// 属性段落标记
const STACK_FRAME_PUSH_ATTR_RE = /^\s*\[cognize_stack_frame_push\.(title|description|traits|outputs|outputDescription)\]\s*$/;
const STACK_FRAME_POP_ATTR_RE = /^\s*\[cognize_stack_frame_pop\.(summary|artifacts)\]\s*$/;
const REFLECT_PUSH_ATTR_RE = /^\s*\[reflect_stack_frame_push\.(title|description|traits|outputs|outputDescription)\]\s*$/;
const REFLECT_POP_ATTR_RE = /^\s*\[reflect_stack_frame_pop\.(summary|artifacts)\]\s*$/;
```

### 4.2 解析结果类型

```typescript
export interface ExtractedStackFramePush {
  type: "cognize_stack_frame_push" | "reflect_stack_frame_push";
  title: string;
  description?: string;
  traits?: string[];
  outputs?: string[];
  outputDescription?: string;
}

export interface ExtractedStackFramePop {
  type: "cognize_stack_frame_pop" | "reflect_stack_frame_pop";
  summary?: string;
  artifacts?: Record<string, unknown>;
}

export interface ExtractedSetPlan {
  type: "set_plan";
  content: string;
}

// 扩展 ParsedOutput
export interface ParsedOutput {
  // ... 现有字段 ...
  stackFrameOperations: Array<
    ExtractedStackFramePush |
    ExtractedStackFramePop |
    ExtractedSetPlan
  >;
}
```

### 4.3 解析流程

```
1. 检测开始标记（如 [cognize_stack_frame_push]）
2. 进入属性收集模式
3. 收集属性段落（如 [cognize_stack_frame_push.title]）
   - 持续收集内容直到遇到结束标记或下一个属性段落
4. 检测结束标记（如 [/cognize_stack_frame_push]）
5. 执行对应操作：
   - push: addNode + moveFocus
   - pop: completeProcessNode + advanceFocus
   - set_plan: 更新当前节点 plan 字段
```

---

## 五、renderProcess 格式调整

### 5.1 内联子节点渲染格式

内联子节点（`inline_before`、`inline_after`、`inline_reflect`）使用特殊格式：

```
[inline/{type}_start]

[{timestamp}] [thought]
内联子节点中的思考内容...

[{timestamp}] [program]
activateTrait("lark-wiki")

>>> 执行结果: ✓ 成功

[inline/{type}_end]
  summary: 已处理 {type} hook
```

**其中 `{type}` 可以是**：
- `before` - before 内联子节点
- `after` - after 内联子节点
- `reflect` - reflect 内联子节点

### 5.2 plan 字段展示

如果当前节点有 `plan` 字段，在 `【认知栈】` 区域展示：

```
══════════════════════════════════════════════════════════
【认知栈】当前帧: 获取文档内容 [* doing]
══════════════════════════════════════════════════════════

【当前计划】
1. 先激活 lark-wiki trait 获取访问能力
2. 调用 wiki API 获取文档内容
3. 解析文档结构并提取关键信息
...

【聚焦路径】（按时间顺序排列）
...
```

---

## 六、执行流程

### 6.1 执行顺序

```
parseLLMOutput()
  │
  ├── 检测 [talk/xxx] / [/talk] → 提取对话
  │
  ├── 检测 [action/xxx] / [/action] → 提取工具调用
  │
  └── 检测认知栈操作标记 → 提取栈帧操作
        │
        ├── [cognize_stack_frame_push] / [/cognize_stack_frame_push]
        │   └── 执行: addNode(type="frame") + moveFocus
        │
        ├── [cognize_stack_frame_pop] / [/cognize_stack_frame_pop]
        │   └── 执行: completeProcessNode + advanceFocus
        │
        ├── [reflect_stack_frame_push] / [/reflect_stack_frame_push]
        │   └── 执行: addNode(type="inline_reflect") + moveFocus
        │
        ├── [reflect_stack_frame_pop] / [/reflect_stack_frame_pop]
        │   └── 执行: completeProcessNode + advanceFocus
        │
        └── [set_plan] / [/set_plan]
            └── 执行: 更新当前节点 plan 字段
```

### 6.2 属性解析规则

1. **title**：必须提供，否则解析失败
2. **traits**：逗号分隔，自动 trim，空字符串视为无
3. **outputs**：逗号分隔，自动 trim，空字符串视为无
4. **artifacts**：必须是有效的 JSON，否则解析失败
5. **description**、**outputDescription**、**summary**：可选，空字符串视为未提供

---

## 七、文件修改清单

| 文件路径 | 修改类型 | 修改内容 |
|----------|----------|----------|
| `src/types/process.ts` | 扩展 | 新增 `NodeType`、`ProcessNode.type`、`ProcessNode.plan` |
| `src/flow/parser.ts` | 修改 | 新增段落标记检测、属性收集、解析结果类型 |
| `src/flow/thinkloop.ts` | 修改 | 移除旧 API 注册、新增新标记执行逻辑 |
| `src/process/render.ts` | 修改 | 调整内联子节点渲染格式、新增 plan 字段展示 |
| `traits/computable/readme.md` | 更新 | 移除旧 API 描述、新增段落标记 API |
| `traits/cognitive-style/readme.md` | 更新 | 移除旧 API 描述、更新示例 |
| `traits/plannable/readme.md` | 更新 | 移除旧 API 描述、更新为新标记格式 |

---

## 八、验证要点

### 8.1 单元测试

- 新增认知栈 API 解析测试
- 验证属性段落正确提取
- 验证 artifacts JSON 解析
- 验证执行逻辑

### 8.2 端到端测试

- 创建真实 Session，使用新标记格式
- 验证 `[cognize_stack_frame_push]` / `[cognize_stack_frame_pop]` 完整流程
- 验证 `[set_plan]` 正确更新 plan 字段
- 验证 renderProcess 显示新格式

### 8.3 回归测试

- 所有现有测试必须通过
- `[talk]`、`[action]` 等其他标记格式不受影响

---

## 九、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 学习新格式成本 | 中 | 文档中提供清晰示例，简化属性数量 |
| 解析逻辑复杂 | 中 | 模块化设计，充分单元测试 |
| 与 `[talk]`/`[action]` 格式一致性 | 低 | 遵循相同的开始/结束标记模式 |
