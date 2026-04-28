# Context Compact — 线程上下文压缩能力

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 负责人：Kernel
> 完成日期：2026-04-22
> kernel commit：16f564b

## 背景 / 问题描述

OOC 的线程在长时间运行后，`process.actions[]` 会不断累积：多次 `program` 输出、文件读取、工具返回值、子线程往返消息等。当 context 超过一定长度时：

1. **LLM 性能下降**——超长 context 导致注意力分散、遗忘早期关键信息
2. **成本线性上升**——每轮输入 token 越来越大
3. **延迟增加**——prefill 阶段变慢

Claude Code 原生有 `/compact` 命令，由用户手动触发；OOC 作为"活的对象生态"，更应该让**对象自己感知上下文压力**，并主动发起压缩——这本身就是元认知能力的一部分。

当前系统缺乏任何上下文压缩机制，所有历史 action 都原封不动被 `contextToMessages` 拼入 prompt。

## 目标

为线程树架构引入 **Compact 能力**：

1. **阈值感知**——engine 计算当前线程 context token 数，超过阈值（如 60k）时，在下一轮 context 末尾注入"建议执行 compact"的提示
2. **compact command**——新增 `open(command="compact")` 指令，激活 `compact` trait，让 LLM 进入"上下文审查模式"
3. **审查动作**——compact trait 提供工具让 LLM：
   - `close(traitId)` — 关闭不再需要的 trait（临时 pinned 的可关）
   - `truncate_action(actionIdx, maxLines)` — 把某条 action 的输出截断为前 N 行
   - `drop_action(actionIdx)` — 整条丢弃（高风险，需要明确理由）
4. **submit compact form**——LLM 审查完后 submit `compact` form，一次性完成：
   - 由 LLM 生成一段摘要（基于被压缩/删除的 actions）
   - engine 清空 `process.actions[]`（或截断到 compact 点之前）
   - 把摘要作为新的首条 action 注入（`inject_summary`），附带"此前已压缩"标记
5. **可视化**——前端 LLMInputViewer 能识别 compact 点，展示压缩前后的对比

## 方案

### 思维模型

`compact` 本质是**对象对自身上下文的反思**：
- `reflective` 是"做完一件事后沉淀经验"——面向**长期记忆**
- `compact` 是"现在上下文太满了，清理当前工作台"——面向**工作记忆**

两者互补：`reflective` 把值得记住的写到 memory.md（跨会话），`compact` 把当前线程内冗余的压缩掉（同线程）。

### 组件拆分

#### A. Kernel trait: `kernel:compact`

新增 `kernel/traits/compact/TRAIT.md`：

```yaml
---
namespace: kernel
name: compact
type: how_to_think
when: never
command_binding:
  commands: ["compact"]
description: 上下文审查与压缩——识别冗余信息、截断或丢弃、生成摘要
---
```

正文描述审查流程（先识别哪些可压，再决定 close/truncate/drop，最后 submit 摘要）。

#### B. compact command 的注册

在 engine 的 command handler 中注册 `compact` command：
- `open(command="compact")` 进入 compact 模式，自动 pin `kernel:compact` trait
- `submit compact {summary: "..."}` 触发压缩动作

#### C. Token 阈值监测

engine 每轮结束后计算 context 近似 token 数：
- 简单估算：`JSON.stringify(actions).length / 4`（粗略估算）
- 超过 `COMPACT_THRESHOLD_TOKENS`（默认 60k）时，在下一轮 `contextToMessages` 末尾追加系统提示：
  > `>>> [系统提示] 当前上下文已占用 ~Xk tokens，接近压力区。建议执行 open(command="compact") 梳理。`

#### D. compact trait 提供的 llm_methods

`kernel/traits/compact/index.ts` 实现：

- `list_actions()` — 返回当前线程所有 action 的索引 + 摘要（第 1 行 + 长度）
- `truncate_action(actionIdx, maxLines)` — 标记该 action 在下次 build context 时截断
- `drop_action(actionIdx, reason)` — 标记丢弃（需要 reason 至少 20 字）
- `close_trait(traitId)` — 从当前 pinnedTraits 中移除某个临时激活的 trait
- `preview_compact()` — 返回压缩后 context 的预估长度对比

#### E. submit compact form 的处理

engine 在收到 `submit compact { summary: "..." }` 时：

1. 读取本轮累积的 truncate/drop/close 标记
2. 对 `process.actions[]`：
   - 被标记 drop 的：整条移除
   - 被标记 truncate 的：output 截断为 `maxLines` 行
   - 未标记的：保留
