# think / talk 指令统一：fork vs continue 语义

> 类型：refactor
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Alan Kay

## 总结

把 thread 操作统一为 think（自己）/ talk（别人）两个指令，**参数一致**：`{msg, threadId?, context: "fork"|"continue", target?}`。
四种模式正交化（fork 自己/别人；continue 自己/别人），协作表达力扩展（talk 可以 continue 别人的线程、fork 别人线程下的子线程）。
按"不考虑旧版本兼容"原则，`create_sub_thread` / `continue_sub_thread` 指令直接删除。
顺带在 `kernel/traits/talkable/TRAIT.md` 补齐 `target="super"` 保留字说明（反例警告 + 示例），关闭 SuperFlow 迭代的 backlog #2。
Phase 1-5 全部达成；E2E 5 用例全绿；测试基线 562 → 571 pass / 6 skip / 0 fail；前端 tsc 0 error + build pass。


## 背景 / 问题描述

当前 thread 相关指令有三个：

- `talk(target, message, ...)` — 向别人的对象发话
- `create_sub_thread(title, ...)` — 在自己的线程树中创建子线程
- `continue_sub_thread(thread_id, message, ...)` — 向已有子线程追加消息

反思这四种 thread 操作模式：

| # | 模式 | 当前对应 |
|---|---|---|
| 1 | fork 别人的 thread | `talk`（隐式——每次 talk 都 fork 对方新根线程） |
| 2 | continue 别人的 thread | *目前无原生表达* |
| 3 | fork 自己的 thread | `create_sub_thread` |
| 4 | continue 自己的 thread | `continue_sub_thread` |

问题：
- **同一本质的 4 个变体**由 3 个语法不同的 command 表达，**概念不正交**
- `talk` 无法 continue 别人的 thread（只能 fork 新根），协作表达有限
- `create_sub_thread` / `continue_sub_thread` 命名冗长且只适用于自己的 thread
- LLM 学习成本高（要记多个 tool schema）

## 目标

把 thread 操作统一为两个指令 `think` 和 `talk`，**参数设计一致**：

- `think`：对自己的线程（替代 `create_sub_thread` / `continue_sub_thread`）
- `talk`：对其他对象的线程

**统一参数**：

```
think/talk {
  msg: string,                       # 要发送的消息
  threadId?: string,                 # 可选：基于哪个线程操作
  context: "fork" | "continue",      # 必填：操作模式
  target?: string                    # 仅 talk：目标对象名
}
```

**context 语义**：

- `fork`：**从原 thread 派生新线程**，不对原线程产生影响。
  - 适用场景：对原线程而言是 **readonly** 的工作——查资料、拆解子任务、探索方案、咨询、总结。
  - 行为：新建一个子线程（root 为原 thread），独立执行后 return。
- `continue`：**直接向原线程发送消息**，不新建线程。
  - 适用场景：对原线程要**产生影响**——补充信息、触发决策、汇报结果、追加指令。
  - 行为：往原 thread 的 inbox 投递消息，唤醒它继续执行。

**四种模式的新表达**：

| # | 模式 | 新 schema |
|---|---|---|
| 1 | fork 别人的 thread | `talk(target=X, msg, threadId=Y, context="fork")` |
| 2 | continue 别人的 thread | `talk(target=X, msg, threadId=Y, context="continue")` |
| 3 | fork 自己的 thread | `think(msg, threadId=Y?, context="fork")` |
| 4 | continue 自己的 thread | `think(msg, threadId=Y, context="continue")` |

**边界约定**（待确认）：
- `talk` 的 `threadId` 省略时：默认 fork 对方一条**新根线程**（= 当前 talk 行为）
- `think` 的 `threadId` 省略时：默认以**当前发起线程自身**为操作对象
- `continue` 时 `threadId` 必填（没有"continue 当前线程"的意义——当前线程自己就是 in flight 的）——在 schema 里用 `required` 校验
- `fork` 时 `threadId` 可选：省略则 fork 自身；填写则 fork 别的线程

## 方案

### Phase 1 — 指令协议层（tools.ts + types.ts）

