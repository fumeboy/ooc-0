# llm.input XML 非法

> 类型：bugfix
> 创建日期：2026-04-24
> 状态：finish
> 负责人：Codex

## 背景 / 问题描述

前端打开 `llm.input.txt` 时，结构树出现 `system(parse-error)` / `user(parse-error)`，右侧内容显示类似 `<system><system>...` 的非法 XML。用户截图指向 `flows/.../objects/supervisor/threads/.../llm.input.txt`，说明当前 viewer 或生成链路仍会把调试输入渲染成 DOMParser 无法解析的结构。

## 目标

`llm.input.txt` 在前端结构化查看器中稳定解析，不再出现 `parse-error`；已有历史文件和新生成文件都应尽可能可读。

## 方案

先调研 `kernel/src/thread/engine.ts` 的 `llm.input.txt` 写出格式与 `kernel/web/src/features/LLMInputViewer.tsx` 的切块/解析逻辑，补充复现测试后最小修复。初步判断需要处理“角色头 + XML 内容”以及可能的重复包装/多根 XML。

## 影响范围

- 涉及代码：`kernel/src/thread/engine.ts`、`kernel/src/thread/xml.ts`、`kernel/web/src/features/LLMInputViewer.tsx`、相关测试
- 涉及文档：本迭代文档
- 涉及基因/涌现：无

## 验证标准

- 针对 `llm.input.txt` 切块与 XML 解析新增/更新测试，覆盖 `--- system ---`、顶层 `<system>/<user>`、重复包装等场景。
- 运行相关 `bun test` / `bun tsc` 或前端构建验证。
- 修复后打开同类 `llm.input.txt` 不再产生 `system(parse-error)` / `user(parse-error)`。

## 执行记录

- 2026-04-24 15:54：已创建迭代项并从 `todo/` 移入 `doing/`。开始按系统化调试 + TDD 排查：先复现 parse-error，再做最小修复。
- 2026-04-24 16:00：定位根因有两层：`formatLatestLlmInput` 会把已带 `<system>/<user>` 根节点的消息再次包裹，生成 `<system><system>...`；前端 `LLMInputViewer` 切块用第一个 `</system>` / `</user>` 截断，遇到历史同名嵌套时会截出半截 XML。
- 2026-04-24 16:04：已修复后端 latest 写出逻辑：如果 message content 已经是对应 role 根节点，则直接写出，不再重复包裹。已新增测试覆盖 `llm.input.txt` 不再出现 `<system>\n<system>` / `<user>\n<user>`。
- 2026-04-24 16:08：已将 viewer 切块逻辑抽到 `web/src/features/llm-input-parser.ts`，按标签深度寻找外层闭合，并跳过 CDATA/comment 内部的假标签；历史双包文件可被切成完整 system/user 块。
- 2026-04-24 16:10：验证通过：相关测试 `39 pass`；`kernel/web` 生产构建通过。全仓 `bun run typecheck` 仍失败于既有无关类型错误，过滤后没有本次 parser/viewer 相关新增错误。
