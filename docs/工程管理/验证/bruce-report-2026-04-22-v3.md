# Bruce 回归测试报告 · 2026-04-22（v3：并行 9 iteration 综合回归）

> 测试者：Bruce（新用户视角）
> 环境：macOS + Chrome via Playwright MCP
> 后端：`localhost:8080`（PID 32346，预启动）
> 前端：`localhost:5173`（PID 32349，vite dev）
> 测试 session：`s_moa4mn3v_n364n4`（code_index 测试起点，后续在同一 session 累积 6 条请求）
> LLM 输入查看样本 session：`s_mo9miafp_59411o`
> 截图目录：`screenshots-bruce-2026-04-22-v3/`（41 张）

## 环境

- Backend 8080 / Frontend 5173（本轮均预启动，未重启）
- 9 项新能力：code_index / edit plans / test watch / build feedback / git pr advanced / reviewable / memory curation / running summary / LLMInputViewer
- 测试方式：spawn supervisor 触发各能力；同时顺带跑常规回归。

## 总览

9 项新能力 + 4 项常规回归 = 13 项。

- ✅ **5 项完全通过**（#1 code_index, #2 edit plans backend, #3 test watch, #7 memory curation knowledge 窗口, 3 项回归）
- ⚠️ **5 项部分通过 / 有 caveat**（#2 前端 EditPlanView 缺失, #5 git blame fallback, #6 read_diff fallback, #8 running summary 只有 pulse 没有 currentAction 文本, #9 parser 错误）
- ❌ **1 项未观察到**（#4 build_feedback knowledge 窗口在 writeFile 路径没注入）
- ✅ **2 项常规回归通过**（@ overlay + Esc、对象卡片 prefill）

---

## 重点新能力 1-9

### 测试项 #1：Code Index trait — ✅ 重点

- **步骤**：新 session → 发 "请用 code_index trait 找一下 handleOnTalkToSuper 定义在哪个文件、多少行"。后续又发了 `symbol_lookup("Engine"/"ContextBuilder"/"Scheduler")` 三连打。
- **期望**：返回精确文件路径 + 行号。
- **实际**：
  - 第 1 次查找：`handleOnTalkToSuper 函数定义在 kernel/src/world/super.ts 第 67 行, 类型为 function. 通过 code_index 的 symbol_lookup 在 program 沙箱中调用 callMethod 定位成功.`（18 轮完成）— **文件+行号完全正确**（我用 grep 验证了：`grep -n handleOnTalkToSuper kernel/src/world/super.ts` 命中 67 行）
  - 第 2 次三连打：supervisor 返回了**结构化表格**（目标 / 最接近的符号 / 位置），还显示了模糊匹配与结论：
    ```
    符号查找结论：
    - Engine → interface EngineConfig
    - ContextBuilder → 不存在（semantic_search 也返回 0 结果）
    - Scheduler → class ThreadScheduler + class SuperScheduler
    结论：symbol_lookup 做精确名称匹配。代码库中不存在独立的 Engine/ContextBuilder/Scheduler 符号——实际名称是 EngineConfig、ThreadScheduler 等。ContextBuilder 在整个索引中完全不存在（可能叫 buildThreadContext）。
    ```
