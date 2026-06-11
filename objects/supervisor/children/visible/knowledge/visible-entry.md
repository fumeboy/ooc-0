---
title: visible 入口 — stone client / flow pages / ui_methods 调用通道
description: Object 自身 UI 页面的两类入口、HTTP callMethod 通道与 client-source-url 契约
activates_on:
  "object::root": "show_description"
---

# visible 入口

Object 的 UI 页面有两类入口：

1. **stone client** — `stones/<self>/visible/index.tsx`，跨 session 稳定的单页入口（"主页"）。
2. **flow client pages** — `flows/<sid>/objects/<obj>/client/pages/<page>.tsx`，session 内的多页扩展（单入口迁 `visible/` 只覆盖了 stone 单页，flow 多页仍落 `client/pages/`，详见 self.md 名词解释 · client/pages）。

## canonical 单入口契约

后端 endpoint 只解析 `visible/index.tsx`（+ legacy `client/index.tsx` 作 fallback），**不扫 stone 根具名 tsx**（如 `Card.tsx` → 404）——杜绝入口歧义。

- 路径计算：`packages/@ooc/core/persistable/stone-object.ts:22` `visibleDir`。
- 读写薄壳：`packages/@ooc/core/persistable/stone-client.ts` `readVisibleSource`（`:41`）/ `writeVisibleSource`（`:51`）；flow 多页 `readFlowClientPage`（`:58`）/ `writeFlowClientPage`（`:66`），pageName `/^[A-Za-z0-9_-]+$/` 防穿越（`:32`）。

## client-source-url：前端拿源码的权威通道

前端不自拼路径，而是调 `GET /api/objects/:scope/:objectId/client-source-url`，后端返回 `{absPath, fsUrl}`，前端据 `fsUrl` 做 `dynamic import`。

- endpoint：`packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts:46`；文件不存在 → 404 `NOT_FOUND`（`:106`）。
- stone scope 默认解析 `visible/index.tsx`（`:68`，+ legacy `client/index.tsx` 回退 `:71`/`:75`）；`?file=diff` 白名单则解析 `visible/diff.tsx`（`:63`，**无 legacy 回退**，缺失干净 404 → 调用方回退 before-after，见 [[window-diff-resolver]]）。
- 渲染器：`packages/@ooc/web/src/domains/clients/ObjectClientRenderer.tsx:195` 动态 `import(fsUrl)`；404 → `StoneFallback`/`NotProducedYet`，加载/渲染错 → `LoadErrorBox`/ErrorBoundary。

## call_method 调用通道（for_ui_access）

UI 经 HTTP `POST /call_method` 调 Object `executable/index.ts` 的 `window.methods` 里标了 `for_ui_access: true` 的方法（2026-06-11 起废独立 `ui_methods` 导出——HTTP 路径与 LLM 路径共用同一份 `window.methods`，只是 HTTP 侧按 `for_ui_access` 过滤可见性）——这是**人类侧专路**，与 LLM 侧路径（program sandbox 里 `self.callMethod`）分流。

- 服务端：callMethod 服务在 `packages/@ooc/core/app/server/modules/stones/service.ts:376`（+ `modules/flows/service.ts` 对端），经 `loadObjectWindow(ref)`（`runtime/server-loader.ts`）取 `window.methods[method]`，仅 `entry.for_ui_access === true` 才执行（`service.ts:391`）；错误码 `METHOD_LOAD_FAILED`（`:383`）/ `METHOD_NOT_FOUND`（`:393`，未找到或未标 for_ui_access）。HTTP 入口 `modules/stones/api.call-method.ts:6`（`POST /api/stones/:id/call_method`）。
- 前端入口：`packages/@ooc/web/src/transport/endpoints.ts` `stoneCallMethod`（`:67`）/ `flowCallMethod`（`:70`）；`ObjectClientRenderer.tsx:84` `callMethodFor` 合成 callMethod prop。

**边界**：visible 只管 UI 资源（tsx）+ 调用通道；method 实现本身归 executable/programmable，可见性标记 `for_ui_access` 的判定归 visible。