- `kernel/src/thread/tools.ts`：
  - 新 `think` tool schema
  - `talk` tool schema 扩展：新增 `threadId?` 和 `context: "fork" | "continue"` 两个字段（`target` 保留）
  - `talk_sync` 同步扩展（如仍存在）
  - 标记 `create_sub_thread` / `continue_sub_thread` 命令为 **deprecated**（按 OOC"不考虑旧版本兼容"原则，**直接删除**，不做兼容层）
- `kernel/src/thread/types.ts`：
  - ThreadAction 的 tool_use / message_out 记录扩展 `context` 字段
- 单元测试：schema 正确性、`context=continue` 要求 threadId

### Phase 2 — Engine 处理层（engine.ts）

- `think` 的处理：
  - `context="fork"` + 有 `threadId` → 在指定 thread 下创建子线程（等价原 `create_sub_thread`）
  - `context="fork"` + 无 `threadId` → 在当前线程下创建子线程（默认自身）
  - `context="continue"` + 有 `threadId` → 向 `threadId` 的 inbox 投递消息，唤醒线程（等价原 `continue_sub_thread`）
  - `context="continue"` 无 `threadId` → schema 层已拒绝，engine 再保底抛错
- `talk` 的处理：
  - `context="fork"` + `target` + 无 `threadId` → 与当前行为一致（对方新根线程）
  - `context="fork"` + `target` + `threadId` → 对方某线程下 fork 新子线程（**新能力**）
  - `context="continue"` + `target` + `threadId` → 向对方某线程 inbox 投递，唤醒对方（**新能力**）
  - `context="continue"` 无 `threadId` → schema 层已拒绝
- 删除 `create_sub_thread` / `continue_sub_thread` 的 engine 分支
- 单元测试：四个模式全覆盖

### Phase 3 — Kernel traits 更新

- `kernel/traits/plannable/TRAIT.md`（原 `create_sub_thread` 的推荐 trait）：
  - `command_binding` 从 `["create_sub_thread"]` 改为 `["think"]`
  - 正文重写：说明 `think` 的两种 context 模式 + 适用场景
- `kernel/traits/talkable/TRAIT.md`：
  - 说明 `talk` 新增 `threadId` + `context` 参数
  - 举例：continue 别人 vs fork 别人 的场景
  - **顺带补 SuperFlow backlog #2**：新增一段说明 `target="super"` 是保留字，用于与"当前对象的 super（反思镜像分身）"对话。必须包含**反例警告**："不要把 super 误解为 supervisor——前者是自己的反思通道，后者是独立的监督对象。"附一个 example：`talk(target="super", msg="记下这个经验", context="fork")`
- `kernel/traits/base/TRAIT.md`：
  - 更新 open/submit 支持的命令清单
- 其他提到 `create_sub_thread` / `continue_sub_thread` 的 trait 文件全仓 grep 更新

### Phase 4 — 前端 + 文档

- 前端 TuiAction 渲染 `think` 命令卡片（参照现有 `create_sub_thread` 卡片）
- `docs/meta.md` 子树 3（ThinkLoop / Engine）更新指令系统清单
- `docs/meta.md` 子树 4（协作）更新 talk 通信原语
- `docs/哲学/discussions/2026-04-22-think-talk统一-fork-continue语义.md`（新 discussion）

### Phase 5 — E2E 验证

- bruce `think(msg, context="fork")` 不带 threadId → 默认自身下新子线程 ✅
- bruce `think(threadId=X, context="continue", msg=Y)` → X 线程 inbox 有新消息 ✅
- bruce `talk(target=supervisor, threadId=S, context="continue", msg=Y)` → supervisor 的 S 线程被唤醒 ✅
- **SuperFlow E2E 真实验证**（承接 SuperFlow 迭代的降级落盘验证）：bruce 被 prompt "向自己的 super 记下经验" → 成功产出 `talk(target="super", ...)`（**不再误解为 supervisor**）→ `stones/bruce/super/threads.json` 新增 inbox 消息
- 全量测试 0 fail
- 前端看板能看到 think/talk 两种卡片