- **截图**：`01-code-index-10s.png`、`02-code-index-35s.png`、`03-thread-opened.png`、`37-symbol-lookup-3x.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？**完美**——symbol_lookup / semantic_search / list_symbols 三个方法都被正确调用并返回结果。
  - 意外行为？LLM 会主动告诉用户"这个符号实际不叫这个名字，真实名称是 X"——非常好。
  - 界面清晰？表格清楚，有目标 / 最接近的符号 / 位置三列，视觉结构化。
  - 说明缺失？无。

### 测试项 #2：Multi-file Transaction (Edit Plans) — ✅ 后端 / ⚠️ 前端

- **步骤**：发"请用 plan_edits 规划一次跨 2 文件的小改动 (`/tmp/bruce-v3-a.txt` / `/tmp/bruce-v3-b.txt`)，preview 给我看，不要立即 apply"。
- **期望**：返回 plan_id + unified diff；前端显示 EditPlanView。
- **实际**：
  - **后端 ✅**：supervisor 正确调用 `plan_edits` → 返回 `plan_id: ep_moa4pmk8_kuvoaf, changesCount: 2` + 完整的 unified diff：
    ```
    --- a//tmp/bruce-v3-a.txt
    +++ b/...
    @@ write (full file overwrite) @@
    - <file did not exist>
    + hello a
    ```
  - **前端 ⚠️**：文件树里出现了 `edit-plans/ep_moa4pmk8_kuvoaf.json` (395B) ✅，点击后只是 **raw JSON 代码视图**（带行号），**没有专门的 `EditPlanView` 组件**渲染 diff。
  - JSON 内容完整：`planId, sessionId, createdAt, status: "pending", rootDir, changes: [{kind: "write", path, newContent}]`。
- **截图**：`04-edit-plan-30s.png`、`05-edit-plan-75s.png`、`06-edit-plans-folder.png`、`07-edit-plan-json-view.png`
- **分类**：✅ 后端通（unified diff 渲染在对话里） / ⚠️ 前端专用视图未实现
- **四维**：
  - 能用吗？对话里的 unified diff 渲染就够用了，用户能看懂要改什么。
  - 意外行为？无。
  - 界面清晰？点击 JSON 文件看原始数据 OK；若有专用 EditPlanView 会更友好。
  - 说明缺失？无。

### 测试项 #3：Test Watch (run_tests) — ✅ 重点

- **步骤**：发"请用 testable trait 的 run_tests 跑一次 kernel/tests/thread-engine.test.ts，返回 pass/fail/summary"。
- **期望**：返回 pass/fail 结构。
- **实际**：返回了**完整结构化**的测试统计：
  ```
  kernel/tests/thread-engine.test.ts 测试全部通过：
  • pass: 18
  • fail: 0
  • skip: 0
  • exitCode: 0
  • durationMs: 101ms
  • expect() calls: 48
  测试覆盖了线程调度的各种边界场景（单线程迭代上限、全局迭代上限、LLM 异常等），全部正常。
  ```
- **截图**：`08-run-tests-45s.png`、`09-run-tests-75s.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？完美——pass/fail/skip/exitCode/durationMs/expect() calls 六个维度都返回。
  - 意外行为？supervisor 还做了**语义解读**（"测试覆盖了..."），加分。
  - 界面清晰？bullet list 一目了然。
  - 说明缺失？无。

### 测试项 #4：Build Feedback Loop — ❌ 未观察到 knowledge 窗口

- **步骤**：发"请用 file_ops 的 write 写一份故意不合法的 JSON 到 /tmp/bruce-v3-bad.json，写完后告诉我 build_feedback 里有什么提示"。
- **期望**：下一轮 knowledge 里出现 `<knowledge name="build_feedback">`，包含 JSON syntax error 提示。
- **实际**：
  - supervisor 成功写入了非法 JSON 文件（32 字节），但返回的结论：
    - `writeFile 不校验内容格式——只是把字节写进磁盘`
    - `build_feedback 在代码库中找不到对应的符号定义`
  - 后续轮次 LLM 并没有收到 `<knowledge name="build_feedback">` 窗口；supervisor 主动尝试 `symbol_lookup("build_feedback")` 也返回空。
  - 我直接 `grep build_feedback` 线程 thread.json 43 次——全部是 supervisor **自己**提到的文本，**没有任何 `<knowledge name="build_feedback">` inject**。
- **根因推测**（从 docs/工程管理/迭代/todo/20260422_feature_feedback_loop_完整闭环.md 提示）：
  - 当前 iteration 的 `build_feedback_loop.md` 只在 `apply_edits` 路径跑 hook，**不在 writeFile 单文件写入上跑**
  - 要等 `feedback_loop_完整闭环` 这个 todo 完成后 writeFile 才会触发 hook
  - 换言之 **v1 基础设施上线、闭环未打通**，是符合文档预期的
- **截图**：`14-build-feedback.png`、`15-build-feedback-done.png`
- **分类**：❌ writeFile 路径不触发；建议也通过 **apply_edits 场景**补测（本轮没跑成 apply_edits，因为用户请求用 writeFile）
- **四维**：
  - 能用吗？**writeFile 场景下不能用**。
  - 意外行为？无（与 todo 文档一致）。
  - 界面清晰？supervisor 如实反馈"build_feedback 不存在"——这个反馈本身是合理的。
  - 说明缺失？建议 trait 文档里说明 "build_feedback 目前只在 apply_edits 触发，writeFile 不会"——避免 LLM 浪费时间找不存在的 symbol。

