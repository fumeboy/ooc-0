# FlowMessage 加 id 字段

> 类型：feature
> 创建日期：2026-04-21
> 完成日期：2026-04-21
> 状态：finish
> 负责人：Alan Kay

## 背景 / 问题描述

Talk Form 迭代发现：前端 TuiTalkForm 在 `FlowMessage` 数组里匹配"哪个 message 对应哪个 form action" 用的是 `content.slice(0,200) + timestamp` 启发式——不够稳。

根因：`FlowMessage`（前端类型 + 后端 mergeMessages 输出）**没有 id 字段**。而 engine 侧每条 message_out action 已经有 `action.id = messageId`（User Inbox 迭代引入）。

## 目标

1. `FlowMessage` 增加 `id?: string` 字段（后端填，前端消费）
2. 后端 `mergeMessages` / `writeThreadTreeFlowData` 等写消息到 flow data.json 时把 action.id 带进去
3. 前端 `TuiTalkForm` 与其他按 content+timestamp 匹配 message 的地方改为用 id（fallback 保留）
4. SSE `flow:message` 事件 payload 也带 id

## 方案

1. `kernel/src/types/flow.ts`（或 types/flow-message 定义处）：`FlowMessage` 加 `id?: string`
2. `kernel/web/src/api/types.ts` 同步
3. 后端所有产出 FlowMessage 的位置：
   - `engine.ts` message_out 写盘 → 带 `id`（已有）
   - `server.ts` `mergeMessages` → 透传 id
   - `world.ts` onTalk 构造 SSE event → 带 id
4. 前端：
   - `TuiTalkForm.tsx` / `MessageSidebar.tsx` / `ThreadsTreeView.tsx` 中按 content+timestamp 匹配 action 的地方改为 id 优先
5. 回归测试

## 影响范围

- `kernel/src/types/flow.ts`
- `kernel/src/server/server.ts`（mergeMessages）
- `kernel/src/world/world.ts`（SSE emit）
- `kernel/src/thread/engine.ts`（落盘 writeThreadTreeFlowData 透传 id）
- `kernel/web/src/api/types.ts`
- `kernel/web/src/features/MessageSidebar.tsx`（匹配启发式）
- `kernel/web/src/components/ui/TuiTalkForm.tsx`（form 匹配）
- `kernel/web/src/features/ThreadsTreeView.tsx`（若有用到）

## 验证标准

- 全量测试 550+ pass / 0 fail
- FlowMessage 落盘含 id
- 前端按 id 匹配能找到对应 action（加 console.assert 或 test）
- Talk Form 场景 B 复测不回归

## 执行记录

### 2026-04-21

**发现**：后端部分已经大半到位——`src/types/flow.ts` / `kernel/web/src/api/types.ts` 的 `FlowMessage.id` 已经是 optional 字段；`engine.ts` 在 push `message_out` action 时已调 `genMessageOutId()` 并写入 `action.id`；`onTalk` 回调签名也已经把 `messageId` 传到 World。

**剩余工作**：
1. SSE `flow:message` event 的 message payload 缺 id → 补
2. 前端 MessageSidebar 的 form 匹配只走 `content+timestamp` 启发式 → 改为 id 优先

**实现**：

- `kernel/src/world/world.ts` 的 `handleOnTalkToUser`：emitSSE 的 message 对象透传 `messageId`（当调用方提供时）
- `kernel/web/src/features/MessageSidebar.tsx`：
  - 构建 `formById: Map<messageId, {form, messageId}>` 与旧 `formByContent` 并列
  - `lookupFormForMessage` 三级匹配：`msg.id → content+ts → 仅 content`
  - useMemo 解构加 `formById` 字段
- 新增 `kernel/tests/flow-message-id.test.ts`：完整验证 action.id / SSE event.message.id / user inbox.messageId 三源完全对齐

**测试基线**：560 pass → **561 pass**（+1 新集成测试），0 fail，6 skip
前端 tsc noEmit / vite build 均通过。

**影响**：
- 前端 Talk Form 匹配更稳（id 精确匹配）——不再依赖 "content prefix + timestamp" 启发式
- 为未来「消息 reaction / 编辑 / 引用回复」等需要稳定消息标识的能力奠基