## 影响范围

- **后端**：
  - `kernel/src/thread/tools.ts`（think schema + talk 扩展 + 删 create_sub_thread/continue_sub_thread）
  - `kernel/src/thread/engine.ts`（处理路径重写）
  - `kernel/src/thread/types.ts`（action 扩展）
  - `kernel/src/thread/tree.ts`（可能需要新 API：基于 threadId fork 子线程）
  - 相关测试
- **Kernel Traits**：
  - `kernel/traits/plannable/TRAIT.md`
  - `kernel/traits/talkable/TRAIT.md`
  - `kernel/traits/base/TRAIT.md`
  - 其他提到 create_sub_thread/continue_sub_thread 的 trait
- **前端**：
  - `kernel/web/src/components/ui/TuiBlock.tsx`（TuiAction 新增 think 渲染）
  - ActionBadge 配色
- **文档**：
  - `docs/meta.md`
  - `docs/哲学/discussions.md`
- **基因/涌现**：
  - 强化 G8（消息）与 G13（线程树）的表达力——对象获得"向任意线程任意模式投递"的原子能力
  - 四种操作正交化后，LLM 更容易表达意图

## 协调 / 依赖

- **SuperFlow 转型迭代**（进行中）：会改 world.ts 的 onTalk，和本迭代的 talk 扩展不冲突（它改路由逻辑，本迭代改 schema+engine）。**本迭代建议等 SuperFlow 转型完成后再启动**，避免 world.ts / engine.ts 并行冲突。
- **ReflectFlow 方案 B 已有代码**：`reflective/super/` trait 的沉淀工具方法不受影响（是 llm_methods，不是 command）。

## 验证标准

1. Phase 1-5 各自测试绿
2. 全量 `bun test` 保持 0 fail
3. 前端 tsc 0 error / build pass
4. Phase 5 E2E 四种模式落盘追溯
5. 全仓 `grep -rn "create_sub_thread\|continue_sub_thread"` 无代码残留（除历史 finish/ 迭代文档）
6. `docs/meta.md` 指令系统清单同步

## 执行记录

### 2026-04-22 开始执行

#### 现状调研（Step 2）

- 起点测试基线：**562 pass / 6 skip / 0 fail**（SuperFlow 转型完成态）
- `create_sub_thread` / `continue_sub_thread` 出现位置（kernel 内）：62 处跨 14 文件
  - src：`thread/tools.ts` (8)、`thread/types.ts` (3)、`thread/engine.ts` (15)、`thread/context-builder.ts` (7)、`thread/hooks.ts` (2)、`thread/collaboration.ts` (5)、`thread/scheduler.ts` (1)
  - tests：`thread-title.test.ts` (8)、`thread-context-builder.test.ts` (2)、`thread-tree.test.ts` (1)、`thread-collaboration.test.ts` (2)
  - traits：`plannable/TRAIT.md` (5)、`object_creation/TRAIT.md` (1)、`base/TRAIT.md` (2)
- 文档出现位置：约 12+ 处活跃文档（不含归档），主要在 `docs/对象/` 和 `docs/工程管理/验证/`
- 核心代码路径结构：
  - `tools.ts` 的 enum list 内含 "create_sub_thread"/"continue_sub_thread"
  - `engine.ts` 同时有**新建流程**和**resume 流程** 2 处分支处理（1207/1243 行，2137/2159 行）
  - `tree.createSubThread(parentId, title, options)` 是底层 API——新 think/talk 都基于此
  - `tree.writeInbox(nodeId, msg)` 是跨对象投递的底层 API（本对象写；跨对象 engine 目前通过 `onTalk` 回调让 world 走 `_talkWithThreadTree`）

#### 设计决策

1. **threadId 省略时的语义**：
   - `think(context="fork")` 无 threadId → fork 当前发起线程（默认自身）
   - `think(context="continue")` 无 threadId → schema 层 required 校验报错（continue 自己当前线程无意义）
   - `talk(context="fork")` 无 threadId → 对方创建新根（= 当前 talk 行为；兼容 continue_thread 参数过渡）
   - `talk(context="continue")` 无 threadId → 报错（continue 必须指定线程）

