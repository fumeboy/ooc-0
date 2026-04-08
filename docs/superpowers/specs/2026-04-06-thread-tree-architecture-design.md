# OOC 线程树架构设计

> 日期：2026-04-06
> 状态：核心模块已实现，集成进行中
> 前置讨论：`docs/哲学文档/discussions/2026-04-05-多对象上下文管理.md`、`docs/哲学文档/discussions/2026-04-05-双视角模型深化.md`
> 审查轮次：第 3 轮通过

---

## 1. 概述

### 1.1 问题

OOC 当前的多对象协作存在三个缺失：
- **多轮对话**：对象间的消息是扁平的时间序列，缺少对话分组和历史追踪
- **多方会议**：多个对象无法共同参与同一个讨论，缺少共享上下文空间
- **并行任务**：行为树的 push/pop 是串行的，无法表达并行执行

### 1.2 解决方案

将行为树从"静态计划结构"重构为"动态线程树"：
- **节点 = 线程 = 栈帧**：三者统一为同一个概念
- **所有交互 = 创建子线程**：`create_sub_thread`、`create_sub_thread_on_node`、`talk` 本质相同
- **执行视角 + 规划视角 = 始终共存**：每个线程同时具备两种视角，LLM 自然决策
- **Issue = 共享 inbox**：多方协作复用现有 Issue/Comment 机制

### 1.3 设计原则

1. **LLM 做判断** — 系统只做检测和通知，决策交给 LLM
2. **一个原语统一所有** — 创建子节点 + 启动线程 = 唯一的执行原语
3. **结构化遗忘** — 默认摘要，按需回忆（create_sub_thread_on_node）
4. **不考虑向后兼容** — 完全重构，以最优雅的方式实现

---

## 2. 核心模型

### 2.1 Node = Thread = 栈帧

当前系统中 ProcessNode、ThreadState、栈帧是三个独立概念。新模型将它们统一：

```
一个 ProcessNode 就是：
  - 一个行为树节点（有 title、status、children）
  - 一个线程（有独立的 ThinkLoop、Context、inbox）
  - 一个栈帧（有 traits、locals、hooks，通过祖先链形成 scope chain）
```

### 2.2 线程树

```
Object "researcher" 的线程树：

        [Root] ─── thread_0
        /    \
      [A]    [B]
      │       │
   thread_1  thread_2（并行执行）
      / \
    [C] [D]
    │     │
 thread_3 thread_4（并行执行）
```

每个线程：
- 有自己的 ThinkLoop（独立调用 LLM）
- 有自己的 Context（由节点位置决定）
- 有自己的 inbox 和 todos
- 独立执行，不等待其他线程

### 2.3 双视角：执行 + 规划

每个线程的 Context 始终包含两个视角，不切换，LLM 同时看到两者：

```
执行视角：
  - whoAmI（身份 + scope chain traits）
  - parentExpectation（父节点的 title + description）
  - plan（当前计划）
  - process（actions + messages 按时间排序）
  - locals（局部变量）
  - windows（trait 数据窗口）

规划视角：
  - children 摘要（title + status + summary）
  - inbox（unread 消息）
  - todos（pending 待办）
  - directory（通讯录）
  - 相关 Issue 的 comments
```

所有操作始终可用，不区分视角。

#### 设计理由：为什么不做视角切换？

前置讨论中曾设计"inbox 有消息时切换到根视角"的机制。最终决定放弃切换，改为始终共存，原因：

1. **每个节点既是叶子又是根**（视角的递归性）。一个中间节点对上是执行者、对下是管理者，两种角色同时存在，不应切换。
2. **LLM 擅长在丰富上下文中自然决策**。给 LLM 同时看到执行信息和规划信息，它会自然判断当下该执行还是该规划，不需要系统强制切换。
3. **避免切换开销和状态管理**。切换模式需要额外的状态机和触发规则，增加复杂度。

**Context 大小控制**：规划视角的信息量天然有限——children 只有摘要（一行），inbox 只有 unread 消息，todos 只有 pending 项。不会显著增加 Context 大小。当 inbox 为空、todos 为空、children 为空时，规划视角部分几乎不占空间。

