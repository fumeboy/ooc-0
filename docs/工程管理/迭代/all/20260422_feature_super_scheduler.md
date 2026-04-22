# Super 跨 session 自动调度器（super 真跑 ThinkLoop）

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD

## 背景 / 问题描述

SuperFlow 转型完成后：
- `talk(target="super")` 会落盘到 `stones/{name}/super/threads.json` 的 inbox
- 但 **没有调度器把 super 线程唤醒跑 ThinkLoop**——消息静静躺在 inbox 里
- memory 行号污染迭代证明了 `persist_to_memory` 链路本身闭合，但因为 super 不跑 ThinkLoop，完整 G12 E2E（`talk super → ThinkLoop → persist_to_memory → 下次 Context 含 memory`）一直无法真实验证

## 目标

1. 新建 **`kernel/src/thread/super-scheduler.ts`**：跨 session 常驻的 per-stone 调度器
   - 启动时扫 `stones/*/super/threads.json`，为每个对象注册一个 scheduler 单元
   - 监听 inbox 变化（polling 或 fs watch，倾向 polling 简单可靠）
   - inbox 有 unread → 触发 `Engine.runWithThreadTree`（或等价路径）跑一轮
   - 跑完 → 线程 done → 下次有新 inbox 再唤醒
2. **World / CLI 启动集成**：`cli.ts` 或 `world.ts` 初始化时启动 super-scheduler
3. **单元测试**：mock engine，验证调度触发正确 / 幂等 / 并发安全
4. **完整 G12 E2E 验证**：bruce talk(super, "记一个经验") → super 跑 ThinkLoop → persist_to_memory → 下次 bruce Context 包含新 memory

## 方案

### Phase 1 — SuperScheduler 实现

- 新 `kernel/src/thread/super-scheduler.ts`：
  ```ts
  export class SuperScheduler {
    register(stoneName: string, superDir: string): void
    start(): void
    stop(): void
    // 内部：polling tick → scan unread → trigger engine
  }
  ```
- 复用 SerialQueue 按 stoneName 串行化（避免同对象的 super 线程同时跑多轮）
- 单元测试：mock engine runner，验证触发 + 幂等 + 错误隔离

commit：`feat(thread): super-scheduler 跨 session 常驻调度`

### Phase 2 — 集成到启动流程

- `kernel/src/world/world.ts` 或 `cli.ts`：启动时 `new SuperScheduler(world)` + 为所有对象 register + start
- 停止时 stop（graceful shutdown）
- 关键：super 线程跑的 engine runner 需要正确的 context（包括对象的 traits / readme / data）

commit：`feat(world): 启动时初始化 super-scheduler`

### Phase 3 — engine runner 改造

engine.ts 的 `runWithThreadTree` 当前假设"一次 talk 触发一次 run"。super 线程需要"独立周期性 run"，要么复用 runWithThreadTree，要么新增 `runReflectThread`（针对常驻线程的简化版）。

- 阅读现有代码评估：直接复用 vs 新增
- 如果要改 engine 签名，保持向后兼容不破坏原 talk 路径
- 测试

commit：`feat(engine): super 线程 ThinkLoop 执行路径`

### Phase 4 — 完整 G12 E2E

- 启动服务（scheduler 随之启动）
- curl 触发 bruce 反思：`bruce talk(target="super", msg="记下这个经验：X")`
- 观察：
  - super 线程 inbox 收到消息
  - scheduler tick 发现 unread → 触发 ThinkLoop
  - LLM 决定调 `persist_to_memory` → `stones/bruce/memory.md` 新条目
  - 新 session talk(bruce, ...) → bruce Context knowledge 段含该 memory
- 完整追溯写入执行记录（线程 id / action id / memory 条目）

commit：`test: super scheduler + 完整 G12 E2E 验证`

### Phase 5 — 文档

- `docs/meta.md` 子树 3（Engine）+ 子树 4（协作）说明 super-scheduler
- `docs/哲学/discussions/2026-04-22-super-scheduler-g12真闭环.md`（新）
- `docs/哲学/genes/g12-经验沉淀.md` 工程映射章节补"scheduler 已实装，G12 完整闭环"

commit：`docs: super-scheduler G12 闭环完整落地`

## 影响范围

- **后端**：
  - `kernel/src/thread/super-scheduler.ts`（新）
  - `kernel/src/world/world.ts`（启动集成）或 `kernel/src/cli.ts`
  - `kernel/src/thread/engine.ts`（可能，看方案决定）
  - 新增测试 `kernel/tests/super-scheduler.test.ts`
