---
title: S6 · thread 详情 + thread list(per session)
status: draft
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P1
---

# S6 · thread 详情 + thread list

## 背景

来自总目录 S6 项。桩点 **3 个**:C1(fetchThread 单 thread 详情)+ C4(fetchSessionThreads list)+ C6(fetchSessionThreadsFull 扩展 shape)。

当前生产 server 已实现 `GET /api/runtime/threads/<sessionId>`(已含粗 list)— S6 在此基础上补**单 thread 详情**与**扩展 list shape**。

## 设计权威锚

- **`## thread`(index.md §E)**:thread 是 agent 一次智能运行的载体,持 transcript(messages 数组,按 entry.author 标 caller/callee)+ events + contextWindows
- **`## collaborable`**:thread 按视角投影成会话窗(default/self/super)— web 控制面以 user-as-caller 视角 = default

## 改动提案

### endpoint 设计

**`GET /api/flows/<sid>/<oid>/threads/<tid>`** (单 thread 详情,新):
- response: 完整 `ThreadContext`
- 含 messages / events / contextWindows / status / lastExecutedAt 等

**`GET /api/flows/<sid>/threads`** (list per session,新):
- 替代 `GET /api/runtime/threads/<sid>`(后者 backward compat 一段时间,可加 X-Deprecated header)
- response: `{ items: Array<{ objectId, threadId, ... + title? + lastEventAt? + hasPendingPermission?(若 S10 选 α 删该字段) }> }`
- 含 status / messageCount / eventCount(已在当前 list)+ 扩展字段

### 实现位置

`app/server/modules/flows/api.threads.ts`:
- GET threads list(替代 /api/runtime/threads)
- GET thread detail

老 endpoint `/api/runtime/threads/:sessionId` 可保留(添 X-Deprecated)或直接退役,取决于其他消费方。

### test

`tests/flows-threads.test.ts`:
- POST 创 thread 后,GET threads list 含它
- GET thread detail 含 messages + events + contextWindows
- list extended fields(title 派生自 self.md 第一行 / lastEventAt / 等)

## 落地 commit

1. `feat(server/flows): GET threads + GET thread/<tid> detail`
2. `feat(web/chat): 解桩 C1/C4/C6`
3. `test`

## 受影响设计元素

- `## app` server module
- `## thread`:确认 web 视角 ThreadContext 暴露形态(messages + events + contextWindows + status)是设计权威范围

## 风险

- ThreadContext 含 `contextWindows: OocObjectRef[]` — backend 直接 JSON 序列化 + 前端消费时是否有循环引用 / 闭包风险?**需 review 数据 shape 安全性**。

## 待裁决点

1. **`hasPendingPermission` 字段是否保留?** — 看 S10 裁决(若 α 退役,该字段从扩展 shape 中删)
2. **list 扩展字段 title 派生策略?** — 推荐复用 self.md 第一行 logic(类似 displayName)

## review/裁决/验收 见总目录 workflow
