# SSE 真流式 + 新 session 立即聚焦 + StrictMode 双连接

> 类型：bugfix
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Claude Opus 4.7

## 背景

SSE 实时性修复（`finish/20260422_bugfix_新session_sse实时性.md`）解决了"必须刷新才能看到内容"的核心 bug——dev 模式直连后端绕过 vite proxy buffering。

但前一轮 agent 报告留下三个**次要的延伸问题**，未在范围内：

1. **fetchFlow 早期 `subFlows: []`**：新 session 创建时第一次 fetchFlow 调用太早，后端还没建好 `flows/{sid}/objects/{name}/` 目录 → 返回 `subFlows: []`。前端 sidebar 的初始聚焦逻辑卡在"等 subFlows 出现"，导致需要等 LLM 跑完才能看到内容（虽然不再需要刷新，但**真流式**仍然没达到）。
2. **真正流式 chunk-by-chunk 显示**：streaming text / actions 应该在每个 SSE chunk 到达时立即出现。当前可能受 React StrictMode 双 mount + 微任务调度影响。
3. **EventSource 双连接**：StrictMode 下 useSSE useEffect 跑两次可能建立两个 EventSource——稳定性可能受影响。

## 目标

- **真流式**：新 session 创建后 1-2 秒内 sidebar 即开始显示 streaming text / 第一个 action（不必等 LLM 跑完）。
- **初始聚焦**：sidebar 从一开始就指向新 session 的 supervisor 主线程（不需要等 subFlows 拉到）。
- **StrictMode 安全**：useSSE 在 StrictMode 双 mount 下不重复建立 EventSource，第一个连接 cleanup 后再开第二个。
- 旧 session 实时性不退化。

## 方案

### Phase 0 — 复现 + 静态根因

用 Playwright 复现"新 session 后 5 秒内 sidebar 是否有 streaming"。

读 `useSSE.ts` / `MessageSidebar.tsx` / `useUserThreads.ts`：
- 双 mount 防御：用 `useRef` 跟踪 EventSource，cleanup 严格 close
- streamingTalkAtom / streamingThoughtAtom 派发链路确认
- subFlows 等待逻辑——能不能"先聚焦虚拟 root，等真 subFlow 出现自动绑定"

### Phase 1 — 修复

按根因逐项：

**A. 初始聚焦不等 subFlows**：
- 新 session 创建后，前端立即用乐观 placeholder thread（id=null 或某约定）作为 currentThread
- SSE 收到第一个 thread-related event 后绑定真实 threadId
- sidebar Body 在乐观态下显示 "thinking..." 而不是空态

**B. 真流式 chunks**：
- 确认 streamingTalkAtom / streamingThoughtAtom 在 SSE event 到达时被同步 set（不是 batched）
- MessageSidebar 渲染 streaming atom 时无 throttle / debounce 阻断

**C. StrictMode 双 EventSource**：
- useSSE useEffect 用 ref 缓存 EventSource，cleanup 时 close
- StrictMode 第二次 mount 创建新 EventSource 前先 close 旧的

### Phase 2 — Playwright 验证

- 新 session 1 秒内 sidebar 出 thinking
- 5 秒内 sidebar 出第一个 streaming chunk
- 旧 session 切换无回归
- 截图对比 `before-fix` vs `after-fix`

## 影响范围

- `kernel/web/src/hooks/useSSE.ts`（StrictMode 双连接 + cleanup）
- `kernel/web/src/features/MessageSidebar.tsx`（初始聚焦 + streaming 渲染）
- `kernel/web/src/store/session.ts`（atoms：可能加乐观 currentThreadId 哨兵）
- 可能 `kernel/web/src/hooks/useUserThreads.ts`
- 后端通常不动

## 验证标准

- 新 session 1 秒内 sidebar 显示"思考中"
- 真流式：streaming text 字符级出现
- StrictMode 下 console 无 "duplicate EventSource" 警告
- tsc 0 error / build pass / bun test 612 pass / 0 fail
- Playwright 截图证据

## 执行记录

### 2026-04-22 Phase 0：复现 + 根因

