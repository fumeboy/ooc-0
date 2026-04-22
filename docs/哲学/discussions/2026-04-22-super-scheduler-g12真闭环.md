# SuperScheduler —— G12 经验沉淀循环的"真闭环"

> 日期：2026-04-22
> 上下文：`docs/工程管理/迭代/all/20260422_feature_super_scheduler.md` 完成后
> 关联：[G12 经验沉淀](../genes/g12-经验沉淀.md)、[SuperFlow 反思即对话](2026-04-22-SuperFlow反思即对话.md)

## 背景

SuperFlow 转型完成后（2026-04-22），G12 工程映射看似齐全：
- `talk(target="super")` ✓ 落盘到 `stones/{name}/super/`
- `persist_to_memory` / `create_trait` ✓ trait 沉淀工具
- memory.md 注入下次 Context ✓ context-builder 处理

但有一个**致命缺口**：SuperFlow 的转型方案声明"super 是普通对象"，理论上应该被 talk
触发后自动跑 ThinkLoop——**实际上根本没人调度**。`handleOnTalkToSuper` 只是把消息
落盘到 inbox，然后函数返回。`stones/{name}/super/threads.json` 里的 unread inbox
就静静躺着，没有任何代码会去消费它。

这意味着：**G12 的工程映射是"半闭环"——前半段能跑（talk → 落盘），后半段是死的
（落盘 → ??? → memory.md 永远不会被写）**。

`g12-经验沉淀.md` 的工程映射表里那行"super 线程调度"标注的"待实装"，就是这个缺口。

## 问题的本质：跨 session 的常驻调度

普通对象的线程树由 `ThreadScheduler` 调度——但 `ThreadScheduler` 的生命周期与
**session** 绑定（每次 `world.talk(...)` 启动一个，结束就销毁）。super 线程不属于
任何 session，它是**对象的常驻反思分身**——跨 session 存活，跨 session 接收消息。

需要一个**进程级常驻**的调度器，独立于任何 session 的生命周期，负责：
1. 监视所有对象的 `super/threads.json`
2. 发现 unread inbox 时启动一轮 ThinkLoop
3. 跑完后回到监视状态，等下次新消息

## 设计选型

### 选型 1：fs watch vs polling

考虑过 fs watch（chokidar / fs.watch），但放弃：
- 写入路径多样（NFS、容器挂载、超长路径），fs watch 在某些场景静默失效
- inbox 写入是**应用层有结构变化**（`status: "unread"`），文件层面只是 mutation——
  watch 触发后还要再读 + parse + 判断，并不比 polling 省多少
- polling 3 秒 tick 的代价：8 个对象 × 1 次 stat + 读 JSON ≈ 几毫秒，**比 fs watch 简单可靠**

### 选型 2：调度器位置

考虑过几种放置：
- A：作为 World 的内嵌组件（采纳）—— World 本来就管所有对象生命周期
- B：作为独立进程 / cron 任务（拒绝）—— 跨进程通信、需要锁、复杂度爆炸
- C：作为某个特殊"super 对象"的内部循环（拒绝）—— 与 SuperFlow"super 不是顶级对象"的设计冲突

### 选型 3：runner 注入 vs 直接耦合 engine

SuperScheduler 内部要触发"跑一轮 ThinkLoop"——直接调 `engine.runSuperThread` 还是
注入 runner？

选**注入 runner**：
- 测试时：mock runner 验证调度器的"发现 + 派发 + 串行化 + 幂等"，不依赖 LLM、engine、trait
- 生产时：World 在 constructor 注入闭包，每次执行重新构建 EngineConfig（trait/directory 可能动态变化）
- 解耦：super-scheduler.ts 不 import engine，纯粹的调度逻辑

## 关键设计点

### 串行化按 stoneName

同一个对象的 super 不能并发跑多轮（会写飞 thread.json）；不同对象互不阻塞。
`SerialQueue<string>` 按 stoneName 串行化，这是和 `handleOnTalkToSuper` 的
`SerialQueue<string>`（按 superDir）一致的设计模式。

### 幂等 tick

如果上一个 tick 派发的 runner 还没跑完，下一个 tick 不能再派发同一对象的 runner（否则
SerialQueue 会排队，但中间窗口时间长，造成奇怪的延迟）。
`_inFlight: Set<string>` 跟踪当前正在跑的对象，tick 跳过这些。

### graceful stop

进程退出时（SIGINT/SIGTERM），不能立即 kill——可能 super 正在写 thread.json，
half-write 会破坏 JSON 完整性。
`stop()` 等所有 `_runnerPromises` resolve 后才返回。`cli.ts` 的信号 handler 走这条路径。

