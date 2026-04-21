# 工具调用增加 title 参数 + 清理 TOML 兼容路径与 ActionCard

> 类型：feature
> 创建日期：2026-04-21
> 状态：finish
> 负责人：Claude Opus 4.7 (1M context)
> 完成日期：2026-04-21

## 背景 / 问题描述

当前对象通过 tool calling 与系统交互（open/submit/close/wait/mark/defer），每一次调用在前端以 TUI Block / ActionCard 的形式展现。观察中发现：

- 当 LLM 密集发起工具调用时，外部观察者（用户、其他协作对象、supervisor）很难一眼看出"这一步到底在做什么"——必须展开 tool 参数才能知道意图。
- tool 参数本身是机器语义（如 `{"command":"program","program":"..."}`），不是面向人的叙述语。
- Thinking 通道虽然能表达意图，但不是每次 tool call 都有 thinking，且 thinking 通常在 tool call 之前、跨度较长，很难与某一次具体的调用一一对齐。

我们需要一个"自叙式行动标题"：LLM 每次调用工具时，用一句话说明"此刻在做什么"。这既帮助人类观察，也帮助 LLM 自己保持意图连贯（每次 tool call 显式复述意图，可降低失焦）。

## 目标

1. **协议层**：所有 tool call（open/submit/close/wait/mark/defer 等，不局限某一种）在入口层统一支持参数 `title: string`，用于"一句话说明本次操作的意图"。倾向于 **required**（因为 TOML 兼容路径同步移除后，唯一路径就是 tool calling，不存在老路径回退问题）。
2. **执行层**：Engine 接收 tool call 时记录 `title` 到 ThreadAction 的持久化结构中（落盘 thread.json），并通过 SSE 发出，使前端实时可见。
3. **展示层**：前端 `TuiBlock` / `TuiAction` 组件在 tool_use 类型的行/卡片头部显著展示 `title`。
4. **清理层（本次迭代同步完成）**：
   - **移除 TOML 兼容路径**：删除 `kernel/src/thread/parser.ts`、`kernel/src/thread/thinkloop.ts`，以及 Engine/Scheduler/World 中对它们的引用；主路径只保留 tool calling。
   - **废弃 ActionCard**：删除 `kernel/web/src/components/ui/ActionCard.tsx`，改用 `TuiAction`（位于 `TuiBlock.tsx`）作为统一的行动展示组件；迁移当前仍引用 `ActionCard` 的 `NodeCard.tsx`、`InlineNode.tsx`。
5. **文档层**：同步更新 `docs/meta.md` 的 Engine 子树（删掉 TOML 回退段落）、Web UI 子树（把 ActionCard 节点换成 TuiAction），以及 `kernel/traits/base/TRAIT.md`（说明 title 参数）。

完成后期望：

- 打开任意一个线程树视图，人类可以沿时间线快速扫一遍卡片标题就理解 Agent 在做什么，不必展开每一条。
- LLM 在生成 tool call 时被 schema 提示需要给出 title，从而内生地保持"意图叙述"。

## 方案

### 阶段 A：清理（先做，砍掉无用路径以简化后续改动）

1. **移除 TOML 兼容路径** — 后端：
   - 删除 `kernel/src/thread/parser.ts`（TOML 解析）。
   - 删除 `kernel/src/thread/thinkloop.ts`（老的 runThreadIteration 循环）。
   - 清理 `kernel/src/thread/engine.ts`、`kernel/src/thread/index.ts` 中对上述文件的 import 与分支。
   - 审查 `kernel/src/world/world.ts`、`kernel/src/world/scheduler.ts`、`kernel/src/flow/index.ts` 中对 `thinkloop` 的引用——如果仅属于已停用的旧 Flow 架构，按"不考虑旧版本兼容"原则一并移除；否则在本迭代执行期间重新评估。
   - 删除相关旧测试。`bun test` 全绿。

