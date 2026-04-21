---
namespace: library
name: lark/event
type: how_to_use_tool
version: 1.0.0
when: never
description: >-
  飞书事件订阅：通过 WebSocket 长连接实时监听飞书事件（消息、通讯录变更、日历变更等），输出 NDJSON 到 stdout，支持 compact
  Agent 友好格式、正则路由、文件输出。当用户需要实时监听飞书事件、构建事件驱动管道时使用。
deps: []
---
# event (v1)

> **前置条件：** 先阅读 [`../lark-shared/readme.md`](../lark-shared/readme.md) 了解认证、权限处理和安全规则。

## Shortcuts（推荐优先使用）

Shortcut 是对常用操作的高级封装（`lark-cli event +<verb> [flags]`）。有 Shortcut 的操作优先使用。

| Shortcut | 说明 |
|----------|------|
| [`+subscribe`](references/lark-event-subscribe.md) | Subscribe to Lark events via WebSocket long connection (read-only, NDJSON output); bot-only; supports compact agent-friendly format, regex routing, file output |
