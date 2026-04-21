# OOC Flow 结构化重构 + Supervisor + 自渲染 UI

> 日期: 2026-03-23
> 状态: Draft
> 范围: Flow 运行时重构、Supervisor 系统特权、对象自渲染 UI

## 1. 背景与动机

当前 OOC 的 Flow 运行时基于单棵 Process Tree + 单 focus cursor。随着系统复杂度增长，暴露出几个局限：

- **对外沟通和内部工作混在一棵树上**，LLM 难以同时管理对话和任务执行
- **缺少结构化的生命周期管理**，没有 defer/yield 等机制确保收尾工作被执行
- **上下文压缩只在节点级别**，无法对单个节点内的 actions 进行折叠
- **用户缺少全局视角**，没有统一的任务管理和进度汇报入口
- **对象无法自定义展示方式**，UI 完全由前端通用组件决定

本次重构引入多线程 Process Tree、栈帧语义 API、Supervisor 全局代理、对象自渲染 UI 四个核心能力。

## 2. 核心概念

### 2.1 多线程 Process Tree

Process Tree 支持**多个命名的 focus cursor**，每个 cursor 是一个**线程（thread）**。

```
Root
├── frontend (thread: "frontend")
│   ├── 接收用户消息
│   └── 回复用户
└── backend (thread: "backend")
    ├── 分析需求
    ├── 执行任务
    └── 汇总结果
```

**ThreadState 定义：**

```typescript
interface ThreadState {
  /** 线程名称，唯一标识 */
  name: string;
  /** 当前聚焦的节点 ID */
  focusId: string;
  /** 线程状态 */
  status: "running" | "yielded" | "finished";
  /** 待处理的 signal 队列 */
  signals: Signal[];
}
```

**线程状态机：**

```
                go(thread, nodeId)
  ┌──────────────────────────────────┐
  │                                  ▼
running ──── focus 移出 doing 节点 ──→ yielded
  │                                  │
  │    return 线程根节点              │ go(thread, nodeId)
  ▼                                  ▼
finished                           running
```

- `running → yielded`：当 focus 从 doing 节点移出时（被动触发 when_yield）
- `yielded → running`：当 `go(threadName, nodeId)` 重新激活线程
- `running → finished`：当线程根节点被 return 时
- `finished` 是终态，不可恢复。finished 线程的 signals 队列被丢弃。

**Signal 定义：**

```typescript
interface Signal {
  id: string;
  from: string;        // 发送方线程名
  content: string;     // 消息内容
  timestamp: number;
  acked: boolean;      // 是否已读
  ackMemo?: string;    // 已读时附加的记忆信息
}
```

**Signal 投递规则：**
- 发送到不存在的线程名 → 报错（不自动创建线程）
- 发送到 finished 线程 → 报错
- Signal 按 timestamp 排序，FIFO 投递，不会乱序
- Signal 队列无上限，但 context builder 只展示最近 N 条未 ack 的 signals（N 由 context 预算决定）
- `ack_signal(signalId, memo)` 标记已读后，signal 保留在队列中（供发送方查看 ackMemo），但不再出现在接收方的 context 中

**Process 类型变更：**

```typescript
interface Process {
  root: ProcessNode;
  /** 多线程：替代原有的单一 focusId */
  threads: Record<string, ThreadState>;
  todo?: TodoItem[];
  /** 已废弃，由 threads 替代 */
  // focusId: string;
}
```

Flow 创建时默认初始化两个线程：
- `frontend`（talkable）— 管理对外沟通：消息收发、对话管理、用户交互
- `backend`（actable）— 管理内部工作：任务规划、程序执行、委派协调

**ThinkLoop 多线程策略：**

每轮 ThinkLoop 遍历所有 `running` 状态的线程。Context 构建时：
- 每个线程的 focus 节点展示完整 actions
- 其他线程的 focus 节点只展示 summary + 最近 1 条 action
- 如果总 token 超预算，优先裁剪非当前线程的 actions，保留 summary

### 2.2 栈帧语义