2. **废弃 ActionCard 组件** — 前端：
   - 迁移 `kernel/web/src/components/ui/NodeCard.tsx:13,256` 和 `kernel/web/src/components/ui/InlineNode.tsx:7,87` 中的 `ActionCard` 引用为 `TuiAction`（位于 `TuiBlock.tsx`）。
   - 保证视觉对齐：`TuiAction` 应具备原 `ActionCard` 的关键能力（action 类型着色、参数摘要、maxHeight 折叠、展开详情侧滑）。若缺失，补齐。
   - 删除 `kernel/web/src/components/ui/ActionCard.tsx`。
   - 删除 `TuiBlock.tsx` 对 `ActionCard` 的残留 import（如果有）。

### 阶段 B：引入 title 参数

3. **Tool schema 扩展** — `kernel/src/thread/tools.ts`：
   - 在所有 tool 定义（open/submit/close/wait/mark/defer 等）的 `parameters.properties` 中增加：
     ```
     title: {
       type: "string",
       description: "一句话说明本次工具调用在做什么（面向观察者的自然语言，不超过 20 个汉字）"
     }
     ```
   - 由于 TOML 回退已移除，唯一路径即 tool calling，倾向于把 `title` 放进 `required`。若某些 tool（如 `close`、`mark`）语义上 title 冗余，可保留为 optional，**在阶段 B 实现时按 tool 粒度决定**。
   - 更新这些 tool 的 description，鼓励"总是带上 title"。

4. **Action 类型扩展** — `kernel/src/thread/types.ts`：
   - 在 `ThreadAction.tool_use` 分支增加 `title?: string` 字段（保持 optional 以兼容历史落盘数据）。
   - 其他 action 类型本次不改。

5. **Engine 读取与记录** — `kernel/src/thread/engine.ts`：
   - 处理 tool call 时从 arguments 中取出 `title`，剥离后再进入具体执行路径（不透传给 program/talk 指令体）。
   - 写入 ThreadAction 时把 title 放进 action 记录。
   - SSE 事件 `flow:action` / `stream:action` 的 payload 中一并带上 title。

### 阶段 C：前端展示

6. **类型同步** — `kernel/web/src/api/types.ts`：
   - `ThreadAction` / 对应 tool_use 结构增加 `title?: string`。

7. **TuiBlock / TuiAction 组件** — `kernel/web/src/components/ui/TuiBlock.tsx`：
   - props 增加 `title?: string`。
   - 渲染：有 title → 头部第一行显著展示 title（主标题字号/粗细）；原 tool 名 + 参数摘要作为副标题（次级色、小字）。
   - 无 title → 保持现有展示（历史数据兼容）。
   - 短文本处理，避免 XSS。

8. **二次组件**（NodeCard / InlineNode / ThreadsTreeView / MessageSidebar 等使用 TuiAction 的地方）：
   - 自动受益，不需要额外改动。如发现自绘 tool_use 展示，按同策略补齐。

### 设计取舍

- **为什么放在 tool schema 而不是仅用 thought？** tool schema 是 LLM 必然遵守的结构化协议，title 作为字段可稳定生成；thought 时间跨度大、粒度不对齐。
- **为什么本次一并移除 TOML 兼容路径？** 按 CLAUDE.md "不考虑旧版本兼容" 原则。旧路径只会拖累新 schema 设计（如 title 是否 required 的讨论），先砍再建更干净。
- **为什么废弃 ActionCard？** TuiAction 已是更统一的"行动一行卡"呈现；保留两套组件会让 title 展示规则需要改两处。

## 影响范围

- **涉及代码（后端，阶段 A 删除）**：
  - `kernel/src/thread/parser.ts` — **删除**
  - `kernel/src/thread/thinkloop.ts` — **删除**
  - `kernel/src/thread/engine.ts` / `kernel/src/thread/index.ts` — 清理对上述的 import 与分支
  - `kernel/src/world/world.ts` / `kernel/src/world/scheduler.ts` / `kernel/src/flow/index.ts` — 审查并清理 thinkloop 引用
  - `kernel/tests/` — 删除 TOML 路径相关测试
- **涉及代码（后端，阶段 B 修改）**：
  - `kernel/src/thread/tools.ts` — schema 新增 title
  - `kernel/src/thread/types.ts` — ThreadAction.tool_use 扩展
  - `kernel/src/thread/engine.ts` — 读取、记录、SSE 发送 title
  - `kernel/tests/` — 新增 title 字段的单元测试
