---
title: S10 · permission_ask 机制裁决 — ooc-6 HITL 通路 vs 新设计权威
status: landed
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P0
---

# S10 · permission_ask 机制裁决

## 背景

来自总目录 `2026-06-29-web-server-reimpl-index.md` S10 项。

ooc-6 web 端含 **HITL(human-in-the-loop)permission 决议机制**:
- thread.events 中有 `permission_ask` event(toolCallId + question)
- LoopTimeline / chat 面板渲染 permission_card,用户 approve/reject
- POST `/api/runtime/flows/<sid>/<oid>/threads/<tid>/permission` 决议
- backend 翻 thread.status="running" + jobManager 重启 thread

**问题**:新 OOC 设计权威(`knowledge/index.md` / 各维度 self.md)中**完全未提此机制**:
- thinkable 章节描述 thinkloop 路径,没有"等用户授权"环节
- executable 章节描述 4 个 tool 原语(exec/close/wait/open),无 permission 闸
- reflectable 描述 super flow 反思机制,与 permission_ask 是不同的事
- collaborable 描述对话,无 HITL 通道
- app 描述 runtime job 编排,无 permission resolve 路径

这是一个 **ooc-6 → 当前设计** 的明显脱节,且影响多个其他桩点(C5/H1)。本 issue 是 **裁决先于实现**——决定 permission_ask 命运,后续 S1-S9 才能稳推。

## 现状

### ooc-6 web 端 permission 桩点

- `decideChatPermission` (chat/query.ts C5):POST `/api/runtime/flows/<sid>/<oid>/threads/<tid>/permission` body={ eventId?, action: "approve"|"reject" }
- `decideChatPermission` 在 LoopTimeline.tsx L167 用(H1)
- `threadHasPendingPermission` (chat/formatter.ts):检测 thread.events 是否含 pending permission_ask
- thread/model.ts:permission_ask event 类型定义
- chat/components/PermissionCard.tsx (推测,未实勘):渲染 approve/reject UI

### 当前 OOC 设计权威检索

实勘 `.ooc-world-meta/stones/main/objects/supervisor/`:

```
$ grep -rn "permission\|HITL\|human.in.the.loop\|approve.*reject\|approve/reject" \
    .ooc-world-meta/stones/main/objects/supervisor/ 2>/dev/null
```

(预期结果:很少或仅在 reflectable / pr 上下文中——reviewer approve/reject PR,不是 thread 内 tool call permission)

reflectable 维度 `pr` builtin 确实有 reviewer approve/reject(`/api/runtime/pr-issues/:id/resolve`,F1 已实现),但这是 **PR 评审**,**不是**单 tool call 用户确认。

## 改动提案(三条路径裁决)

### Path α · 退役 permission_ask 机制(推荐)

理由:
1. 新设计权威完全未提此机制 — 不属于 8 维度任一
2. OOC 哲学:"4 个 tool 原语恒定"(exec/close/wait/open),permission 不在内
3. agent 自主性 vs HITL 是两种范式 — OOC 走前者,permission_ask 拉回后者
4. 真要 HITL,有 super flow + talk(target="super") 通道(reflectable 已建)
5. 桩化时连带 ooc-6 web 大量 permission 相关代码当死代码处理

**对桩点的影响**:
- C5/H1 永远不实现,删 chat/query.ts 中 `decideChatPermission` 函数 + LoopTimeline 中 decide 逻辑
- chat/components/PermissionCard 删
- thread/model.ts 中 permission_ask event 类型删
- threadHasPendingPermission 删

**风险**:如果未来真需要 HITL(如危险 method 调用前用户确认),则需要重新设计——但**应该在那时按新设计**走,不延续 ooc-6 模式。

### Path β · 在新设计中加入 permission_ask 维度