Process Tree 的每个节点就是一个**栈帧**。操作语义借鉴编程语言的调用栈：

| 操作 | 语义 | 触发的 Hook |
|------|------|------------|
| `add_stack_frame(title, deps?, traits?)` | 压栈：在当前 focus 下创建子节点 | when_stack_push |
| `return(summary?)` | 弹栈：执行 when_stack_pop hooks，完成当前帧，focus 回到父帧 | when_stack_pop |
| `go(threadName, nodeId)` | 将指定线程的 focus 移到目标节点；若离开 doing 节点则触发 when_yield | when_yield（被动） |
| `throw(error)` | 异常：标记当前帧失败，向上冒泡直到被 catch | when_error |
| `catch` | 捕获：主动执行 when_error hook 处理异常 | when_error |
| `compress(actionIds)` | 折叠：将当前帧的指定 actions 移到新子帧，生成 summary | — |
| `summary` | 对当前帧生成摘要 | — |
| `signal(threadName, message)` | 线程间通信：向目标线程发送消息（非阻塞） | — |
| `ack_signal(signalId, memo)` | 标记 signal 已读，附加记忆信息 | — |
| `create_hook(when, handler)` | 在当前帧注册生命周期回调 | — |

**关键简化：**

- **defer = `create_hook("when_stack_pop", handler)`**。不引入独立的 defer 概念，hook 系统统一处理。
- **yield 是被动事件**，不是主动操作。当 focus cursor 从一个 doing 节点移出时（如 `go` 到其他节点），系统自动触发 when_yield hooks。LLM 不需要显式调用 yield。

### 2.3 Hook 系统扩展

**Hook 时机：**

| Hook 时机 | 触发条件 |
|-----------|---------|
| `when_stack_push` | 新栈帧被创建时（add_stack_frame） |
| `when_stack_pop` | 栈帧被 return 时（所有 when_stack_pop hooks 执行完毕后才真正 return） |
| `when_yield` | focus cursor 从 doing 节点移出时（被动触发） |
| `when_error` | throw 冒泡到当前帧时，或主动 catch |

**Hook 注册 API：**

```typescript
// handler 是一段描述性文本，由 LLM 在 hook 触发时解释执行
create_hook(when: HookTime, type: HookType, handler: string)

// 示例：注册 defer（return 时注入提醒消息）
create_hook("when_stack_pop", "inject_message", "请在 return 前确认所有子任务已完成")

// 示例：注册 yield 时创建 todo
create_hook("when_yield", "create_todo", "更新 report.md 中的进度")
```

**Hook 类型：**

| Hook 类型 | 行为 |
|-----------|------|
| `inject_message` | 将 handler 文本作为系统消息注入当前 context，LLM 在下一轮思考时看到 |
| `create_todo` | 将 handler 文本作为 title 创建一个 todo 项到 todo 队列 |

**Hook 执行顺序：** 同一时机的多个 hooks 按注册顺序（FIFO）执行。when_stack_pop hooks 按 LIFO 执行（与 Go defer 一致：后注册先执行）。

**Hook 错误处理：** Hook 执行失败不阻塞主流程。失败的 hook 记录一条 inject action 到当前节点，LLM 在下一轮看到错误信息。when_yield hook 失败不阻止 focus 移动（focus 移动已经发生，hook 是后置通知）。

**初始 Hooks：**

每个栈帧创建时自动注册：
- `create_hook("when_stack_pop", "inject_message", "summary")` — return 时提醒生成摘要（即 defer summary）
- `create_hook("when_yield", "inject_message", "summary")` — yield 时提醒生成摘要
- `create_hook("when_yield", "inject_message", "declare_running_processes")` — yield 时提醒声明运行中的进程状态

> `declare_running_processes` 的含义：当 focus 离开一个 doing 节点时，LLM 应该声明该节点当前的工作状态和进度，以便后续恢复时快速理解上下文。

### 2.4 compress 操作

compress 解决单个节点 actions 过多导致 context 膨胀的问题。

