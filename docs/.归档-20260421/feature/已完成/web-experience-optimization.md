# Web 体验优化（Candy 体验报告修复）

<!--
@ref kernel/web/src/features/WelcomePage.tsx — implemented-by — 系统介绍+对象概览
@ref kernel/web/src/features/SessionsList.tsx — implemented-by — New Session 修复
@ref kernel/web/src/components/ui/MarkdownContent.tsx — implemented-by — HTML 注释过滤
@ref kernel/src/server/server.ts — implemented-by — 会话列表去噪
-->

## 背景

2026-04-08 Candy（Web 端体验测试者）对 OOC Web 界面进行了全面体验测试，
产出体验报告（`user/.temp/体验报告-2026-04-08.md`），发现 8 个问题。

本次修复覆盖 2 个 HIGH + 4 个 MEDIUM 问题。

## 修复清单

### HIGH-1: New Session 按钮不切换主区域

**问题**：从 Stones 页切回 Flows 点 New session，右侧主区域不更新。
**根因**：`useEffect([activeId])` 中清空 activePath/tabs 的条件依赖 `activeTab === "flows"`，跨 tab 时不满足。
**修复**：SessionsList 的 New session onClick 同时清空 activePath + tabs，不依赖 activeTab。

### HIGH-2: 线程树 Process 可视化

详见 `thread-tree-process-visualization.md`。

### MEDIUM-3: WelcomePage 缺新手引导

**问题**：首页只显示 "What would you like to do?"，新用户不知道系统是什么。
**修复**：WelcomePage 增加系统介绍文案 + 对象概览卡片（从 objectsAtom 读取，展示名称和 talkable.whoAmI）。

### MEDIUM-4: Readme HTML 注释暴露

**问题**：sophia Readme 顶部 `<!-- @ref ... -->` 直接显示给用户。
**修复**：MarkdownContent 渲染前用正则 `<!--[\s\S]*?-->` 过滤所有 HTML 注释。

### MEDIUM-5: 会话列表重复噪音

**问题**：大量 `[系统通知]` 前缀消息混杂，无法区分会话。
**修复**：后端 getSessionsSummary 的 firstMessage 优先选非 `[系统通知]` 开头的 in 消息。

### MEDIUM-6: Stones 空状态提示语

**问题**：显示 "Select a file from the sidebar"，暴露实现细节。
**修复**：改为 "从侧边栏选择一个对象查看详情"。

## 未修复（LOW）

- 对象列表缺摘要 — 已通过 WelcomePage 对象卡片间接解决
- 控制台 404 错误 — kanban readme/issues/tasks 资源缺失，不影响核心功能

## 关键文件

| 文件 | 变更 |
|------|------|
| `kernel/web/src/features/SessionsList.tsx` | New session onClick 清空 activePath/tabs |
| `kernel/web/src/features/WelcomePage.tsx` | 重写，增加系统介绍+对象概览 |
| `kernel/web/src/components/ui/MarkdownContent.tsx` | 增加 stripHtmlComments |
| `kernel/web/src/App.tsx` | 空状态提示语改中文 |
| `kernel/src/server/server.ts` | firstMessage 过滤系统通知 |