### 测试项 #5：Git PR / blame — ✅ 功能通 / ⚠️ 未走专用 trait

- **步骤**：发"请帮我用 git 的 blame 能力看一下 kernel/src/cli.ts 第 1 行是谁写的"。
- **期望**：返回 author + commit + date，理想是通过 `library/git/advanced` 的 `blame` trait 方法。
- **实际**：
  - supervisor 没有 `git/blame` 在可用 trait 列表里——直接 fallback 用 `program` 跑 `shell: cd kernel && git blame -L 1,1 src/cli.ts`
  - 返回：
    ```
    kernel/src/cli.ts 第 1 行的 git blame 结果:
    • Author: fumeboy
    • Commit: 1c30190
    • Date: 2026-03-26 02:26:50 +0800
    • Line content: /**
    注: kernel 是 git submodule (https://github.com/fumeboy/ooc.git), 需在 kernel/ 目录内执行 git blame 才能查到历史。
    ```
- **截图**：`10-git-blame-45s.png`、`11-git-blame-75s.png`、`12-git-blame-done.png`、`13-git-blame-final.png`
- **分类**：⚠️ 功能性 OK（最终用户得到了正确答案），但**新 git trait 未被触发**
- **四维**：
  - 能用吗？最终用户看到了 author+commit+date，可用。
  - 意外行为？supervisor 第一次失败（没意识到 kernel 是 submodule）后 **自主修正**走子模块内 git blame——这个自纠错非常好。
  - 界面清晰？结果 bullet list 清晰。
  - 说明缺失？**`library/git/advanced` trait 不在 supervisor 默认可用列表里**。需要 supervisor 通过 `open(type=trait, name=...)` 主动加载才能调用。可考虑在 supervisor readme 里提示"git 操作优先用 library/git/advanced trait"。

### 测试项 #6：Code Review / read_diff — ⚠️ 同 #5

- **步骤**：发"请用 reviewable trait 的 read_diff 看一下 kernel 最近 2 个 commit 之间的 diff（files + hunks），返回摘要"。
- **期望**：结构化 diff（files 数组、每个 file 的 hunks）。
- **实际**：
  - supervisor 日志显示 "reviewable trait 不存在 (不在可用 trait 列表中), 改用 shell_exec 的 git diff HEAD~1..HEAD"
  - 但**输出结果异常漂亮**：
    ```
    修改文件 (3 个):
    • src/thread/context-builder.ts  +32/-11
    • traits/reflective/super/index.ts  +112
    • traits/reflective/memory_api/TRAIT.md  +32

    架构要点:
    1. 双写兼容: persist_to_memory 同时写老 memory.md 和新 memory/entries/{id}.json
    2. 幂等迁移: migrate_memory_md 按 key+content hash 去重，多次跑结果一样
    3. 只读查询 trait: memory_api 只暴露读方法，写入通道仍在 super 的 persist_to_memory
    4. TTL + Pinned: 支持过期天数和固定标记，query 默认过滤过期条目
    ```
- **截图**：`16-read-diff-90s.png`、`17-read-diff-done.png`
- **分类**：⚠️ 功能通 / 未走专用 trait
- **四维**：
  - 能用吗？用户得到的是 **"结构化 diff + 架构摘要"**，质量比单纯 diff 还高。
  - 意外行为？supervisor 不仅给了 diff 还给了"架构要点"——这就是 LLM 做判断、代码做记账原则的好体现。
  - 界面清晰？表格 + 编号要点非常清晰。
  - 说明缺失？同 #5：reviewable trait 默认不可用，需 open 加载。

### 测试项 #7：Memory Curation / query_memory — ✅ 重点

