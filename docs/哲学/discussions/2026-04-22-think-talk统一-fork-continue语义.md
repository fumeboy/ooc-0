# 2026-04-22 · think / talk 指令统一 — fork vs continue 语义

## 问题

之前 thread 操作由三条不同形状的指令承担：

- `talk(target, message)` — 向别人发话（隐含每次都是对方**新根线程**）
- `create_sub_thread(title, ...)` — 在自己的线程树下派生新子线程
- `continue_sub_thread(thread_id, message)` — 向已创建子线程追加消息

反思这四种操作模式：

| # | 模式 | 旧对应 |
|---|---|---|
| 1 | fork 别人的 thread | `talk`（隐式——每次 talk 默认 fork 对方新根线程） |
| 2 | continue 别人的 thread | **无原生表达** |
| 3 | fork 自己的 thread | `create_sub_thread` |
| 4 | continue 自己的 thread | `continue_sub_thread` |

问题很清晰：

- 同一本质的 4 个变体由 **3 个语法不同的 command** 表达，**概念不正交**
- `talk` 无法 continue 别人的 thread（只能 fork 新根），跨对象协作表达受限
- `create_sub_thread` / `continue_sub_thread` 命名冗长、只适用于自己
- LLM 记多个 tool schema 学习成本高

## 统一后的协议

两个指令：

- `think` — 对**自己**的线程操作（替代 create_sub_thread / continue_sub_thread）
- `talk` — 对**其他对象**的线程操作

参数完全一致：

```
think/talk {
  msg: string,                       # 消息内容
  threadId?: string,                 # 目标线程 ID
  context: "fork" | "continue",      # 必填：操作模式
  target?: string,                   # 仅 talk：目标对象名（支持保留字 "super"）
}
```

四种模式正交化：

| 模式 | 新表达 |
|---|---|
| fork 别人的 thread | `talk(target=X, msg, threadId=Y, context="fork")` |
| continue 别人的 thread | `talk(target=X, msg, threadId=Y, context="continue")` |
| fork 自己的 thread | `think(msg, threadId=Y?, context="fork")` |
| continue 自己的 thread | `think(msg, threadId=Y, context="continue")` |

## fork vs continue 的哲学差异

这是本次重构的关键区分：

- **fork**：**从原 thread 派生新线程**，不对原线程产生影响
  - 对原线程是 **readonly** 的——你像在"另开一张草稿纸"工作
  - 场景：查资料、拆解子任务、探索方案、咨询、总结
  - 行为：新建一个子线程（以原线程为父），独立执行后 return 摘要

- **continue**：**直接向原线程投递消息**
  - 对原线程**产生影响**——唤醒它、改变它的下一步
  - 场景：补充信息、触发决策、汇报结果、追加指令
  - 行为：往原 thread 的 inbox 投递消息；若该线程是 done，自动复活为 running

这两种语义一直都存在，只是旧指令没把它们表达成对称的两半。统一后，LLM 可以更精准地表达意图——"我是在借这个线程做点事（fork）、还是在推它往前走（continue）？"

## 新能力：跨对象的 fork / continue

过去 `talk` 只能 fork 对方的新根线程（+ 通过 `continue_thread` 参数 continue 对方）。
现在 `talk(context="fork", threadId=Y)` 能在**对方的线程 Y 下**派生子线程——这是之前没有的能力。

这意味着协作粒度更细：你可以让 B 在 B 已有的某条工作线程下另开一枝处理你的 request，而不是打断 B 的根线程。

## 按 OOC 原则：不考虑旧版本兼容

`create_sub_thread` / `continue_sub_thread` 指令**直接删除**，不保留兼容层。
旧 stones 的迭代文档里仍有引用是历史印记；活跃的 kernel traits、kernel/src、前端、docs/对象 全部同步更新为新协议。

## SuperFlow backlog #2 顺带修复

上一轮 SuperFlow 迭代 Phase 5 E2E 时，bruce 的 LLM 把 `target="super"` 误解为 `target="supervisor"`。
此次借 talk schema 改写的机会，在 **kernel/traits/talkable/TRAIT.md** 补了一段明确的"super 保留字语义"说明，含：
- 保留字定义：`target="super"` 指当前对象的反思镜像分身
- **反例警告**：不要误解为 supervisor
- 反例对比表：两种 target 的后果差异
- 示例：`talk(target="super", msg="记下这个经验", context="fork")`

这样 LLM 在激活 talkable 时，Context 中就会含"super ≠ supervisor"的明确提示。

## 实现要点

- **tools.ts**：open 的 command enum 替换；submit 参数新增 `msg` / `threadId` / `context`，删除 `continue_thread`
- **types.ts**：ProcessEvent 新增可选 `context` 字段（fork / continue），前端/持久化可追溯
- **engine.ts**：run/resume 两路径同步重写 talk/think 分支，删除 create_sub_thread / continue_sub_thread 分支
- **engine.runWithThreadTree**：新增 `forkUnderThreadId` 参数（对方线程下 fork 子线程）
- **world.ts** & **world.super.ts**：onTalk 签名加 `forkUnderThreadId`，两处（`_talkWithThreadTree` + `_buildEngineConfig`）同步
- **traits**：plannable / talkable / object_creation / base 四个 kernel trait 全面改写；supervisor 的 session-kanban trait 同步
- **前端**：TuiAction 增加 think/talk 徽章（`command·context·threadId`），NodeCard 扩展 context 字段
- **文档**：docs/meta.md 子树 3/4 同步；docs/对象/ 下相关文档替换旧命令；创建此 discussion

## 验收

- 起点测试基线：562 pass / 6 skip / 0 fail
- Phase 1+2 后：571 pass / 6 skip / 0 fail（+9 新 think/talk 测试）
- Phase 3+4 后：前端 tsc 0 error + build pass

## 设计哲学回响

这次统一让我想起 Smalltalk 的原则：**"一切都是对象，一切都是消息"**。
OOC 里我们有一个更精细的变体：**"一切都是线程上的投递，区别只在『派生』还是『继续』"**。
think vs talk 区分的是**作用域**（自身 vs 他者），fork vs continue 区分的是**对原线程的影响**（readonly vs 写入）。
两个维度正交，四种模式天然浮现——没有新概念，只是让已有的结构以对称的方式被表达出来。
