# kernel/talkable — 对象间通信

> 没有 talkable，对象是孤岛。

## 基本信息

```yaml
name: kernel/talkable
type: how_to_interact
activates_on:
  show_content_when: [talk, return]
description: 对象间通信协议 — talk 消息传递与等待回复
```

## 两个指令

### talk — 对话

```
open(title="发送消息", type=command, command=talk, description="发送异步消息")
refine(form_id, { target, msg, context: "fork" })
submit(title="发送消息", form_id)
```

发送消息给目标对象，**不等待回复**。发送方继续自己的流程；对方的回复以后会出现在 inbox 中（含 `[remote_thread_id: th_xxx]`）。

如果需要等待回复，给同一个 talk form 增加 `wait: true`：

```
open(title="发送并等待", type=command, command=talk, description="发送消息并等待回复")
refine(form_id, { target, msg, context: "fork", wait: true })
submit(title="发送并等待", form_id)
```

当前线程会进入 waiting，收到对方回复后继续。

适用场景：像调用函数一样调用其他对象（如 filesystem 的 listDir）。

### return — 完成当前线程

```
open(title="返回结果", type=command, command=return, description="完成当前线程")
refine(form_id, { summary })
submit(title="返回结果", form_id)
```

结束当前线程，返回结果给**创建者**（父线程或外部 talk 发起方）。

return 激活了三个 trait：`talkable`（这里讲如何返回）、`reflective`（沉淀经验）、`verifiable`（完成前要有验证证据）。详见各对应 trait 文档。

## 子 Trait

```
kernel/talkable/
├── cross_object         ← 跨对象函数调用协议
├── ooc_links            ← ooc:// 链接和导航卡片
├── delivery             ← 交付规范、协作交付
└── issue-discussion     ← Issue 讨论与评论机制
```

### cross_object

定义"跨对象函数调用"的协议。本质是 `talk(wait=true)` 的一种约定格式：

```typescript
open(title="读取文件", command=talk, description="请求 filesystem 读取文件", args={
  target: "filesystem",
  msg: { method: "readFile", args: { path: "..." } },
  context: "fork",
  wait: true
})
submit(title="读取文件", form_id)
```

对方对象（filesystem）收到后识别这是 method call，调用对应的 trait 方法，返回结果。

### ooc_links

定义 `ooc://` 链接格式，让消息中引用对象或文件可被前端拦截：

```
请查看 ooc://object/alan 的 readme
相关文件：ooc://file/researcher/results.json
```

前端 MarkdownContent 组件识别这些链接，点击弹出预览侧滑面板。

### delivery

交付规范。定义"完成"一个请求时应该返回什么：
- 摘要（简短）
- 关键结果（具体数据）
- 参考（引用的文件 / 对象）
- 下一步建议（如需人工跟进）

### issue-discussion

Issue 讨论机制。实际功能上与"看板"密切相关。**注意**：虽然位于 `kernel/traits/talkable/` 下，但它在语义上更偏向看板系统。详见 [../../../合作/结构化/trait/issue-discussion.md](../../../合作/结构化/trait/issue-discussion.md)。

## inbox 机制

talkable 定义了"消息的发送"，但接收端——inbox——的处理在 Engine / Context 层。详见 [../../../合作/消息/](../../../合作/消息/)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/talkable/TRAIT.md` + 子目录 |
| talk / return 处理 | `kernel/src/thread/engine.ts` |
| 跨 Session 投递 | `kernel/src/thread/collaboration.ts` |
| ooc:// 前端拦截 | `kernel/web/src/components/MarkdownContent.tsx` |

## 与基因的关联

- **G1**（数据即对象）— talk 的"目标"是对象名
- **G6**（关系即网络）— talkable 让关系"可用"
- **G8**（Effect 与 Space）— 消息是一种 Effect