- **步骤**：发"请用 memory_api 的 query_memory 搜索 key 或 content 里包含 'test' 的 memory entries。另外看看你当前 context 里有没有 knowledge name="memory" 这个窗口。"
- **期望**：返回条目或空结果；`<knowledge name="memory">` 存在。
- **实际**：
  - **memory_api trait 也不在可用列表**——supervisor 改用 file_ops 直接读 memory 目录。
  - 返回：
    ```
    1. query_memory 搜索 "test" 的结果
       • memory/entries/ 目录 不存在（尚未迁移为结构化存储）
       • memory.md 存在但其中没有任何包含 "test" 的内容
       • 结论: 没有匹配 "test" 的 memory entries

    2. knowledge name="memory" 窗口
       有。当前 context 中存在 <window name="memory">，内容为"Supervisor 项目知识"，包含组织结构速查、常用委派模式、关键文档路径、体验测试经验等。

    这说明 context-builder 成功从 stones/supervisor/memory.md 读取并注入了 memory 窗口（走的是老路径 memory.md，因为新的 memory/index.md 和 memory/entries/ 尚未创建）。
    ```
- **截图**：`18-query-memory-75s.png`、`19-query-memory-135s.png`、`20-query-memory-done.png`
- **分类**：✅ **knowledge 窗口注入成功**；⚠️ memory_api trait 未暴露给 supervisor
- **四维**：
  - 能用吗？**核心诉求达成**——`<knowledge name="memory">` 正常注入，回退路径 `memory.md` 生效。
  - 意外行为？支持老对象未迁移场景（memory/entries/ 不存在时回退到 memory.md）——**设计考虑周到**。
  - 界面清晰？supervisor 明确用"1. / 2." 分段回答两个子问题。
  - 说明缺失？memory_api 新 trait 同样不在默认列表；query_memory / migrate_memory_md 只能通过 open 加载使用。

### 测试项 #8：Running Session 动态摘要 — ⚠️ 只有 pulse 没有 currentAction 文本

- **步骤**：打开 running session，观察 SessionKanban 里 supervisor 主线程行。
- **期望**：kanban 中 running session 行展示 pulse 蓝点 + "正在 <currentAction>" 文本。
- **实际**：
  - **pulse 蓝点 `●` ✅**（running 时明显，finished 后变成 `✓`）
  - **"正在 <currentAction>" 文本 ❌ 未找到**
    - 所见摘要文本：始终是**上一条已完成任务的 summary**（例如 supervisor 完成 gene.md 总结后，下一条 symbol_lookup 请求进行中，kanban 显示的仍是 `gene.md 前 3 条基因的一句话总结:`）
    - **动态部分只有 `N actions` 数字在增长**（163 → 170 → 174 → 180 → 185 → 206）
  - 我尝试多次刷新 DOM 抓取，均没发现 hidden `正在 ...` 字段
- **截图**：`22-kanban-running-8s.png`、`23-kanban-running-25s.png`、`24-kanban-running-55s.png`、`25-kanban-running-pulse.png`、`40-final-kanban.png`
- **分类**：⚠️ 部分实现（pulse 有，动态文本没）
- **四维**：
  - 能用吗？用户**能看到线程在跑**（pulse + action 数增长），但**看不到"在干什么"**——需要点进去才知道。
  - 意外行为？无。
  - 界面清晰？显示上一条摘要虽然不是 currentAction，但作为"最近做过什么"也有一定信息量。
  - 说明缺失？如果有"正在 symbol_lookup Engine"这样的 live 文本会更加直观，现在需要点进去看右侧 sidebar。

### 测试项 #9：LLMInputViewer — ✅ 基础 UI 有 / ⚠️ parser 不工作

- **步骤**：导航到 `/flows/.../objects/supervisor/threads/.../llm.input.txt`。
- **期望**：树形左侧导航 + 右侧详情 + 顶栏字符数 / token 估算 / 搜索框；点击 `<knowledge>` 子节点看详情；搜索 `reporter` 高亮。
- **实际**：
  - 先测今天 session `s_moa4mn3v_n364n4`：**根本没有 llm.input.txt 文件**（threads/th_.../ 只有 thread.json）——可能该 session 不触发落盘
  - 切到 `s_mo9miafp_59411o/objects/supervisor/threads/th_mo9miagp_5n2223/llm.input.txt` 能看到视图
  - **顶栏** ✅：`llm.input.txt · 9,522 chars · ~3,174 tokens · 1 blocks`（字符数 + token 估算 + blocks 数）
  - **搜索框** ✅：`搜索（标签 / 属性 / 内容）` 占位符；输入 "reporter" 有清除按钮 × 出现
  - **左侧树导航** ⚠️：只有 **1 个节点 `other(parse-error) 9522`**——parser 没能把 XML 结构解析开（因为 llm.input.txt 是**多根**XML：`<system>...</system><assistant>...` 不是严格单根）
  - **右侧详情** ✅（占位 "在左侧选择节点查看内容"），但由于 parse-error 只有 1 个节点可选，点击后也没展开详情
  - **后端 XML 缩进** ✅：我直接读文件 `grep '^  <' llm.input.txt | wc -l` 得到 35 行 2 空格缩进，`<action>` → `<args>` → `<title>` 三层结构齐全（hostname 在行 315-336）
