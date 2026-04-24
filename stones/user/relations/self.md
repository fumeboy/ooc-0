---
summary: 和 user 沟通时，优先清晰交付结果；必要时用报告文档、交互 View 和导航卡片承载复杂产出
tags: [presentation, delivery, user-experience]
last_updated: 2026-04-24
updated_by: codex
---

# 和 user talk 时的呈现规范

这个文件是 user 对所有 OOC Object 的沟通偏好声明。任何对象准备 `talk(target="user")` 或 `talk(target="this_thread_creator")` 且创建者是 user 时，都应优先遵守这里的呈现方式。

## 基本原则

- 先给结论，再给必要细节。
- 直接回答当前问题，不把内部过程当作主要内容。
- 重要文件、报告、交互页面要用可点击导航卡片引导 user 查看。
- 需要 user 决策时，用结构化选项或清晰的问题，不让 user 猜下一步。
- 如果交付后还要等待 user 输入，提交 talk 时使用 `wait=true`。

## 两类可选产出

### 1. 报告文档

适合：

- 纯信息汇报，无需 user 立即决策。
- 需要永久记录的结果。
- 可被别的对象作为知识引用的材料。

推荐路径：

- Stone 级：`stones/{object}/files/reports/{reportName}.md`
- Flow 级：`flows/{sessionId}/objects/{object}/files/reports/{reportName}.md`

写入后，在消息末尾附导航卡片：

```text
[navigate title="任务报告" description="本次任务的完整报告"]
ooc://file/flows/{sessionId}/objects/{object}/files/reports/result.md
[/navigate]
```

### 2. 交互 View

适合：

- 需要 user 提交表单、打分、反馈。
- 需要动态图表、可点击列表或多步引导。
- 希望 user 点击或输入后唤醒对象继续思考。

推荐路径：

```text
flows/{sessionId}/objects/{object}/views/{viewName}/
├── VIEW.md
├── frontend.tsx
└── backend.ts
```

消息末尾附导航卡片：

```text
[navigate title="反馈表单" description="请花 30 秒为本次结果打分"]
ooc://view/flows/{sessionId}/objects/{object}/views/feedback/
[/navigate]
```

## 选择规则

| 场景 | 推荐呈现 |
|---|---|
| 简短回答、无需留档 | 直接 talk 文本 |
| 纯汇报、需要留档 | talk 摘要 + 报告文档 |
| 需要 user 输入 | talk 问题 + 结构化 form，或交互 View |
| 动态展示、复杂数据 | 交互 View |
| 多步引导 | 交互 View + notifyThread 唤醒线程 |

## 用户提交后的闭环

当 user 在 View 中提交表单时：

- `ctx.setData(...)` 保存输入。
- `ctx.notifyThread(msg)` 向线程 inbox 写入 system 消息。
- 对象会收到 inbox 消息，并基于 user 输入继续思考。

这让“对象 → user → 对象”的闭环无需 user 手动再发起一轮 talk。

## 注意

- 导航卡片的 `title` 和 `description` 面向人类 user，必须短、清楚、可读。
- 生成 View 后，应验证 `frontend.tsx` / `backend.ts` 可编译。
- 不要把大量内部日志直接塞进 talk 消息；复杂内容应放入报告或 View。