把 HITL permission 明确化为 OOC 设计的一部分。需要:
1. 起独立 issue 把 permission_ask 加入 knowledge/index.md 某维度(候选:executable 加 permission 子段 / reflectable 扩 HITL gating / 新建非维度 module)
2. 重设计 method 调用流(method 注册时声明 require_permission?)
3. 实现 server 端:permission_ask event 生成 / decide endpoint / job-manager 与 permission 联动

**工作量**:1-2 天纯设计 + 2-3 天实现。

### Path γ · 暂搁(桩点继续抛 TODO,等业务驱动需求出现)

不裁决、不实现。C5/H1 继续抛 TODO,web 上对应 UI 元素显示错误状态。等真正业务需求出现(如 reflectable 需要 HITL gating)再回来按那时设计走。

**风险**:web 端这部分 UI 一直不能用,降低控制面价值。

## 推荐裁决

**Supervisor 强烈推荐 Path α(退役)**:

1. 符合 OOC 哲学(克制熵增、警惕新增名词、复用先于新引入)
2. 设计权威已明确(super flow 是反思/HITL 通道,permission_ask 是另一套机制)
3. ooc-6 桩点连带的 UI 代码作死代码删除,不留半态

## 受影响设计元素

对照 `knowledge/index.md`:

- 若选 Path α:无影响(本就不在设计权威内)
- 若选 Path β:**触动 executable 或 reflectable 维度核心契约**,需 fan-out 该维度对象 reviewer + 完整性批评官

## 风险与权衡

- Path α 风险:**完全删除 ooc-6 web 中所有 permission 相关 UI/代码**——LoopTimeline.tsx L167 permission decide handler / chat/PermissionCard / thread events 中 permission_ask 处理。如果用户后期想恢复 HITL,得重新做 UI(但**应该**重新做,不该用 ooc-6 旧 UI 复活)。

- Path β 风险:引入新名词增加复杂度;OOC 哲学谨慎对待。

## 待裁决点

**1. 选 Path α / β / γ?**

(默认推荐 Path α,等用户回来确认)

## review 记录

(待 fan-out:object 维度 reviewer + reflectable 维度 reviewer + 完整性批评官)

## 裁决

**用户裁决(2026-06-29)**: **Path α 退役 + 保留桩位**

> "permission_ask 退役,之后系统设计稳定后再加入"

精确落地策略:**永久死代码而非物理删除**——保留 type signature + 函数桩位,运行时永不命中:
- `decideChatPermission()` (chat/query.ts) 改 TODO 描述为 "[退役] permission_ask 机制在新 OOC 设计权威中无对应位置(4 tool 原语恒定);用户裁决 S10 退役;系统设计稳定后另起 issue 重新评估 HITL 通路"
- `threadHasPendingPermission()` (chat/formatter.ts) 永返 false,UI 中 permission card 永不展示
- LoopTimeline / chat formatter / model.ts / endpoints.ts 中 permission 相关代码保留为 dead branch(不破坏现有 tsx 编译;运行时永不触发,因 backend 不再产 permission_ask event)
- 未来恢复 HITL 时:重新设计协议后,只需 unstub decideChatPermission + 改 threadHasPendingPermission 返回真值即可——**UI 路径已就位,不必再写**

这套退役策略**符合 OOC「克制熵增、复用先于新引入」哲学**——dead code 比物理删除更可控,设计稳定后激活成本极低。

## 落地验收

(landed,2026-06-29):
1. ✅ `decideChatPermission` TODO 描述标[退役]
2. ✅ `threadHasPendingPermission` 改返恒 false + JSDoc 注释退役
3. ✅ UI 代码保留(dead branch,运行时永不命中)
4. ✅ 后端永不产生 permission_ask event(本 issue 不要求 backend 改,直接通过"backend 不实现 endpoint"自然兜底)
5. ✅ verify 全绿(`bun run verify`)
6. 未来恢复:HITL 设计 issue 立项 + 重新对齐 endpoint 协议 + unstub query.ts + 改 threadHasPendingPermission
