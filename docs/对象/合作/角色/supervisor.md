# Supervisor — 全局代理

> Supervisor 是一个 Stone，但拥有系统级特权。它是 Session 的总协调者。

## 三个特权

```
1. 用户消息默认路由到 supervisor
2. 可访问 Session 中所有 sub-flow 的状态（通过 _session_overview 方法）
3. 其他对象的 Flow 事件自动通知 supervisor
```

## 1. 默认消息路由

用户通过前端发消息，不指定 target 时，默认发给 Supervisor：

```
用户输入："帮我实现 X"
  → 后端 API 接收
  → 创建 Session（如果没有活跃的）
  → talk("supervisor", { from: "user", content: "帮我实现 X" })
  → Supervisor 的根线程启动
```

设计选择：**用户面对 OOC 时，看到的是 Supervisor**——Supervisor 再决定把任务分给谁。

## 2. _session_overview

Supervisor 可以调用一个特殊方法：

```typescript
const overview = await _session_overview();
// → {
//   session_id: "...",
//   flows: [
//     { object: "supervisor", rootThreadStatus: "running", threads: 3 },
//     { object: "alan", rootThreadStatus: "waiting", threads: 2 },
//     ...
//   ],
//   issues: [ { id, title, status }, ... ],
//   tasks: [ ... ]
// }
```

这让 Supervisor 有**全局视角**——能看到"整个 Session 正在发生什么"。

普通对象没有这个方法——它们只看到自己的 Flow 状态。

## 3. Flow 事件通知

其他对象的 Flow 状态变化（线程启动、失败、完成等）会**自动通知** Supervisor：

```
alan.thread_3 status: running → failed
  → 系统发 inbox 消息给 supervisor.rootThread
    content: "[系统通知] alan.thread_3 失败: <错误>"
```

Supervisor 下一轮 Context 会看到这条消息，可以决定介入。

## Supervisor 的 readme（典型）

```markdown
---
traits:
  - kernel/base
  - kernel/talkable
  - kernel/computable
  - kernel/plannable
  - kernel/reflective
  - kernel/verifiable
  - session-kanban    ← 专属
---

# 我是 Alan Kay

我是 OOC 项目的 Supervisor。
我不属于任何一个层——我站在所有层之上，负责：

1. 任务拆分
2. 部门调度
3. 跨部门协调
4. 质量把关
5. 战略决策

我的工作方式：
- 收到任务后，先判断涉及哪些部门，然后并行或串行 spawn agent 执行
- 简单任务直接自己做
- 复杂任务拆分后分发，自己做 review 和集成

...
```

## 典型流程

### 一次典型的 Session

```
1. 用户 talk("supervisor", "实现 X 功能")

2. Supervisor 读消息：
   - 创建 Issue："实现 X 功能"
   - 分析：这涉及后端 + 前端
   - talk("alan", "请设计 X 的后端方案")
   - talk("iris", "请设计 X 的前端方案")
   - wait

3. alan / iris 各自处理，完成后 return summary

4. Supervisor 收到两个 return，inbox 有了 alan + iris 的报告：
   - 创建 Task："实现 X 后端"，assignee=coder
   - 创建 Task："实现 X 前端"，assignee=ui-coder
   - talk("coder", TASK-002, 方案)
   - talk("ui-coder", TASK-003, 方案)
   - wait

5. coder / ui-coder 完成后，Supervisor:
   - updateTaskStatus("TASK-002", "done")
   - updateTaskStatus("TASK-003", "done")
   - talk("bruce", "请体验测试")
   - wait

6. bruce 完成后：
   - updateIssueStatus("ISSUE-001", "confirming")
   - setIssueNewInfo("ISSUE-001", true)  // 请用户确认
   - 整理结果，talk("user", 摘要)
   - return（等用户确认后 Session 可继续或终止）
```

## 自渲染 UI：Session Kanban

Supervisor 通过自渲染展示 Session 看板。它的 `ui/index.tsx`：

```tsx
// stones/supervisor/ui/index.tsx
export default function SupervisorDashboard({ session }) {
  return <SessionKanban sessionId={session.id} />;
}
```

前端打开 Supervisor 的详情页时，看到的直接是当前 Session 的看板——不是普通的"Stone 详情"。

详见 [../../人机交互/页面/session-kanban.md](../../人机交互/页面/session-kanban.md)。

## 特殊性 vs 普通性

Supervisor 的"特殊"体现在：
- 系统默认路由（写在 `server/*.ts` 的逻辑里）
- _session_overview 方法（只对 supervisor 生效）
- Flow 事件自动通知（系统主动投递）

但**本质上它还是对象**：
- 用同样的 trait 系统
- 用同样的 ThinkLoop
- readme / data 的格式相同

换一个项目，可以把 Supervisor 换成另一个对象（如 coordinator），只要改几处路由配置即可。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 默认路由 | `kernel/src/server/*.ts`（用户消息 → supervisor） |
| _session_overview | `kernel/traits/` 或 `kernel/src/kanban/` 下的 supervisor 专属方法 |
| Flow 事件通知 | `kernel/src/thread/scheduler.ts` 或 `world/session.ts` |
| Supervisor stone | `stones/supervisor/` |

## 与基因的关联

- **G1**（数据即对象）— Supervisor 是对象而非特殊机制
- **G6**（关系即网络）— Supervisor 通过关系连接所有参与对象
- **G8**（Effect 与 Space）— Supervisor 是 Session 这个 Space 的协调者