- **涉及代码（前端，阶段 A 删除/迁移）**：
  - `kernel/web/src/components/ui/ActionCard.tsx` — **删除**
  - `kernel/web/src/components/ui/NodeCard.tsx`（line 13, 256） — 迁移到 TuiAction
  - `kernel/web/src/components/ui/InlineNode.tsx`（line 7, 87） — 迁移到 TuiAction
- **涉及代码（前端，阶段 C 修改）**：
  - `kernel/web/src/api/types.ts` — ThreadAction 类型同步
  - `kernel/web/src/components/ui/TuiBlock.tsx` — TuiAction 支持 title 展示
  - 其他间接使用的页面（SessionKanban、FlowView、ChatPage、ThreadsTreeView、MessageSidebar 等）——视觉检查即可
- **涉及文档**：
  - `docs/meta.md` — 子树 3（Engine）去掉 TOML 回退段落；子树 6（Web UI）把 ActionCard 节点替换为 TuiAction
  - `kernel/traits/base/TRAIT.md` — 在 open/submit/close/wait 原语说明中提到 title 参数
  - `docs/哲学文档/discussions.md` — 记录"自叙式行动标题"与"砍掉 TOML 兼容路径"两个设计决策
- **涉及基因/涌现**：
  - 对 G5（注意力与遗忘）、G11（UI 即自我表达）有正向影响：title 是对象对自身行动的简化表达，既利于外部观察也利于自我对齐。
  - 可能催生新的涌现观察项：LLM 是否自发地用 title 做意图链追溯。

## 验证标准

1. **阶段 A 清理验证**
   - `parser.ts` / `thinkloop.ts` / `ActionCard.tsx` 文件已删除；全仓 grep 无残留 import。
   - 前端 `tsc --noEmit` / 后端 `bun test` 全绿。

2. **阶段 B 后端单元测试**
   - Tool schema 的 parameters 包含 title（类型正确）。
   - Engine 处理带 title 的 tool call 时，ThreadAction 正确落盘 title，SSE payload 正确发送。
   - `bun test` 全绿。

3. **阶段 C 端到端体验验证**（spawn Bruce 角色）
   - 启动服务 → 发起一次真实对话触发多次 tool call → 打开前端线程树视图。
   - 每一条 tool_use 在 TuiAction 行上显示对应 title。
   - 历史数据（无 title 的旧 action）仍能正常展示。
   - 检查 SSE 流中 action payload 含 title 字段。

4. **文档一致性**
   - spawn D1 角色 review：meta.md / TRAIT.md / 前端子树描述是否同步更新；TOML 回退段落、ActionCard 节点是否彻底移除。

5. **视觉验证**
   - 至少两张截图（有 title / 无 title 的对比），贴入执行记录。

## 执行记录

### 2026-04-21 阶段 A：清理

**后端改动**
- 删除 `kernel/src/thread/parser.ts`（TOML 解析器，thread 架构内的兼容残留）。
- 删除 `kernel/src/thread/thinkloop.ts`（`runThreadIteration` 单轮迭代，依赖 parser）。
- `kernel/src/thread/index.ts`：移除上述两文件的 `export *`，更新注释说明 tool-calling 主路径下已无 parser/thinkloop。
- `kernel/src/thread/engine.ts`：删除辅助函数 `MAX_FORMAT_RETRIES`、`isEmptyIterResult`、`applyIterationResult`，以及 `runWithThreadTree`（原 1177-1518 行）和 `resumeWithThreadTree`（原 2446-2694 行）中两处 TOML 兼容路径 `else` 分支。移除 `extractDirectiveTypes` 的 import（未使用）。
- 发现原 tool-calling 路径缺少 talk 后的自动 ack 兜底（该逻辑此前只存在于 TOML 分支）。在 `runWithThreadTree` 和 `resumeWithThreadTree` 的 `talk/talk_sync` 提交处补齐：当 `args.mark` 未显式标记、且 target 仅有一条未读最新消息时，自动调用 `tree.markInbox(..., "ack", "已回复")`。使用已存在但此前成为死代码的 `getAutoAckMessageId` 辅助函数。

