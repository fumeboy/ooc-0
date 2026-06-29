---
title: P5 · InlineTalkComposer / onUserReply / selfObjectId prop 链清退
status: verified
date: 2026-06-29
follows: 2026-06-29-p4-context-snapshot-dead-union.md
priority: P5
landed_at: 2026-06-29
landed_commit: 2631de15
verified_at: 2026-06-29
---

# P5 · InlineTalkComposer / talk-reply prop 链清退

## 背景

P4 verified 后续工作:talk window 已退役 (后端无生产代码 + P4 删 union),但
`InlineTalkComposer / onUserReply / selfObjectId` 三个 prop 跨 7 文件的传递链仍存在
(死代码,永远不渲染)。P4 issue ## 后续 (留独立 issue) 第 1 项明确说留独立 issue 清退,
本 P5 兑现。

## 设计权威

`.ooc-world-meta/.../visible/self.md` ## 核心设计;talk window 已在 P4 退役。

## 改动 (8 文件 / -116/+18 行 / 净减 -98 行)

1. **ContextSnapshotViewer.tsx** (-85 行): 删 InlineTalkComposer 函数 + WindowDetail /
   NodeDetail / ContextSnapshotViewer 三处 props 接收的 selfObjectId / onUserReply +
   transcript 末尾的 InlineTalkComposer 渲染块
2. **FileViewer.tsx**: props 类型 + 解构 + 头注释 + ContextSnapshotViewer 调用站点删
3. **ThreadDetailTabs.tsx**: Props 接口 + 解构 + FileViewer 调用站点删
4. **ThreadInspectDetail.tsx**: props 类型 + 解构 + ThreadDetailTabs 调用站点删
5. **UserThreadHome.tsx**: props 接口 + 解构 + SessionThreadsIndex 调用站点删
6. **SessionThreadsIndex.tsx**: props 接口删 selfObjectId
7. **MainPanel.tsx**: props 类型 + 解构 + 3 个调用站点 (UserThreadHome / ThreadDetailTabs /
   FileViewer) 透传删
8. **shell.tsx**: MainPanel 调用站点删 selfObjectId / onUserReply

## 不动的 (留 P6+)

- **shell.handleSend / RightPanel.onSend / ChatComposer** — 另一条用户回复路径,
  与 InlineTalkComposer 无关,正常工作
- **ThreadInspectDetail.tsx** — 顺手发现是孤儿组件 (无生产 import,仅测试引用),
  可作 P6 候选清退

## 受影响设计元素

- `## visible` 维度: 视图层 dead-code 清退;不影响 visible/server / dynamic 路径等核心机制
- 无后端改动

## 风险与权衡

- **风险**: shell.tsx 第 469 行删 onUserReply 后,如果未来有需要 user 在中间面板回复
  的场景,需重新拉一条 prop 链 — 但这是新增功能的成本,不是 dead-code 必要支出
- **权衡**: ThreadInspectDetail 孤儿状态未一并清退 — 它是 60+ 行的独立组件,
  且测试里有引用,清退应有独立 review,P5 不夹带

## 验收

- typecheck → 0 error
- bun test packages/@ooc/tests/ → 215 pass / 0 fail (后端无回归)
- bun test web visible / SessionThreadsIndex → 31 pass / 0 fail
- web build → dist/main **915.86 KB**
- 8 files / -116 行 / +18 行 (净减 -98 行)

## 累计 P1 → P5 退潮数据

| Phase | dist/main | 差量 |
|---|---|---|
| P1 落地 | 937 KB | (起点) |
| P2d 退潮 | 924.86 KB | -12 KB |
| P3 死键/组件清退 | 918.98 KB | -6 KB |
| P4 union/transcript 清退 | 916.31 KB | -2.67 KB |
| **P5 prop 链清退** | **915.86 KB** | **-0.45 KB** |
| **累计** | | **-21.14 KB / -2.26%** |

## 后续 (留独立 issue)

1. ThreadInspectDetail 孤儿组件清退 (顺手发现)
2. addUserTalkWindow 后端 endpoint 是否还活 (跨前后端协同)
3. plan shape 漂移 (text→content / status enum)

## 验收 review (2026-06-29 verified)

acceptance reviewer 独立 A/B/C/D 4 维度全 ✅:
- A 文档: 8 files / -116/+18 行精确匹配 commit stat; self.md 现状如实记录;不动清单全部信守
- B 代码: InlineTalkComposer 函数 0 命中; 8 文件 props/解构/调用全清; typecheck 0 error;
  215 + 23 + 115 tests pass; dist/main 915.86 KB 字字符合
- C 退潮: 全仓搜 4 处命中全是 P5 落地说明注释,0 处生产引用; 8 files / -98 行净减对账
- D 漂移: handleSend / RightPanel / ChatComposer 全保留; ThreadInspectDetail 孤儿组件
  按 issue 不夹带; git diff 触及面=提案面

**顺手发现** (reviewer 报告): 1 个 web 测试 fail (`objects/query.test.ts:66 fetchSelfFirstLine`)
经回溯到 P4 落地后 = **预先存在**,与 P5 无因果关系。

**判定**: status verified
