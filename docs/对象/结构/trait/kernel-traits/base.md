# kernel/base — 指令系统基座

> 系统协议基座。定义 OOC 对象与系统交互的五个原语，不再依赖 frontmatter `when`。

## 基本信息

```yaml
name: kernel/base
type: how_to_think
description: 指令系统基座 — open/refine/submit/close/wait 五原语
```

`kernel:base` 由系统默认注入——这是对象的"基本呼吸"。

## 五原语

base 定义了五个 tool：

### open — 打开上下文

声明"你要做什么"，系统加载相关知识并返回 `form_id`。

| type | 用途 | 必填参数 |
|---|---|---|
| `command` | 执行指令（program/talk/return 等） | `title`, `command`, `description` |
| `trait` | 加载 trait 知识到上下文 | `title`, `name`（trait 路径）, `description` |
| `skill` | 加载 skill 内容到上下文 | `title`, `name`（skill 路径）, `description` |
| `file` | 读取文件到上下文窗口 | `title`, `path`, `description` |

open 返回 `form_id`，用于后续 refine / submit 或 close。`open(args)` 等价于 open 后立即 refine 一次。

### refine — 累积参数

```
refine(title, form_id, args)
```

对 command form 追加或修改参数，但不执行。多次 refine 时后到的同名字段覆盖先前字段。

### submit — 提交执行

```
submit(title, form_id)
```

对 command 类型的 form，submit 执行具体指令。指令参数必须已经通过 `refine` 或 `open(args)` 累积在 form 中。

对 trait / skill 类型的 form，**不需要 submit**——open 时已加载，直接可用。

### close — 关闭上下文

```
close(form_id)
```

- 对 command 类型：取消指令（若未 submit）
- 对 trait / skill 类型：卸载内容（Context 释放）

close 后，FormManager 会 `deactivateTrait`，refcount 归零时 trait 被真正卸载。

### wait — 等待外部消息或事件

```
wait(reason)                ← 等待外部消息或事件
```

让当前线程进入 `waiting` 状态，让出调度权。当 inbox 有新消息时自动唤醒。等待子线程完成请使用 `do(wait=true)`。

> **与 meta.md 的关系**：当前 base 实际定义了**四原语**（open/submit/close/wait），而 meta.md 子树 3 早期版本写的是"三原语 + mark"。这里以代码为准，meta.md 需在 Phase 8 修正。

## 附加参数：mark

任意 tool call 都可以附带 `mark` 参数，用于标记 inbox 消息：

```
open(title="查询", type=command, command=program, description="...",
     mark=[{ messageId: "msg-123", type: "ack", tip: "已处理" }])
```

action 值：
- `ack` — 已确认（常规处理）
- `ignore` — 忽略（不再展示）
- `todo` — 待办（保留在 inbox 中但降低优先级）

详见 [../../../认知/指令系统/mark.md](../../../认知/指令系统/mark.md)。

## 为什么只有五原语

OOC 刻意让基座极简。五原语覆盖了所有必要交互：

- **open** = "我要做什么"（声明意图）
- **refine** = "把参数填清楚"（累积意图）
- **submit** = "执行它"（触发动作）
- **close** = "取消 / 结束"（回收资源）
- **wait** = "等别人"（让出执行）

所有其他能力（写文件、发消息、创建对象）都通过 command + 对应 trait 实现——base 只提供"如何与 command 交互"的语法，不提供任何具体能力。

这是 **Progressive Disclosure** 的极致体现：基座永远驻留，能力层按需激活。

## 与其他 trait 的关系

base 是所有其他 trait 的"调用入口"：

```
想执行代码 → open(title="执行代码", command=program, description="...") → 激活 computable
想发消息   → open(title="发消息", command=talk, description="...") → 激活 talkable
想创建子线程 → open(title="创建子线程", command=do, description="...") → 激活 plannable（do 统一了 fork/continue）
想结束线程 → open(title="返回结果", command=return, description="...") → 激活 talkable + reflective + verifiable
```

没有 base，对象不知道"如何开始一个动作"。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/base/TRAIT.md` |
| Tool 定义 | `kernel/src/thread/tools/`（每个 tool 一个文件，`index.ts` 聚合） |
| Form 管理 | `kernel/src/thread/form.ts` |
| Engine 处理 tool call | `kernel/src/thread/engine.ts` |

## 与基因的关联

- **G3**（trait 是自我定义）— base 是"作为对象"的最小词汇表
- **G13**（线程树即运行模型）— 四原语的作用域就是线程
