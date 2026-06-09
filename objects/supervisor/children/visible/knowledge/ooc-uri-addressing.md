---
title: ooc:// 寻址由 visible 解析
description: ooc://client/... 是 Agent 知识侧的稳定寻址 URI，由 visible 渲染层 1:1 映射 SPA route
activates_on:
  "object::root": "show_description"
---

# ooc:// 寻址由 visible 解析

`ooc://` 是 OOC 暴露给 Agent 知识侧的**稳定寻址协议**——Agent 只产出 `ooc://client/...`，不写易漂移的物理 SPA 路径；由 visible 渲染层负责把它 1:1 映射成控制面 route。

## 映射规则

解析器：`packages/@ooc/web/src/shared/ui/oocUri.ts`（`:29` `parseOocUri` / `:68` `isOocUri`）。前缀 `ooc://client/`（`:19` `CLIENT_PREFIX`）。

- `ooc://client/stones/<self>[/]` ↔ `/stones/<self>`（`oocUri.ts:56-58`）
- `ooc://client/flows/<sid>/<self>/pages/<name>` ↔ `/flows/<sid>/<self>/pages/<name>`（`oocUri.ts:46-52`）

**只处理 `ooc://client/...`**；其它任何形态返回 `null`——调用方降级为纯文本，不抛错不吞错（前缀不匹配 `:30`、非法 percent-encoding `:39`、空段 `:43`、不匹配两种形态 `:60`）。

## 为什么归 visible

ooc:// 是原生寻址 URI，visible 是把它落到"人类看得见的页面"的渲染层；二者 1:1 对应。stone 短链导航见 `packages/@ooc/web/src/app/routing.ts` `parseRoute` 的 `/stones/:objectId` 分支（`routing.ts:15`/`:94`）。

## agent-native parity 缺口（待设计）

ooc:// 让 Agent 能**寻址**自己的 UI 页面，但调用侧仍有 agent-native parity 缺口（`ui_methods` 仅经 HTTP `/call_method` 暴露给前端、agent 端无等价 tool 路径）——权威叙述与技术债定性见 self.md「已知问题」。