---

## 3. 数据结构

### 3.1 线程树索引（threads.json）

```typescript
/** 线程状态 */
type ThreadStatus = "pending" | "running" | "waiting" | "done" | "failed";

/**
 * 状态映射（旧 → 新）：
 *
 * 旧 FlowStatus:
 *   "running"  → "running"
 *   "waiting"  → "waiting"
 *   "pausing"  → 删除（暂停机制由外部控制，不再是线程状态）
 *   "finished" → "done"
 *   "failed"   → "failed"
 *
 * 旧 NodeStatus:
 *   "todo"  → "pending"
 *   "doing" → "running"
 *   "done"  → "done"
 *
 * 新增：
 *   "pending" — 节点已创建但线程未启动（create_sub_thread 后、Scheduler 启动前的瞬态）
 *
 * 删除：
 *   "pausing" — 暂停/恢复改为 Scheduler 级别控制（暂停某个 Object 的所有线程），
 *               不再是单个线程的状态。
 */

/** 线程树结构索引，轻量，存储节点关系和元数据 */
interface ThreadsTreeFile {
  rootId: string;
  nodes: Record<string, ThreadsTreeNodeMeta>;
}

/** 线程树节点元数据（不含 actions） */
interface ThreadsTreeNodeMeta {
  id: string;
  title: string;
  description?: string;
  status: ThreadStatus;
  parentId?: string;
  childrenIds: string[];

  // 认知栈
  traits?: string[];
  activatedTraits?: string[];

  // 输出契约
  outputs?: string[];
  outputDescription?: string;

  // 完成摘要（结构化遗忘）
  summary?: string;

  // 线程等待状态
  awaitingChildren?: string[];

  // 创建者追踪（用于失败通知路由）
  creatorThreadId?: string;
  creatorObjectName?: string;

  // 跨 Object talk 关联（仅 talk 创建的处理节点有此字段）
  linkedWaitingNodeId?: string;       // 对方的等待节点 ID
  linkedWaitingObjectName?: string;   // 对方的 Object 名称

  createdAt: number;
  updatedAt: number;
}
```

### 3.2 线程运行时数据（thread.json）

```typescript
/** 单个线程的运行时数据，由该线程独占写入 */
interface ThreadDataFile {
  id: string;
  actions: Action[];
  locals?: Record<string, unknown>;
  plan?: string;
  inbox?: InboxMessage[];
  todos?: TodoItem[];
  hooks?: FrameHook[];
}
```

### 3.3 inbox 消息

```typescript
interface InboxMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  source: "talk" | "issue" | "thread_error" | "system";
  issueId?: string;
  status: "unread" | "marked";
  mark?: {
    type: "ack" | "ignore" | "todo";
    tip: string;
    markedAt: number;
  };
}
```

#### inbox 清理策略

- **unread 上限**：50 条。超过时自动 mark(ignore, "inbox 溢出") 最早的消息。
- **marked 消息保留**：线程 done/failed 时，marked 消息随 thread.json 一起归档，不主动清理。
- **运行中清理**：marked 消息超过 200 条时，自动清理最早的 marked 消息（保留最近 100 条）。

### 3.4 待办

```typescript
interface TodoItem {
  id: string;
  content: string;
  sourceMessageId?: string;
  status: "pending" | "done";
  createdAt: number;
  doneAt?: number;
}
```

### 3.5 生命周期钩子

```typescript
interface FrameHook {
  event: "before" | "after";
  traitName: string;
  content: string;
  once?: boolean;  // 默认 true
}
```

---

## 4. API

### 4.1 线程管理

