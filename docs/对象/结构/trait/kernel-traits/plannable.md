# kernel/plannable — 任务拆解与规划

> 先想清楚再动手。

## 基本信息

```yaml
name: kernel/plannable
type: how_to_think
when: never
activates_on:
  paths: [think, set_plan]
description: 任务拆解与规划 — 先想清楚再动手
```

> 2026-04-22 起 plannable 的 activates_on.paths 统一为 `think` + `set_plan`。
> 旧命令 `create_sub_thread` / `continue_sub_thread` 已被 `think(context="fork"|"continue")` 替代（不做兼容层）。

## 核心原则

1. **先拆解再执行** — 复杂任务先用 `set_plan` 写出计划，再逐步执行
2. **一次只做一步** — 每步完成后验证，再进入下一步
3. **子线程处理子任务** — 用 `think(fork)` 将独立子任务委托给子线程

## 两个指令

### think — 对自己的线程操作

`think` 统一了 fork（派生新子线程）和 continue（向已有线程补充信息）两种意图：

```
think {
  msg: string,                       # 必填：消息内容
  threadId?: string,                 # 目标线程（context=continue 时必填）
  context: "fork" | "continue",      # 必填：操作模式
  traits?: string[],                 # 仅 fork：新子线程的 trait 列表
}
```

#### think(fork) — 创建子线程

```
open(type=command, command=think, description="派生搜索子任务")
submit(form_id, {
  title: "搜索相关文档",              // 同时作为子线程名
  context: "fork",
  msg: "在 /docs 下查找与 X 相关的 md 文件",
  traits: ["kernel/computable"]       // 可选
})
```

在线程树下创建一个子节点，让子节点独立处理子任务。子线程完成后 return 结果给父线程。

详见 [../../../认知/线程树/子线程.md](../../../认知/线程树/子线程.md)。

#### think(continue) — 向子线程追加消息

```
open(type=command, command=think, description="给子线程补充信息")
submit(form_id, {
  title: "补充 Y 的检查要求",
  context: "continue",
  threadId: "th_xxx",
  msg: "继续：再检查一下 Y"
})
```

向已创建的子线程追加消息（必须指定 `threadId`）。若子线程已 done，自动复活为 running。

### set_plan — 写入计划

```
open(type=command, command=set_plan)
submit(form_id, {
  text: "..."   // 当前线程的文字计划
})
```

把当前线程的计划以文字形式写入。对 LLM 可见（进入 Context），帮助它保持对整个任务的视野。

## 子 Trait

```
kernel/plannable/
├── kanban  — Session 级 Issue/Task 看板
```

## 规划风格指导

plannable 的 TRAIT.md 含若干规划经验：

- **子线程 vs 同线程**：只有**真正独立**的子任务才值得 `think(fork)` 开子线程；线性依赖的步骤在同一线程里做
- **计划粒度**：不要拆太细（5 步够用），但要能让验证单独进行
- **计划可更新**：执行中发现新情况，随时 set_plan 重写计划——不要死守旧计划

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/plannable/TRAIT.md` |
| think 处理 | `kernel/src/thread/engine.ts`（think 分支，4 模式） |
| 线程树创建 | `kernel/src/thread/tree.ts` |
| plan 字段 | `kernel/src/thread/types.ts` |

## 与其他 trait 的组合

- **plannable + object_creation** → 创建新对象时需要为其规划初始身份
- **plannable + debuggable** → 执行失败时重新规划（不是无脑重试）

## 与基因的关联

- **G9**（线程树计划执行）— plannable 提供线程树的"计划语义"
- **G13**（线程树即运行模型）— plan 是线程树节点的元数据
