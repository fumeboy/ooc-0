# kernel/plannable — 任务拆解与规划

> 先想清楚再动手。

## 基本信息

```yaml
name: kernel/plannable
type: how_to_think
when: never
command_binding: [create_sub_thread, continue_sub_thread, set_plan]
description: 任务拆解与规划 — 先想清楚再动手
```

## 核心原则

1. **先拆解再执行** — 复杂任务先用 `set_plan` 写出计划，再逐步执行
2. **一次只做一步** — 每步完成后验证，再进入下一步
3. **子线程处理子任务** — 用 `create_sub_thread` 将独立子任务委托给子线程

## 三个指令

### create_sub_thread — 创建子线程

```
open(type=command, command=create_sub_thread)
submit(form_id, {
  title: "搜索相关文档",
  description: "在 /docs 下查找与 X 相关的 md 文件",
  inherit_scope: true  // 继承父线程的 trait 作用域
})
```

在线程树下创建一个子节点，让子节点独立处理子任务。子线程完成后 return 结果给父线程。

详见 [../../../认知/线程树/子线程.md](../../../认知/线程树/子线程.md)。

### continue_sub_thread — 追加消息

```
open(type=command, command=continue_sub_thread)
submit(form_id, {
  thread_id: "th_xxx",
  message: "继续：再检查一下 Y"
})
```

向已创建的子线程追加消息。若子线程已 done，自动复活为 running。

### set_plan — 写入计划

```
open(type=command, command=set_plan)
submit(form_id, {
  plan: [
    { step: 1, title: "...", status: "pending" },
    { step: 2, title: "...", status: "pending" },
  ]
})
```

把结构化的计划写入当前线程的 `plan` 字段。每步有 status，可标记 `pending` / `doing` / `done` / `blocked`。

计划对 LLM 可见（进入 Context），帮助它保持对整个任务的视野。

## 子 Trait

```
kernel/plannable/
├── (具体子 trait 待补充)
```

## 规划风格指导

plannable 的 TRAIT.md 含若干规划经验：

- **子线程 vs 同线程**：只有**真正独立**的子任务才值得开子线程；线性依赖的步骤在同一线程里做
- **计划粒度**：不要拆太细（5 步够用），但要能让验证单独进行
- **计划可更新**：执行中发现新情况，随时 set_plan 重写计划——不要死守旧计划

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/plannable/TRAIT.md` |
| create_sub_thread 处理 | `kernel/src/thread/engine.ts` |
| 线程树创建 | `kernel/src/thread/tree.ts` |
| plan 字段 | `kernel/src/types/thread.ts` |

## 与其他 trait 的组合

- **plannable + object_creation** → 创建新对象时需要为其规划初始身份
- **plannable + debuggable** → 执行失败时重新规划（不是无脑重试）

## 与基因的关联

- **G9**（线程树计划执行）— plannable 提供线程树的"计划语义"
- **G13**（线程树即运行模型）— plan 是线程树节点的元数据
