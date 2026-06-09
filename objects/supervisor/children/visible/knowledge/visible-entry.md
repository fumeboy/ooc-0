---
title: visible 入口 — stone client / flow pages / ui_methods 调用通道
description: Object 自身 UI 页面的两类入口、HTTP callMethod 通道与 client-source-url 契约
activates_on:
  "object::root": "show_content"
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

## ui_methods 调用通道

UI 经 HTTP `POST /call_method` 调 Object `executable/index.ts` 平行导出的 `ui_methods` 字典（legacy `server/index.ts` 仅作回退，canonical = `executable/index.ts`，`packages/@ooc/core/runtime/server-loader.ts:28`/`:35`）——这是**人类侧专路**，与 LLM 侧的 **object method**（program sandbox 里 `self.callMethod`）分流（`executable/object/types.ts:13`）。

- 服务端：callMethod 服务在 `packages/@ooc/core/app/server/modules/stones/service.ts:387`（+ `modules/flows/service.ts` 对端），经 `loadUiServerMethods(ref)`（`runtime/server-loader.ts`）取 `uiMethods[method]`；错误码 `METHOD_LOAD_FAILED`（`stones/service.ts:394`）/ `METHOD_NOT_FOUND`（`:402`）。HTTP 入口 `modules/stones/api.call-method.ts:6`（`POST /api/stones/:id/call_method`）。
- 前端入口：`packages/@ooc/web/src/transport/endpoints.ts` `stoneCallMethod`（`:67`）/ `flowCallMethod`（`:70`）；`ObjectClientRenderer.tsx:84` `callMethodFor` 合成 callMethod prop。

**边界**：visible 只管 UI 资源（tsx）+ 调用通道；`ui_methods` 实现本身归 programmable。