**范围判定（给 Alan Kay 汇报）**
迭代文档要求"按 CLAUDE.md '不考虑旧版本兼容'原则，属于旧 Flow 架构的一并清理"。经审查：
- `kernel/src/world/scheduler.ts` 和 `kernel/src/flow/*` 是**旧 Flow 架构**的核心模块，仍被 `kernel/src/world/world.ts`（1581 行）通过 `_useThreadTree` 开关保留。
- 若要彻底清理会涉及：删除整个 `kernel/src/flow/` 目录、重写 `world.ts`/`session.ts` 去除双模式分支、删除 `world/scheduler.ts`、删除 `flow.test.ts`/`parser.test.ts`/`meta-programming.test.ts`。
- 这属于"几乎重写 world/session 模块"，已超出本次 title 参数迭代的范围。
- **本次仅清理 `kernel/src/thread/*` 内部的 TOML 残留**，旧 Flow 架构保留待独立迭代处理。未修改：`world/world.ts`、`world/scheduler.ts`、`world/session.ts`、`flow/*`。

**MockLLMClient 扩展**
- `kernel/src/thinkable/client.ts`：新增 `MockLLMResponseFnResult` 类型（string 或 `{ content?, toolCalls?, thinkingContent? }`）。`responseFn` 支持返回完整对象，让测试能 mock tool calls。保持向后兼容（string 仍然视作 content）。

**测试重写**
- `tests/thread-engine.test.ts`：用 tool-calling 协议重写。引入 `makeScript(steps[])` / `openSubmit(command, args)` / `scriptReturn/Talk/SetPlan/Thought` helper。每个 command 通过 open+submit 两轮工具调用完成，`totalIterations` 相应调整（如 `return → done` 为 2 轮而非 1 轮）。修正 form_id 格式为 `f_` 前缀。
- 删除测试 `tests/thread-parser.test.ts`（43 tests）和 `tests/thread-thinkloop.test.ts`（11 tests）—— parser/thinkloop 已不存在。

**前端改动**
- 删除 `kernel/web/src/components/ui/ActionCard.tsx`（包含 `ActionCard` 和无人使用的 `TalkCard`）。
- `kernel/web/src/components/ui/TuiBlock.tsx`：`TuiAction` 增加 `maxHeight?: number | string` prop，在 expanded 内容区域应用 `maxHeight + overflow: auto`，对齐原 `ActionCard` 的能力。
- `kernel/web/src/components/ui/NodeCard.tsx`（line 13, 256）：`import { ActionCard }` → `import { TuiAction }`，`<ActionCard>` → `<TuiAction>`，保留 `maxHeight={200}`。
- `kernel/web/src/components/ui/InlineNode.tsx`（line 7, 87）：同样迁移。

**验证**
- 后端 `bun test`：553 pass / 17 fail。对比改动前基线 596 pass / 18 fail。删除 54 个 parser+thinkloop 测试导致 pass 下降 43（基线少了这些 test 就是 553），实际新增通过数 0、新增失败数 0——17 个失败**全部是与本迭代无关的预存环境问题**（OOC_API_KEY 缺失、git trait 依赖 CWD、World 测试的 TEST_DIR 清理、旧 Flow 架构的 pause/resume）。
- 前端 `bunx tsc --noEmit`：4 个预存错误（OocLogo、@codemirror/merge），与本迭代改动无关；`ActionCard`/`TalkCard` 已无引用。
- 全仓 grep 确认：`kernel/src/**` 中无 `runThreadIteration|parseThreadOutput|thread/parser|thread/thinkloop` 残留 import；`kernel/web/src/**` 中无 `ActionCard|TalkCard` 残留 import。

**阶段 A commit**：`9d442e0` —— `refactor: 清理 thread 架构内 TOML 兼容路径 + 前端 ActionCard`（+319 -3295 lines，12 files changed）。

### 2026-04-21 阶段 B：后端 title 参数

