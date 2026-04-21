# 认知栈思维模式 — cognitive-style trait 拆分设计

<!-- @ref docs/哲学文档/gene.md#G13 — 认知栈设计 -->
<!-- @ref kernel/traits/plannable/readme.md — 被拆分的原 trait -->
<!-- @ref kernel/src/process/cognitive-stack.ts — 作用域链 + frame hooks -->
<!-- @ref kernel/src/flow/thinkloop.ts — ThinkLoop 引擎 -->

## 问题

OOC 对象在处理复杂需求时，不会主动将任务拆解为 process tree 的多个节点。即使认知栈（G13）提供了完整的作用域隔离、结构化遗忘、per-frame trait 激活能力，对象仍然倾向于在单一节点内"一口气做完"所有事情。

子对象尤其严重：收到 `talk` 消息后，系统通过 `interruptForMessage` 创建中断节点，对象的 focus 被推到这个单一节点上，自然倾向于在此节点内直接回复。

### 根因分析

1. **plannable trait 是 conditional 的** — `when: "当任务包含多个步骤..."` 意味着 LLM 第一轮思考时可能看不到规划能力的 readme，不知道自己可以拆解
2. **缺少 always-on 的认知栈思维引导** — 没有 trait 持续告诉对象"你应该用认知栈思考"
3. **缺少任务入口的评估提示** — 没有 before hook 在进入新节点时提醒"先评估复杂度"
4. **plannable 混合了两个职责** — 既是"思维模式"（什么时候该拆解）又是"能力 API"（怎么拆解）

## 设计

### 核心思路：拆分 plannable 为两个独立 trait

| Trait | when | 职责 |
|-------|------|------|
| `cognitive-style` | always | 认知栈思维模式 — 教对象什么时候该 push/pop/创建子节点 |
| `plannable` | conditional + before hook | 规划能力 API — 提供拆解工具 + 进入新节点时的评估提示 |

### 1. cognitive-style trait（新建）

**文件结构**：
```
kernel/traits/cognitive-style/
└── readme.md    # when: "always", 无 index.ts（纯思维模式，无方法）
```

**readme.md 内容设计**：

```yaml
---
when: always
description: "认知栈思维模式 — 用行为树结构化你的思考过程"
deps: []
---
```

Body 包含以下部分：

#### 1.1 核心原则

你的行为树不只是任务清单，它是你的思维结构。每个节点是一个独立的认知帧，有自己的上下文、traits、局部变量。当一个子帧完成后，它的详细 actions 被遗忘，只留下 summary — 这让你的 context 保持精简。善用这个结构。

#### 1.2 七个应该创建子节点的场景

| # | 场景 | 信号 | 做法 |
|---|------|------|------|
| 1 | **多步骤任务** | 收到的任务包含 2 个以上逻辑独立的步骤 | 拆解为子节点，每步独立执行 |
| 2 | **异常/错误隔离** | 执行中遇到意外错误或异常 | push 子帧处理错误，完成后 pop 回来，主流程只看到 summary |
| 3 | **上下文切换** | 需要从当前思维模式切换到另一种（如"写作"→"调研"） | 新子帧携带不同 traits，切换认知上下文 |
| 4 | **中途发现子问题** | 做着做着发现一个需要单独处理的子问题 | push 子帧处理，避免主流程 actions 被污染 |
| 5 | **协作等待** | 需要向其他对象请求信息，等待回复 | 当前帧 yield，回复到达后恢复 |
| 6 | **信息收集与分析分离** | 先收集再分析，两个阶段的认知需求不同 | 分成两个子帧，收集帧完成后 summary 传递给分析帧 |
| 7 | **验证/测试** | 完成主要工作后需要验证结果 | 独立子帧验证，保持主流程干净 |

#### 1.2.1 如何创建子节点

当你判断需要拆解时，使用以下 API：

- `createPlan(title, description)` — 创建完整的多步骤计划
- `create_plan_node(parentId, title, description, traits?)` — 在计划中添加步骤
- `add_stack_frame(title, description?)` — 快速压入一个子帧（适合临时子任务，如错误处理）
- `finish_plan_node(summary)` / `stack_return(summary)` — 完成当前子帧，focus 自动回到父节点

