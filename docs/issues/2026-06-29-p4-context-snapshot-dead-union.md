---
title: P4 · context-snapshot dead union 清退 (do/talk/feishu_chat/feishu_doc)
status: verified
date: 2026-06-29
follows: 2026-06-29-p3-dead-keys-and-types-cleanup.md
priority: P4
landed_at: 2026-06-29
landed_commit: e46af0c2
verified_at: 2026-06-29
---

# P4 · context-snapshot dead union 清退

## 背景

P3 verified 后 acceptance review 顺手发现 #2: web 端 `ContextWindow` union 含
4 个死类型分支 (do / talk / feishu_chat / feishu_doc),后端**无生产代码**生成这些
class 字面值。P3 issue 明确说留 P4 独立 issue 清退,本 issue 兑现。

死类型来源:
- `do` — issue B 已退役 (合并入 talk)
- `talk` — 后端 `method.talk.ts` 现在生成 thread (class: `_builtin/agent/thread`),
  不生成 `class: "talk"` window
- `feishu_chat` / `feishu_doc` — ooc-6 旧设计的 web 端类型镜像,feishu_app builtin
  现在只是 tool-object 形态,不生成此类 window

## 设计权威

`.ooc-world-meta/.../visible/self.md` ## 核心设计 (visible 维度);ooc-6 → ooc-7
迁移后 do/talk window 已不存在,context-snapshot union 是技术债。

## 改动

### 1. context-snapshot.ts — 主战场 (-203 行净减)

- Union 删 4 个 dead 分支 (do / talk / feishu_chat / feishu_doc)
- windowBadge / windowSummary / windowCharCount / WINDOW_TYPE_ORDER 各 switch case 清退
- 删 DoWindowShape / TalkWindowShape type alias
- 删 filterMessagesForDoWindow / filterMessagesForTalkWindow 两个 helper
- collectWindowConsumedMessageIds 简化为返回空集 (无 window 收纳消息,顶层 inbox/outbox 兜底)
- buildWindowNode 内 do/talk transcript 收纳块整体删

### 2. chat/model.ts — Union 镜像 (-23 行)

删 do / talk 两个分支 (chat 视图更小 union 镜像)

### 3. ContextSnapshotViewer.tsx — Talk window 内联交互死代码

删 InlineTalkComposer 渲染 + ICON map 4 个映射 + MessageSquare unused import。
InlineTalkComposer / onUserReply prop 链跨 5 文件仍保留 (本 P4 范围已大,留独立 issue)。

### 4. RightPanel.tsx — isUserOwnedOrCreated 兼容路径

旧 thread.json 缺 creatorObjectId 时 fallback 看 talk creator window 的死路径,删除。

### 5. SessionThreadsIndex.tsx — TalkWindow filter

TalkWindow type alias + talkWindows filter 改空数组 (恒空)。isEmptySession /
addUserTalkWindow 调用栈保留。

### 6. chat/formatter.ts — talk window targets

talkWindowTargets 索引改空 Map (恒空)。

## 不清退的同名引用 (语义不同)

- `RelationOverlay.tsx` 的 `RelationKind = "talk"` — relation 语义,跟 window class 同名
- `chat/formatter.ts` 的 `message.source === "talk"` — message 来源字段

## 受影响设计元素

- `## visible` 维度:web 端 type union 与后端 ContextWindow class 实际生产值对齐
- 无后端 OocClass / module 改动;纯 web 端 dead-code 清理

## 风险与权衡

- **风险**: 旧 thread.json 反序列化时如果包含 do/talk window (例如 ooc-6 时代落盘的快照),
  现在前端 union 不识别这些类型 → 经 default fallback 用 title 兜底渲染。这是预期行为
  (废弃类型不该再有可识别 UI);若有具体回归需求,可后续加迁移工具。
- **权衡**: InlineTalkComposer / onUserReply 链未一并清退 — 跨 ThreadDetailTabs /
  UserThreadHome / FileViewer / ContextSnapshotViewer 等 5 文件,半径大于本 P4,
  留独立小 issue 处理。

## 验收

- typecheck → 0 error
- bun test packages/@ooc/tests/ → 215 pass / 0 fail
- bun test web visible/__tests__ → 12 pass / 0 fail
- web build → dist/main **916.31 KB**
- 6 files / -238 行 / +33 行 (净减 -205 行)

## 累计 P1 → P4 退潮数据

| Phase | dist/main | 差量 |
|---|---|---|
| P1 落地 | 937 KB | (起点) |
| P2d 退潮 | 924.86 KB | -12 KB |
| P3 死键/组件清退 | 918.98 KB | -6 KB |
| P4 union/transcript 清退 | 916.31 KB | -2.67 KB |
| **累计** | | **-20.7 KB / -2.2%** |

## 后续 (留独立 issue)

1. InlineTalkComposer / onUserReply prop 链清退 (跨 5 文件)
2. addUserTalkWindow / 后端 stale endpoint 同步退潮 (后端协同)
3. plan shape 漂移 (text→content / status enum) 清理

## 验收 review (2026-06-29 verified)

acceptance reviewer 独立核对 A/B/C/D 4 维度全 ✅:

- A 文档: 6 files / +33/-238 行精确匹配 (RightPanel 1+/4- / formatter 2+/7- /
  chat/model 0+/23- / ContextSnapshotViewer 4+/19- / context-snapshot 23+/180- /
  SessionThreadsIndex 3+/5-);同名语义保留点 (RelationKind / message.source) 真保留
- B 代码: ContextWindow union 0 命中 4 个死分支,剩 9 个 active;helper / type alias
  全删;质量门 typecheck 0 error / 215 后端 + 12 web visible tests pass / web build
  dist/main 916.31 KB
- C 退潮: web/src 非 test 内 4 死类型字面值在生产代码 0 命中,仅保留 RelationKind +
  message.source + P4 comment 注释;commit stat 6 files / -238/+33 一字不差
- D 漂移: onUserReply prop 链跨 5 文件按提案保留未顺手清退;RelationOverlay 三处
  "talk" 全留;无提案外偏差

**判定**: 无阻塞缺口 → status verified