```typescript
/** 线程句柄（create_sub_thread 的返回值） */
type ThreadHandle = string;  // 即节点 ID

/** 子线程的返回结果 */
interface ThreadResult {
  summary: string;
  artifacts?: Record<string, unknown>;
  status: "done" | "failed";
}

/** 创建子节点并启动子线程 */
create_sub_thread(title: string, options?: {
  traits?: string[];
  description?: string;
}): ThreadHandle

/** 在指定节点下创建子线程（按需回忆，仅限同一 Object 内） */
create_sub_thread_on_node(nodeId: string, message: string): Promise<string>

/** 完成当前线程，将结果交还创建者 */
return(summary: string, artifacts?: Record<string, unknown>): void

/** 等待单个子线程完成 */
await(threadId: string): Promise<ThreadResult>

/** 等待多个子线程全部完成 */
await_all(threadIds: string[]): Promise<ThreadResult[]>
```

#### return 的 artifacts 去向

`return(summary, artifacts)` 调用时：
- `summary` 写入 `ThreadsTreeNodeMeta.summary`（用于结构化遗忘）
- `artifacts` 合并到**创建者线程**的 `locals` 中（`Object.assign(creator.locals, artifacts)`）
- 创建者线程被唤醒后，可以通过 `locals` 访问子线程的产出

#### create_sub_thread_on_node 的作用域

`create_sub_thread_on_node` 仅限同一 Object 内使用。目标 nodeId 必须在当前 Object 的线程树中。跨 Object 的交互统一使用 `talk`。

#### description 与 plan 的区别

- `description`：创建时由父线程指定，描述"你被要求做什么"，不可变，展示在 Context 的 parentExpectation 中
- `plan`：线程自己通过 `set_plan` 设置，描述"我打算怎么做"，可随时更新

### 4.2 对话

```typescript
/** 跨对象对话：在对方 Root 下创建子线程，当前线程自动进入 waiting */
talk(targetObject: string, message: string): void

/** 给自己的 ReflectFlow 发消息（已有机制） */
talkToSelf(message: string): void
```

#### talk() 的完整生命周期

`talk` 是一个复合操作，系统自动执行以下步骤：

```
A 的线程 T1 调用 talk("B", message):

1. 系统在 A 的当前节点下创建子节点 W（title: "等待 B 回复"）
   - W.status = "waiting"
   - W.creatorThreadId = T1.id
   - W 不启动线程（纯等待占位节点）

2. 系统在 B 的 Root 下创建子节点 H（title: "处理 A 的请求"）
   - H.creatorThreadId = T1.id
   - H.creatorObjectName = "A"
   - H.linkedWaitingNodeId = W.id（关联 A 侧的等待节点）
   - H.linkedWaitingObjectName = "A"
   - 消息写入 H 的 inbox
   - 启动 H 的线程（running）

3. T1 设置 awaitingChildren = [W.id]，T1.status 变为 waiting
   T1 的 ThinkLoop 退出循环

4. H 的线程独立执行，完成后调用 return(summary, artifacts)

5. 系统收到 H 的 return：
   - W.status 变为 done，W.summary = H 的 summary
   - 将 H 的 summary 写入 T1 的 inbox（source: "talk"，内容包含 summary）
   - 将 H 的 artifacts 合并到 T1 的 locals 中
   - T1 的 awaitingChildren 全部 done → T1.status 变为 running
   - Scheduler 重新启动 T1 的 ThinkLoop

6. T1 被唤醒，Context 中看到 inbox 里的回复 + locals 里的 artifacts

注意：W 是纯占位节点，没有 thread.json，不启动线程。
W 只在 threads.json 中有 ThreadsTreeNodeMeta（记录 status 和 summary）。
所有运行时数据（inbox 消息、artifacts）直接写入创建者 T1 的 thread.json。
这与 Section 4.1 中"artifacts 合并到创建者线程的 locals"的规则一致。
```

### 4.3 消息与待办

```typescript
/** 处理 inbox 消息 */
mark(messageId: string, type: "ack" | "ignore" | "todo", tip: string): void

/** 在当前节点创建待办 */
addTodo(content: string, sourceMessageId?: string): void
```

### 4.4 规划

```typescript
/** 更新当前节点的计划文本 */
set_plan(text: string): void
```

### 4.5 Issue 协作

```typescript
/** 在 Issue 上发表评论 */
commentOnIssue(issueId: string, content: string, mentions?: string[]): void
```

### 4.6 执行

```
[program]: 执行代码
+ 所有 trait 注册的方法
```

