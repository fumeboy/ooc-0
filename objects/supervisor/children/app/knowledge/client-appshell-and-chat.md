---
activates_on: {"object::root": "show_description"}
---

# app.client — AppShell 与 chat 模型

Web 控制面在 `packages/@ooc/web/`（Vite + React）。它**不持有业务状态**——所有状态仍落在 world 的 flows / stones 文件里，client 只通过 app server 的 HTTP API 读取并把状态翻译成人读界面。

## AppShell：URL 单向真相

`~~packages/@ooc/web/src/app/routing.ts:42~~（已删除）` 定义 `RouteState` 六个 kind：welcome / scope / file / stoneClient / flowPage / flowsView。`toPath(state)`（`:80`）是 URL 反向构造、`parseRoute(pathname, search, params)`（`:165`）是正向解析、`useRouteState()`（`:145`）从 react-router 当前 URL 派生 RouteState。

`shell.tsx` 不 `setState` 改导航字段——所有 handler 走 `navigate(toPath(...))`，URL 变化经 `useRouteState` 回流为下一帧 state。这让前进/后退、刷新、URL 复制粘贴都能恢复页面。导航维度全部从 URL 派生：`activeSessionId`（`shell.tsx:64`）、`activeObjectId`（`:83`）、`activeThreadId` / `activePath`。本地 `useState` 只承担两类职责：数据缓存（tree/thread/flows/stones + hash）与 transient UI（表单 draft、modal、showSessions）。

**thread 上下文 = query string overlay**：`flowsView` / `file` 路由可携带 `?sessionId=&objectId=&threadId=`，让在 chat 里看文件时 RightPanel 的 chat 不消失。老 `/threads/...` 路径在 parseRoute 里仍能识别（归一为 flowsView+thread_context），保证已收藏链接不挂。

## chat = cross-object talk，不是自由对话

user 在 `user.root` 上持有一个 talk_window 指向 target object 的 callee thread；user 的"消息"实际是 `user.root.talk_window.say` 三段式调用，派送到 target，callee 回信通过 `thread.outbox` 流回 user。composer 输入永远经 talk_window 派送，没有裸消息通道。

- **建 session**：`POST /api/sessions`（seedSession）一次性 seed session + user flow object + talk_window + 派送 initialMessage + enqueue job。前端 `canSubmit` 强制 sessionId / targetObjectId / initialMessage 三者非空。
- **continue**：`POST /api/flows/:sid/continue`，body `{ text, targetWindowId? }`，固定走 user.root.talk_window。
- **polling-job 协议**：发起动作拿 `jobId` → 轮询 job 状态（`domains/chat/policy.ts` 的 `waitForJob`，约 10s 上限）→ job 终态后刷新 thread。**无 SSE**。额外有 4s thread 静默轮询（`shell.tsx:252`，`setInterval(..., 4000)`）做 hash diff 后只在变化时更新，让 callee 在用户不动时也渐进显示新事件。
- **timeline 模型**：`domains/chat/formatter.ts` 把异构 thread 事件归一为 `ChatLine`（message | tool | notice | notice_group），TuiBlock 渲染；连续 tool 卡合并、assistant→user 回信穿插、inbox 按 fromObjectId 显示真实标签。
- **inline UI token**：消息文本里 `[[ui{"comp":"file-link",...}ui]]` 由 `InlineUiContent` 解析渲染成 React 组件，零 `dangerouslySetInnerHTML`；协议来自 user 对象的 `readable.md`。

## 其余控制面块

- **tree-scope**：flows / stones / pools / world 四 scope 的目录树 + 文件预览（Sidebar 切 scope，`shell.tsx:419` `handleScope` 保留 query string）。
- **file-viewer**：通用 CodeMirror 预览 + `llm.input.json` / `loop_*.input.json` 专用 debug viewer（左 input item、右 XML context 拆树）。
- **ContextSnapshotViewer**：把 thread.json shape 渲染成左树（windows 按 type 分组、events 默认折叠）+ 右详情（file/edit/program/knowledge 按 type 增强）。
- **ObjectClientRenderer**（`domains/clients/`）：经 `/api/objects/:scope/:id/client-source-url` 拿 backend 权威 `{absPath, fsUrl}`，用 `/@fs/` 动态 import 渲染 Object 自带 React UI；不再硬编码路径。
- **写入边界**：client 唯一开放写入是对象 knowledge（经 `/api/pools/<objectId>/knowledge/...` 落到 pool 层，旧 `/api/stones/.../knowledge/...` 仍兼容带 `X-Deprecated`，见 `web/src/transport/endpoints.ts`），其余只读浏览，不让 UI 旁路 server 策略。

## 明确不做（旧 Web 未迁移）

Kanban / Issue / Task 视图、SSE 实时流、Command Palette、复杂 FlowData 聚合、旧 `/api/talk/:target` 兼容层——都是显式裁剪，不是没做。
