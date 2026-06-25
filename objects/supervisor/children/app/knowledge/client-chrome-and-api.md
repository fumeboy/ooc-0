---
title: app.client — 控制面外壳（layout / header / logo / file-viewer / 消费的 API 子集）
description: AppShell chat 模型之外的控制面框架块：布局切换、RightPanel header、全局状态 logo、任意路径文件预览、与 app server API 的实际消费边界
activates_on: {"object::root": "show_description"}
---

# app.client — 控制面外壳

承接 [[client-appshell-and-chat]]（routing / chat 核心）。本篇收 chat 模型之外、属于**控制面框架自身**的块：布局、header、全局状态、文件预览、API 消费边界。

## Layout mode：三栏 / 两栏切换

`packages/@ooc/web/src/app/layout/LayoutModeToggle.tsx` 导出单一按钮组件 `LayoutModeToggle`（`:16`）+ `LayoutMode = "three-column" | "two-column"`（`:14`）。状态由 `shell.tsx` 的 `useState` + localStorage key `ooc:layoutMode`（`LayoutModeToggle.tsx:45` `STORAGE_KEY`，`readPersistedLayoutMode` `:48` / `persistLayoutMode` `:59`）跨刷新持久化。

- `three-column`：原 grid（sidebar + 主面板 + 右面板）。
- `two-column`：强制省略 sidebar、主面板与右面板各占 50%——典型"专注 chat ↔ 主视图"模式。

按钮挂两处共享同一 `mode`：`MainPanel` 的 breadcrumb-bar 最左 + `RightPanel` 顶部 header；点任一处都走同一 setter + persist。

## RightPanel header：对话对象 + 主视图切换

`~~packages/@ooc/web/src/app/layout/RightPanel.tsx:36~~（已删除）` 的 `.right-header` 行（取代旧的 invisible spacer）：

- 左侧：**对话对象 displayName**（`:39`，取自 self.md 首行经 `useDisplayNames(objectId)` 解析，fallback objectId）。
- 右侧：**Network 按钮**（`:49`）调 `handleShowContextWindows`，本质是 `navigate(toPath({kind:"flowsView", view:"thread_context", ...}))`，把 MainPanel 从 file viewer 等视图一键切回 thread context tree；以及 **LayoutModeToggle**（`:3` import，与 breadcrumb 那个共享 mode）。

不渲染 RightPanel 时（如 `activeObjectId === "user"`，user 不能和自己对话）整个 header 连同 ChatPanel 一起隐藏，切两列布局。

## MainLogo：全局健康 / 暂停 / 调试状态

`packages/@ooc/web/src/shared/brand/MainLogo.tsx` 接后端真实 runtime 状态作全局控制位：

- `GET /api/health`（`:82`）探 online / offline。
- `GET|POST /api/runtime/global-pause/*` 控全局 pause。
- `GET|POST /api/runtime/debug/*` 控 debug 开关（`:123` enable/disable）。
- 每 10s 轮询一次（`:97` `setInterval`）；视觉编码：默认灰、pause 橙、debug 蓝、pause+debug 渐变（`:136` `"gradient"`）。

## 任意路径文件预览（/api/file/read）

通用 file-viewer（CodeMirror + `llm.input.json` / `loop_*.input.json` 专用 debug viewer，已在 [[client-appshell-and-chat]] 提到）之外，另有一个**不受 world 隔离**的只读 endpoint：

- `GET /api/file/read?path=&maxBytes=`（后端 `~~packages/@ooc/core/app/server/modules/ui/api.read-any-file.ts:15~~（已删除）`，service `modules/ui/service.ts:198` `readAnyFile`）。
- 用途：服务 `file_window` 详情面板预览——`file_window.path` 常是绝对路径、不一定落在 `--world` 内。
- **256 KB 软上限**（`service.ts:198` `maxBytes = 256 * 1024`），超出标 `truncated`（`:213`）。前端经 `fetchAnyFile(path)`（endpoint `endpoints.ts:36` `readAnyFile`）消费，`.md` 走 MarkdownContent、其它走 CodeMirror。

⚠️ `/api/file/read` 无 world 隔离与策略层，仅本地 dev 用；公开部署须先加 path 白名单或鉴权。另：debug viewer 仍走 `/api/tree/file` 读 world 里的 debug JSON（不是 runtime debug HTTP API），与 runtime debug endpoint 不一致。

## 实际消费的 server API 子集（边界）

app.client 只消费 app server 能力的一个较小子集，全部登记在 `packages/@ooc/web/src/transport/endpoints.ts`：

- **sessions / chat**：`POST /api/sessions`（seed）、`GET /api/flows/:sid/objects/:oid/threads/:tid`（拉 thread）、`GET /api/flows/:sid/threads`（ThreadHeader 切换器数据源）、`POST /api/flows/:sid/continue`、`POST /api/flows/:sid/pause`|`/resume`。
- **ui**：`GET /api/tree`、`GET /api/tree/file`、`GET /api/file/read`。
- **stones / pools**：list / create stone / knowledge 目录与文件读写（写经 pool 层）。
- **runtime**：job status、global pause status & toggle、debug status & toggle。
- **call_method**：flow object `POST /api/flows/:sid/objects/:id/call_method`（由 ObjectClientRenderer 按需调）。**裁定：callMethod 仅 flow scope**——stone scope 不调 object 程序、stone client 只读；stone `POST /api/stones/:id/call_method` 已移除。

当前**不**消费：runtime 的 llm-config / jobs list / latest debug / loop debug；stone 的 self / readme / data / server-source 读写。要新纳入须先在 transport 层登记对应 endpoint。

## ThreadHeader：session 内 thread 切换器

`packages/@ooc/web/src/app/layout/ThreadHeader.tsx` 在 MainPanel breadcrumb-bar 内联显示 `<objectId> · <threadId>` + 状态 pill；`sessionThreads.length > 1` 时渲染 `<select>` 切 thread，选中走 `navigate`。数据源 `GET /api/flows/:sid/threads`（后端 `modules/flows/api.list-threads.ts` 列 session 下所有 (objectId, threadId) 对）。ThreadHeader 只显示与切换、不携带 send/pause，RightPanel 被隐藏时仍可见。

## ChatLine 三元模型的边界澄清

chat 是状态的解释器、不是状态源：client 不发明第二状态，只把 world / thread / runtime 已有状态翻译成人读界面。原始 thread 事件先在 `domains/chat/formatter.ts` 归一为稳定的 `ChatLine`（message | tool | notice）再交组件，避免组件里 if/else 失控。pause / global pause / debug 统一从 app server API 暴露，client 不维护平行实现——避免"UI 看起来开了但 runtime 没开"的双重真相。