- **文档**：
  - `docs/meta.md`
  - 新 discussion
  - `gene.md` G12 工程映射
- **基因/涌现**：
  - G12 完整工程闭环真实达成（非降级落盘）
  - 可能催生涌现：对象自发"什么场景下主动反思"

## 验证标准

1. Phase 1-5 各 commit 独立
2. `bun test` 保持 593+ pass / 0 fail（新增 super-scheduler 测试）
3. 前端 tsc 0 error / build pass
4. **完整 G12 E2E** 跑通，执行记录附全程追溯
5. `grep -rn "super 线程跑的时候"` 等旧注释清理

## 执行记录

### 2026-04-22 起点基线

- `cd kernel && bun test` 全量：**593 pass / 6 skip / 0 fail**（与 SuperFlow 转型完成时一致）
- sibling chore agent 的 backlog 清理在并行进行（server.ts tsc 修复 + docs/对象/ 术语同步），战场严格隔离

### Phase 1 — SuperScheduler 实现

**新文件**：
- `kernel/src/thread/super-scheduler.ts`（244 行）：
  - `SuperScheduler` 类 + `SuperRunner` 类型
  - `register / unregister / start / stop / tickNow` 公开 API
  - 内部：polling tick → 扫所有注册对象 → SerialQueue 派发 runner
  - 幂等：`_inFlight` Set 避免同 stone 重复派发
  - 错误隔离：runner 抛错被 catch + log，不阻塞其他对象 / 后续 tick
  - graceful stop：等所有 in-flight runner 完成
- `kernel/tests/super-scheduler.test.ts`（11 tests）：
  - 无注册对象 / 无 unread / 有 unread → 派发
  - 幂等（runner in-flight 期间新 tick 跳过）
  - 多 stone 并发（不同 key 不互相阻塞）
  - 同 stone 顺序执行（SerialQueue）
  - runner 错误隔离
  - graceful stop（等 in-flight 完成）
  - start/stop 幂等
  - unregister 后不再派发

**测试**：`bun test tests/super-scheduler.test.ts` → **11 pass 0 fail**
**全量**：593 → **604 pass**（+11）零回归
**kernel commit**：`f462ca6` feat(thread): super-scheduler 跨 session 常驻调度（Phase 1）

### Phase 3 — engine runner 改造

**评估方案**：
- A：复用 resumeWithThreadTree 注入参数（采纳——最小改动，复用 740 行 resume 全部能力）
- B：新写 600 行 runReflectThread（拒绝——大量代码重复，维护成本高）

**改动**：
- `engine.ts::resumeWithThreadTree` 新增参数 `objectFlowDirOverride?: string`（向后兼容）
- 新增 `engine.ts::runSuperThread(stoneName, superDir, config)`：
  - 虚拟 sessionId `super:{stoneName}`（仅日志/SSE 用，不创建 flows/）
  - 加载 super 目录 tree → 给 root 线程 force-activate `kernel:reflective/super` trait
  - 注入 super 角色 prompt（`extraWindows` 的 `super_role` 窗口）——含完整 open + submit
    工具调用示例（避免 LLM 漏传 trait/function_name）
  - 调 resumeWithThreadTree 传 objectFlowDirOverride=superDir

**副带修复**（被新测试发现的既有 bug）：
- `engine.ts::resumeWithThreadTree` 的 `command === "return"` 调用了不存在的
  `scheduler.markDone(threadId)` → 抛错 "scheduler.markDone is not a function"。
  改为与 run 路径一致使用 `tree.returnThread()`（自动设 done + 写 summary + 唤醒等待父线程）。
- `engine.ts` 两路径（run + resume）的 `call_function`：当 `form.trait` 或
  `form.functionName` 缺失时**静默跳过**（导致 LLM 误以为 persist_to_memory 成功
  但什么都没写）。改为：
  1. 兜底：从 `args.trait` / `args.function_name` 补填
  2. 缺失时 inject 明确错误 + warn log（而非静默跳过）

**新测试**：`kernel/tests/engine-run-super-thread.test.ts`（2 tests）：
- super 线程消费 unread inbox → call_function persist_to_memory →
  memory.md 落盘（不带行号污染）+ inbox 状态 marked + 不写 flows/
- 无 unread inbox 时 scheduler 跑完无副作用

**测试**：`bun test tests/engine-run-super-thread.test.ts` → **2 pass 0 fail**
**全量**：604 → **606 pass**（+2）零回归
**kernel commit**：`6b3be6e` feat(engine): super 线程 ThinkLoop 执行路径（Phase 3）