- **截图**：`28-llm-input-view.png`、`29-llm-input-detail.png`、`30-llm-input-search.png`、`31-llm-input-tree.png`
- **分类**：⚠️ 基础设施已上线但 parser 不能解析真实 llm.input.txt
- **四维**：
  - 能用吗？UI 框架 **可用**（顶栏 + 搜索 + 左右分栏），但**核心价值（树形导航）失效**。
  - 意外行为？显示 "other(parse-error)" 能如实告诉用户解析失败——不装糊涂。
  - 界面清晰？字符数/token 数/blocks 数一行齐——比 flat text 进步一大截。
  - 说明缺失？
    1. 需要把 parser 改成"容错模式"：多根 XML 也按每个 `<tag>` 顶层切块；或者在 XML 外包一个虚拟根
    2. 今天的 session（`s_moa*`）根本不写 llm.input.txt——是**可配置**行为还是**忘记落盘**？需 kernel 团队确认

---

## 常规回归

### 测试项 #10：对象卡片点击 prefill `@name` — ✅

- **步骤**：欢迎页点击 `bruce` 卡片。
- **期望**：输入框预填 `@bruce `。
- **实际**：点击后输入框 value = `"@bruce "`，placeholder 变成 `"Message bruce..."`。✅
- **截图**：`32-card-prefill.png`
- **分类**：✅ 无退化

### 测试项 #11：@ 浮层 + Esc 清空 — ✅

- **步骤**：进入 session，focus sidebar 输入框，按 `@` → 看浮层 → 按 Esc。
- **期望**：浮层弹出 6 个对象按字母排序，Esc 关闭浮层 + 清空 `@`。
- **实际**：
  - 按 `@` → 浮层弹出 `bruce / debugger / iris / kernel / nexus / sophia`（按字母排序） ✅
  - 按 `Esc` → 浮层关闭 + 输入框 value = `""` ✅
- **截图**：`36-at-overlay-sidebar.png`
- **分类**：✅ 无退化
- **注意**：**欢迎页的输入框 `@` 不触发浮层**（`33-at-overlay.png` / `34-at-overlay.png` / `35-at-b.png` 三张都看不到浮层）。只有在已打开的 session sidebar 里才触发。这可能是**有意设计**（欢迎页本来只用来挑对象起 session），但也可能是**回归退化**——需要 Iris 判断。

### 测试项 #12：Ctx View 4 色 legend — ✅

- **步骤**：点 Ctx View toggle。
- **期望**：显示 detailed / summary / title_only / hidden 四色 legend。
- **实际**：`focus: supervisor 主线程 | detailed (完整可见) | summary (title + 摘要) | title_only (仅 title) | hidden (不可见)`，thread 行有彩色左边框。
- **截图**：`38-ctx-view.png`
- **分类**：✅ 无退化

### 测试项 #13：MessageSidebar 过滤 noise + threads center — ✅

- **步骤**：比较 sidebar 里 action 列表是否过滤了 inject/mark_inbox；点击"查看所有线程"。
- **期望**：sidebar 无 inject/mark；threads center 显示"我发起的 / 收到的"。
- **实际**：
  - sidebar DOM 扫描：`thinking=64, open=64, inject=0, mark_inbox=0` ✅
  - threads center：`我发起的 (1) supervisor 主线程 → supervisor` + `收到的 (0) 暂无其他对象对 user 的消息` ✅
- **截图**：`39-threads-center.png`、`40-final-kanban.png`
- **分类**：✅ 无退化

---