---

## 5. Context 构建

### 5.1 三种线程创建方式的 Context 差异

| 创建方式 | 初始 process | 目标节点信息 | 其余节点 |
|---------|-------------|------------|---------|
| `create_sub_thread` | 拷贝父线程 process（快照） | — | 摘要 |
| `create_sub_thread_on_node` | 空白 | 目标节点完整展示（actions + messages） | 摘要 |
| `talk` | 空白 | — | 摘要 |

#### process 拷贝的语义（create_sub_thread）

`create_sub_thread` 的"拷贝"是**渲染快照**，不是 actions 数组的深拷贝：

```
拷贝时机：create_sub_thread 被调用的那一刻
拷贝内容：将父线程当前的 actions 渲染为一段摘要文本，写入子线程的首条 inject action
拷贝方式：类似 autoSummarize —— 提取关键信息，压缩为结构化文本

子线程的 thread.json:
  actions: [
    { type: "inject", content: "=== 父线程上下文 ===\n{渲染后的摘要}", timestamp: ... },
    // 后续是子线程自己的 actions
  ]
```

这样：
- 不会产生 actions 数组的重复存储
- 父线程后续的 actions 不会影响子线程（快照语义）
- 子线程的 Context 中自然包含父线程的上下文（通过 inject action）
- 压缩后的大小可控（不会因为父线程很长而导致子线程 Context 爆炸）

### 5.2 默认 Context 规则

```
节点 N 的 Context：

1. N 自己的 process（actions + messages 按时间排序）
   - create_sub_thread：初始 = 父线程 process 拷贝 + 后续自己的 actions
   - create_sub_thread_on_node：初始 = 空白 + 目标节点完整历史
   - talk：初始 = 空白

2. N 的直系祖先节点：摘要（title + status + summary）

3. N 的兄弟节点：摘要（title + status + summary）

4. N 的子节点：摘要（title + status + summary）

5. scope chain（traits 继承）：
   从 Root 到 N 的路径上所有节点的 traits 合并
   无论哪种创建方式，traits 都沿祖先链继承
   保证身份（帧 0 = Root 的 Kernel Traits）始终可见

6. 规划视角：inbox、todos、directory、相关 Issue
```

### 5.3 scope chain 示例

```
        [Root]   traits: [kernel/computable, kernel/talkable, kernel/reflective]
          │
        [写论文]  traits: [academic_writing]
          │
        [第二章]  traits: [domain/ai_safety]  ← 当前线程

scopeChain = [kernel/computable, kernel/talkable, kernel/reflective,
              academic_writing, domain/ai_safety]
```

---

## 6. Scheduler

### 6.1 架构：事件驱动，独立循环

每个线程是一个独立的 async loop，不同步等待其他线程。

```typescript
class Scheduler {
  activeLoops: Map<string, Promise<void>>;

  /** 启动线程循环 */
  startThread(thread: ThreadHandle) {
    const loop = this.runThreadLoop(thread);
    this.activeLoops.set(thread.id, loop);
  }

  /** 单个线程的独立循环 */
  async runThreadLoop(thread: ThreadHandle) {
    while (thread.nodeRef.status === "running") {
      await runOneIteration(thread);
    }
    // status 不再是 running（变为 waiting/done/failed）
    if (thread.nodeRef.status === "done" || thread.nodeRef.status === "failed") {
      this.onThreadFinished(thread);
    }
    // status === "waiting" 时循环自然退出，等待被唤醒
  }

  /** 线程结束回调 */
  onThreadFinished(thread: ThreadHandle) {
    // 1. 通知 creatorThreadId（失败或完成）
    // 2. 检查 awaitingChildren → 唤醒等待者
    // 3. 检查 todos → 注入提醒
  }

  /** 唤醒等待中的线程（子线程完成时调用） */
  wakeThread(threadId: string) {
    const thread = this.threads.get(threadId);
    thread.nodeRef.status = "running";
    this.startThread(thread);  // 重新启动循环
  }

  /** 新线程注册 */
  onThreadCreated(thread: ThreadHandle) {
    this.startThread(thread);
  }

  /** 等待 Session 中所有线程结束 */
  async waitAll(): Promise<void> {
    await Promise.all(this.activeLoops.values());
  }
}
```