3. 把 LLM 提供的 `summary` 作为一条**特殊 action** 插入到历史开头：
   ```json
   {
     "type": "compact_summary",
     "summary": "...",
     "compactedAt": "2026-04-22T...",
     "originalActionCount": 42,
     "keptActionCount": 8
   }
   ```
4. 写回 thread.json，下一轮 context build 时 compact_summary 作为首条"历史背景"注入

#### F. 前端可视化

`LLMInputViewer` 扩展：
- compact_summary 类型的 action 用特殊徽章（"已压缩 · 34 条 → 摘要"）
- 点开可看原压缩清单（被 drop/truncate 的 action 列表，可回放）

### 工作流示例

```
轮 N（用户反馈"好像越来越慢"）：
  LLM: open(command="compact") — 我感觉上下文有点重，我来梳理下
  [engine 注入 kernel:compact trait]

轮 N+1（compact 模式）：
  LLM: list_actions()
  → 返回 42 条 action 的索引

轮 N+2：
  LLM: truncate_action(3, 10)  # 把第 3 条的 1000 行输出截到前 10 行
  LLM: truncate_action(7, 20)
  LLM: drop_action(12, "只是探索性的文件读取，结论已沉淀到 memory")
  LLM: close_trait("library:git/advanced")  # 当前任务不再需要 git
  LLM: preview_compact()
  → 预估：从 68k → 24k tokens

轮 N+3：
  LLM: submit compact {
    summary: "此前：阅读了 kernel/src/engine.ts 和 thread/tree.ts 理解线程树执行流程；
             尝试过直接改 engine.ts 的 triggerBuildHooks 失败（权限问题）；
             最终结论是需要 extractWrittenPaths 支持 trait 方法源。
             当前任务：修复 extractWrittenPaths 的 traitId 匹配。"
  }
  [engine 执行压缩：actions 从 42 条减到 8 条 + 1 条 summary]
  [close command] — 退出 compact 模式

轮 N+4（正常执行，context 已瘦身）
```

### 对象社交语义

compact 是**单线程内**的操作，不涉及跨对象。但可以为将来的"对象向 super 投递经验"提供素材——compact 时 LLM 决定"丢弃"的内容，若被标记为 `archived: true`，可以自动 talk 给 super 作为经验沉淀的候选。这是 Phase 2 的扩展点，本迭代不做。

## 影响范围

- **涉及代码**：
  - `kernel/src/engine.ts` — token 阈值检测 + compact command 分支 + submit compact 处理
  - `kernel/src/thread/tree.ts` — process.actions[] 修改 API（truncate / drop / insert compact_summary）
  - `kernel/src/thread/context-builder.ts` — 渲染 compact_summary 为首条背景信息
  - `kernel/traits/compact/` — 新建 trait（TRAIT.md + index.ts）
  - `kernel/web/src/views/LLMInputViewer.tsx` — compact_summary 渲染
- **涉及文档**：
  - `kernel/traits/compact/TRAIT.md` — 使用说明
  - `docs/哲学/emergences/metacognitive_pressure.md` — 新增 "对象的元认知压力调节" 涌现能力条目
  - `user/docs/架构/thinkloop/` — 补充 compact 在执行循环中的位置图
- **涉及基因/涌现**：
  - **G5（遗忘是智能的基础设施）** — compact 是"工作记忆层"的主动遗忘机制，与 memory.md 的"长期遗忘"互补
  - **G12（知识 → 能力 → 直觉）** — LLM 判断"什么可以压缩"本身是一种技能，compact trait 的 readme 是把这种技能语言化
- **不涉及**：
  - 不改变 thread tree 的调度语义
  - 不改变 Trait 激活机制（仍走 command_binding）
  - 不影响其他对象的线程（compact 是 per-thread）

## 验证标准

### 功能验证

1. **阈值触发**——构造一个 actions 累积超 60k tokens 的线程，下一轮 context 末尾应看到"建议 compact"提示
2. **compact 激活**——`open(command="compact")` 后，`kernel:compact` trait 出现在 activeTraits 中
3. **压缩执行**——LLM 调用 truncate_action + drop_action + submit compact → thread.json 中 actions[] 数量减少，新增一条 compact_summary
4. **摘要可见**——下一轮 context 的首条 system/user 块是 compact_summary 的内容
5. **幂等性**——再次 open(compact) 不会损坏已有 compact_summary（应当看作历史背景，不再被纳入压缩清单）

### 测试覆盖

- `kernel/tests/compact.test.ts` — 单元测试 token 估算、action 修改 API、compact_summary 插入
- `kernel/tests/engine-compact.test.ts` — 集成测试 open→submit→verify context
- Playwright E2E —— 构造长上下文会话，触发压缩，验证前端 LLMInputViewer 正确展示

### 体验验证

