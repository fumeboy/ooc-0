# defer — 注册 command hook

> 灵感来自 Go 的 `defer` 语句：**在未来某个 command 被 submit 时，自动注入提醒文本到 Context**。

## 签名

```typescript
open({
  type: "command",
  command: "defer",
  description: "..."
})

submit({
  form_id,
  on_command: "return",           // 触发时机：某个 command 被 submit
  content: "在 return 前，请..."  // 注入的提醒
})
```

## 语义

1. 对象注册一个 defer："当 `on_command` 被 submit 时，把 `content` 注入 Context"
2. 这个注册**存储在线程级**，不是 trait 级也不是全局
3. 当触发时机满足，Engine 在下一轮 Context 构建时注入提醒
4. **线程 return 后，所有 defer 自动清除**

## 为什么需要 defer

### 场景：执行前的最后提醒

LLM 可能在复杂流程中**忘记**某些细节。比如：

```
LLM: 我要做 A → B → C，C 结束后 return
（中间 A、B 各跑 20 轮，LLM 的 Context 已经被新信息填满）
LLM: 即将 return，但忘了在 return 前调用 updateFlowSummary
```

**解法**：在流程开始时 defer：

```
open(command=defer)
submit({ on_command: "return", content: "别忘了先 updateFlowSummary('一句话总结')" })
```

之后即使 Context 被新内容填满，当 LLM 要 submit(return) 时，自动看到这个提醒。

### 场景：钩子式约束

```
open(command=defer)
submit({ on_command: "talk",
         content: "发消息前检查：是否 @ 了具体对象？是否提供了 context？" })
```

每次要 talk 时都有这个提醒。

## 与 trait hooks 的区别

trait 的 `hooks.when_finish` / `when_error` 也是注入机制，但：

| 维度 | trait hooks | defer |
|---|---|---|
| 生命周期 | trait 激活期间 | 线程级（return 后清除） |
| 触发时机 | 固定（when_finish / when_error 等） | 任意 command |
| 声明处 | trait 的 TRAIT.md | LLM 运行时声明 |
| 共享 | 所有激活该 trait 的线程 | 当前线程独享 |

defer 是**对象运行时的临时钩子**，trait hooks 是**系统级/能力级的固定钩子**。

## Once / Every 语义

defer 的注入默认是**每次**触发：

```
defer({ on_command: "program", content: "..." })
→ 每次 submit(program) 都注入
```

当前实现中未明确区分 once vs every——实际使用中 LLM 通常 defer 一次、触发几次、线程结束时自动清除。

## 多个 defer 的执行顺序

按注册顺序（FIFO）。如果注册了多个针对同一 command 的 defer：

```
defer1: on_command=return, content="A"
defer2: on_command=return, content="B"
```

触发时两条提醒都注入 Context：

```
[Deferred reminders]
  - A
  - B
```

## 源码锚点

| 概念 | 实现 |
|---|---|
| defer 指令定义 | `kernel/src/thread/tools.ts`（如果实现了） |
| defer 存储 | `kernel/src/thread/tree.ts` → `thread.deferreds` |
| 触发注入 | `kernel/src/thread/context-builder.ts` |

**注意**：defer 是新机制，当前实现完整度可能未覆盖所有场景。本文档描述的是**设计意图**。实际工程状态请查 `kernel/src/thread/` 源码。

## 与基因的关联

- **G5**（Context 即世界）— defer 是 Context 动态性的扩展
- **G12**（经验沉淀）— 常被 defer 的提示可能值得沉淀为 trait hook
