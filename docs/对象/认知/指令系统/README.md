# 指令系统 — 思考的产出形式

> 对象通过 `open / submit / close / wait` 四原语与系统交互。
> 这是基座 trait（`kernel/base`）定义的唯一交互协议。

## 七个文档

| 文档 | 内容 |
|---|---|
| [open.md](open.md) | 打开上下文：command / trait / skill 三种类型 |
| [submit.md](submit.md) | 提交执行 |
| [close.md](close.md) | 关闭上下文 |
| [wait.md](wait.md) | 等待子线程或消息 |
| [mark.md](mark.md) | 标记 inbox 消息（附加参数） |
| [defer.md](defer.md) | 注册 command hook（灵感自 Go defer） |
| [form-manager.md](form-manager.md) | Form 生命周期管理器 |

## 四原语速览

### open — 打开上下文

声明"我要做什么"，加载相关知识/能力。返回 `form_id`。

### submit — 提交执行

对 command 类型 form：执行具体指令。对 trait / skill 类型：无需 submit。

### close — 关闭上下文

结束 form，卸载关联的 trait / skill。释放 Context 空间。

### wait — 等待

进入 waiting 状态，让出调度权。子线程完成或消息到达时唤醒。

## 附加参数：mark

任意 tool call 都可携带 `mark` 参数，用于**同时**标记 inbox 消息（ack/ignore/todo）。避免"标记消息"需要单独 open + submit。

详见 [mark.md](mark.md)。

## 渐进式加载机制

open 不只是"声明意图"——它还是**按需加载的入口**：

```
open(command=program)
  → 激活 kernel/computable（command_binding 触发）
  → kernel/computable 的 readme 注入 Context
  → 子 trait 描述也可见（Level 2）
```

这让 Context 保持精简——只有当前需要的能力被加载。

详见 [../../结构/trait/渐进式激活.md](../../结构/trait/渐进式激活.md)。

## Defer：command hook

defer 是一个元指令，允许对象**在某个 command 被 submit 时**注入提醒文本到 Context。灵感来自 Go 的 defer 语句。

```
open(command=defer) + submit({ on_command: "program", content: "..." })
  → 下次 submit(command=program) 时，自动注入 content 到 Context
```

生命周期 = 线程级。线程 return 后自动清除。

详见 [defer.md](defer.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Tool 定义 | `kernel/src/thread/tools.ts` |
| Form 管理 | `kernel/src/thread/form.ts` |
| Tool call 处理 | `kernel/src/thread/engine.ts` |
| 基座 trait | `kernel/traits/base/TRAIT.md` |

## 与基因的关联

- **G4**（输出程序以行动）— 四原语是 G4 的工程协议
- **G3**（trait 是自我定义）— 指令激活 trait 的机制
