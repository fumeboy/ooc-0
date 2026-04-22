# Backlog 清理：server.ts tsc + docs 术语同步

> 类型：chore
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Alan Kay (chore-cleanup agent)

## 背景 / 问题描述

Kanban agent 报告发现 `kernel/src/server/server.ts` 有 4 个预存 tsc errors（line 463/488/491/497），迭代开始前就存在，非本次 feature 引入。SuperFlow 转型 agent 报告发现 `docs/对象/` 层约 10 个 .md 文件仍含 `ReflectFlow` 旧术语，未在转型迭代范围内。

本迭代合并两件小 cleanup 任务。

## 目标

1. **#1 server.ts tsc 0 error**：修掉 463/488/491/497 四处类型错误，不改行为
2. **#3 docs 术语同步**：`docs/对象/` 下所有提到 ReflectFlow / `reflect/` / `talkToSelf` 的旧表述同步为 SuperFlow 新语义

## 方案

### Phase 1 — server.ts tsc fix

- `cd /Users/zhangzhefu/x/ooc/kernel/web && bun run tsc --noEmit` 定位错误详情
- 修掉 4 处，保持行为不变（零功能改动）
- `bun test` 保持 593 pass / 0 fail
- commit：`fix(server): 修复 server.ts 预存 tsc 错误`

### Phase 2 — docs 术语同步

- `grep -rln "ReflectFlow\|reflect_flow\|talkToSelf\|stones/.*reflect/" docs/对象/` 列清单
- 逐文件替换：
  - ReflectFlow → SuperFlow
  - reflect_flow → super
  - talkToSelf → talk(target="super")
  - stones/{name}/reflect/ → stones/{name}/super/
- 如有语境需要调整周边说明（不仅 s/ 替换）
- commit：`docs(对象): ReflectFlow → SuperFlow 术语同步`

## 影响范围

- `kernel/src/server/server.ts`（仅 tsc 修复，零行为变化）
- `docs/对象/**.md`（术语同步）

## 验证标准

- `cd kernel/web && bun run tsc --noEmit` 0 error（之前 4 → 0）
- `bun test` 保持 593+ pass / 0 fail
- `grep -rn "ReflectFlow\|reflect_flow\|talkToSelf" docs/对象/` 无残留
- 前端 build pass

## 执行记录

### Phase 1 — server.ts tsc fix（commit `35edf66`）

- `bunx tsc --noEmit` 拿到具体错误：4 处都集中在 `kernel/src/server/server.ts`
  - line 463：`sessionId = path.split("/")[3]` 类型推断为 `string | undefined`
  - line 488：同上，`sessionId/objectName = parts[3/5]`
  - line 491、497：`json(data, { status: 404 })` 误传对象，签名实际是 `json(data, status: number)`
- 修复方式（零行为变化）：
  - L463/487-488 加 non-null 断言 `!`（path 前缀已保证存在）
  - L491/497 把 `{ status: 404 }` 改为 `404`
- 验证：
  - `bunx tsc --noEmit | grep server` → 0 errors（其他文件的预存错误属于其他迭代范围，不归本次）
  - `bun test` → 593 pass / 6 skip / 0 fail，与基线一致
- 显式 stage：`git add kernel/src/server/server.ts`，避免和 sibling super-scheduler agent race

### Phase 2 — docs 术语同步（commit `8b7fe37`）

19 个 `.md` 文件、73 处旧术语全部替换为 SuperFlow 新语义：

- `ReflectFlow` → `SuperFlow`
- `reflect_flow` → `super`
- `talkToSelf(...)` → `talk(target="super", ...)`
- `_selfmeta`（target 名）→ `super`
- `stones/{name}/reflect/` → `stones/{name}/super/`
- `reflect("...")`（API 调用） → `talk(target="super", content="...")`

文件 rename：
- `docs/对象/成长/反思机制/reflect-flow.md` → `super-flow.md`（git mv 保留历史）

顺手修了 `docs/对象/结构/身份.md` 中 `../../成长/...` 的旧路径误差（应是 `../成长/...`）。

涉及文件清单：
- `docs/对象/人机交互/view-registry.md`
- `docs/对象/合作/消息/return.md`
- `docs/对象/合作/消息/talk.md`
- `docs/对象/存在/README.md`
- `docs/对象/存在/flow.md`
- `docs/对象/存在/stone.md`
- `docs/对象/存在/持久化.md`
- `docs/对象/成长/README.md`
- `docs/对象/成长/三层结构/README.md`
- `docs/对象/成长/三层结构/知识.md`
- `docs/对象/成长/三层结构/能力.md`
- `docs/对象/成长/反思机制/README.md`
- `docs/对象/成长/反思机制/super-flow.md`（rename + rewrite）
- `docs/对象/成长/反思机制/沉淀循环.md`
- `docs/对象/成长/自我修改.md`
- `docs/对象/成长/遗忘.md`
- `docs/对象/结构/trait/README.md`
- `docs/对象/结构/trait/kernel-traits/README.md`
- `docs/对象/结构/trait/kernel-traits/reflective.md`
- `docs/对象/结构/关系/relation.md`
- `docs/对象/结构/身份.md`
- `docs/对象/认知/context/三层记忆.md`
- `docs/对象/认知/thinkloop/README.md`

验证：
- `grep -rn "ReflectFlow\|reflect_flow\|talkToSelf" docs/对象/` → 无残留
- `grep -rn "stones/.*reflect/\|/reflect/" docs/对象/` → 无残留

### 总结

两件 cleanup 都完成，basis 0 fail。本迭代严格遵守边界（仅 `server.ts` + `docs/对象/`），未触碰 sibling super-scheduler agent 的战场（thread/、world/、cli.ts、traits/）。
