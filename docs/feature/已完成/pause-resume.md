# OOC Pause/Resume 功能设计方案

<!--
@ref docs/哲学文档/gene.md#G4 — extends — ThinkLoop 暂停/恢复机制
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — isPaused + _pendingOutput
-->

## 需求精确定义

用户通过 Web 界面控制 OOC 对象的暂停/恢复：
1. **Pause**：对象完成当前 ThinkLoop 的 LLM 调用后暂停，LLM output 暂存但其中的 programs 不执行
2. **查看**：用户在 Web 页面能看到暂停时的 context（传给 LLM 的完整 prompt）和 LLM output
3. **Resume**：恢复后，暂存的 LLM output 中的 programs 继续执行

## 架构挑战

### 挑战 1：Pause 是异步信号

`world.talk()` 是 async 函数，Scheduler 在其中同步运行直到所有 Flow 完成。
用户在 Scheduler 运行期间发 pause 请求时，HTTP server 仍能接收请求（Bun 事件循环在 `await llm.chat()` 处让出控制权）。

**方案**：World 维护 `_pauseRequests: Set<string>`，ThinkLoop 在 LLM 调用返回后检查。

### 挑战 2：Resume 时 Scheduler 已退出

Flow 被暂停时，Scheduler 因入口 Flow 状态为 `pausing` 而退出，`_createAndRunFlow` 返回。
Resume 时需要重新创建 Scheduler 来继续执行。

**方案**：新增 `_resumePausedFlow` 方法（类似已有的 `_resumeAndRunFlow`），ThinkLoop 检测到 `_pendingOutput` 后跳过 LLM 调用直接执行 programs。

### 挑战 3：Context 保存

Context 是每轮动态构建的（`buildContext` + `formatContextAsSystem` + `formatContextAsMessages`）。
要让用户看到 context，需要在暂停时保存。

**方案**：在 Flow.data 中暂存 `_pausedContext`（system prompt + chat messages）。

## 详细设计

### 1. 暂停信号（运行时，不持久化）

```typescript
// world.ts
private _pauseRequests = new Set<string>();

pauseObject(name: string): void {
  this._pauseRequests.add(name);
}

resumeObject(name: string): void {
  this._pauseRequests.delete(name);
}

isPaused(name: string): boolean {
  return this._pauseRequests.has(name);
}
```

不持久化 — 暂停是运行时信号。但 Flow 的 `pausing` 状态和 `_pendingOutput` 会持久化，重启后用户仍可 resume。

### 2. ThinkLoop 暂停检查点

ThinkLoopConfig 增加 `isPaused` 回调：

```typescript
interface ThinkLoopConfig {
  maxIterations: number;
  isPaused?: () => boolean;  // 新增
}
```

在 LLM 调用返回后、程序执行前（约 line 117 后）：

```typescript
// ★ 暂停检查点 ★
if (config.isPaused?.()) {
  flow.setFlowData("_pendingOutput", llmOutput);
  flow.setFlowData("_pausedContext", {
    systemPrompt,
    chatMessages: chatMessages.map(m => ({ role: m.role, content: m.content })),
  });
  flow.setStatus("pausing");
  flow.save();
  return { ...stone.data };
}
```

注意：thought 已经在检查点之前被 recordAction 了，所以暂停时 actions 里已有这条 thought。

### 3. ThinkLoop 恢复逻辑

在循环体开头（pending messages 处理之后），检查是否有暂存 output：

```typescript
const pendingOutput = flow.toJSON().data._pendingOutput as string | undefined;
if (pendingOutput) {
  // 清除暂存数据
  flow.setFlowData("_pendingOutput", undefined);
  flow.setFlowData("_pausedContext", undefined);

  // 用暂存的 output 代替 LLM 调用
  llmOutput = pendingOutput;
  // 跳过 context build + LLM call，直接进入 extract programs 阶段
  // （用 flag 控制跳过）
}
```

实现方式：用 `resumeFromPending` flag 控制跳过 context build 和 LLM call 阶段。

### 4. Scheduler 处理 pausing 状态

```typescript
// _getReadyFlows() — pausing 的 Flow 不参与调度
// （不需要改，因为 pausing 既不是 running 也不是 waiting）

// run() — 入口 Flow 为 pausing 时退出调度
if (status === "pausing") {
  consola.info(`[Scheduler] 入口 Flow 已暂停，退出调度`);
  break;
}
```

### 5. World 的 Resume 方法

```typescript
async resumeFlow(objectName: string, flowId: string): Promise<Flow> {
  this._pauseRequests.delete(objectName);

  const stone = this._registry.get(objectName);
  const flowDir = join(stone.effectsDir, flowId);
  const flow = Flow.load(flowDir);

  flow.setStatus("running");
  // 创建 Scheduler 并运行
  // ThinkLoop 会检测 _pendingOutput 并跳过 LLM 调用直接执行 programs
  // ... 与 _resumeAndRunFlow 类似的逻辑
}
```

### 6. API 设计