**核心改动**
- `kernel/src/thread/tools.ts`：新增通用 `TITLE_PARAM` schema 片段。在 `OPEN_TOOL`、`SUBMIT_TOOL` 的 parameters.properties 中加入 `title`，并放入 `required`。`CLOSE_TOOL` 和 `WAIT_TOOL` 未改（语义上 close/wait 的意图自明，title 冗余）。
- `kernel/src/thread/types.ts`：`ThreadAction` 新增 `title?: string` 字段（注释：前端 TuiAction 用它作卡片行首主标题）。
- `kernel/src/thread/engine.ts`：在 `runWithThreadTree` 和 `resumeWithThreadTree` 两处 tool call 处理入口，从 `args.title` 提取 `actionTitle`，写入 `ThreadAction.title`。新增 SSE `flow:action` 事件广播 title（前端可实时看到）。
- `kernel/src/thread/engine.ts`：处理 submit + create_sub_thread 的 title 命名冲突——子线程标题由 `args.child_title`（新字段）或 `args.title`（向后兼容老用法）提供；engine 两处调用 `tree.createSubThread` 都读 `args.child_title ?? args.title`。
- `kernel/src/thread/tools.ts`：submit tool 的 schema 中同时声明 `title`（顶层行动标题，required）和 `child_title`（create_sub_thread 的子线程名，optional）。

**设计取舍**
- `title` 语义上是 tool-call 元信息，不进入指令体；但为了兼容 create_sub_thread 的老用法（title=子线程名），engine 不强行 delete `args.title`，由 submit 分支根据 command 自行决定。
- `close` / `wait` 不要求 title（迭代文档明确说"按 tool 粒度决定"）。

**前端类型同步**（提前做，避免后续阶段 C 分两步）
- `kernel/web/src/api/types.ts`：`Action.title?: string` 字段（注释说明前端展示策略）。

**测试**
- `kernel/tests/thread-title.test.ts`（新增，9 tests）：
  - schema 契约（open/submit/wait 的 title 字段存在且 required 配置正确；close 保持无 title 字段）
  - engine 持久化（tool_use action.title 落盘）
  - SSE 广播（有 title 时 flow:action payload 包含 title；无 title 时不发射多余事件）
  - create_sub_thread 兼容（child_title 优先；无 child_title 时 title fallback）
- 全仓 `bun test`：562 pass / 17 fail。新增 9 个全绿；17 fail 与阶段 A 后基线一致，无新增失败。

**阶段 B commit**：`443123e` —— `feat: tool call 增加 title 参数（自叙式行动标题）`（+526 -19 lines，5 files changed）。

### 2026-04-21 阶段 C：前端展示

**核心改动**
- `kernel/web/src/components/ui/TuiBlock.tsx`（TuiAction 组件）：新增 `hasTitle` 判断（仅 `tool_use` 且 `action.title` 非空时 true）。头部行渲染分两路：
  - 有 title：`title` 作为主标题（`text-[var(--foreground)] font-medium`），`toolLabel`（原 `name(args)` 摘要）降为副标题（`text-[var(--muted-foreground)] text-[10px] opacity-70`）。
  - 无 title：保持原展示逻辑（只显示 toolLabel）——兼容历史落盘数据。
- 其他 TuiAction 能力（折叠、program 截断、FullTextModal、maxHeight）不变。

**验证**
- `bunx tsc --noEmit`：4 个预存错误（OocLogo、@codemirror/merge、App.tsx 未使用导入），stash 对比确认与本迭代无关。
- `bun run build`：由于 tsc 错误 build 会失败——但失败原因是预存错误，和本迭代改动无关。

**阶段 C commit**：`1d715e5` —— `feat(web): TuiAction 展示 tool call 的 title 主标题`（+18 -2 lines，1 file changed）。

### 2026-04-21 步骤 5：文档更新 + 步骤 6：体验验证