#### await / await_all 的执行机制

`await` 和 `await_all` 不是 JavaScript 层面的 await，而是**线程状态转换**：

```
线程 T1 执行 await(childId) 或 await_all([childId1, childId2]):

1. runOneIteration 中检测到 await 指令
2. 设置 T1.awaitingChildren = [childId, ...]
3. 设置 T1.status = "waiting"
4. runOneIteration 返回
5. runThreadLoop 的 while 条件不满足（status !== "running"），循环退出
6. T1 的 async loop 结束，线程挂起

子线程完成时：
1. Scheduler.onThreadFinished(child) 被调用
2. 检查所有 waiting 线程的 awaitingChildren
3. 如果某个 waiting 线程的 awaitingChildren 全部 done/failed：
   → Scheduler.wakeThread(waitingThreadId)
   → 重新启动该线程的 async loop
4. 线程被唤醒后，下一轮 Context 中包含子线程的结果（summary + artifacts）
```

**线程状态机**：

```
                    create_sub_thread
          ┌──────────────────────────────┐
          ▼                              │
  pending → running ──await──→ waiting ──┘ (子线程 done 时唤醒)
               │
               ├── return ──→ done
               └── error  ──→ failed
```

### 6.2 设计要点

- **扁平调度**：Scheduler 不关心线程的父子关系或所属 Object，只看 status
- **无同步点**：每个线程独立循环，快线程不等慢线程
- **事件驱动**：Scheduler 被动响应线程状态变化，不主动轮询
- **全局安全阀**：总迭代上限，防止无限循环

---

## 7. 生命周期钩子

### 7.1 before hook

`create_sub_thread` 时，系统检查 scope chain 上所有 traits 的 before hooks，将内容注入到子线程的首轮 Context 中（作为系统消息）。

用途：trait 强制注入指导。例如 `kernel/verifiable` 的 before hook："开始任务前，先明确验证标准。"

### 7.2 after hook

子线程 `return` 时，系统检查 scope chain 上所有 traits 的 after hooks，将内容注入到父线程（创建者线程）被唤醒后的下一轮 Context 中。

用途：触发反思和经验沉淀。例如 `kernel/reflective` 的 after hook："子任务完成了，有什么值得沉淀的经验？"

### 7.3 非递归保证

hook 注入的内容是纯文本提示，不是可执行的 hook，不会触发新的 hook。天然非递归。

### 7.4 删除的机制

- ~~inline_reflect~~：被规划视角 + talkToSelf 替代
- ~~reflect_stack_frame_push/pop~~：同上

---

## 8. 错误处理

### 8.1 统一原则

系统只做检测和通知，决策交给 LLM。

### 8.2 失败通知路由

**线程失败 → 通知 `creatorThreadId`**，无论同 Object 还是跨 Object。

```
场景 1：Object 内部
  A 的线程 T1 调用 create_sub_thread → 创建 T2
  T2 失败 → 通知 T1

场景 2：跨 Object
  A 的线程 T1 调用 talk("B", msg) → B 的 Root 下创建 T2
  T2 失败 → 通知 T1（不是 B 的 Root）

场景 3：create_sub_thread_on_node
  D 的线程 T4 调用 create_sub_thread_on_node("C", question) → C 下创建 T5
  T5 失败 → 通知 T4
```

### 8.3 其他边界情况

| 场景 | 处理方式 | 决策者 |
|------|---------|--------|
| 子线程失败 | 失败信息 → 创建者线程 inbox | 创建者 LLM |
| 跨 Object 失败 | 失败信息 → 创建者线程 inbox（可能在另一个 Object） | 创建者 LLM |
| 单线程超时 | 强制 failed → 通知创建者 | 创建者 LLM |
| Session 超时 | 全部强制 failed | 系统 |
| 死锁 | running=0 且 waiting>0 → 通知并唤醒所有 waiting 线程 | 相关线程 LLM |
| 孤儿线程 | 通知 → 等待自行结束 → 超时强制 | 子线程 LLM / 系统 |
| inbox 溢出 | 自动忽略最早消息（上限 50 条 unread）+ 通知 | 系统 |

