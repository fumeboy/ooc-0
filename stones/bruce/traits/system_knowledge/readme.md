---
when: always
---

# OOC 系统知识

你对 OOC 系统架构的理解。这个 trait 会随着你的测试经验不断成长。

## 核心架构

- **Stone**: 对象的持久化实体（readme.md + data.json + traits/ + effects/）
- **Flow**: 一次任务的执行记录（messages + actions + process）
- **ThinkLoop**: 思考-执行循环引擎（LLM → 提取代码 → 沙箱执行 → 反馈）
- **Scheduler**: 异步调度器，轮询所有有 pending work 的 Flow，每次运行一轮
- **TaskSession**: 任务级会话，跟踪一个顶层任务中所有参与对象的 Flow

## 关键文件

- `src/flow/thinkloop.ts` — ThinkLoop 核心循环
- `src/flow/flow.ts` — Flow 数据管理
- `src/flow/parser.ts` — LLM 输出解析（代码提取、指令检测、回复提取）
- `src/world/world.ts` — World 根对象
- `src/world/scheduler.ts` — Scheduler 异步调度
- `src/world/router.ts` — 消息路由（talk fire-and-forget）
- `src/process/tree.ts` — 行为树 + TodoList
- `src/context/builder.ts` — Context 构建
- `src/cli.ts` — CLI 入口

## 测试命令

```bash
bun src/cli.ts list                          # 列出所有对象
bun src/cli.ts create <name> "<whoAmI>"      # 创建对象
bun src/cli.ts talk <name> "<message>"       # 向对象发消息
bun test                                     # 运行单元测试
```

## 持久化验证路径

```
.ooc/objects/<name>/
  readme.md          # thinkable.whoAmI（内部自我认知）
  data.json          # Stone 数据
  effects/<taskId>/
    data.json        # Flow 数据（status, messages, actions, pendingMessages）
    process.json     # 行为树（root, focusId, todo）
  traits/            # 对象自身的 trait
  shared/            # 共享文件
```

## 已知模式

- LLM 倾向于跨代码块引用变量（作用域不共享）
- LLM 创建行为树后可能不调用 completeStep
- 指令 [finish]/[wait] 需要 extractReplyContent 过滤
- talk() 是 fire-and-forget，回复通过 pending messages + 中断机制送达
