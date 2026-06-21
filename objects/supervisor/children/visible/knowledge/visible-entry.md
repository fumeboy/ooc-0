---
title: visible 入口 — stone client / flow pages / visible/server 调用通道
description: Object 自身 UI 页面的两类入口、HTTP callMethod → visible/server 通道与 client-source-url 契约
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

## call_method 调用通道（→ visible/server）

UI 经 HTTP `POST /call_method` dispatch 到 Object **`<ObjectDir>/visible/server/index.ts`** 提供的 for-ui 服务端 API——这是**人类侧专路**，与 LLM 侧路径（executable object method）分流。两者是**两条独立签名的模块**：for-ui server method 的 ctx 有 **world / session（目标 flow）/ object-self（data）、无 current thinkloop thread**，改 object data → persistable.save（非版本化、flow 层）。`visible/server` 由 `<ObjectDir>/index.ts` 与 executable / readable / persistable **一并注册**。

> **目标设计（代码尚未实现）**：取代旧「executable `window.methods` 里标 `for_ui_access: true` 的方法经 callMethod 暴露」——`for_ui_access` 标记退役，人机分流移交独立 visible/server 模块；因 ctx 无 thinkloop thread，天然不写依赖 thread 的操作（旧「guard 降级 vs 新标注」的复杂度消解）。

- 服务端：callMethod 服务在 `packages/@ooc/core/app/server/modules/stones/service.ts`（+ `modules/flows/service.ts` 对端，stones+flows 两路同接），dispatch 到 visible/server for-ui method，注入 ctx + method 改 data 后触发 persistable.save。HTTP 入口 `modules/stones/api.call-method.ts`（`POST /api/stones/:id/call_method`）。
- 前端入口：`packages/@ooc/web/src/transport/endpoints.ts` `stoneCallMethod` / `flowCallMethod`；`ObjectClientRenderer.tsx` `callMethodFor` 合成 callMethod prop。

**边界**：visible 管 UI 资源（tsx）+ visible/server for-ui 服务端 API 模块 + 调用通道。**编辑源文件（self.md / readable.md / executable 源码 / seed knowledge）不走 callMethod**，走 app 的通用 file-edit 原语 `PUT /stones/:id/file?path=`（版本化）+ 控制面通用文件编辑器。