| 方法 | 路径 | Body | 说明 |
|------|------|------|------|
| POST | `/api/objects/:name/pause` | — | 设置暂停信号（异步，不阻塞） |
| POST | `/api/objects/:name/resume` | `{ flowId }` | 恢复指定 Flow 的执行（阻塞，等待完成） |
| GET | `/api/objects/:name/effects/:taskId` | — | 已有，返回 Flow 数据（含 `_pendingOutput` 和 `_pausedContext`） |

### 7. 前端展示

FlowDetail 中：
- 当 Flow status 为 `pausing` 时：
  - 显示 `_pausedContext.systemPrompt`（可折叠，展示传给 LLM 的完整 system prompt）
  - 显示 `_pausedContext.chatMessages`（对话历史）
  - 高亮显示 `_pendingOutput`（LLM 的输出，标记为"待执行"）
  - 显示 "恢复执行" 按钮
- 对象列表/详情页增加 "暂停" 按钮

CommandPalette 中：
- pausing 状态的 session 显示暂停标记（如 ⏸ 图标）

### 8. 改动文件清单

| 文件 | 改动 |
|------|------|
| `kernel/src/flow/thinkloop.ts` | 增加 `isPaused` 回调 + 暂停检查点 + pendingOutput 恢复逻辑 |
| `kernel/src/world/scheduler.ts` | `run()` 入口 pausing 时退出 |
| `kernel/src/world/world.ts` | 增加 `_pauseRequests` + `pauseObject/resumeObject/isPaused` + `resumeFlow` |
| `kernel/src/server/server.ts` | 增加 pause/resume API 路由 |
| `kernel/web/src/api/client.ts` | 增加 `pauseObject()`/`resumeFlow()` |
| `kernel/web/src/api/types.ts` | FlowStatus 前端类型已有 pausing，无需改 |
| `kernel/web/src/features/FlowDetail.tsx` | 显示 paused context + pending output + 恢复按钮 |
| `kernel/web/src/components/CommandPalette.tsx` | pausing session 显示暂停标记 |
| `kernel/tests/` | 新增 pause/resume 测试 |

### 9. 执行顺序

1. ThinkLoop: `isPaused` 回调 + 暂停检查点 + pendingOutput 恢复逻辑
2. Scheduler: pausing 状态退出
3. World: _pauseRequests + pauseObject/resumeObject/isPaused + resumeFlow
4. Server: pause/resume API 路由
5. 测试: 单元测试
6. 前端 API: client 增加 pause/resume
7. 前端 UI: FlowDetail 展示 + 按钮
8. 端到端验证

### 10. 时序图

```
用户                    Server              World               Scheduler           ThinkLoop
 │                        │                   │                    │                    │
 │── talk greeter hello ──│                   │                    │                    │
 │                        │── talk() ─────────│                    │                    │
 │                        │                   │── Scheduler.run() ─│                    │
 │                        │                   │                    │── runThinkLoop() ──│
 │                        │                   │                    │                    │── await llm.chat()
 │                        │                   │                    │                    │   (事件循环让出)
 │── POST /pause ─────────│                   │                    │                    │
 │                        │── pauseObject() ──│                    │                    │
 │◄─ { paused: true } ───│                   │                    │                    │
 │                        │                   │                    │                    │◄─ LLM returns
 │                        │                   │                    │                    │── isPaused()? YES
 │                        │                   │                    │                    │── save _pendingOutput + _pausedContext
 │                        │                   │                    │                    │── setStatus("pausing")
 │                        │                   │                    │◄─ return ──────────│
 │                        │                   │                    │── entry pausing → break
 │                        │                   │◄─ return ──────────│
 │                        │◄─ flow (pausing) ─│                    │
 │                        │                   │                    │
 │── GET /effects/taskId ─│                   │                    │
 │◄─ { _pendingOutput, _pausedContext } ──────│                    │
 │   (用户查看 context 和 LLM output)         │                    │
 │                        │                   │                    │
 │── POST /resume ────────│                   │                    │
 │                        │── resumeFlow() ───│                    │
 │                        │                   │── new Scheduler ───│
 │                        │                   │                    │── runThinkLoop() ──│
 │                        │                   │                    │                    │── detect _pendingOutput
 │                        │                   │                    │                    │── skip LLM, execute programs
 │                        │                   │                    │                    │── continue normal loop...
 │                        │                   │                    │◄─ finished ────────│
 │                        │◄─ flow (finished) │                    │
 │◄─ { status: finished } │                   │
```

### 11. 注意事项

- **并发安全**：Bun 单线程，`await llm.chat()` 让出控制权时 pause 请求被处理，回来后检查 `isPaused()` 即可
- **暂停粒度**：对象级别，该对象所有 running 的 Flow 都会在下一个 LLM 调用后暂停
- **resume 指定 Flow**：用户需要指定恢复哪个 Flow（通过 flowId）
- **重启后**：`_pauseRequests` 不持久化（消失），但 Flow 的 `pausing` 状态和 `_pendingOutput` 已持久化，用户仍可 resume
- **无程序的 LLM output**：如果 LLM output 没有 programs（纯文本回复），resume 时直接应用 directives
- **thought 重复**：暂停时 thought 已 recordAction，resume 执行 programs 时不应再次 record thought
