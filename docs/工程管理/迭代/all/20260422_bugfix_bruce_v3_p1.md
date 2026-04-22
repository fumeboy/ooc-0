# Bruce v3 回归 P1 修复包（一次性 4 件）

> 类型：bugfix
> 创建日期：2026-04-22
> 状态：finish
> 完成日期：2026-04-22
> 负责人：Kernel + Iris
> 优先级：P1

## 背景

Bruce v3 回归（`bruce-report-2026-04-22-v3.md`）9 项新能力 8/9 通过，但留下 4 件 P1 瑕疵：

## 4 件待修

### P1-a：3 个新 trait 没注册到 supervisor 默认可用列表

**现象**：supervisor 不知道以下 trait 存在，全 fallback 到 `shell_exec`：
- `kernel:reviewable/review_api`
- `kernel:reflective/memory_api`
- `library:git/advanced`（git/pr / git/worktree 也一起）

**根因**：trait 默认可用性由 `command_binding` 或 `when: always` 决定；新 trait 都 `when: never`，且没有 command_binding 把它们挂到常用指令上；supervisor 的 scope chain 里也没显式激活。

**修复方向**（两条路任选）：
1. `stones/supervisor/readme.md` 或 `.data.json` 列出 `_traits_ref` 引用这几个 trait
2. 给这几个 trait 加 `command_binding`：
   - `review_api` → bind to `return`（Supervisor 完成任务时可能想 review 代码）
   - `memory_api` → bind to `return`（反思时需要查记忆）
   - `git/*` → bind to `program`（通过 program 调用 git 命令）

推荐方式：**给 supervisor 的 readme 添加 `_traits_ref`**——精准范围，不污染其他对象。

### P1-b：build_feedback 不触发 writeFile 路径

**现象**：`file_ops.writeFile({path: "/tmp/bad.json", content: "{bad json"})` 写完后 jsonSyntaxHook 没跑，下轮 knowledge 没有 `<knowledge name="build_feedback">`。

**根因**：`engine.ts` 的 `triggerBuildHooksAfterCall` 目前只识别 `file_ops:writeFile` / `file_ops:editFile` **触发源**，但要求调用方 trait 是 `computable:file_ops`——**writeFile 从 `callMethod` 过来的路径里 objectName/traitId 格式匹配可能出错**，或者 `extractWrittenPaths` 没从 result 里拿到 path。

**修复方向**：
- 读 engine.ts `extractWrittenPaths` 逻辑，确认参数签名
- 加 debug log：每次 file_ops-family tool 调用后打印 `[build_hooks] triggering for path=...`
- 单元测试：mock 一次 writeFile bad.json → 验证 feedback store 里有条目

### P1-c：LLMInputViewer parser 多根 XML 容错

**现象**：`llm.input.txt` 实际结构是 `--- system ---\n<system>...</system>\n--- assistant ---\n...` 多根 + 角色头，DOMParser 遇到多根抛错 → 整棵树显示为 "other(parse-error)"。

**根因**：`LLMInputViewer.tsx` 的 parser 先按 `--- role ---` 切块，但未正确解析切块后的子 XML；或切块正则不对齐 engine.ts 的实际输出格式。

**修复方向**：
- 读 engine.ts `contextToMessages` 真实输出头部格式
- 调整 parser：切块 → 每块单独 DOMParser 包一层 `<root>...</root>` 再 parse
- fallback 用正则切标签而非 DOMParser

### P1-d：Running 线程 "正在 X" 文本不显示

**现象**：SessionKanban running 行显示 pulse 蓝点但**没有动态 currentAction 文本**。

**根因**：后端 `server.ts::computeCurrentAction` 已实现，但前端 `SessionKanban.tsx` 的 render 可能没读到 subFlow.currentAction 字段，或读到但组件条件判断漏渲染。

**修复方向**：
- 调 `GET /api/flows/{sid}` 看响应是否含 `subFlows[i].currentAction`
- 检查 `SessionKanban.tsx` 对 running 行的渲染逻辑——是否 `currentAction` 字段被正确读取并显示
- 可能需要 SSE flow:action 事件触发 SubFlowMeta 刷新（Running-Summary agent 的 loadSubFlowMeta 可能没挂到 SSE）

## 方案（Phase）

### Phase 1 — P1-a supervisor trait_refs
- 加 `_traits_ref` 到 `stones/supervisor/data.json` 或 readme frontmatter
- 验证：supervisor prompt → "用 review_api 看一下某 diff"，LLM 不再 fallback shell

### Phase 2 — P1-b build feedback 触发
- 诊断 + 修复 extractWrittenPaths / traitId 匹配
- 单元测试覆盖

### Phase 3 — P1-c LLMInputViewer parser
- 读 engine.ts 实际输出格式
- 修 parser 做"按 role 切块 + 每块独立 parse"