---

## 9. 多对象协作

### 9.1 1:1 对话

```
A 的线程 T1: talk("B", "请搜索 AI safety")
  ↓
1. A 当前节点下创建子节点 "等待 B 回复"
   → T1 进入 waiting，creatorThreadId = T1
2. B 的 Root 下创建子节点 "处理 A 的请求"
   → 启动 T2 (running)，creatorThreadId = T1，creatorObjectName = "A"
3. T2 独立执行，T1 等待
4. T2 完成 → return → 结果路由回 T1 → T1 唤醒
```

### 9.2 多方讨论

复用现有 Issue/Comment 机制：

```
Supervisor 创建 Issue，participants: [A, B, C]
任何参与者 commentOnIssue 时 @其他人
被 @的对象 在 Root 节点下新建该“issue”对应的thread，这个 thread 的 inbox 收到通知 （如果该issue已有thread则不重复创建）
```

### 9.3 并行任务

```
A 的线程：
  t1 = create_sub_thread("搜索 X")
  t2 = create_sub_thread("搜索 Y")
  t3 = create_sub_thread("搜索 Z")
  await_all([t1, t2, t3])
  → 三个子线程并行执行
  → 全部完成后 A 被唤醒，看到三个结果
```

### 9.4 按需回忆

```
D 的线程：create_sub_thread_on_node("C", "你产出的文档路径在哪？")
  → C 下创建子线程，Context 包含 C 的完整 actions 历史
  → 子线程回答后 return，结果异步返回 D
```

---

## 10. 持久化

### 10.1 目录结构

```
flows/{sessionId}/objects/{objectName}/
├── .flow
├── data.json                         ← Object 在此 Session 中的数据
├── threads.json                      ← 线程树结构索引（轻量）
├── threads/                          ← 线程数据（目录嵌套 = 父子关系）
│   └── {rootId}/
│       ├── thread.json               ← Root 线程运行时数据
│       ├── {childId}/
│       │   ├── thread.json
│       │   └── {grandchildId}/
│       │       └── thread.json
│       └── {childId2}/
│           └── thread.json
├── memory.md
└── files/
```

### 10.2 读写规则

- **thread.json**：线程独占写入（无冲突）
- **threads.json**：所有写入通过 per-Object 串行化队列

#### threads.json 的并发控制

多个线程可能同时调用 `create_sub_thread` 或 `return`，都需要写 `threads.json`。

**方案：内存树 + 串行化写入队列**

```
每个 Object 维护一个 ThreadsTree 内存实例：
  - 所有线程读取时直接读内存（无 IO）
  - 所有写入操作（create_sub_thread / return / status 变更）
    通过 serializedWrite 队列串行执行
  - 每次写入后同步 flush 到 threads.json

serializedWrite 的实现：
  - 复用现有的 session.serializedWrite() 机制
  - 本质是一个 async 队列，FIFO 执行
  - 写入操作是原子的：读内存 → 修改 → 写内存 → flush 磁盘

读写一致性：
  - 读：直接读内存，始终是最新状态
  - 写：排队串行执行，不会丢失更新
  - Context 构建（读）和线程创建（写）不冲突
```

### 10.3 Context 构建时的读取

1. 读 `threads.json` → 获取树结构和所有节点摘要
2. 读当前线程的 `thread.json` → 获取完整 process
3. 如果是 `create_sub_thread`：还需读父线程的 `thread.json`（拷贝 process）
4. 如果是 `create_sub_thread_on_node`：还需读目标节点的 `thread.json`（完整展示）

---

## 11. 与 OOC 基因的映射