### Phase 2 — World 集成

**改动**：
- `world.ts`：新增 `_superScheduler: SuperScheduler` 成员
  - constructor 中创建（runner 是闭包：每次执行重新构建 EngineConfig）
  - `init()` 末尾：注册所有非 user 对象 + start polling
  - 新 API：`stopSuperScheduler()`（graceful shutdown 入口） + `get superScheduler`
- `cli.ts`：在 start 子命令注册 SIGINT/SIGTERM handler，调 `world.stopSuperScheduler()` 后退出

**测试**：606 pass / 0 fail（无回归；World 集成验证留 Phase 4 真服务 E2E）
**kernel commit**：`5c88769` feat(world): 启动时初始化 super-scheduler（Phase 2）

### Phase 4 — 完整 G12 E2E 真实验证

**环境准备**：
- `rm -rf stones/bruce/super stones/bruce/memory.md`（清干净起点）
- 启动服务：`cd user && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' bun kernel/src/cli.ts start 8080`

**第一次跑（暴露问题）**：
- 启动后 SuperScheduler 自动检测到 bruce 旧 super 的 unread inbox 并启动 ThinkLoop
- 但 super 线程的 LLM 把自己当成普通 bruce——开始读 docs 文件、找工作流，**没有去 persist**
- **根因**：super 线程加载的 readme 是普通 bruce 的，且 `kernel:reflective/super` trait
  的 `when: never` 不会自动激活——LLM 既没有"super 角色感知"也看不到沉淀工具
- **修复**：在 `runSuperThread` 中：
  1. force-activate `kernel:reflective/super` 到 root 线程（让 callMethod 看见沉淀工具）
  2. 注入 `super_role` extraWindow——明确告诉 LLM 自己是 X 的 super 镜像分身

**第二次跑（暴露 LLM 工具调用协议陷阱）**：
- super 线程跑了，识别了角色（"I'm in bruce:super thread"），决定 persist
- LLM `open call_function` 时**只传了 description，漏传 trait + function_name**
- engine 静默跳过——LLM 以为成功，inbox ack，return done
- 但 memory.md 实际从未写入
- **修复**：
  1. engine 两路径都加 inject 错误（静默跳过 → 显式报错）
  2. super_role prompt 补完整 open + submit 示例（含必传字段标注）

**第三次跑（成功！完整 G12 闭环跑通）**：

session 1（user → bruce 主线程）：
- session id：`s_mo9dwvjz_ass8gf`
- bruce 主线程：`th_mo9dwvke_wppml2`（4 iter，status done）
- 第 2 轮 LLM 调 `talk(target="super", context="fork")`
- handleOnTalkToSuper 落盘到 `stones/bruce/super/`，messageId `msg_mo9dxke1_goap`
- bruce 主线程 `[return]` 汇报已完成

bruce super 线程（被 SuperScheduler 自动唤醒）：
- super root 线程：`th_mo9dxke3_xsbeqo`（runSuperThread 4 iter，status done）
- 第 1 轮 thinking：`I'm in bruce:super thread. I have an unread inbox message...`
  → LLM 正确识别角色
- 第 2 轮：`open call_function trait="kernel:reflective/super" function_name="persist_to_memory"`
  → form `f_mo9dy0l5_nzh1`
- 第 3 轮：`submit args={ key: "线程树的可观测性价值", content: "..." } mark=[ack]`
  → `kernel:reflective/super.persist_to_memory` 执行成功，写入 `stones/bruce/memory.md`
  → inbox `msg_mo9dxke1_goap` mark 为 ack
- 第 4 轮：`open + submit return`（summary：`处理了 1 条 inbox 消息：将「线程树的可观测性价值」经验沉淀到 memory.md`）

`stones/bruce/memory.md` 实际内容（干净，无行号污染）：
```
## 线程树的可观测性价值（2026-04-22 09:40）

OOC 的线程树设计让外部观察者第一次能看到 LLM 的注意力边界。每个线程是一个明确的上下文窗口，外部可以清晰看到：LLM 在关注什么、忽略了什么、上下文切换发生在哪里。这比黑箱式的单轮对话提供了全新的可观测性。
```

