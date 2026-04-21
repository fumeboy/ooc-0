# Session — 多 Flow 协作的工作空间

> 一次会话 = 一个 Session。Session 是同一任务中多个对象协同工作的物理容器。

## 什么是 Session

**Session 是一次端到端的任务处理**。从用户发起一个请求（或系统触发一个目标）开始，到这个请求被完成（或放弃）结束。

在这段时间内：
- 可能涉及多个对象（Alan、Bruce、filesystem、...）
- 每个参与对象都有自己的 Flow
- 所有 Flow 共享同一个 Session 目录
- Session 级的 Issue / Task 跨对象共享

## 目录结构

```
flows/sess_20260421_abc/            ← 一个 Session = 一个目录
├── .session.json                   ← Session 元数据（title、启动时间等）
├── readme.md                       ← Session 工作状态摘要（由 Supervisor 维护）
│
├── objects/                        ← 参与对象的 Flow 目录
│   ├── supervisor/                 ← Supervisor 的 Flow
│   │   ├── .flow
│   │   ├── threads.json
│   │   └── threads/
│   ├── alan/
│   ├── bruce/
│   └── filesystem/
│
├── issues/                         ← Session 级 Issue 跟踪
│   ├── index.json                  ← 轻量索引
│   └── issue-{id}.json             ← 单条 Issue 完整数据
│
└── tasks/                          ← Session 级 Task 跟踪
    ├── index.json
    └── task-{id}.json
```

## Session vs Flow

| 概念 | 粒度 | 归属 |
|---|---|---|
| **Session** | 一次任务 | 多对象共享 |
| **Flow** | 单对象在单个 Session 中的状态 | 单对象 |
| **Thread** | 单 Flow 中的单个执行线程 | 单 Flow |

层次关系：

```
Session
  ├── Flow (对象 A)
  │   ├── Thread 1 (根线程)
  │   │   └── Thread 2 (子线程)
  │   └── Thread 3 (另一根，如 SelfMeta)
  └── Flow (对象 B)
      └── Thread 4
```

## Session 的生命周期

1. **创建** — 用户发起消息（或系统触发），API 创建 `sess_xxx/` 目录
2. **运行** — 各参与对象的 Flow 在 `objects/` 下并发运行
3. **协作** — 通过 talk / Issue / Task 机制跨对象协作
4. **结束** — 根任务完成（Supervisor 判断）或用户终止

Session 结束后，目录保留（不删），但所有 `.flow` 标记文件被清除，不再加载。

## readme.md — Session 工作状态

由 Supervisor 维护，描述"这个 Session 正在做什么、进展如何"：

```markdown
# Session: 线程树架构集成验证

## 目标
验证线程树架构能够替代旧的 Flow/Process 架构，覆盖所有现有用例。

## 当前状态
- Issue 001: 集成测试通过 ✓
- Issue 002: 文档更新 进行中

## 参与对象
- supervisor (Alan Kay)
- alan (负责架构设计)
- bruce (负责体验验证)
```

前端在 Session 列表中直接展示这段摘要。

## Issue 与 Task 的 Session 归属

看板（Kanban）数据属于 Session 级：

- **Issue** = 需求/问题讨论单元。跨对象讨论，任何对象都可以 comment
- **Task** = 执行单元。通常由一个对象负责，但可以关联多个 Issue

详见 [../合作/结构化/](../合作/结构化/)。

## 并发写入的安全性

同一个 Session 下可能有多个 Flow 同时写 `issues/` / `tasks/`。这通过 **per-session 串行化队列** 保证：

```
三个写入者：
1. Supervisor → session-kanban trait
2. 其他对象 → issue-discussion trait
3. 用户评论 → 后端 API

全部通过 session.serializedWrite(path, fn) 串行化
```

详见 [../合作/结构化/并发写入.md](../合作/结构化/并发写入.md)。

## 跨对象协作的 Session 语义

当对象 A 通过 `talk(B, message)` 向对象 B 发消息：

1. 消息被投递到 `flows/{sessionId}/objects/B/threads/{tid}/thread.json` 的 inbox
2. 如果 B 的 Flow 不存在，**自动创建**（在同一个 Session 下）
3. B 的 Flow 处理消息，可能再 talk 给其他对象
4. 所有交互都发生在**同一个 Session 的 objects/ 下**

这保证了：
- 跨对象的线程树可以追溯到同一个 Session
- 看板（Issue/Task）跨对象共享
- Session 结束时所有参与对象统一清理

## Session 元数据

`.session.json`：

```json
{
  "id": "sess_20260421_abc",
  "title": "线程树架构集成验证",
  "startedAt": "2026-04-21T10:00:00Z",
  "status": "running",
  "rootObject": "supervisor"
}
```

## 源码锚点

| 概念 | 实现 |
|---|---|
| Session 数据结构 | `kernel/src/world/session.ts` |
| 串行化写 | `kernel/src/world/session.ts` → `serializedWrite()` |
| Session API | `kernel/src/server/*.ts` |
| 调度器 | `kernel/src/world/scheduler.ts` |
| 跨对象 talk | `kernel/src/thread/collaboration.ts` |

## 与其他概念的关系

- **Supervisor** 是 Session 级的总协调者（[../合作/角色/supervisor.md](../合作/角色/supervisor.md)）
- **看板** 的数据（Issue/Task）属于 Session（[../合作/结构化/](../合作/结构化/)）
- **跨对象协作** 都在 Session 内发生（[../合作/消息/跨对象协作.md](../合作/消息/跨对象协作.md)）

## 与基因的关联

- **G7**（目录即存在）— Session 也是一个目录
- **G8**（Effect 与 Space）— Session 提供 Space：多对象协作的物理边界