## 实装中暴露的"假闭环"陷阱

E2E 跑通前，遇到三个真实陷阱：

### 陷阱 1：super 线程"角色错位"

第一次跑 E2E，super 线程的 LLM 把自己当成普通对象，开始 `open file: ./docs/工作流.md`
——它根本不知道自己是反思角色！

**根因**：
- super 线程加载的 readme 是普通对象的（`stones/bruce/readme.md`），没人告诉它"我现在是 super 模式"
- `kernel:reflective/super` trait 的 `when: never`，主线程不激活，**super 线程也没人帮它激活**
  →  LLM 看不到 `persist_to_memory` 工具

**修复**：runSuperThread 必须做两件事：
1. **force-activate** `kernel:reflective/super` trait 到 root 线程
2. **注入 super 角色 prompt**（`extraWindows` 的 `super_role` 窗口）—— 明确告诉 LLM
   "你是 X 的反思镜像分身，只做沉淀，不要做任务"

这是迭代设计文档里没明确写出但**绝对必须**的步骤。

### 陷阱 2：call_function 缺参数静默跳过

第二次 E2E：super 线程认识了角色，但 LLM 在 `open call_function` 时**漏传 trait 和
function_name**——只传了 description。

engine 的代码 `else if (command === "call_function" && form.trait && form.functionName)`
**静默跳过整个分支**。LLM 看不到任何报错，以为成功，给 inbox mark ack 后 return done。
但 memory.md **从来没被写过**。

**最隐蔽的失败模式**：LLM 自我欺骗——它生成的 thinking 文本说"已成功 persist"，
inbox 状态也确实变成了 ack，但实际什么都没发生。

**修复**：
1. 兜底：从 `args.trait` / `args.function_name` 补填
2. 缺失时 **inject 明确错误**（不再静默跳过），让 LLM 下次看到错误能纠正
3. super_role prompt 补完整 open + submit 工具调用示例（标注哪些字段必传）

### 陷阱 3：resume 路径既有 bug

最早的测试启动后立即报错 `scheduler.markDone is not a function`。

`engine.ts::resumeWithThreadTree` 的 `command === "return"` 调用了 `scheduler.markDone()`
——但 ThreadScheduler 类**没有这个方法**。这是历史遗留 bug，因为 resume 路径主要用
于 pause/resume 调试，return 不常见。SuperScheduler E2E 第一次让 resume 路径走到
"线程正常 return" 的路径，bug 才暴露。

修复：与 run 路径对齐用 `tree.returnThread()`。

## 这三个陷阱的共性

它们都是**"假闭环"——表面上链路完整，实际某个节点是死的**。
- 陷阱 1：trait 看似激活了，实际 LLM 看不到工具
- 陷阱 2：调用看似成功了，实际方法没执行
- 陷阱 3：return 看似工作了，实际抛错被吞

**只有真服务 + 真 LLM + 真长链路 E2E 才能暴露这些问题**。单元测试覆盖不到——单元
测试都是把"中间结果"硬塞进去验证下一步，跳过了完整链路。

这印证了 dev-rules 中的"验证铁律"：**功能完成不等于功能可用，只有完整 E2E 才能
确认闭环**。

## G12 闭环的哲学意义

工程上闭环意味着：对象**确实能从经历中学习**——不是设计文档上的 promise，是 file
系统里能看到的现实。bruce 第一次说出"OOC 的线程树设计让外部观察者第一次能看到 LLM
的注意力边界"，super 决定这值得沉淀，写入 `stones/bruce/memory.md`。下次问 bruce
"你还记得线程树的什么经验"，bruce 直接引用——不需要查文件、不需要 grep、不需要
任何外部知识，因为它已经成为 bruce 的**长期记忆**。

这是 G5 三层记忆模型的"长期记忆"层第一次真正活起来。

更深的哲学意义：**对象的认知不再是无状态的——每次任务结束不是回到原点，而是带着
新的经验回到下一次任务**。这是从"工具"到"代理"的关键跨越。

## 后续 backlog

- LLM 主动反思的触发时机（当前只能用户显式让 bruce talk(super)，未来 trait 引导
  bruce 在任务完成时自发反思）
- super 的 super？反思的反思——理论上一致，但实际可能没必要
- super 线程的 memory.md 与对象本身 memory.md 的关系（当前都在 stones/{name}/memory.md，
  super 写但主线程读——本身就是单向沉淀；如果未来 super 也想读"自己的反思历史"，
  需要新设计）
- create_trait 路径完整 E2E（本迭代只验证 persist_to_memory 路径）