## 其他观察

### 控制台错误

6 个 error（最初 3 个是 Vite HMR websocket proxy 错误 `ws://0.0.0.0:18080`），后期增加了 3 个——可能是 thread detail 加载时的某些资源请求；**应用层没有 aria-label 报错**，功能完整。

### 新发现：supervisor 自纠错很好

- **git blame**：第 1 次 `git blame kernel/src/cli.ts` 失败（kernel 是 submodule），supervisor 自己想到要 `cd kernel && git blame src/cli.ts`——自主修正很好。
- **多层 fallback**：`reviewable` 和 `memory_api` 不在可用 trait 时，supervisor 自动 fallback 到 shell/file_ops；**没有陷入死循环**，符合 G5（遗忘是智能的基础设施）+ G12（经验沉淀）。

### 新发现：EditPlans 文件持久化

- plan_edits 不仅返回 plan_id，还在 `flows/<sessionId>/edit-plans/<plan_id>.json` 文件化——**Supervisor 可以之后 "找回" 这些计划再 apply**，符合"对象生态"哲学。

### 新发现：context 里的 `<knowledge name="memory">` 真的有用

- supervisor 自省报告说：`<knowledge name="memory">` 包含组织结构、委派模式、关键文档路径、体验测试经验——这就是 G12 (经验沉淀) 的落地效果。

### 已知限制：3 个新 trait 未进入默认可用列表

- `reviewable`（read_diff 等 4 方法）
- `memory_api`（query_memory / migrate_memory_md）
- （git/advanced 的 blame 等）

这三个 trait 目前只能通过 `open(type=trait, name=...)` 主动加载。对 LLM 来说，如果不知道 trait 名字就 **发现不了它们**。这会影响"LLM 主动调用新能力"的比例。

---

## 总体印象（对 9 项新能力的满意度）

| # | 新能力 | 状态 | 核心输出 |
|---|---|---|---|
| 1 | Code Index trait | ✅ 完美 | 18 轮内返回精确 file:line，多方法（symbol_lookup/semantic_search/list_symbols）齐活 |
| 2 | Multi-file Transaction | ✅ 后端 / ⚠️ 前端 | plan_id + unified diff 齐全；EditPlanView 前端未实现 |
| 3 | Test Watch (run_tests) | ✅ 完美 | 返回 pass/fail/skip/exitCode/durationMs/expect() calls |
| 4 | Build Feedback Loop | ❌ 未观察到 | writeFile 不触发 jsonSyntaxHook（预期只在 apply_edits 触发） |
| 5 | Git PR / blame | ⚠️ 功能通/trait 未用 | fallback 到 shell，仍返回 author+commit+date |
| 6 | Code Review / read_diff | ⚠️ 功能通/trait 未用 | fallback 到 shell，返回结构化 3 列表格 + 架构要点 |
| 7 | Memory Curation | ✅ knowledge 窗口 / ⚠️ trait 未用 | `<knowledge name="memory">` 正常注入；memory_api trait 未暴露 |
| 8 | Running Session 动态摘要 | ⚠️ pulse 有 / currentAction 文本无 | 只见 pulse 蓝点 + action 数增长，没有 "正在 X" live 文本 |
| 9 | LLMInputViewer | ⚠️ UI 有 / parser 失效 | 顶栏+搜索+左右分栏齐备；parser 在多根 XML 上 parse-error |

**通过率**：
- ✅ 完全通过：2/9（#1, #3）
- ✅ 关键价值达成（有瑕疵）：3/9（#2, #7, #9）— 后端 / 核心能力 OK，前端或 parser 需要补
- ⚠️ 功能性通过但未走新 trait：2/9（#5, #6）— trait 注册问题
- ⚠️ 部分实现：1/9（#8）— pulse 有，动态文本无
- ❌ 未观察到：1/9（#4）— 路径触发问题

**广义通过率：8/9 = 88.9%**（#4 的 build_feedback 是唯一完全没达成的）

---

## P0/P1/P2 待修 backlog

### P0（阻塞用户核心体验）

无。

### P1（重要，影响新能力的"发现率"）