### Phase 4 — P1-d Running 摘要文本
- 检查 subFlow.currentAction 字段链路
- SessionKanban.tsx 前端渲染修

## 验证标准

- 每个 P1 修完后用 Playwright/curl 复验
- `bun test` 0 fail
- 前端 tsc 0 new error / build pass

## 执行记录

### Phase 1 (P1-a) — stone 级 activated_traits（2026-04-22）

- kernel commit `8e32170`（feat: stone 级默认激活 trait）+ user commit `93d3cce`
- readme.md frontmatter 增加 `activated_traits` 字段；data._traits_ref 合并
- supervisor readme 添加 5 个 trait 激活（review_api / memory_api / git/pr / git/worktree / git/advanced）
- Context builder 扩展 computeThreadScopeChain 支持 stoneRefs

### Phase 2 (P1-b) — build_feedback writeFile 触发（2026-04-22）

- kernel commit `91f707f`（fix: engine build hooks writeFile 触发路径匹配）
- 根因：program 分支内 callMethod(file_ops.writeFile) / 沙箱 writeFile 基础 API 写文件从未触发 build hooks —— program 走完就走了
- 修复：buildExecContext 新增 writtenPaths 累计 + getWrittenPaths()；沙箱 callMethod 与 writeFile 包装后记录 path；两处 program 分支（run + resume）执行完扫 paths 跑 runBuildHooks，失败结果通过 action:inject 写入线程
- 新增集成测试 tests/build-hooks-trigger.test.ts（4 case：沙箱 writeFile 坏/好 json、不写文件、callMethod file_ops.writeFile 坏 json）→ 4/4 pass
- 基线对比：763 pass → 767 pass / 6 skip / 6 fail（无新增 fail）

### Phase 3 (P1-c) — LLMInputViewer parser 多根 XML 容错（2026-04-22）

- kernel commit `0a1699b`（fix: LLMInputViewer 多根 XML parser 容错）
- 根因：engine.ts 实际把 `llm.input.txt` 写成 `<system>...</system>\n\n<user>...</user>` 多根 XML 且无 `--- role ---` 分隔符；原 splitMessageBlocks fallback 把整个文件当单块喂 DOMParser 报错 → 整棵树变 `other(parse-error)`
- 修复：splitMessageBlocks 增加第二协议（正则扫顶层 `<(system|user|assistant)>` 按标签范围切块，每块单根）；parseLLMInput tryParse 兜底（包 `<ooc-root>` 重试，遇 ooc-root 则子元素各作为 ParsedNode root 展开）
- 验证：bun tsc 0 error；bun run build 成功；离线验证真实 llm.input.txt 切块（system 7387B + user 2133B）

### Phase 4 (P1-d) — SessionKanban running 行 currentAction 文本（2026-04-22）

- kernel commit `326caa1`（fix: SessionKanban running 行展示 currentAction 文本）
- 根因（在后端不在前端）：engine 仅在 thread 完成时写 data.json；running 期间 data.json 不存在或停留在上次 finished —— readFlow 返回 null → subFlow 不进入 /api/flows/:sid 响应 → 前端 meta.status 永远 undefined → "正在 X" 条件 isLive 永远 false；Bruce 看到的 pulse 实际是 ThreadsTreeView 节点状态符号 `●`，不是 SessionKanban 对象级 pulse
- 修复：server.ts 新增 inferLiveFlowStatus(objectFlowDir, dataStatus)（读 threads.json，任一节点 running/waiting 则 override status=running）；/api/flows/:sid handler data.json 缺失但 threads.json 存在时用 threadsToProcess 合成"临时 subFlow"；data.json 全缺失时构造占位 flow；任一 subFlow 活跃则顶层 flow.status 强制 running
- 前端 SessionKanban.tsx 渲染逻辑本身正确，不动
- 验证（curl 真实 running session）：POST /api/talk/supervisor → s_moa7u3od_tomchz (running)；GET /api/flows/：修复前 flow.status=pending subFlows=[] currentAction=N/A；修复后 flow.status=running subFlows=[supervisor, running, currentAction="The user wants me to read `docs/..."]
- 验证：旧 finished session 不受影响（s_moa4mn3v_n364n4 仍 finished，currentAction=undefined）
- tsc 0 new error；server tests 26/26 pass；全量 772 tests / 6 fail（基线持平）

## 汇总

4 phase 全部完成，kernel 4 commits（8e32170 / 91f707f / 0a1699b / 326caa1），user 1 commit（93d3cce 含 submodule bump）。

- 测试：kernel bun test 由 763 pass 提升到 767 pass / 6 skip / 6 fail（无新增 fail，基线持平）
- tsc：kernel 基线 engine.ts 6 个已知错误不变；web 0 error
- build：kernel/web build 通过