**复现**（Playwright，dev 5173 + backend 8080）：

新 session 创建后每 1 秒截图，session = `s_mo9lpnzd_ppcfmm`：
- `before-fix-1s.png`：右侧 sidebar 显示空态文字"向 supervisor 发起对话"；中间面板已渲染 supervisor 主线程
- `before-fix-3s.png`：sidebar 仍空，中间面板 actions=8
- `before-fix-6s.png`：sidebar 仍空，中间面板 actions=10
- `before-fix-11s.png`：**sidebar 突然全部内容一次性出现**（13 actions、talk reply、tool calls 全到位）

**Console / Network 观察**：
- 没有 "duplicate EventSource" warning（因为 SSE 走原生事件循环，浏览器静默处理冲突）
- network 没有任何 `/api/sse` 出现在 5173 端口下（已直连 8080——前一轮 SSE 直连修复生效）
- `/api/flows/{sid}` 在 11 秒内被轮询了约 8 次（debouncedRefresh 300ms）

**SSE 抓包**（`fetch('http://localhost:8080/api/sse')` 直接读 raw 流）：
- 抓 25 秒：只收到 `flow:start` + 2 个 `stream:thought` + 几个 `flow:action` + `flow:progress`
- 第一个 `stream:thought` 在 t=5793ms（session 启动 5.8 秒后才有 LLM 输出）
- 第二个 `stream:thought` 在 t=17776ms（间隔 12 秒）
- 全程没有 `stream:talk` 事件

**根因**：

1. **初始聚焦不出现**：`MessageSidebar.tsx:595-607` 的"自动选默认线程"effect 仅在 `subFlows.length > 0` 时运行。新 session 早期 fetchFlow 返回 `subFlows: []`，sidebar `currentThreadId` 保持 `null`，渲染分支走"暂无内容"空态。等到 LLM 跑完后 SSE `flow:end` 触发 fetchFlow 才拿到 subFlows，此时 currentThreadId 才被赋值，**Body 一次性显示完整内容**。

2. **真流式 chunk-by-chunk 缺失**：**这是后端瓶颈，不是前端 bug**。
   - `kernel/src/thread/engine.ts:919-924` 在 `await callLLM(...)` 完整返回后才一次性 `emitSSE("stream:thought", chunk: thinkingContent)`——chunk 是整段 thinking。
   - LLM provider 返回前后端 silent 12 秒没事件可发，前端再"真"也无米下锅。
   - 前端层面唯一能做的优化：让 `streaming*` 块在 `activeFlow.status` 还没 = "running" 时也能显示（修复条件 `activeFlow?.status === "running"`），让那一两个 chunk 至少能立即出现。

3. **StrictMode 双 EventSource**：`useSSE.ts` 的 useEffect 没用 ref 缓存，依赖数组里有多个 setAtom 函数。React StrictMode dev 双 mount 会跑两次 effect，理论上 cleanup → 重连，但有微秒级竞态窗口可能短暂双连接。需要用 ref 防御 + 去掉冗余依赖。

**结论**：
- A（初始聚焦）：纯前端可修
- B（真流式）：后端 streaming 协议不下发 chunk-by-chunk，前端能做的只是放宽 streaming 块渲染条件
- C（StrictMode）：纯前端可修

### 2026-04-22 Phase 1：修复

**Commit A+B（kernel `b1f1b22`）**：`fix(web): MessageSidebar 新 session 立即显示思考态 + streaming 块放宽渲染条件`

- timeline 空态：activeId 存在但无 currentThreadId 时显示"正在思考中..."（带 pulse 动画），不再显示"向 supervisor 发起对话"误导文案
- 6 个 streaming 块（thought/talk/program/action/stack_push/stack_pop/set_plan）渲染条件从 `activeFlow?.status === "running"` 改为 `streaming.sessionId === activeId`。新 session 早期 status 还是 pending/waiting 时，第一个 stream chunk 也能被渲染。

**Commit C（kernel `b5078c3`）**：`fix(web): useSSE 用 useRef 防御 StrictMode 双 mount 重复连接`