2. **required 校验规则**：schema 层声明 `msg` + `context` 必填；`threadId` 条件必填（由 engine 运行时校验）

3. **engine 分支合并策略**：4 种模式分别在 `think` / `talk` 下按 `context` 分发，**复用底层 API**：
   - `think(fork)` → `tree.createSubThread(threadId ?? currentThreadId, title=msg, ...)`
   - `think(continue)` → `tree.writeInbox(threadId, {from: self, content: msg, source: "continue"})`
   - `talk(fork)` → `config.onTalk(target, msg, objectName, threadId, ...)`（维持现有 continue_thread=undefined 语义）
   - `talk(continue)` → **新路径**：`config.onTalk` 中识别 `context="continue"`——即让 world 对对方的 thread 走跨对象 writeInbox

4. **跨对象 continue 的实现可行性**：
   - `world._talkWithThreadTree` 内置了 `continueThreadId` 参数（通过 `continue_thread` 老参数），会传给 `runWithThreadTree`
   - 但当前 `runWithThreadTree` 的 continueThreadId 语义是"在对方的 root 下继续而非 fork 子线程"
   - 经阅读 `runWithThreadTree` 的实现：传入 continueThreadId 时会复用该 threadId 作为对方的根线程（已有跨对象 continue 能力，只是没被本 schema 暴露）
   - 决策：`talk(context="continue", threadId=X)` → 透传 X 给 world 的 onTalk.continueThreadId，由 world 消费即可，**不需要新增 tree 跨对象方法**

5. **talk 的 continue_thread 老参数**：保留向后兼容（talk schema 已有 continue_thread；`context="continue"` 是新的语义通道）。本迭代遵守"不考虑旧版本兼容"直接删除 `continue_thread`，改为让 LLM 用 `threadId + context="continue"` 统一表达

6. **think 的 traits/description/outputs 参数**：沿用 create_sub_thread 的额外参数

#### Phase 1+2 — 指令协议 + Engine 处理

- `tools.ts`：
  - open 的 command enum 替换：新增 "think"，删除 "create_sub_thread" / "continue_sub_thread"
  - submit 参数新增 `msg` / `threadId` / `context`，删除 `continue_thread`
- `types.ts`：ThreadAction 新增可选 `context: "fork" | "continue"` 字段
- `engine.ts`：
  - run/resume 两路径同步重写 talk / think 分支
  - 删除 create_sub_thread / continue_sub_thread 分支
  - onTalk 签名新增 `forkUnderThreadId` 参数
  - `runWithThreadTree` 新增 forkUnderThreadId 初始化分支（对方线程下 fork 子线程）
- `world.ts`：_talkWithThreadTree 接入 forkUnderThreadId；onTalk 两处同步
- 新测试 `tests/thread-think-talk-unified.test.ts`：9 tests 覆盖 schema + 4 种模式
- kernel commit `b408c69` feat(thread): think/talk 指令统一 fork/continue 协议（Phase 1+2）
- 测试基线：**562 → 571 pass / 6 skip / 0 fail**（+9）

#### Phase 3 — Kernel traits 更新

- `traits/plannable/TRAIT.md`：command_binding 改 `["think", "set_plan"]`；重写为 think 的 4 模式对照 + 语义要点
- `traits/talkable/TRAIT.md`：
  - 重写为 talk 4 模式对照表（含 fork under / continue 两个新能力）
  - **新增 target="super" 保留字语义段**：反例警告、反例对比表、示例（承接 SuperFlow backlog #2）
- `traits/object_creation/TRAIT.md`：command_binding 改 `["think"]`
- `traits/base/TRAIT.md`：命令清单去 create_sub_thread / continue_sub_thread，加 think
- 用户 stones: `stones/supervisor/traits/session-kanban/TRAIT.md` 同步
- kernel commit `8672765` docs(traits): plannable/talkable/object_creation 同步 think/talk 协议 + super 保留字
- 测试基线：**571 pass / 6 skip / 0 fail**（持平）