| 基因 | 在新模型中的体现 |
|------|----------------|
| G1（万物皆对象） | 每个节点也是微型智能体 |
| G2（Stone/Flow） | Stone = 无线程树，Flow = 有活跃线程树 |
| G3（Trait 自我定义） | scope chain 沿祖先链继承 traits，子线程可激活额外 traits |
| G4（程序行动） | 每个线程独立执行 [program] |
| G5（Context/遗忘） | 默认摘要，按需回忆 = 结构化遗忘 |
| G6（Relation 关系） | 不变，通过 directory 展示在 Context 中 |
| G7（持久化即存在） | threads.json + threads/{path}/thread.json = 线程树的物理存在 |
| G8（Effect） | talk / create_sub_thread_on_node / commentOnIssue = Effect |
| G9（行为树） | 行为树 = 线程树 |
| G10（事件历史） | actions 记录在节点的 thread.json |
| G11（UI 自我表达） | 不变，但前端需要适配线程树可视化（见 Section 13） |
| G12（经验沉淀） | return 时 after hooks → talkToSelf → ReflectFlow |
| G13（认知栈） | scope chain = 祖先链的 traits 继承 |

---

## 12. 删除的旧机制

| 旧机制 | 替代方案 |
|--------|---------|
| `process.focusId`（全局 focus 光标） | 每个节点是独立线程，不需要全局 focus |
| `ThreadState`（独立的线程状态） | 合并到 ProcessNode |
| `goThread` / `sendSignal` / `ackSignal` | 不需要线程切换，所有 running 线程并行 |
| `inline_before` / `inline_after`（内联子节点） | 简化为 Context 注入（before/after hook） |
| `inline_reflect`（反思内联节点） | 删除，被规划视角 + talkToSelf 替代 |
| `reflect_stack_frame_push/pop` | 删除，同上 |
| `stack_push` / `stack_pop` | 替换为 `create_sub_thread` / `return` |
| `pendingMessages`（Flow 级别） | 替换为节点级别的 inbox |
| `process.json`（单文件存储整棵树） | 拆分为 `threads.json` + `threads/{path}/thread.json` |

---

## 13. 补充说明

### 13.1 目录嵌套深度

线程树的目录嵌套深度 = 树的深度。当前 G9 约束最大深度为 20 层。加上 `flows/{sessionId}/objects/{objectName}/threads/` 前缀，最深路径约 30 层。

在主流文件系统（ext4、APFS、NTFS）上，路径长度限制为 4096 字节，30 层嵌套（每层 ID 约 12 字符）约 360 字符，远低于限制。如果未来出现问题，可以改用扁平目录 + parentId 引用，但当前嵌套方案更直观。

### 13.2 死锁检测的宽限期

死锁检测条件"running=0 且 waiting>0"可能是正常瞬态（如所有线程都在等待跨 Object 响应）。

处理方式：
- 检测到条件后，等待一个宽限期（默认 30 秒）
- 宽限期内如果有线程变为 running，取消死锁判定
- 宽限期后仍然满足条件，才触发死锁通知
- 区分"等待子线程"（内部死锁，立即通知）和"等待跨 Object 响应"（外部等待，延长宽限期）

### 13.3 Session 的角色

Session 在新模型中的角色不变：
- 一个 Session = 一次任务的完整生命周期
- Session 管理多个 Object 的参与（每个 Object 一个 `objects/{name}/` 目录）
- Session 提供 `serializedWrite()` 用于 threads.json 的并发控制
- Session 管理 Issue/Task 看板数据
- Session 结束时清理所有 Object 的 `.flow` 标记

### 13.4 暂停/恢复机制

旧模型的 `pausing` 状态从线程状态集中删除。暂停/恢复改为 Scheduler 级别控制：
- Scheduler 维护 `pausedObjects: Set<string>` 记录被暂停的 Object
- `pauseObject(objectName)`：将 objectName 加入 pausedObjects，该 Object 的所有 running 线程在当前迭代完成后暂停（不再调用 LLM）
- `resumeObject(objectName)`：从 pausedObjects 移除，恢复该 Object 的所有暂停线程
- 暂停期间，inbox 消息仍然可以写入（不丢失），恢复后线程自然处理

### 13.5 前端适配