简单场景用 `add_stack_frame`，复杂场景用 `createPlan` + `create_plan_node`。详细参数说明见 plannable trait。

#### 1.3 反模式

不要在一个节点的 actions 里堆积大量不同性质的操作。

**坏的例子**：一个节点的 actions 包含"搜索了 3 个网站 → 对比了数据 → 写了报告 → 发现引用错误 → 修复了引用 → 重新验证"。这 6 个操作涉及 3 种不同的认知模式，应该拆成至少 3 个子帧。

**好的例子**：
```
[*] 写调研报告
  [✓] 收集信息 (从 3 个来源收集了关键数据)
  [✓] 分析数据 (AI 安全分为 3 个主要方向：对齐、可解释性、治理)
  [*] 撰写报告 ← focus
```

#### 1.4 收益提醒

拆解的好处：
- **Context 精简**：每个子帧完成后 summary 保留，详细 actions 被遗忘
- **Trait 按需激活**：不同子帧可以激活不同 traits（如"调研"帧激活 web_search）
- **错误隔离**：出错时只影响当前子帧，不污染主流程
- **可恢复性**：子帧失败可以重试，不需要从头开始

### 2. plannable trait（改造）

**改动点**：

#### 2.1 加 before hook

```yaml
---
when: 当任务包含多个步骤、需要拆解、或不确定从哪里开始时
description: "任务拆解和行为树规划，先想清楚再动手"
deps: []
hooks:
  before:
    inject: |
      你刚进入一个新的任务节点。在开始执行之前，先评估：
      - 这个任务是否包含多个逻辑独立的步骤？
      - 是否需要在不同步骤中使用不同的思维方式或 traits？
      - 直接在当前节点完成，actions 会不会变得冗长混乱？
      如果以上任一为"是"，请先用 createPlan 拆解为子节点，再逐步执行。
      如果任务简单直接，可以直接在当前节点完成。
    once: true
---
```

`once: true` 当前语义是 per-Flow（`firedHooks` key 为 `${trait.name}:${event}`）。需要改为 per-node 语义（key 改为 `${trait.name}:${event}:${focusNodeId}`），确保每个新 focus 节点都能收到评估提示。见下方 §2.3。

#### 2.2 readme body 精简

移除"思维模式"相关内容（已迁移到 `cognitive-style`），只保留：
- 规划 API（`createPlan`, `create_plan_node`, `finish_plan_node`）
- 栈帧语义 API（`add_stack_frame`, `stack_return`, `go`, `compress`）
- API 使用示例
- YAGNI 原则
- Red Flags（保留，因为这些是规划执行层面的警告）

移除的内容：
- "什么时候需要规划"（迁移到 cognitive-style 的 7 场景）
- "核心原则：先想清楚要做什么"（迁移到 cognitive-style）
- "常见的合理化借口"表格（迁移到 cognitive-style 的反模式）

#### 2.3 前置工程修复：before hook 运行时接入

**现状**：ThinkLoop 中有两套 hook 收集函数：
- `collectAndFireHooks`（thinkloop.ts line 648）— 实际使用的运行时函数，支持 `TraitHookEvent`（含 `"before"`/`"after"`），内部调用 `getActiveTraits` 做依赖解析，自动持久化 `firedHooks`
- `collectFrameHooks`（cognitive-stack.ts line 54）— 导入但从未调用的死代码，跳过依赖解析

当前只有 `when_finish`、`when_wait`、`when_error` 三种事件被调用，`"before"` 和 `"after"` 虽然类型定义支持但从未触发。

**修复**：在 ThinkLoop 的 context 构建之后、LLM 调用之前，调用已有的 `collectAndFireHooks`：

```typescript
// thinkloop.ts — 在 buildContext() 之后、LLM 调用之前（约 line 207）
const beforeInjection = collectAndFireHooks(traits, flow, "before", firedHooks);
if (beforeInjection) {
  chatMessages.push({ role: "user", content: beforeInjection });
}
```

无需新增函数。`collectAndFireHooks` 已经处理了作用域链计算、trait 激活、依赖解析和 `firedHooks` 持久化。

**清理**：`collectFrameHooks`（cognitive-stack.ts）可标记为 deprecated 或移除，避免与 `collectAndFireHooks` 混淆。

