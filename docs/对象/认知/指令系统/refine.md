# refine — 累积参数

> 对已经 `open` 的 command form 追加或修改参数，但不执行。等参数齐备后，再用 `submit` 触发执行。

## 签名

```typescript
refine({
  title: "补充对话参数",
  form_id: "f_001",
  args: {
    target: "bruce",
    msg: "请验证这个改动",
    context: "fork"
  },
  mark?: [
    { messageId: "msg_xxx", type: "ack", tip: "已处理" }
  ]
})
```

`args` 是对象。多次 refine 时，后一次会覆盖同名字段。

## 典型流程

```typescript
open({
  title: "准备发消息",
  type: "command",
  command: "talk",
  description: "请 bruce 帮忙验证"
})
// -> form_id = "f_001"

refine({
  title: "指定接收者",
  form_id: "f_001",
  args: { target: "bruce" }
})

refine({
  title: "补充消息内容",
  form_id: "f_001",
  args: { msg: "请验证 refine 文档是否准确", context: "fork" }
})

submit({
  title: "发送验证请求",
  form_id: "f_001"
})
```

也可以在 `open` 时直接传 `args`，等价于 `open` 后立即执行一次 `refine`：

```typescript
open({
  title: "准备发消息",
  type: "command",
  command: "talk",
  description: "请 bruce 帮忙验证",
  args: {
    target: "bruce",
    msg: "请验证 refine 文档是否准确",
    context: "fork"
  }
})
```

## 路径深化

`refine` 不只是填参数。每次参数变化都会重新计算 command path，可能触发新的 trait 激活：

```
open(title="准备对话", command=talk, description="准备发送消息")
  -> paths: ["talk"]

refine(args={ context: "continue" })
  -> paths: ["talk", "talk.continue"]

refine(args={ wait: true })
  -> paths: ["talk", "talk.continue", "talk.wait"]
```

这取代了旧的 `submit(partial=true)`。现在 `submit` 只负责执行，不再接收 command 参数。

## 源码锚点

| 概念 | 实现 |
|---|---|
| refine tool 定义 | `kernel/src/thread/tools/refine.ts` |
| 参数累积 | `kernel/src/thread/form.ts` → `FormManager.applyRefine` |
| 路径计算 | `kernel/src/thread/commands/index.ts` |
| engine 处理 | `kernel/src/thread/engine.ts` |