线程树模型对前端（Iris 层）的影响：
- **ProcessView**：从单 focus 光标的行为树视图，改为多线程并行的线程树视图。每个 running 线程需要独立的状态指示。
- **Timeline**：从单一时间线改为多线程交织的时间线，需要按线程分组或按时间合并。
- **MessageSidebar**：不变，仍然与 supervisor 的 Root 线程交互。

前端的具体设计需要独立的 Iris 层 spec，不在本文档范围内。

---

## 14. 测试验证

### 14.1 单元测试

#### 线程树结构

- 创建 Root 线程，验证 threads.json 和 thread.json 正确生成
- `create_sub_thread` 创建子节点，验证父子关系、目录嵌套、status 变更
- `return` 完成线程，验证 summary 写入、artifacts 合并到创建者 locals、status 变为 done
- 多层嵌套（Root → A → B → C），验证 scope chain 正确继承

#### Context 构建

- `create_sub_thread`：验证子线程 Context 包含父线程 process 的渲染快照（inject action）
- `create_sub_thread_on_node`：验证子线程 Context 包含目标节点的完整 actions，自身 process 为空
- `talk`：验证子线程 Context 的 process 为空
- 祖先/兄弟/子节点均以摘要展示
- scope chain 沿祖先链正确合并 traits

#### inbox 与 mark

- 消息写入 inbox，status 为 unread
- `mark(ack)` / `mark(ignore)` / `mark(todo)` 正确更新状态
- 未 mark 的消息在下一轮 Context 中仍然展示
- inbox 溢出（>50 unread）自动忽略最早消息
- marked 消息超过 200 条时自动清理

#### todo

- `addTodo` 创建 pending todo
- 子线程全部 done 且有 pending todo 时，系统注入提醒到 inbox
- todo 与 sourceMessageId 的关联正确

#### await / await_all

- `await` 单个子线程：父线程 waiting → 子线程 done → 父线程 running
- `await_all` 多个子线程：全部 done 后父线程才唤醒
- 部分子线程 failed：父线程仍被唤醒，inbox 收到失败通知

#### 生命周期钩子

- `create_sub_thread` 时 before hooks 注入到子线程首轮 Context
- `return` 时 after hooks 注入到创建者线程下一轮 Context
- hooks 非递归：注入内容不触发新的 hook

### 14.2 集成测试

#### 单 Object 并行执行

- 创建 3 个子线程并行执行，验证 Scheduler 独立调度、互不阻塞
- `await_all` 等待全部完成，验证结果正确汇聚

#### 跨 Object 对话

- A.talk("B", msg)：验证 B 的 Root 下创建子线程、creatorThreadId 指向 A 的线程
- B 的线程 return 后，结果正确路由回 A 的 inbox + locals
- A 从 waiting 唤醒，Context 中看到回复

#### Issue 多方讨论

- Supervisor 创建 Issue，participants: [A, B, C]
- A commentOnIssue @B → B 的 Root 下创建 issue 对应的 thread
- B 的 thread inbox 收到通知，Context 中包含 Issue comments
- 同一 Issue 不重复创建 thread

#### 错误传播

- 子线程 failed → 创建者线程 inbox 收到 thread_error 消息
- 跨 Object 失败：B 的线程 failed → A 的线程（creatorThreadId）收到通知
- Session 超时：所有线程强制 failed

#### 死锁检测

- 构造 A await B、B await A 的死锁场景
- 验证宽限期后 Scheduler 检测到死锁并通知所有 waiting 线程

### 14.3 持久化测试

- 线程树目录嵌套正确反映父子关系
- threads.json 的串行化写入在并发 create_sub_thread 下不丢失数据
- thread.json 独占写入无冲突
- 重启后从磁盘加载线程树，状态正确恢复

### 14.4 体验验证

每个核心场景完成后，spawn Bruce 进行体验测试：

- 场景 1：单 Object 多线程并行执行任务
- 场景 2：两个 Object 之间的 talk 对话
- 场景 3：三个 Object 通过 Issue 进行多方讨论
- 场景 4：create_sub_thread_on_node 按需回忆已完成节点的信息
- 场景 5：子线程失败后父线程的错误处理