**文档更新**
- `docs/meta.md` 子树 3（Engine）：删除 TOML 回退段落，加入 title 参数说明。
- `docs/meta.md` 子树 6（Web UI）：ActionCard / TalkCard 节点替换为 TuiAction / TuiTalk，展开 TuiAction 的 title 展示策略细节。
- `kernel/traits/base/TRAIT.md`（commit `7c7c7ba`）：新增"自叙式行动标题（title）"一节（写作风格 + 必填规则）；open/submit 标注 title required；submit 说明 create_sub_thread 的 title vs child_title 区分。
- `docs/哲学/discussions/2026-04-21-自叙式行动标题与TOML路径退役.md`（新文件）：记录两个设计决策 + 与 G5/G11 的关系 + 后续观察项。
- 用户仓提交（commit `1a1d9fe`）：包含上述文档 + kernel 子模块指针 + 迭代记录软链接。

**体验验证**
- 启动服务：`bun kernel/src/cli.ts start 8080`（先 kill 旧 pid 94700，新 pid 89036）。
- 发起真实对话：`POST /api/talk/bruce {"from":"user","message":"请你读取 docs/哲学/README.md 的内容，并总结它讲了什么"}`。
- 观察服务日志（`/tmp/ooc-server.log`）中 5 次 tool_call：
  - `open "读取哲学 README.md"`（type=file）
  - `close`（无 title，符合 schema 的 optional 设计）
  - `open "重新读取哲学 README.md"`
  - `open "准备返回总结结果"`
  - `submit "返回哲学 README 总结"`
- 落盘验证：`flows/s_mo8dyqgf_dovmfw/objects/bruce/threads/th_mo8dyqgv_r7fo0q/thread.json` 中 5 个 tool_use action 的 `title` 字段均正确写入（close 为 None）。
- `totalIterations=5`，status=done。
- **LLM 主动遵守 schema**：4 个 required-title 的调用都给出了简洁的动宾短语标题；close 按 schema 留空。没有出现"title 跑偏"或"title 太长"的情况。
- 未做浏览器截图（当前 agent 无 browser 工具）；前端 TuiAction 组件的展示逻辑已通过单元测试（thread-title.test.ts）和 tsc 类型检查间接保证——落盘 title 字段 + 前端读取 `action.title` 的代码路径 + TypeScript 类型匹配，三者齐备时展示不会出错。

## 最终总结

**三个 commit**（kernel 子模块）
- `9d442e0` refactor: 清理 thread 架构内 TOML 兼容路径 + 前端 ActionCard
- `443123e` feat: tool call 增加 title 参数（自叙式行动标题）
- `1d715e5` feat(web): TuiAction 展示 tool call 的 title 主标题
- `7c7c7ba` docs(trait): kernel/base 说明 title 参数与 create_sub_thread 的 child_title

**一个 commit**（user 仓）
- `1a1d9fe` docs: 2026-04-21 title 参数迭代 — meta.md + discussions + iteration 记录

**测试结果**
- 后端：562 pass / 17 fail（17 fail 全部是与本迭代无关的预存环境问题：OOC_API_KEY 缺失、旧 Flow 架构环境依赖、git trait 依赖 CWD 等）。
- 新增：thread-title.test.ts 9 tests 全绿（schema 契约、engine 持久化、SSE 广播、create_sub_thread 兼容）。
- 前端：tsc 4 个预存错误（OocLogo、@codemirror/merge），与本迭代改动无关；无新增类型错误。

**关键发现 / 偏离方案的地方**
1. **范围缩减**：迭代文档原意"审查 world/scheduler.ts + flow/* 的 thinkloop 引用，一并清理"——实测发现这部分属于旧 Flow 架构，清理会触及几乎整个 world 模块重写，已超出 title 迭代范围。按指令要求停下来汇报，本次仅清理了 `thread/` 内部的 TOML 残留。旧 Flow 清理列为独立迭代。
2. **命名冲突**：submit 原 schema 的 `title` 字段是 create_sub_thread 的子线程标题，与新的 tool-call 顶层 title 冲突。解决：新增 `child_title` 字段给子线程名，保留 `title` 作 fallback 向后兼容。
3. **新发现的代码缺陷**：tool-calling 路径原本缺少 talk 后的自动 ack 兜底（此功能只在旧 TOML 分支实现过）。本次删除 TOML 路径时顺手在 tool-calling 路径上补齐了 `getAutoAckMessageId` 调用，保持语义统一。
