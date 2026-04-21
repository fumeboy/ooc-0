# MessageSidebar UX 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 MessageSidebar 的流式输出、优化滚动行为、简化 Program/Action 卡片展示

**Architecture:**
1. **Phase 1: 后端流式事件扩展** - 添加 stream:program 和 stream:action 事件
2. **Phase 2: 前端流式支持** - 全链路支持新的流式事件
3. **Phase 3: 滚动行为优化** - 实现新消息按钮交互
4. **Phase 4: ActionCard 简化** - 默认隐藏 Result，仅在 Maximize 时展示

**Tech Stack:** TypeScript, Bun, React, Jotai

---

## 文件映射

| 文件路径 | 职责 | 修改类型 |
|---------|------|---------|
| `kernel/src/server/events.ts` | SSE 事件类型定义 | 修改 |
| `kernel/src/flow/thinkloop.ts` | 流式解析与推送 | 修改 |
| `kernel/web/src/api/types.ts` | 前端类型定义 | 修改 |
| `kernel/web/src/store/session.ts` | Jotai atoms 状态 | 修改 |
| `kernel/web/src/hooks/useSSE.ts` | SSE 事件处理 | 修改 |
| `kernel/web/src/features/MessageSidebar.tsx` | 消息面板组件 | 修改 |
| `kernel/web/src/components/ui/ActionCard.tsx` | Action 卡片组件 | 修改 |

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 流式事件新增可能影响现有行为 | 中 | 保持现有 thought/talk 逻辑不变 |
| 滚动状态管理复杂 | 中 | 增量实现，先写测试再实现 |
| ActionCard 修改影响其他页面 | 低 | 仅修改消息列表模式，保持 Modal 不变 |

---

## 执行选项

**1. Subagent-Driven (recommended)** - 每个任务独立 subagent，任务间 review

**2. Inline Execution** - 当前会话执行，批量执行带检查点

---

### 详细任务分解

完整任务分解请参考 spec: `docs/superpowers/specs/2026-03-31-messagesidebar-ux-optimization.md`

**任务摘要:**

1. **Task 1: 后端 events.ts 新增事件类型**
   - 添加 stream:program / stream:action 及其 :end 事件

2. **Task 2: 后端 thinkloop.ts 流式解析扩展**
   - streamingSection 支持 "program" 和 "action"
   - 新增 streamingProgramLang 和 streamingActionToolName 变量
   - 扩展 checkLineTag 检测 action_open/action_close
   - 扩展 endCurrentSection 发送新事件

3. **Task 3: 前端 types.ts 同步更新**
   - 同步 SSEEvent 类型定义

4. **Task 4: 前端 store/session.ts 新增 atoms**
   - streamingProgramAtom
   - streamingActionAtom

5. **Task 5: 前端 useSSE.ts 处理新事件**
   - 处理 stream:program / stream:program:end
   - 处理 stream:action / stream:action:end

6. **Task 6: MessageSidebar 滚动行为优化**
   - isUserAtBottom 检测函数
   - userScrolledUp 状态
   - unreadCount 计数
   - 「N 条新消息」按钮 UI

7. **Task 7: MessageSidebar 流式展示扩展**
   - 渲染 streamingProgram
   - 渲染 streamingAction

8. **Task 8: ActionCard 简化**
   - 消息列表中默认隐藏 result 栏
   - 状态指示器优化
   - Modal（Maximize）保持完整展示

9. **Task 9: 验证与更新 meta.md**
   - 功能验证
   - 更新 docs/meta.md（如需要）