#### 2.4 前置工程修复：`once` 语义改为 per-node

**现状**：`collectAndFireHooks` 中 `firedHooks` 的 key 为 `${trait.name}:${event}`（thinkloop.ts line 665），导致 `once: true` 的 hook 在整个 Flow 生命周期只触发一次。

**修复**：将 key 改为包含 focusNodeId，使 `once: true` 的语义变为"每个 focus 节点只触发一次"：

```typescript
// thinkloop.ts — collectAndFireHooks 内（line 665）
const focusNodeId = flow.process.focusId;
const hookId = `${trait.name}:${event}:${focusNodeId}`;  // 原来没有 focusNodeId
```

注意：此改动对 `when_finish`、`when_wait`、`when_error` 等事件也生效。这是合理的 — 这些事件本来就应该在不同节点上各触发一次。

### 3. 触发流程

对象面对复杂任务时的完整路径：

```
1. 对象收到任务（新 Flow 或 talk 消息中断）
2. cognitive-style（always-on）在 context 中 → 对象意识到"这个任务需要拆解"
3. 对象调用 createPlan / add_stack_frame 创建子节点
4. focus 移到新节点 → plannable 进入作用域链
5. plannable 的 before hook 触发 → 注入"先评估再动手"提示
6. 对象在子节点中执行，完成后 finish_plan_node / stack_return
7. focus 回到父节点，子帧的详细 actions 被遗忘，只留 summary
```

## 文件变更

| 文件 | 操作 | 内容 |
|------|------|------|
| `kernel/traits/cognitive-style/readme.md` | **新建** | 认知栈思维模式：核心原则 + 7 场景 + 反模式 + 收益 |
| `kernel/traits/plannable/readme.md` | **修改** | 加 before hook frontmatter；移除思维模式内容，精简为纯 API 文档 |
| `kernel/src/flow/thinkloop.ts` | **修改** | ① 在 context 构建后调用 `collectAndFireHooks(traits, flow, "before", firedHooks)` ② `collectAndFireHooks` 内 hookId 改为 per-node key |
| `kernel/src/process/cognitive-stack.ts` | **清理** | `collectFrameHooks` 标记 deprecated 或移除（死代码） |

## 向后兼容

- `cognitive-style` 是新增 trait，不影响现有对象
- `plannable` 的 `when` 条件和 API 表面不变，现有使用 plannable 的对象不受影响
- plannable readme 内容精简（思维模式部分迁移到 cognitive-style），但 API 文档完整保留
- `collectAndFireHooks` hookId 格式变更（从 `trait:event` 变为 `trait:event:nodeId`），旧格式的 key 不会匹配新格式，等价于"所有 hook 重新触发一次"，这是安全的
- `collectFrameHooks` 移除不影响任何运行时行为（从未被调用）

## 验证

1. **单元测试 — cognitive-stack.ts**：
   - `collectFrameHooks` 使用 per-node key：同一 trait 的 before hook 在不同 focusNodeId 下各触发一次
   - `collectFrameHooks` 使用 per-node key：同一 focusNodeId 下 `once: true` 的 hook 只触发一次
2. **单元测试 — activator.ts**：确认 `cognitive-style`（when: always）始终被激活
3. **集成测试 — thinkloop before hook 注入**：
   - 构造一个带 plannable before hook 的 trait，验证 LLM 收到的 messages 中包含 before hook 注入文本
4. **集成实验 — 任务拆解行为**：
   - 给子对象发送复杂任务（如"调研 AI 安全最新进展并写一份报告"）
   - 成功标准：process tree 出现 >= 3 个子节点
   - 子节点完成后正确 pop 并保留 summary
5. **负面测试 — 简单任务不过度拆解**：
   - 给子对象发送简单任务（如"告诉我现在几点"）
   - 成功标准：对象在当前节点直接完成，不创建子节点

## 升级路径

本设计已包含 trait 层改造 + 最小引擎修复（before hook 接入 + once 语义修正）。如果实验发现 LLM 仍然不够主动拆解，可进一步增强：在 ThinkLoop 中加轻量辅助 — 当 focus 节点是新创建的（actions 为空）且没有子节点时，在 context 末尾追加额外系统提示。这只需在 `thinkloop.ts` 加约 3 行代码。
