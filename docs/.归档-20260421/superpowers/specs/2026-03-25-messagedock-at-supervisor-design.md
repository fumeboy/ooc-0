<!--
@ref docs/哲学文档/meta.md — extends — 子树 6 Web UI 架构
@ref kernel/web/src/features/MessageSidebar.tsx — designs — MessageDock 改造
@ref kernel/src/context/builder.ts — designs — Supervisor 全局消息注入
-->

---

## 概述

三项改动：
1. MessageDock 去边框（更灵动的视觉）
2. MessageInput 支持 @对象 自动补全（指定消息目标）
3. Supervisor context 注入全局消息时间线（信息对等）

## 1. MessageDock 去边框

**文件**: `kernel/web/src/features/MessageSidebar.tsx`

- 容器：移除 `border-l border-[var(--border)]`
- Header：移除 `border-b border-[var(--border)]`
- MessageInput 外层：移除 `border border-[var(--border)]`，聚焦时用 `ring-1 ring-[var(--ring)]` 替代

## 2. MessageInput @对象自动补全

**文件**: `kernel/web/src/features/MessageSidebar.tsx`

**交互流程**:
1. 输入 `@` 触发下拉浮层（输入框上方）
2. 显示对象列表（从 `/api/stones` 缓存），支持模糊搜索
3. 选择后设置 target 状态，输入框显示 `@sophia` tag
4. 发送时用 target 替代默认的 supervisor
5. 不选 @ 则默认 supervisor

**UI**:
- placeholder 动态变化：`给 supervisor 发消息...` / `给 sophia 发消息...`
- 已选对象显示为可删除的 tag（点击 x 清除，回退到 supervisor）
- 下拉最多 6 项，模糊匹配

**API 调用变化**:
- `talkTo(target, msg, resumeFlowId)` 中 target 从固定 "supervisor" 改为动态值

## 3. Supervisor 全局消息时间线

**文件**: `kernel/src/context/builder.ts`

**方案**:
- `buildContext` 中检测 `stone.name === "supervisor"` 且 `sessionDir` 存在
- 读取 `sessionDir/flows/*/data.json` 的 messages 数组
- 去重（同一条消息可能在 sender 和 receiver 的 flow 中都有）
- 按 timestamp 排序
- 格式化为 `_session_messages` knowledge window：
  ```
  [HH:MM:SS] from → to: content（截断到 200 字）
  ```
- 保留现有 `_session_overview`，新增 `_session_messages`
