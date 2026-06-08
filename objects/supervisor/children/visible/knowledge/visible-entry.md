---
title: visible 入口 — stone client / flow pages / ui_methods 调用通道
description: Object 自身 UI 页面的两类入口、HTTP callMethod 通道与 client-source-url 契约
activates_on:
  "window::root": "show_content"
---

# visible 入口

Object 的 UI 页面有两类入口（meta `dimensions.visible`，`packages/@ooc/meta/object.doc.ts:4072`）：

1. **stone client** — `stones/<self>/visible/index.tsx`，跨 session 稳定的单页入口（"主页"）。
2. **flow client pages** — `flows/<sid>/objects/<obj>/visible/pages/<page>.tsx`，session 内的多页扩展。

## canonical 单入口契约

后端 endpoint 只解析 `visible/index.tsx`（+ legacy `client/index.tsx` 作 fallback），**不扫 stone 根具名 tsx**（如 `Card.tsx` → 404）——杜绝入口歧义。

- 路径计算：`packages/@ooc/core/persistable/stone-object.ts` `visibleDir`。
- 读写薄壳：`packages/@ooc/core/persistable/stone-client.ts` `readVisibleSource` / `writeVisibleSource`；flow 多页 `readFlowClientPage` / `writeFlowClientPage`（pageName `/^[A-Za-z0-9_-]+$/` 防穿越）。

## client-source-url：前端拿源码的权威通道

前端不自拼路径，而是调 `GET /api/objects/:scope/:objectId/client-source-url`，后端返回 `{absPath, fsUrl}`，前端据 `fsUrl` 做 `dynamic import`。

- endpoint：`packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts`；文件不存在 → 404 `NOT_FOUND`。
- stone scope 默认解析 `visible/index.tsx`（+ legacy `client/index.tsx` 回退）；`?file=diff` 白名单则解析 `visible/diff.tsx`（**无 legacy 回退**，缺失干净 404 → 调用方回退 before-after，见 [[window-diff-resolver]]）。
- 渲染器：`packages/@ooc/web/src/domains/clients/ObjectClientRenderer.tsx` 动态 `import(fsUrl)`；404 → `StoneFallback`/`NotProducedYet`，加载/渲染错 → `LoadErrorBox`/ErrorBoundary。

## ui_methods 调用通道

UI 经 HTTP `callMethod` 调 `executable/index.ts` 导出的 `ui_methods`（与 LLM 的 `program.callCommand` 分流）。

- 服务端：`packages/@ooc/core/app/server/modules/ui/service.ts`（`loadUiServerMethods` → `ui_methods[method]`；错误码 `METHOD_LOAD_FAILED` / `METHOD_NOT_FOUND`）。
- 前端入口：`packages/@ooc/web/src/transport/endpoints.ts` `stoneCallMethod` / `flowCallMethod`；`ObjectClientRenderer.tsx:84` `callMethodFor` 合成 callMethod prop。

**边界**：visible 只管 UI 资源（tsx）+ 调用通道；`ui_methods` 实现本身归 programmable。
