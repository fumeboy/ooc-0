# return — 完成当前线程

> 结束当前线程，把 summary 返回给**创建者**（父线程或外部 talk 发起方）。

## 签名

```typescript
open(title="返回结果", type=command, command=return, description="完成当前线程并返回摘要")
refine(form_id, {
  summary: "任务完成：找到 3 份相关文档..."
})
submit(title="返回结果", form_id)
// → 线程 status = done
```

## 语义

1. 当前线程 status → `done`
2. summary 作为消息写入创建者的 inbox
3. 关联的 trait 释放（refcount--）
4. SSE 推送 `thread:returned` 事件

## 创建者是谁

取决于线程如何被创建：

| 创建方式 | 创建者 | summary 去向 |
|---|---|---|
| `think(context="fork")` | 父线程 | 父线程 inbox |
| 用户直接 talk | （用户侧） | 通过 SSE 推送给前端 |
| 其他对象 talk | 对方线程 | 对方线程 inbox |
| `think(context="continue")` | 原线程创建者 | 原线程创建者 inbox |

## 激活的三个 trait

`activates_on.show_content_when: [return]` 的 trait 有三个：

- **talkable** — 定义如何传递结果
- **reflective** — 沉淀经验（when_finish hook）
- **verifiable** — 验证证据（when_finish hook）

`open(title="返回结果", command=return, description="完成当前线程")` 时，这三个 trait 全部激活——LLM 看到的 Context 会包含：
- 如何写一个好的 return summary（talkable）
- 结束前反思的提示（reflective）
- 验证门禁（verifiable）

## when_finish hook 的作用

最显著的 hook 是 **verifiable.when_finish**：

```
[验证门禁] 你即将声明完成。回答以下问题：
1. 你运行了什么验证命令？
2. 输出是什么？
3. 输出是否支持你的结论？
如果任何一项答不上来，先运行验证再 [finish]。
```

这让"宣称完成"有门槛——必须给出证据。

**reflective.when_finish** 则提示沉淀经验：

```
在结束任务前，请花一轮思考回顾：
1. 这个任务中你学到了什么新东西？
2. 有什么值得长期记住的？用 talk(target="super") 告诉你的 SuperFlow
...
```

## summary 的建议结构

```
概述：一两句话（什么任务，做到了什么）
关键结果：具体内容（数据、链接、文件路径）
参考：引用的源材料
下一步：如需继续的建议
```

这个结构让**父线程**在收到消息时能快速理解，不需要去读完整 actions 历史。

## 线程 done 后的命运

- **不立即删除**：thread.json 保留，供后续追溯
- **可能被复活**：如果有新消息进入 inbox，自动 done → running
- **占用的 trait refcount 释放**：其他线程不再依赖时，trait 真正卸载

## 父线程的反应

父线程收到子线程的 return summary（通过 inbox）后：

```
父线程 inbox:
  [new] msg-xxx from sub_thread_yyy: "任务完成：找到 3 份相关文档..."
```

父线程的 Context 构建时，会看到这条消息 + childrenSummary 中该子线程的 done 状态。LLM 下一轮决定如何处理（可能继续推进，也可能自己 return）。

## 错误情况

### 没 open 就 submit(return)

不可能——submit 要求 form_id 必须是已 open 的 command。

### 在根线程 return

根线程 return → 该 Flow 结束。如果是 Supervisor 的根线程，可能触发 Session 终止判断。

## 源码锚点

| 概念 | 实现 |
|---|---|
| return 处理 | `kernel/src/thread/engine.ts` |
| summary 投递到父 inbox | `kernel/src/thread/collaboration.ts` |
| done 状态处理 | `kernel/src/thread/tree.ts` |

## 与基因的关联

- **G8**（Effect 与 Space）— return 是"向上传递"的 Effect
- **G12**（经验沉淀）— return 前的反思是沉淀的关键时刻
