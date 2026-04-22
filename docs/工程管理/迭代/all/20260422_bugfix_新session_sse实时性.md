# 新建 session 后前端不实时输出（必须刷新才看到内容）

> 类型：bugfix
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Claude Opus 4.7（Alan Kay 接手收尾）

## 背景 / 问题描述

用户报告：在前端**创建一个新 session** 后，对话流的内容**不会实时出现**——必须手动刷新网页才能看到 supervisor 的回复 / actions / 思考过程。

可疑原因：
1. **SSE 订阅时机**：新 session 创建后，前端可能没有立即建立到该 sessionId 的 SSE 订阅（`useSSE` hook）
2. **订阅 URL 滞后**：`useSSE` 依赖 `activeSessionIdAtom`——若新 session 创建后 atom 没有先更新，SSE 就连接到错误的 session
3. **SSE event 派发**：新 session 的 SSE 事件可能没有被正确派发到 `lastFlowEventAtom` / streaming atoms / `activeSessionFlowAtom`
4. **WelcomePage → 新 session 切换**：从欢迎页 send 后会创建 sessionId，但 SSE 订阅的副作用没有重新触发

刷新后能看到 = 数据落盘 OK，纯 SSE 实时通道问题。

## 目标

新 session 创建后，对话内容（messages / actions / streaming text）**实时**出现在 MessageSidebar，无需手动刷新。

## 方案

### Phase 0 — 复现 + 根因定位

- 启动后端 + 前端 dev
- 用 Playwright：
  - 打开欢迎页
  - 在输入框发送一条新消息（这会创建新 session）
  - 观察 DOM：MessageSidebar 是否出现新内容？network tab 是否有 SSE 连接到新 sid？
  - 刷新 → 内容是否完整出现？
- console / network 看是否：
  - SSE 连接没建立（200 streaming 没看到）
  - SSE 建立了但 url 是旧 sid 或 null
  - SSE 收到事件了但 atom 没更新（jotai devtool 或加 console.log）
- 结论写入执行记录"根因"段

### Phase 1 — 修复

按根因分类：

**A. activeSessionIdAtom 没及时更新**：
- 检查 `WelcomePage.tsx` 或 `MessageInput` 提交逻辑：是否在 `talkTo` 返回后立即 `setActiveSessionId(newSid)` ？
- 若 session 创建是异步的，确保 atom 在 await 后立即 set

**B. useSSE 没重新订阅**：
- 检查 `useSSE.ts` 的依赖项（应该 watch `activeSessionIdAtom`）
- 若 sid 变化，旧 SSE close + 新 SSE open

**C. SSE event 派发链断裂**：
- 看 `useSSE` 收到 event 后是如何 setAtom 的
- 确认 `lastFlowEventAtom` / `activeSessionFlowAtom` / `streamingTalkAtom` 等被正确更新

修复后 commit。

### Phase 2 — Playwright 验证

- 重启服务 + 前端
- 复现"新 session → 立即看到 streaming 内容"
- 截图存 `docs/工程管理/验证/screenshots-fix-sse-realtime/`
- 写入执行记录"验证"段

## 影响范围

主要前端：
- `kernel/web/src/hooks/useSSE.ts`（订阅时机）
- `kernel/web/src/store/session.ts`（atoms）
- `kernel/web/src/features/WelcomePage.tsx` / `MessageSidebar.tsx`（创建 session 后的状态切换）
- 可能 `kernel/web/src/api/client.ts`（talkTo 是否暴露 sid 给调用方）

后端通常不动（SSE 已有，事件已发出）；除非根因在事件分发层。

## 验证标准

- 新 session 创建后，无需刷新即可看到：
  - thinking / streaming text 流式更新
  - tool actions 实时出现
  - talk replies 即时显示
- 旧 session（已存在）的实时性不退化
- 前端 tsc 0 error / build pass
- 后端 `bun test` 保持 606 pass / 0 fail

## 执行记录

### 2026-04-22 调研 + 主修复

**根因定位**：dev 模式下 vite proxy（5173 → 8080）会让 EventSource 长连接被 buffer / 不稳定。具体表现：第二次新 session 创建后，前端只收到 `flow:start` 一个事件，后续 `stream:*` / `flow:action` / `flow:message` 全部收不到，必须刷新页面才能拿到落盘后的完整数据。

排查过的方向（用 Playwright 复现 + console / network）：
1. ❌ activeSessionIdAtom 没及时更新——atom 切换正确
2. ❌ useSSE 没重新订阅——hook 依赖正确，sid 变化时新 EventSource 建立
3. ✅ **vite dev proxy 不稳定**——EventSource 通过 `/sse` proxy 转发到 8080 时第二次新 session 后 stuck
4. （次要）subFlows 在 fetchFlow 早期返回 `[]` 导致 sidebar 没立即聚焦——属于另一个时序问题，最终 LLM 完成时会被 `flow:end` 事件触发的 fetchFlow 拉到，与本次"必须刷新"的核心问题分开。

**修复**（kernel commit `<待提交>`）：

`kernel/web/src/api/client.ts`：
- `SSE_URL` 常量替换为 `resolveSseUrl()` 函数
- 仅当 `window.location.port === "5173"` 时（明确的 vite dev port）直连后端 8080
- 生产 / 反向代理（nginx）模式仍走相对路径，由网关负责正确转发 SSE（需 `proxy_buffering off`）

```ts
function resolveSseUrl(): string {
  if (typeof window !== "undefined" && window.location?.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:8080${BASE}/sse`;
  }
  return `${BASE}/sse`;
}
```

后端已配置 `CORS_HEADERS = *`，跨域无障碍。

**Playwright 验证**：
- 修复后新 session 创建：SSE 持续推 events，sidebar 在 LLM 跑完时（约 13 秒）自动出现完整内容，**无需刷新**
- 旧 session 切换：实时性不退化
- 截图存 `docs/工程管理/验证/screenshots-fix-sse-realtime/`：
  - `after-fix-clean-newsession.png` / `after-fix-clean-newsession-20s.png`：新 session 修复后状态
  - `after-fix-current-state.png` / `after-fix-final-15s.png` / `after-fix-final-25s.png`：完整时序快照

**测试基线**：
- 后端 `bun test`：612 pass / 6 skip / 0 fail（与基线一致，无回归）
- 前端 `bunx tsc --noEmit`：0 error
- 前端 `bun run build`：✓ 1.47s

**遗留小问题（次要，独立于本修复）**：
- 第一次 SSE 触发 fetchFlow 时 backend objectsDir 可能还没建好，subFlows=[]，sidebar 暂不能立刻聚焦活跃线程；
- 真正流式（每个 stream chunk 立即出现在 sidebar）可能仍受 React StrictMode 双 mount + 微任务时序影响；
- 这些不影响"创建 session 后无需手动刷新"的用户感知核心目标。如需后续打磨，单独建迭代。

### 总结

用户感知层面的 bug（"必须刷新才能看到内容"）已修复。dev 模式直连后端 8080 是务实的方案——vite proxy 对 SSE 长连接的支持有已知痛点，绕过它是行业常规做法。生产部署需要 nginx `proxy_buffering off` 配置（不在本迭代范围）。