#### Phase 4 — 前端 + 文档

- 前端：
  - `web/src/api/types.ts` Action 接口新增 `context?: "fork" | "continue"`
  - `web/src/components/ui/TuiBlock.tsx` TuiAction：think/talk 徽章（`command·context·threadId`），fork=blue，continue=teal
- 文档：
  - `docs/meta.md` 子树 3/4/5 同步（指令清单、通信原语、trait 清单）
  - `docs/对象/` 下 14 个文档替换 create_sub_thread / continue_sub_thread 引用（plannable.md 重写、子线程.md 重写、线程复活.md 局部、submit.md 改示例、wait.md 示例、scope-chain.md 局部、README 等）
  - `docs/哲学/discussions/2026-04-22-think-talk统一-fork-continue语义.md`：新 discussion（问题诊断、统一后的协议、fork vs continue 哲学、新能力、SuperFlow backlog 修复、验收）
- tsc: 0 error；vite build: 1233KB（持平）
- kernel commit `e0247ca` feat(web): TuiAction 新增 think/talk 徽章
- user commit `41233b2` docs+user: think/talk 统一协议文档同步
- 测试基线：**571 pass / 6 skip / 0 fail**（持平）

#### Phase 5 — E2E 验证

启动服务 `bun kernel/src/cli.ts start 8080`，串行运行 5 个 E2E 用例：

**Test 1 — think fork 自身** ✅
- Prompt bruce "用 think(context=fork) 派生子线程汇总 docs/meta.md 前 5 子树标题"
- session: `s_mo8xb04p_nb0zs5`，main thread: `th_mo8xb056_lb9vae`
- Engine log：
  - `[Engine] tool_call: open ... command":"think"`
  - `[Engine] tool_call: submit ... "context":"fork","msg":"请读取 docs/meta.md..."`
  - `[Engine] think.fork: 派生子线程汇总 meta.md 前5子树标题 → th_mo8xb9m1_sxp1z2`
- 落盘验证：`threads.json` 显示 root.childrenIds=[th_mo8xb9m1]，child.status=done，child.summary 含 5 个子树标题
- 主线程 return：iterations=10，status=done

**Test 2 — think continue 自身子线程** ✅
- Prompt bruce "向刚才子线程 th_mo8xb9m1_sxp1z2 发 think(continue) 补充消息（要求列出基因 ID）"，复用同 session
- Engine log：
  - `[Engine] tool_call: submit ... "context":"continue","threadId":"th_mo8xb9m1_sxp1z2"`
  - `[Engine] think.continue: → th_mo8xb9m1_sxp1z2`
- 子线程被唤醒：`[ThreadScheduler] 唤醒线程 th_mo8xb9m1_sxp1z2` → running → 处理后 return 基因 ID 列表（G7/G5/G13/G4/G9/G12/G6/G8/G3）
- 主线程 return 汇报 continue 投递成功

**Test 3 — talk fork 新根（= 当前 talk 行为）** ✅
- Prompt bruce "talk(target=supervisor, context=fork, msg=问候) 向 supervisor 发起新根线程"
- session: `s_mo8xdfit_dkprlj`
- Engine log：
  - `[World] 跨 Object talk: bruce → supervisor, session=s_mo8xdfit_dkprlj`（无 forkUnder / continue 后缀，= 新根）
  - supervisor 主线程 th_mo8xdppn_qnirqn 创建（根线程），收到 bruce 问候
  - supervisor 回复 bruce → `[World] 跨 Object talk: supervisor → bruce, session=..., continue=th_mo8xdfj5_99of9r`

**Test 4 — talk continue 对方已有线程（新能力）** ✅
- Prompt bruce "用 talk(target=supervisor, threadId=th_mo8xdppn_qnirqn, context=continue, msg=补充) 向 supervisor 已有线程投递 continue"
- Bruce 落盘 submit args：`{target:"supervisor", threadId:"th_mo8xdppn_qnirqn", context:"continue", msg:"..."}`
- Engine log：
  - `[World] 跨 Object talk: bruce → supervisor, session=s_mo8xdfit_dkprlj, continue=th_mo8xdppn_qnirqn`
