---
title: P3 · BUILTIN_VISIBLE 死键修正 + 死类型组件清退
status: verified
date: 2026-06-29
follows: 2026-06-29-p2-builtin-visible-self-hosted.md
priority: P3
landed_at: 2026-06-29
landed_commit: e97aa88c
verified_at: 2026-06-29
---

# P3 · 死键 / 死类型清退

## 背景

P2 verified 后续推进剩余 4 个 builtin (method_exec / feishu_chat / feishu_doc / talk) 迁
self-hosted visible 的工作。深度勘探后发现 4 个**都不是真的可迁 builtin**:

| BUILTIN_VISIBLE key | 后端 OOC class 字面值 | 状态 |
|---|---|---|
| `method_exec` | `_builtin/agent/method_exec_form` (全名) | **死键** (key 命名漂移,永远命中不到) |
| `feishu_chat` | (后端无生产代码) | **死类型** |
| `feishu_doc` | (后端无生产代码) | **死类型** |
| `talk` | (后端无生产代码) | **死类型** |

3 个死类型是 ooc-6 旧设计的 web 端类型镜像;后端 `grep "class:"feishu_chat""` 等
**全无匹配**。method_exec 是 key 不匹配 bug(BUILTIN_VISIBLE 用短名,后端发全名)。

所以 P3 工作从"迁移"重新框定为"退潮 + bug fix":
1. method_exec key 改 OOC class 全名 `_builtin/agent/method_exec_form`
2. 删 3 个死类型组件文件 (FeishuChat/FeishuDoc/Talk WindowDetail.tsx)
3. BUILTIN_VISIBLE 从 4 槽 → 1 槽

## 设计权威

`.ooc-world-meta/.../children/visible/self.md` ## 核心设计
P2 issue: `docs/issues/2026-06-29-p2-builtin-visible-self-hosted.md`

## 改动

### 1. BUILTIN_VISIBLE 唯一保留 = method_exec_form (全名 key)

UI 留 web 端 (不迁 builtin self-hosted):MethodExecWindowDetail 强依赖 CodeMirror /
FileEditDiffView 等 web 包基础设施,迁 builtin 违反 P2b 的 "builtin 不依赖 @ooc/web 包"
裁决;form UI 本质是 thread context viewer 的横切关注 (不像 todo/file 那样属某 builtin
自身身份),留 web 端合理。

### 2. 3 个死类型组件文件清退

`packages/@ooc/web/src/domains/files/components/visible/` 删:
- FeishuChatWindowDetail.tsx
- FeishuDocWindowDetail.tsx
- TalkWindowDetail.tsx

BUILTIN_VISIBLE 移除 3 个槽位后,这 3 个组件**没人 import**,安全删除。

### 3. 测试更新

builtin-visible-registry.test.ts:
- assert: BUILTIN_VISIBLE.size === 1, 仅 `_builtin/agent/method_exec_form`
- assert: 4 个旧短名死键全部 undefined

## 受影响设计元素

- `## visible` 维度 (self.md):静态注册表退潮终态接近 — 仅留 1 项 (P4 候选迁移 / 整体退役)
- 无后端代码改动 (无后端 OocClass / module 变更);只是 web 端 UI 端 dead-code 清理

## 风险与权衡

- **风险 1**:web 端 ContextWindow union 仍含 `class: "feishu_chat" / "feishu_doc" / "talk"`
  三个分支 + 43 处消费方引用 (ContextSnapshotViewer 内联渲染 / SessionThreadsIndex 内
  talk thread 列表 / chat/formatter / chat/model 等)。这些消费方实际跑不到 (后端不生产
  这些 class 字面值),是更大半径的 dead-code。本 issue **不动**这些 — 触动 web 多模块,
  另起 P4 退潮 issue (见 ## 后续)。
- **权衡**:method_exec_form UI 是否要迁 builtin self-hosted? 否 — 见 "## 改动 1"。

## 后续 (留独立 issue)

1. **P4 (建议起):web 端 ContextWindow union dead-type 退潮** — 删 feishu_chat /
   feishu_doc / talk 三个 union 分支 + 43 处消费方清理 (含 ContextSnapshotViewer
   内联渲染 / SessionThreadsIndex / chat/formatter 等)
2. web ContextWindow union 的 plan shape 漂移 (text→content / status enum) 清理
3. ObjectClientRenderer vs resolveWindowVisible 两份 dynamic 实现的统一
4. P2 + P3 整体 acceptance review

## 验收

- bun test web visible/__tests__ → 12 pass / 0 fail
- bun test 后端 → 215 pass / 0 fail (无回归)
- web build → dist/main 918.98 KB / 10.13s (**比 P2d 的 924.86 KB 再缩 ~6KB**,
  3 死组件 + 1 死键的物理 footprint 真减小)
- 5 files changed / -294 行 / +35 行
- 累计 build size 缩减 (vs P1 落地): 937 KB → 918.98 KB,**约 -2%** 退潮信号

## 验收 review (2026-06-29 verified)

P3 与 P2 双 issue 一起派独立 acceptance reviewer 走 A/B/C/D 4 维度核对,
A 文档 / B 代码 / C 退潮 / D 漂移 全部 ✅,无阻塞缺口。

P3 特定验收点 (B.5 / C.2 / C.3 / C.4 / D.3 在 reviewer 报告):
- BUILTIN_VISIBLE 仅 1 项 `_builtin/agent/method_exec_form` (全名 key)
- 3 个死类型组件 (FeishuChat / FeishuDoc / Talk WindowDetail.tsx) 全部删除,find 结果 0 个
- 4 个旧短名死键全仓 0 命中 (test 用 for 循环命中 undefined 不命中 grep)
- context-snapshot.ts 3 个 dead union 分支保留 (本 issue 明确说留 P4,reviewer 确认未夹带)

**判定**: status verified

详细 reviewer 报告: P2 issue ## 验收 review 段 (P2 + P3 双验收同源)。
