# docs/issues —— 系统设计调整 issue

每次 OOC 系统设计调整在此留一份 issue 文档：记录提案、受影响设计元素、review 意见与最终裁决。完整流程见 supervisor `knowledge/design-workflow.md`。**涉及源代码变更的 issue 在源码仓 `.worktree/<slug>` 新建 worktree 分支隔离开发。**

## 命名

`YYYY-MM-DD-<slug>.md`，slug 用 kebab-case 概括主题（如 `2026-06-21-thread-window-projection-axis`）。

## 状态

frontmatter `status` 字段流转：`draft`（起草中）→ `in-review`（fan-out 设计 review 中）→ `decided`（已裁决待落地）→ `landed`（已落地并回流一致性，待验收）→ `verified`（落地验收 review 确认文档/代码如约改造，闭环完成）。

旁支终态 `superseded`：本 issue 在 `decided` 前被后起 issue 完整覆盖、不再独立推进。frontmatter 须配 `superseded_by:` 字段指明继承者（issue 路径或一句话说明）；用于保留历史推理痕迹、不再走落地与验收。

## 模板

```markdown
---
title: <一句话标题>
status: draft
date: YYYY-MM-DD
---

# <标题>

## 背景 / 动机
为什么要改。

## 现状
当前设计怎么说的（锚 `knowledge/index.md` 对应 `##` 节 / 对应维度 self.md）。

## 改动提案
要改成什么。

## 受影响设计元素
对照 `knowledge/index.md` 的 `##` 元素清单，逐一列出本次改动触及的设计元素——这份清单驱动 review fan-out。

- `## <元素>` —— 受影响点
- ...

## 风险与权衡
可能引入的矛盾、跨维度连锁、退役遗留。

## 待裁决点
需要 Supervisor 拍板的分叉。

## review 记录
（fan-out 后由 Supervisor 汇总各 reviewer + 完整性批评官意见）

## 裁决
（最终方案 + 落地与一致性回流清单；涉及源代码变更则记录 `.worktree/<slug>` worktree 分支）

## 落地验收
（`landed` 后由 Supervisor 汇总验收 reviewer 意见：文档/代码是否如约改造、回流是否漏一边、退役是否清干净、有无提案外漂移；缺口补完则标 `verified`）
```
