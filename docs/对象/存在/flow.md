# Flow — 动态/现实态

> Flow 是 Stone 在执行具体任务时的**活体**。线程树正在运行，LLM 正在被调用。

## 目录结构

```
flows/{sessionId}/objects/{name}/
├── .flow                    ← 存活标志
├── data.json                ← Flow 运行时数据
├── threads.json             ← 线程树索引（rootId + nodes 元数据）
├── threads/{threadId}/
│   └── thread.json          ← 单个线程的 actions、locals、plan
├── memory.md                ← 会话记忆（仅当前任务可见）
├── ui/pages/                ← Flow 演示页面
│   └── *.tsx
└── files/                   ← Flow 的共享数据（可选）
```

## 关键特性

### 1. Flow 是 Stone 的派生

```
stones/alan/              ← Alan 的 Stone（唯一）
  ├── readme.md            ← Alan 的身份
  └── traits/              ← Alan 的能力

flows/sess_X/objects/alan/  ← Alan 在 Session X 的 Flow
  ├── threads.json          ← 这个 Flow 的线程树
  └── threads/              ← 各线程的 thread.json
```

Flow **共享 Stone 的身份与能力**，但有独立的运行时状态。

### 2. 一个 Stone 可以同时有多个 Flow

不同 Session 下，同一个 Stone 可以有多个并行的 Flow：

```
stones/alan/                          ← 唯一的 Stone
flows/sess_A/objects/alan/            ← 处理任务 A
flows/sess_B/objects/alan/            ← 处理任务 B
flows/sess_C/objects/alan/            ← 处理任务 C
```

三个 Flow 互不干扰，各自的线程树独立运行。

### 3. Flow 只能写自己的目录

这是 OOC 的**隔离原则**。Flow 不能直接修改：
- 自己的 Stone 的 readme.md / data.json / memory.md / traits/
- 其他对象的任何文件
- 其他 Session 的任何文件

**想修改 Self（Stone）**：通过 `talk(target="super", message)` 向 SelfMeta（SuperFlow）发消息，由 SelfMeta 审视后决定是否写入。
**想影响其他对象**：通过 `talk(target, message)` 发送消息，由对方自行处理。

这个约束让并发 Flow 不会踩踏。

### 4. Flow 的两种数据

| 数据 | 生命周期 | 例子 |
|---|---|---|
| `data.json` | Flow 级 | 当前任务进度、临时计算结果 |
| `memory.md` | Flow 级 | 本次会话的思考笔记 |
| `threads/*/thread.json` | 线程级 | 单线程的 actions 历史 |

**所有 Flow 级数据在任务结束后都不进入下一次任务的 Context**。如果要沉淀到 Stone，必须走 SelfMeta。

## 核心字段

### .flow

空文件，标记"此 Flow 存活"。Session 结束时被删除（Flow 不再加载）。

### threads.json

线程树的索引：

```json
{
  "rootId": "thread-001",
  "nodes": {
    "thread-001": {
      "id": "thread-001",
      "title": "处理用户查询",
      "status": "running",
      "parentId": null,
      "childrenIds": ["thread-002"]
    },
    "thread-002": {
      "id": "thread-002",
      "title": "查找相关文档",
      "status": "done",
      "parentId": "thread-001",
      "childrenIds": []
    }
  }
}
```

### threads/{threadId}/thread.json

单线程的详细数据：

```json
{
  "id": "thread-001",
  "title": "处理用户查询",
  "description": "用户询问了 X，需要查 Y 并回答",
  "actions": [
    { "type": "thought", "content": "...", "ts": "..." },
    { "type": "tool_use", "tool": "open", "args": {...}, "ts": "..." }
  ],
  "inbox": [
    { "id": "msg-001", "from": "user", "content": "...", "marked": "ack" }
  ],
  "revivalCount": 0,
  "locals": { ... },
  "plan": { ... }
}
```

详见 [../认知/线程树/](../认知/线程树/)。

## Flow 的状态机

```
       ┌───────────┐
       │  running  │───→ waiting ───→ running（被外部事件唤醒）
       └─────┬─────┘
             │
             ├──→ pausing（人工介入检查点）
             │
             └──→ finished / failed
```

- **running** — ThinkLoop 正在执行
- **waiting** — 等待外部输入（子线程完成 / inbox 消息 / 用户回复）
- **pausing** — 人机协作检查点（参见 [../认知/context/pause.md](../认知/context/pause.md)）
- **finished** — 任务完成（根线程 return）
- **failed** — 任务失败

## Flow 级 UI：pages/

Stone 的自渲染 UI 是一个 `ui/index.tsx`。Flow 的自渲染 UI 是**多页面**：

```
flows/sess_X/objects/alan/ui/pages/
├── issue-ISSUE-001.tsx       ← 关联到某个 Issue 的 report 页
├── task-TASK-002.tsx
└── progress.tsx              ← 进度页
```

这些页面通过 Issue / Task 的 `reportPages` 字段被引用，前端通过 DynamicUI 动态加载。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Flow 数据结构 | `kernel/src/types/flow.ts` |
| Flow 加载/运行 | `kernel/src/flow/flow.ts`（过渡中） |
| 线程树运行 | `kernel/src/thread/engine.ts` + scheduler.ts |
| Session 管理 | `kernel/src/world/session.ts` |
| 调度 | `kernel/src/world/scheduler.ts` |
| 线程持久化 | `kernel/src/thread/persistence.ts` |

## 与其他概念的关系

- Flow 的"思考"由线程树驱动（[../认知/线程树/](../认知/线程树/)）
- Flow 的"行动"通过 Effect 输出（[../合作/基础/effect.md](../合作/基础/effect.md)）
- Flow 的"反思"调用 SuperFlow（[../成长/反思机制/super-flow.md](../成长/反思机制/super-flow.md)）
- Flow 的"展示"通过 ui/pages/（[../人机交互/页面/flow-view.md](../人机交互/页面/flow-view.md)）

## 与基因的关联

- **G2**（Stone 与 Flow）— 本章核心
- **G9**（线程树计划执行）— Flow 的运行结构
- **G13**（线程树即运行模型）— Flow 的统一运行模型
