# Thread Detail 布局优化 + Pause/Resume 适配线程树

> 日期：2026-04-10
> 范围：前端 ThreadsTreeView + 后端 thread engine pause/resume

---

## 需求 1：Thread Detail 布局调整

### 现状

`ThreadDetailView`（`kernel/web/src/features/ThreadsTreeView.tsx:383-436`）当前布局：

```
┌─────────────────────────┐
│ header (shrink-0, 固定)  │  ← 返回按钮 + 标题 + 状态
├─────────────────────────┤
│ summary (固定)           │  ← border-b 分隔
├─────────────────────────┤
│ actions (flex-1, 滚动)   │  ← 独立 overflow-auto
└─────────────────────────┘
```

问题：summary 和 actions 分属不同容器，展示面积被压缩。

### 目标布局

```
┌─────────────────────────┐
│ header (shrink-0, 固定)  │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ summary             │ │  ← 合并到同一个
│ │ actions 列表         │ │  ← 滚动容器
│ └─────────────────────┘ │
└─────────────────────────┘
```

### 改动

文件：`kernel/web/src/features/ThreadsTreeView.tsx`

- 移除 summary 区域的 `border-b` 和独立 div
- 将 summary 和 actions 列表放入同一个 `flex-1 overflow-auto` 容器
- header 保持 `shrink-0` 固定

---

## 需求 2：Pause/Resume 适配线程树

### 现状分析

线程树引擎（`kernel/src/thread/engine.ts`）已有基本的 pause/resume 逻辑：

- **暂停时**（L671-692，`runWithThreadTree` 回调）：将 `_pendingOutput` 缓存到 threadData，写入 `llm.output.txt` 和 `llm.thinking.txt` 到 `threads/{threadId}/`
- **恢复时**（L639-648）：从 `threadData._pendingOutput` 读取缓存输出

**存在的问题：**

| 问题 | 说明 |
|------|------|
| 缺少 `llm.input.txt` | 暂停时未写入 Context 信息，用户无法查看 LLM 输入 |
| `resumeWithThreadTree` 回调缺少全部调试文件写入 | L1152-1158 的暂停路径只缓存到 threadData，不写任何文件 |
| Resume 不读文件 | 旧系统优先从文件读取（支持人工修改），线程树直接读 threadData |
| 前端未适配 | ThreadsTreeView 不显示 pause 状态，ThreadDetailView 无暂停面板 |
| thread-adapter 未传递 pause 状态 | `_pendingOutput` 存在 threadData 中，但 `buildNode` 未注入到 `locals` |

**代码路径说明：**

engine.ts 中有两个独立的 `runOneIteration` 回调定义：
1. `runWithThreadTree` 内的回调（L623-820）— 首次运行路径
2. `resumeWithThreadTree` 内的回调（L1100-1210）— 恢复/单步执行路径

`stepOnceWithThreadTree`（L1232-1257）不是独立路径，它设置 `_debugMode` 后委托给 `resumeWithThreadTree`。

**多线程暂停语义：** 暂停是对象级别的。当暂停信号到达时，只有正在等待 LLM 返回的线程会缓存 `_pendingOutput`。其他线程在 scheduler 循环顶部退出（scheduler.ts L252），不会有缓存输出，resume 时会重新发起 LLM 调用。

### 改动方案

#### 2.1 后端：暂停时写入完整调试文件（两个路径）

文件：`kernel/src/thread/engine.ts`

需要新增 `unlinkSync` 到 import：
```typescript
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
```

**路径 1**（`runWithThreadTree` 回调，L679-685）— 补充 `llm.input.txt`：

```typescript
/* 写入调试文件 */
const debugDir = join(objectFlowDir, "threads", threadId);
mkdirSync(debugDir, { recursive: true });
writeFileSync(join(debugDir, "llm.output.txt"), llmOutput, "utf-8");
if (thinkingContent) {
  writeFileSync(join(debugDir, "llm.thinking.txt"), thinkingContent, "utf-8");
}
// 新增：写入 Context（messages 在 L663 构建，与暂停检查点在同一个 else 分支内）
const inputContent = messages.map(m => `--- ${m.role} ---\n${m.content}`).join("\n\n");
writeFileSync(join(debugDir, "llm.input.txt"), inputContent, "utf-8");
```

**路径 2**（`resumeWithThreadTree` 回调，L1152-1158）— 补充全部调试文件写入：

当前代码只有：
```typescript
threadData._pendingOutput = llmOutput;
if (thinkingContent) threadData._pendingThinkingOutput = thinkingContent;
tree.writeThreadData(threadId, threadData);
scheduler.pauseObject(objectName);
return;
```

需要在 `tree.writeThreadData` 之后、`return` 之前添加完整的文件写入逻辑（与路径 1 相同）。

#### 2.2 后端：Resume 优先从文件读取（两个路径）

