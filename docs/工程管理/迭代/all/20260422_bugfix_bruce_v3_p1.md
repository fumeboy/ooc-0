# Bruce v3 回归 P1 修复包（一次性 4 件）

> 类型：bugfix
> 创建日期：2026-04-22
> 状态：doing
> 负责人：TBD
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

（初始为空）