1. **把 3 个新 trait 注册到 supervisor 默认可用列表**
   - 涉及：`reviewable`（read_diff 等）、`memory_api`（query_memory / migrate_memory_md）、`library/git/advanced`（blame 等）
   - 现象：supervisor fallback 到 shell，**不知道 trait 存在**。
   - 修复方向：在 supervisor `.stone/traits` 或默认 trait 列表里加这 3 个；或在 supervisor 的 memory.md 里列出"这些新 trait 你可以直接 open"。

2. **build_feedback loop 扩展到 writeFile 路径**
   - 现象：writeFile 不触发 jsonSyntaxHook → 下一轮没有 `<knowledge name="build_feedback">`。
   - 当前状态：docs/工程管理/迭代/todo/ 里已经有 `feedback_loop_完整闭环.md` —— 此 P1 已经在 todo 队列，符合进度，但需尽快推进。

3. **LLMInputViewer parser 改成容错模式**
   - 现象：XML 多根（`<system>...<assistant>...<user>` 并列）导致 parse-error，一直只显 1 个节点。
   - 修复方向：parser 内部用一个虚拟 `<root>` 包裹；或按 top-level `<tag>` 切块。

4. **Running Session 动态摘要补 "正在 <currentAction>" 文本**
   - 现象：只见 pulse 蓝点 + action 数，看不到"现在线程在干什么"。
   - 修复方向：从 thread 最新 action 抽 `tool_use.title` 或 `thinking` 首句，作为 kanban 行 "live tip"。

### P2（锦上添花）

5. **EditPlanView 专用前端组件**
   - 现象：`edit-plans/*.json` 只渲染 raw JSON，没有 diff 着色渲染。
   - 修复方向：参考 GitHub PR 的 diff view 写一个 EditPlanView。

6. **欢迎页 `@` 不触发浮层一致性**
   - 现象：session sidebar 里 `@` 触发浮层 ✅，但欢迎页底部的 "Message supervisor..." 输入框 `@` 不触发。
   - 修复方向：确认这是有意设计还是遗漏。（建议欢迎页也支持——新用户体验更一致）

7. **今天的 session 不写 llm.input.txt**
   - 现象：`s_moa*` 整组 session 的 threads 目录里没 llm.input.txt。
   - 修复方向：确认是否 kernel 切换了写策略（仅 debug mode 写？）；文档里说明。

### P3（观察记录，不必修）

8. **`<knowledge name="memory">` 内容来自老 `memory.md`，新 `memory/index.md` + `memory/entries/` 尚未生成**
   - 符合 docs/工程管理/迭代/all/ 中 memory_curation 的"双写兼容"设计
   - 老对象未迁移的回退逻辑生效，非 bug

---

## 最终交付

- **测试项总数**：13（9 新能力 + 4 回归）
- **分布**：✅ 完全通过 5 / ✅ 关键通过有瑕疵 3 / ⚠️ 部分 3 / ❌ 1 / ✅ 回归 2
- **9 项新能力广义通过率**：8/9 = 88.9%（#4 唯一未达成）
- **最重要 3 个发现**：
  1. **Code Index trait 是 CodeAgent 最可立即产出价值的能力**——18 轮定位代码符号，精确率 100%，体验可直接用于生产
  2. **3 个新 trait 未注册到默认可用列表**——这是 #5 #6 #7 "部分通过"的共同根因，修了这个问题 3 个能力能一起提升为 ✅
  3. **LLMInputViewer 基础设施已到位，但 parser 还 parse 不了真实 XML**——这是 #9 的关键短板，补完 parser 可立即解锁"XML 树形导航"价值
- **推荐 fix 顺序**：
  - P1-1（trait 注册）→ 一改三通过
  - P1-3（parser 容错）→ LLMInputViewer 立刻可用
  - P1-4（currentAction live tip）→ 提升 running 状态可见性
  - P1-2（build_feedback 扩到 writeFile）→ 依赖 todo 队列中的"闭环"迭代
  - P2 系列后置

**结论**：
本轮 9 项新能力"骨架到位"（8/9 功能性通过），其中 `code_index` 完全生产就绪。主要短板集中在 **trait 分发**（3 个新 trait 没进默认列表）和 **前端渲染**（EditPlanView / LLMInputViewer parser / running currentAction 文本）。推荐下一迭代专注补齐这三类前端/分发层工作——比新增能力更有 ROI。
