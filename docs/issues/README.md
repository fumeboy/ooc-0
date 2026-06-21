# docs/issues —— 系统设计调整 issue

每次 OOC 系统设计调整在此留一份 issue 文档：记录提案、受影响设计元素、review 意见与最终裁决。完整流程见 supervisor `knowledge/design-workflow.md`。

## 命名

`YYYY-MM-DD-<slug>.md`，slug 用 kebab-case 概括主题（如 `2026-06-21-thread-window-projection-axis`）。

## 状态

frontmatter `status` 字段流转：`draft`（起草中）→ `in-review`（fan-out review 中）→ `decided`（已裁决待落地）→ `landed`（已落地并回流一致性）。

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
（最终方案 + 落地与一致性回流清单）
```