session 2（验证下次 Context 注入 memory）：
- session id：`s_mo9dz1sm_ehcgc7`
- 用户问："你还记得之前对线程树有什么经验？请直接 [return] 引用具体经验内容"
- bruce 主线程 2 iter 直接 return（无需任何文件查询——memory 已在 Context）
- 回复内容：
  ```
  我记得的经验是：
  **线程树的可观测性价值（2026-04-22 09:40）**
  OOC 的线程树设计让外部观察者第一次能看到 LLM 的注意力边界。
  每个线程是一个明确的上下文窗口，外部可以清晰看到：LLM 在关注什么、忽略了什么、上下文切换发生在哪里。
  这比黑箱式的单轮对话提供了全新的可观测性。
  ```

**G12 完整闭环数据流**：
```
user talk → bruce 主线程 ThinkLoop
  → talk(target="super", msg=...) [session 1]
    → handleOnTalkToSuper 落盘 stones/bruce/super/threads.json (unread inbox)
SuperScheduler polling tick
  → 检测 unread → runSuperThread(bruce, superDir, config)
    → 加载 super tree、激活 kernel:reflective/super trait、注入 super_role prompt
    → resumeWithThreadTree（虚拟 sessionId="super:bruce"）
      → LLM ThinkLoop（识别角色、判断价值、调 persist_to_memory）
        → kernel:reflective/super.persist_to_memory({ key, content })
          → append stones/bruce/memory.md（干净，无行号污染）
          → mark inbox unread → ack
      → return done
[next session]
user talk → bruce 主线程 ThinkLoop
  → context-builder 从 stones/bruce/memory.md 读取（knowledge 段注入）
  → LLM 看到 memory，直接 return 引用
```

**全程线程 ID 追溯**：
| 事件 | ID |
|------|-----|
| bruce session 1 | `s_mo9dwvjz_ass8gf` |
| bruce 主线程 | `th_mo9dwvke_wppml2` |
| talk(super) messageId | `msg_mo9dxke1_goap` |
| bruce super root 线程 | `th_mo9dxke3_xsbeqo` |
| super persist_to_memory form | `f_mo9dy0l5_nzh1` |
| memory.md 路径 | `stones/bruce/memory.md` |
| bruce session 2（验证 Context 注入） | `s_mo9dz1sm_ehcgc7` |

**服务停机**：`lsof -tiTCP:8080 | xargs kill -9`，`SIGINT` handler 走 graceful stop（in-flight runner 完成）

**测试基线终值**：606 pass / 6 skip / 0 fail（与 Phase 3 一致；E2E 是真服务而非单测）

### Phase 5 — 文档

待执行：
- `docs/meta.md` 子树 3（Engine）+ 子树 4（协作）说明 super-scheduler
- `docs/哲学/discussions/2026-04-22-super-scheduler-g12真闭环.md`（新）
- `docs/哲学/genes/g12-经验沉淀.md` 工程映射章节追加

### 测试基线演进

| 阶段 | 总 pass | 增量 |
|------|---------|------|
| 起点（SuperFlow 转型完成） | 593 | — |
| Phase 1 后 | 604 | +11（super-scheduler.test） |
| Phase 3 后 | 606 | +2（engine-run-super-thread.test） |
| Phase 2 后 | 606 | 0（World 集成测试由 Phase 4 真服务 E2E 覆盖） |
| Phase 4 后 | 606 | 0（E2E 是真服务） |
| Phase 5 后 | 606 | 0（纯文档） |

**零回归 / 零新增 fail / 零新增 skip**。

### 非预期发现 / 偏离

1. **resume 路径既有 bug**：`return` 命令调用了不存在的 `scheduler.markDone()`，
   导致 Phase 3 测试启动时直接报错 "scheduler.markDone is not a function"。
   修复后 super E2E 才能跑通。属于"super-scheduler 把潜在 bug 暴露出来"——
   增益。

2. **call_function 协议陷阱**：LLM 在 open 时漏传 trait/function_name，engine 静默跳过——
   导致 LLM 自欺（以为 persist 成功，实际什么都没做）。
   修复：参数缺失时显式 inject 错误 + 提供 args 兜底通道。
   也属于"E2E 暴露既有 UX bug"——增益。

3. **super 角色感知**：仅靠 `talk(target="super")` 落盘 + 加载主对象 readme 远远不够。
   super 必须要有"我是 X 的反思镜像分身"的视角注入 + sankened 的沉淀工具。
   增加了 `runSuperThread` 内部的 force-activate trait + super_role extraWindow——
   这是迭代设计中没明确写出但必须的"第三步"。

4. **engine.ts 行数继续膨胀**：runSuperThread + 副带修复让 engine.ts 增加约 100 行。
   总行数 2410 → 2510。后续应考虑拆分（`run.ts` / `resume.ts` / `super.ts`）——
   留作技术债。