文件：`kernel/src/thread/engine.ts`

**路径 1**（`runWithThreadTree` 回调，L639-648）和 **路径 2**（`resumeWithThreadTree` 回调，L1134-1140）都需要相同的修改：

```typescript
if (threadData._pendingOutput) {
  /* 优先从文件读取（用户可能已修改） */
  const debugDir = join(objectFlowDir, "threads", threadId);
  const outputFile = join(debugDir, "llm.output.txt");
  if (existsSync(outputFile)) {
    llmOutput = readFileSync(outputFile, "utf-8");
    unlinkSync(outputFile);
    const thinkingFile = join(debugDir, "llm.thinking.txt");
    if (existsSync(thinkingFile)) {
      thinkingContent = readFileSync(thinkingFile, "utf-8");
      unlinkSync(thinkingFile);
    }
    const inputFile = join(debugDir, "llm.input.txt");
    if (existsSync(inputFile)) unlinkSync(inputFile);
  } else {
    /* fallback 到内存缓存 */
    llmOutput = threadData._pendingOutput;
    thinkingContent = threadData._pendingThinkingOutput;
  }

  delete threadData._pendingOutput;
  delete threadData._pendingThinkingOutput;
  tree.writeThreadData(threadId, threadData);
}
```

#### 2.3 后端：thread-adapter 注入 pause 状态

文件：`kernel/src/persistence/thread-adapter.ts`

当前 `buildNode`（L85-93）构建的 `locals` 不包含 `_pendingOutput`。需要读取 threadData 并注入：

```typescript
locals: {
  _threadStatus: meta.status,
  _creatorThreadId: meta.creatorThreadId ?? null,
  _creationMode: meta.creationMode ?? null,
  _awaitingChildren: meta.awaitingChildren ?? [],
  _createdAt: meta.createdAt,
  _updatedAt: meta.updatedAt,
  _pins: pins,
  _hasPendingOutput: !!threadData?._pendingOutput,  // 新增
},
```

注意：`buildNode` 当前不接收 threadData 参数，需要在调用链中传入。具体方式：在 `threadsToProcess` 中读取 threadData 并传给 `buildNode`。

#### 2.4 前端：ThreadsTreeView 展示 pause 状态

文件：`kernel/web/src/features/ThreadsTreeView.tsx`

在 `STATUS_INDICATOR` 中添加 `paused` 状态：

```typescript
const STATUS_INDICATOR = {
  // ...existing
  paused: { color: "text-orange-400", symbol: "⏸" },
};
```

在 `getThreadMeta` 中增加 `hasPendingOutput` 字段：

```typescript
function getThreadMeta(node: ProcessNode) {
  const locals = (node.locals ?? {}) as Record<string, unknown>;
  return {
    threadStatus: (locals._threadStatus as string) ?? null,
    hasPendingOutput: !!locals._hasPendingOutput,
    // ...existing
  };
}
```

在 `ThreadNode` 中，当 `hasPendingOutput` 为 true 时，状态显示为 `paused`。

#### 2.5 前端：ThreadDetailView 展示暂停面板

文件：`kernel/web/src/features/ThreadsTreeView.tsx`

在 `ThreadDetailView` 组件中，当节点有 `_hasPendingOutput` 时，在 actions 列表上方显示暂停面板：

- 显示 "Thread 已暂停" 提示
- 展示待执行的 LLM Output（通过 API 读取 `threads/{threadId}/llm.output.txt`）
- 可折叠查看 Context（读取 `threads/{threadId}/llm.input.txt`）
- 恢复按钮（调用现有 `resumeFlow` API）

需要传入 `sessionId` 和 `objectName` props 以支持 resume 调用和文件读取。

---

## 文件变更清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `kernel/web/src/features/ThreadsTreeView.tsx` | 修改 | ThreadDetailView 布局 + pause 状态展示 + 暂停面板 |
| `kernel/src/thread/engine.ts` | 修改 | 两个路径：暂停写入 llm.input.txt + resume 优先读文件 |
| `kernel/src/persistence/thread-adapter.ts` | 修改 | buildNode 注入 `_hasPendingOutput` 到 locals |

---

## 验证计划

1. **Thread Detail 布局**：启动前端，进入 FlowView → Process tab → 点击线程节点，确认 summary 和 actions 在同一个容器内滚动
2. **Pause 文件写入**：暂停对象后，检查 `flows/{sid}/objects/{name}/threads/{tid}/` 下是否有 llm.input.txt、llm.output.txt、llm.thinking.txt
3. **Resume 读文件**：修改 llm.output.txt 内容后恢复执行，确认使用修改后的内容
4. **前端 pause 状态**：暂停后刷新页面，确认 ThreadsTree 中暂停的线程显示 ⏸ 状态
5. **ThreadDetail 暂停面板**：点击暂停的线程节点，确认显示暂停面板和 LLM 输出内容