**操作流程：**
1. LLM 调用 `compress(actionIds)` 指定要折叠的 actions（必须是当前 focus 节点上已完成的 actions）
2. 系统在当前 focus 节点下创建一个新子节点（title 自动生成）
3. 将指定的 actions **移动**（非复制）到新子节点：从当前节点的 actions 列表中删除，追加到新子节点的 actions 列表
4. 对新子节点自动生成 summary（基于被移动的 actions 内容）
5. 新子节点状态标记为 done

**效果：** 当前节点的 actions 列表变短，context 变轻。历史细节被折叠到子节点中，context 构建时已完成子节点只展示 summary。

**约束：**
- 只能 compress 当前 focus 节点的 actions（不能跨节点）
- actionIds 必须引用当前节点上存在的 actions
- compress 不影响 hooks（当前节点的 hooks 保持不变）
- compress 创建的子节点不触发 when_stack_push hook（它是数据归档，不是新的执行帧）

## 3. Supervisor 系统级特权

Supervisor 是一个 stone，但系统给它特殊待遇。

### 3.1 消息路由

用户发送的消息默认路由到 supervisor。Supervisor 决定：
- 自己直接回答（简单问题）
- 委派给其他对象（通过 `talk`/`delegate`）
- 拆分为多个子任务分发给不同对象

### 3.2 全局状态可见性

Supervisor 可以访问当前 session 中所有 sub-flow 的状态。

实现方式：context builder 为 supervisor 注入 `_session_overview` window，内容包括：
- 各对象的 Flow status（running/waiting/finished/failed）
- 各对象的 process tree 摘要（根节点 + 一级子节点标题和状态）
- 各线程的 focus 位置和状态
- 消息流摘要（谁在和谁说话）

> 注意：`_session_overview` 排除 supervisor 自身的 flow 信息（避免循环引用）。Supervisor 通过自身的 process tree 和 actions 了解自己的状态。

### 3.3 Session 级自动通知

当用户直接与其他对象对话时（绕过 supervisor），系统自动 inject 一条消息到 supervisor flow，让它知道发生了什么。

### 3.4 报告职责

Supervisor 通过 reporter trait 维护 `report.md`。结合自渲染 UI（Section 4），supervisor 可以用 TSX 组件提供更丰富的任务看板。

## 4. 对象自渲染 TSX UI（G11）

### 4.1 机制

每个 stone 可以在 `shared/ui/index.tsx` 中编写 React 组件：

```typescript
// .ooc/stones/{name}/shared/ui/index.tsx
import React from "react";

interface StoneUIProps {
  stone: StoneData;
  flow?: FlowData;
  sessionId?: string;
  sendMessage: (msg: string) => void;
}

export default function SupervisorUI({ stone, flow, sessionId }: StoneUIProps) {
  return (
    <div>
      <h2>任务看板</h2>
      {/* ... */}
    </div>
  );
}
```

### 4.2 前端加载

对象的 `shared/ui/index.tsx` 文件位于 `.ooc/stones/{name}/shared/ui/index.tsx`。前端项目通过路径约定直接 import，Vite dev server 自动处理热更新。

**ViewRouter 集成：**
- 检测对象是否有 `ui/index.tsx`
- 有则优先使用自渲染 UI，注入 StoneUIProps
- 无则继续使用通用视图（ObjectDetail、FlowView 等）
- 渲染失败时 fallback 到通用视图

### 4.3 Supervisor 的 UI

Supervisor 利用自渲染能力创建任务看板：
- 展示当前 session 的所有任务及状态
- 展示各对象的工作进度
- 提供快捷操作
- 由 supervisor 自己在执行过程中编写和更新

## 5. 分阶段实现计划

### Phase 0：meta.md 哲学文档补充

在所有工程实现之前，先更新 `docs/哲学文档/meta.md`：
- 多线程 Process Tree 概念
- 栈帧语义操作表
- Hook 时机扩展（when_stack_push/pop, when_yield, when_error）
- defer = when_stack_pop hook 的统一
- yield = 被动事件的定义
- Supervisor 角色定义
- G11 自渲染 UI 的工程路径