- **关键**：world 正确传递 continueThreadId 参数（而非 forkUnderThreadId）；supervisor 的原线程被唤醒继续处理，而非新建线程

**Test 5 — SuperFlow E2E（super 保留字语义）** ✅ 🎉
- Prompt bruce "向你自己的 super（反思镜像分身，**不是 supervisor**）记下经验"
- session: `s_mo8xeac8_sr8tnq`
- Bruce LLM thinking：`"The user wants me to send a message to my 'super' (reflection mirror) using talk..."`
- Bruce 落盘 submit args：`{target:"super", msg:"经验沉淀：think/talk 统一 fork-continue 协议后..."}`
- Engine log：`[Super] bruce → super 投递: len=121 messageId=msg_mo8xek5g_xj27 rootId=th_mo8rn23b_85fznh`
- 持久化验证：`stones/bruce/super/threads/th_mo8rn23b_85fznh/thread.json` inbox 新增 1 条 `from=bruce` 的消息，内容匹配 bruce 投递的经验
- **SuperFlow backlog #2 关闭**：bruce 正确区分 super vs supervisor（上一轮被误解为 supervisor 的问题，本轮 trait 层文档化 target="super" 保留字 + 反例警告后，LLM 首次直觉就用对了）

**服务 kill**：`pkill -f "bun kernel/src/cli.ts"` 成功。

#### 全仓 grep 验证

- `grep -rn "create_sub_thread\|continue_sub_thread"` kernel/src/thread/：0 匹配（只剩 `sub_thread_on_node` 协作 API，保留）
- kernel/src/world/、kernel/src/thinkable/、kernel/web/：0 匹配
- 文档活跃区仅剩"替代旧 X"、"think 统一了 X"等说明性引用；归档区（.归档-20260421/）不处理

### 测试基线演进

| 阶段 | 总 pass |
|------|---------|
| 起点 | 562 |
| Phase 1+2 后 | 571（+9 新 think/talk 测试） |
| Phase 3 后 | 571（持平） |
| Phase 4 后 | 571（持平） |
| Phase 5 后 | **571 pass / 6 skip / 0 fail**（E2E 不改测试） |

零回归 / 零新增 fail / 零新增 skip。

### commit 清单

kernel：
- `b408c69` feat(thread): think/talk 指令统一 fork/continue 协议（Phase 1+2）
- `8672765` docs(traits): plannable/talkable/object_creation 同步 think/talk 协议 + super 保留字
- `e0247ca` feat(web): TuiAction 新增 think/talk 徽章（fork·continue·threadId）

user：
- `41233b2` docs+user: think/talk 统一协议文档同步（Phase 3+4 user 侧）
- 最终 commit：`refactor: think/talk 指令统一 + super 语义修正`（含 kernel submodule 指针、Phase 5 迭代文档流转）

### 非预期发现

1. **engine 签名扩展优于重构**：onTalk 原本有 `continueThreadId` 参数，新增 `forkUnderThreadId` 让两个能力并存（互斥使用）。不用改成 options 对象也能承载——正是 OOC "最小改动" 原则的体现。
2. **bruce 这次没搞错 super**：trait 层加了反例警告和 target="super" 明确段落后，LLM 一次就对，不需要 Phase 3 强化。原始 SuperFlow 迭代的 E2E 教训已经被此次迭代承接并修复。
3. **测试基线增长可预期**：+9 单元测试覆盖 4 模式 + schema 契约；现有 562 基线零回归。

### 后续 backlog

1. `forkUnderThreadId` 的 E2E 用例（talk 对方线程下 fork 子线程）——本次只做了 onTalk 端到端 unit 测试覆盖，LLM prompt 级 E2E 留作后续
2. 前端 Badge 可以进一步视觉化 fork tree（NodeCard 展示子线程关系时标注 fork/continue 来源）
3. 废弃警告：如果从旧版本升级带有 create_sub_thread actions 的 thread.json，前端应识别并提示（当前直接 fallback 到通用 tool_use 渲染，无警示）
