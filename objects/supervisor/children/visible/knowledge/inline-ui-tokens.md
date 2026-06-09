---
title: inline UI tokens — Object 在消息文本里嵌可交互组件
description: [[ui{...}ui]] token 语法、注册组件、失败回退与渲染入口；Object 只产 token 文本，前端集中 dispatch（零 dangerouslySetInnerHTML）
activates_on:
  "object::root": "show_content"
---

# inline UI tokens

Object 向 user 发消息时，可在文本里嵌 `[[ui{"comp":"<name>",...}ui]]` token，让前端渲染成可点击 / 可交互的 inline 组件，而不只是纯文本。**Object 只产 token 文本，前端集中 dispatch 渲染**——不让 Object 写 HTML，杜绝 XSS（零 `dangerouslySetInnerHTML`）。这是 visible 维度的「Object 自有内容如何被渲染」在消息流里的延伸。

## 语法

- `[[ui` 起首、`ui]]` 结束。
- 中间是**严格 JSON 对象**（key 必须双引号），`comp` 字段指定组件名，其余字段是该组件 props。
- 一条消息任意多个 token，与普通文本混排。

## 已注册组件

`InlineUiComponent` dispatch（`packages/@ooc/web/src/shared/ui/InlineUiContent.tsx:91`）：

- **file-link**（`:92`，`FileLinkInline` `:101`）——必选 `path`、可选 `label`；渲染 React-Router `<Link>` 跳 file viewer。关键：用 `useLocation()` 读当前 thread 上下文（query string 的 `sessionId/objectId/threadId`，`:124`）拼到 file URL，让 RightPanel 的 chat 跨文件查看持续显示。
- **follow-ups**（`:93`，`FollowUpsInline`）——渲染后续操作组。

## 失败回退（fail-soft）

- JSON 解析失败 → 原文按字面文本展示。
- 缺 `comp` 字段 / `comp` 非 string → 同上（`InlineUiContent.tsx:49`）。
- 未知 `comp` → 渲染 `<code className="inline-ui-unknown">[unknown ui: <comp>]</code>` 占位（`:95`）。

## 渲染入口

`TuiBlock` 渲染 `line.kind === "message"` 时走 `InlineUiContent`（`:71`）而非直调 MarkdownContent：fast path（无 `[[ui` 子串）退回 MarkdownContent；含 token 时 `parseInlineUiSegments`（`:28`）切成 `[text, ui, text, ...]` 段分别渲染。样式 `.inline-ui-*` 在 web styles。测试 `InlineUiContent.test.ts`。

## 协议来源与扩展

约定的权威文本是 user 对象的 `readable.md`（inline-ui 语法注册表）——Object 在 super flow 注入 LLM context 时读它学这套语法。加新组件只需在 `InlineUiComponent` switch 加一条 case + 更新 user 对象 `readable.md` 的注册表，Object 端零改动；都走同一通道，零 `dangerouslySetInnerHTML`。