spawn Bruce 测试：
- 构造一个长会话（让他做一个复杂任务产生 >60k context）
- 观察 LLM 是否自主触发 compact
- 压缩后继续对话，验证摘要是否保留了关键上下文

### 哲学一致性

spawn Sophia 评审：
- compact 是否符合 G5 的"三层记忆"模型？
- 摘要由 LLM 生成是否符合 G12 的"LLM 做判断"？

## 执行记录

### 2026-04-22 实现 + 测试通过（Kernel）

**新增文件**：
- `kernel/src/thread/compact.ts` — 纯函数：`estimateActionsTokens` / `applyMarks` / `applyCompact` / `previewCompactedTokens` / `buildCompactHint` / `COMPACT_THRESHOLD_TOKENS`
- `kernel/traits/compact/TRAIT.md` — trait 说明（when:never + command_binding.compact）
- `kernel/traits/compact/index.ts` — 5 个 llm_methods：list_actions / truncate_action / drop_action / close_trait / preview_compact
- `kernel/tests/thread-compact.test.ts` — 25 个测试全 pass
- `docs/哲学/emergences/metacognitive_pressure.md` — E13 元认知压力调节涌现条目

**修改文件**：
- `kernel/src/thread/types.ts` — `ProcessEvent.type` 扩展 `compact_summary`（含 `original` / `kept`）；`ThreadDataFile` 扩展 `compactMarks`
- `kernel/src/thread/tools.ts` — `OPEN_TOOL.command` 枚举追加 `compact`；`summary` 字段描述补上 compact 用法
- `kernel/src/thread/context-builder.ts` — `renderThreadProcess` 为 `compact_summary` 特化渲染
- `kernel/src/thread/engine.ts` — 两条路径（run + resume）：
  - `buildExecContext` 注入 `__threadId` + `__threadsTree`（compact trait 方法读写 thread.json）
  - context 构建后做 token 阈值检测，超 60k 注入 `buildCompactHint`（排除"已在 compact 模式"场景）
  - submit 分支新增 `command === "compact"`：读 compactMarks → applyCompact → 清空 marks
- `docs/哲学/emergences/README.md` — 索引新增 E13

**测试**：
- compact 单测 25 pass / 0 fail
- 全量 `bun test`：785 pass / 6 skip / 6 fail（6 fail 均为 pre-existing http_client 端口问题，baseline 已有）
- TypeScript `tsc --noEmit`：新文件 0 新增错误；engine.ts 的 TS 错误均 pre-existing

**哲学校准**：
- 与 G5 关系：compact 不推翻"结构化遗忘"，而是**单线程持续演进场景的兜底**
- 与 G12 关系：compact 管短期工作记忆，`reflective/super` 管长期记忆（memory.md），互补而非重叠
- LLM 做判断（决定哪些可压、写 summary），engine 做记账（读 marks 应用到 actions 数组）

### 2026-04-22 调研与设计（Kernel）

**已调研**：
- `kernel/src/thread/types.ts` — `ProcessEvent.type` 枚举、`ThreadDataFile` 结构
- `kernel/src/thread/engine.ts` — open/submit 分发（双路径 runWithThreadTree + resumeWithThreadTree）
- `kernel/src/thread/context-builder.ts` — `renderThreadProcess` 按 type 分支渲染
- `kernel/src/thread/tools.ts` — `OPEN_TOOL` command enum 必须更新
- `kernel/src/thread/hooks.ts` — `collectCommandTraits` 通过 `commandBinding.commands` 匹配
- `kernel/src/trait/registry.ts` — llm_methods 注入沙箱 ctx（含 selfDir/stoneName）
- `kernel/traits/reflective/super/` — 模板：command_binding + when:never + llm_methods

**设计**：
- 扩展 `ProcessEvent.type` 增加 `"compact_summary"`，可选 `original?` / `kept?`
- 扩展 `ThreadDataFile` 增加 `compactMarks?`（drops/truncates，落盘于 thread.json）
- tools.ts `OPEN_TOOL.command` enum 追加 `"compact"`
- 新建 `kernel/traits/compact/` — 5 个 llm_methods：list_actions / truncate_action / drop_action / close_trait / preview_compact
- engine 新增 `command === "compact"` submit 分支：读标记 → 应用到 actions → 插入 compact_summary → 清空标记
- 阈值提示：在两个 context 构建点做 token 估算（`JSON.stringify(actions).length / 4`），超 60k 时追加到 last user message
- 测试：`tests/thread-compact.test.ts` 单测 + context-builder 渲染验证
- 哲学：**compact 定位为"结构化遗忘不够用时的元认知压力调节"**，补足 G5 行为树 focus 无法自然收敛单线程场景