### Phase 1：栈帧语义 API + Hook 扩展 + compress

**改动范围：** `src/types/process.ts`, `src/meta/tree.ts`, `src/meta/focus.ts`, `src/meta/thinkloop.ts`, `src/meta/cognitive-stack.ts`

- 重命名现有 API：addNode → add_stack_frame, completeNode → return, moveFocus → go
- 新增 `compress`：选取当前 focus 节点的 actions → 新子节点 + summary
- 新增 `throw/catch`：异常冒泡 + when_error hook
- 新增 `summary`：对当前帧主动生成摘要
- 新增 `create_hook(when, handler)`：运行时注册 hook
- 扩展 hook 时机：when_stack_push, when_stack_pop, when_yield, when_error
- 扩展 hook 类型：inject_message, create_todo
- 初始 hooks：每个栈帧创建时自动注册 when_stack_pop(summary) + when_yield(summary) + when_yield(declare_running_processes)
- yield 被动触发：focus 从 doing 节点移出时自动执行 when_yield hooks

### Phase 2：多线程 Process Tree

**改动范围：** `src/types/process.ts`, `src/meta/flow.ts`, `src/meta/focus.ts`, `src/meta/thinkloop.ts`, `src/meta/builder.ts`

- Process 类型：`focusId` → `threads: Record<string, ThreadState>`
- Signal 机制：`signal(threadName, message)` + `ack_signal(signalId, memo)`
- Flow 创建时初始化 frontend/backend 两个默认线程
- ThinkLoop 每轮遍历所有活跃线程，构建包含多线程状态的 context
- `go(threadName, nodeId)`：支持跨线程 focus 移动
- Context builder 展示所有线程的 focus 状态
- 迁移：现有单 focusId 数据自动迁移为单线程 `{ backend: { focusId, status: "running" } }`

### Phase 3：Supervisor 系统级特权

**改动范围：** `src/meta/builder.ts`, `src/server/server.ts`, `.ooc/stones/supervisor/`

- Context builder 为 supervisor 注入 `_session_overview` window
- 消息路由：用户消息默认经过 supervisor
- Session 级自动通知：其他对象的 flow 事件 inject 到 supervisor flow
- 更新 supervisor stone 的 readme 和 traits

### Phase 4：对象自渲染 TSX UI

**改动范围：** `.ooc/web/src/features/`, `.ooc/web/src/components/`

- 建立 `shared/ui/index.tsx` 的加载约定
- ViewRouter 集成：检测 ui/index.tsx 存在时优先使用
- StoneUIProps 注入机制
- Fallback 到通用视图
- Supervisor 编写自己的任务看板 UI

## 6. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 多 focus vs 单 focus | 多 focus（命名线程） | 思考和表达是并行的，单 focus 无法表达 |
| defer 独立概念 vs hook 统一 | hook 统一 | defer = when_stack_pop hook，减少概念数量 |
| yield 主动 vs 被动 | 被动 | focus 移出 doing 节点时自动触发，更自然 |
| signal 目标 | 线程（非节点） | 线程是执行单元，节点是数据单元 |
| signal 已读 | ack + memo | 发送方需要知道消息是否被处理，memo 提供记忆 |
| 自渲染 UI 编译 | Vite 原生 import | 不需要浏览器端编译，Vite dev server 自动热更新 |
| 双子树位置 | Root 的两个子节点 | 保持单棵树的统一性，frontend/backend 是子树不是独立树 |

## 7. 与哲学基因的对应

| 概念 | 对应基因 |
|------|---------|
| 多线程 Process Tree | G9（结构化规划）+ G13（认知栈） |
| 栈帧语义 | G13（认知栈统一运行时） |
| Hook 系统 | G3（Trait = 自我定义单元）+ G13 |
| compress | G5（上下文 = 有界信息）+ G10（Actions 不可变历史） |
| signal | G8（Effects = 三个影响方向） |
| Supervisor | G1（对象是唯一建模单元）+ G6（关系 = 网络连接） |
| 自渲染 UI | G11（UI = 自我表达） |