- 引入 `sseDisconnectRef`，进入 effect 前先关闭 ref 中残留的连接
- cleanup 时仅当 ref 仍指向自己时才解除引用，避免第二次 mount 关掉自己刚建好的连接

**Commit D（kernel `062b8d7`）**：`fix(web): MessageSidebar 思考态判定与空提示边界处理`

Phase 1 验证时发现 A 的边界过宽：
- 不存在的 sid / fetchFlow 失败 / 已 finished session 都误显示"思考中"
- streaming 块和"发起对话"空提示同时显示导致 UI 冗余

修复：
- 新增 `flowFetched` 本地 state，跟踪 fetchFlow 是否已返回
- "思考中"严格限制：`!flowFetched || status === running/waiting/pausing`
- 空提示在有任何 streaming 块时不渲染

### 2026-04-22 Phase 2：验证

**Playwright 验证**（dev 5173 + backend 8080，session = `s_mo9m4u99_eit2un`）：

新 session 创建后：
- `after-fix-V2-1s.png`：sidebar 已显示新 session 头部（s_mo9m4u99_eit2un + supervisor），主面板已渲染主线程行
- `after-fix-V2-5s.png`：sidebar 出现 thinking streaming 块（"The user said 流式终极V2..."），无空提示叠加
- `after-fix-V2-10s.png`：thinking 仍在 streaming（spinner 转），稳定显示
- `after-fix-V2-20s.png`：sidebar 完整出现 thinking + 2 个 tool actions（开任务/提交任务）+ talk reply

**对比 before-fix**：
- before-fix-1s/3s/6s：sidebar 全空（"向 supervisor 发起对话"）
- before-fix-11s：突然全部内容一次性出现
- after-fix-5s：thinking 块已出现（提前 6 秒）
- after-fix-20s：完整 timeline 已稳定

**旧 session 切换**（`after-fix-old-session-no-regression.png`）：跳转到旧 finished session（`s_mo9lpnzd_ppcfmm`）后 sidebar 立即显示完整历史，无"思考中"误显示，**无回归**。

**不存在的 sid**（`after-fix-nonexistent-session-reloaded.png`）：跳转到不存在的 session 后 sidebar 显示"向 supervisor 发起对话"空提示（fetchFlow 失败 → flowFetched=true → status=undefined → 走 else 分支），符合预期。

### 2026-04-22 Phase 3：测试 Gate

- 后端 `bun test`：606 pass / 6 skip / 0 fail（612 total，与基线一致）
- 前端 `bunx tsc --noEmit`：exit=0，无 error
- 前端 `bun run build`：✓ built in 1.41s

### 关于真流式（B）的诚实交代

前端层面已优化到极致：streaming 块渲染条件放宽到 `sessionId === activeId`，任何到达的 stream chunk 都立即显示。

**但真"chunk-by-chunk 字符级流式"仍受后端协议限制**：
- `kernel/src/thread/engine.ts:919-924, 1996-1997` 在 `await callLLM()` 完整返回**之后**才一次性 `emitSSE("stream:thought", chunk: thinkingContent)`
- chunk 本身就是整段 thinkingContent，不是 LLM provider streaming response 的逐 token 转发
- 后端无 stream callback 串到 SSE，无法做到真正的"打字机"效果

这是后端 streaming 协议的架构问题，超出本迭代（前端 bugfix）范围。**作为 backlog 待后续单独立项**：让 engine 在 `callLLM` 期间通过 callback 将 LLM provider 的 chunk 流转发为 SSE chunked 事件。

### 总结

完成范围：
- A（初始聚焦）：✅ sidebar 在新 session 创建后立即显示"思考中..."
- B（真流式 — 前端层）：✅ 6 个 streaming 块渲染条件放宽，第一个 chunk 一到就显示；后端层瓶颈作为 backlog
- C（StrictMode 双连接）：✅ useRef 防御机制部署
- 边界处理（D）：✅ finished session / 不存在 sid / 空 session 不误显示思考中

测试基线：612 tests 0 fail / tsc 0 error / build pass
Playwright 截图证据：`docs/工程管理/验证/screenshots-fix-sse-streaming/`


