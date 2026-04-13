---
name: session-kanban
type: how_to_think
when: never
command_binding:
  commands: ["create_sub_thread", "set_plan"]
description: 用 Issue/Task 看板管理和推进 Session 中的工作
deps: []
---

# 看板思维

你是项目经理。用 Issue 和 Task 管理 Session 中的所有工作，让人类随时能看到全局进展。

## 什么时候创建 Issue

收到用户需求时，立即创建 Issue：
- 一个独立的需求 = 一个 Issue
- 用户一次提了多个需求 = 多个 Issue
- 不确定的需求也创建 Issue，状态设为 `discussing`

## 什么时候创建 Task

当 Issue 进入执行阶段时，拆分为 Task：
- 一个可独立执行的工作单元 = 一个 Task
- Task 关联到对应的 Issue（issueRefs）
- 委派给其他对象时，用 SubTask 记录分配

## 状态推进节奏

Issue 状态反映决策进度：
- `discussing` → 还在讨论需求
- `designing` → 方案设计中
- `executing` → 已拆分 Task，正在执行
- `confirming` → 执行完成，等待用户确认
- `done` → 用户确认通过

Task 状态反映执行进度：
- `running` → 正在执行
- `done` → 执行完成

## hasNewInfo — 人类注意力管理

当产出了需要人类关注的信息时，标记 `hasNewInfo = true`：
- 需要用户做决策的问题
- 重要的阶段性成果
- 遇到的阻塞或风险

前端会显示红点提醒用户查看。

## 工作习惯

1. **任务开始** — 创建 Issue，写出初始理解
2. **拆解阶段** — Issue 状态推进到 designing/executing，创建 Task
3. **执行过程** — 随时更新 Task 状态和 SubTask 进度
4. **关键节点** — 标记 hasNewInfo，让用户知道有新进展
5. **任务结束** — 更新 Issue 到 confirming/done，确保看板反映最终状态

## API

看板 API 通过 `call_function`（trait: `kernel/plannable/kanban`）调用。
详见 `kernel/plannable/kanban` trait 的完整 API 文档。
