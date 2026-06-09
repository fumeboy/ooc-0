---
title: Vite serve visible 文件 + 安全边界
description: Vite /@fs 暴露本地 tsx、worktree 预览路由、fs.allow 边界与穿越防护
activates_on:
  "window::root": "show_content"
---

# Vite serve visible 文件 + 安全边界

## 渲染靠 Vite /@fs

OOC 只写 tsx 文件 + 给出绝对路径与 `fsUrl`；真正的打包/渲染由消费方实现。当前 web 控制面用 Vite dev server 经 `/@fs/<绝对路径>/` 把本地 visible 文件暴露给浏览器 `dynamic import`。

`client-source-url` endpoint 返回 `fsUrl: \`/@fs${absPath}\``（`packages/@ooc/core/app/server/modules/ui/api.client-source-url.ts:117`）。

## worktree 预览路由（自己改的界面自己看见）

stone 升级为 session-worktree 模型后，业务 session 在自己 worktree 里改 `visible/index.tsx`。endpoint stone scope 带 `?sessionId` 时经 `resolveStoneIdentityRef(read)` 路由：

- 已建 worktree → 读 worktree 的 `visible/index.tsx`；
- 未建 / super flow / 控制面（不带 sessionId）→ 读 main canonical。

`read` 模式保证纯预览不会意外创建 worktree（`api.client-source-url.ts:58-77`）。

## 安全边界

1. **标识符校验**：`assertSafeIdentifier`（`api.client-source-url.ts:40`）拒绝含 `/` `\` `..` `\0` 的 objectId / sessionId / page → `INVALID_INPUT`。
2. **page 白名单**：flow 页名受 `/^[A-Za-z0-9_-]+$/` 约束（`persistable/stone-client.ts:32` flow 读写），防路径穿越。
3. **canonical 单入口**：只解析 `visible/index.tsx`（+legacy `client/index.tsx`），不扫根具名 tsx。
4. **fs.allow**：Vite dev server 经 `server.fs.allow` 放行 `[<repo packages 目录>, worldRoot]`（`packages/@ooc/web/vite.config.ts:117`）——即整个 world 根目录可经 `/@fs/` 访问。注意陷阱——脚本用临时 `/tmp/...` world 但 Vite 在另一 world 下运行时，`fs.allow` 不含临时目录，visible 文件会 403。

**边界**：仓库不提供生产级渲染 host——这是 visible 维度的显式 warning。
