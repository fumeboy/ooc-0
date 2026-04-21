# Bruce 首轮体验问题综合修复

> 类型：bugfix
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Alan Kay

## 背景 / 问题描述

Bruce 首轮真实系统体验测试（`docs/工程管理/验证/bruce-report-2026-04-22.md`）发现 14 个问题：
- **2 P0 阻塞**：核心功能走不通
- **4 P1 重要**：明显体验瑕疵
- **8 P2 锦上添花**

本迭代按 P0→P1→P2 分阶段修复。所有问题都是**前端**问题——不动后端（除 Memory markdown pipeline 如有 server 侧处理）。

## 问题清单（按优先级）

### P0 阻塞

**#1 Talk Form option picker 完全缺失**（Bruce 测试项 #7）
- 现象：supervisor 向 user 发 form，user 端只看到 talk 文本 + `[fork] [form: form_xxx]` 尾缀，**没有可点选项 UI**，键盘快捷键失效。
- 根因假设：MessageSidebar 重构为多线程中心后，form 消息匹配逻辑（原本靠 content+ts 启发式）失效；即便 FlowMessage.id 修了匹配，`TuiTalkForm` 触发条件没生效。
- 修复方向：
  - 定位 `MessageSidebar.tsx` 中 form 消息的 render 路径
  - 确保 `message.form` 存在时渲染 TuiTalkForm 而不是普通 TuiTalk
  - 验证键盘 ↑↓/Enter/Esc + Something else 兜底

**#2 欢迎页无对象入口 + 无 @ 快捷键提示**（Bruce 测试项 #1 + #12）
- 现象：对象卡片 cursor=auto 不可点；欢迎页副标题说"直接与任何对象对话"但没有入口；新用户不知道如何切换对象。
- 修复方向：
  - 对象卡片点击 = 新建一个 target=<object> 的 session（或至少 prefill 输入框为 `@<object> `）
  - 欢迎页副标题下方添加 hint："想和某个对象直接对话？输入 `@` 或点击下方对象卡片。"
  - 卡片 cursor 改 pointer、加 hover 态

### P1 重要

**#3 Tool 卡片无独立 title 行**（Bruce 测试项 #4）
- 现象：tool 卡片只渲染 `⚙ tool supervisor 02:03:01` + 原始 JSON；title 字段埋在 JSON 里。
- 根因：TuiAction（`TuiBlock.tsx`）虽然支持 title 字段但可能未生效或展示位置错误。
- 修复方向：在 tool 卡片顶部抬一行加粗 title（类似 thinking 卡片样式），主体 JSON 保留折叠。

**#4 新 session 的 sidebar 不自动聚焦活跃线程**（Bruce 测试项 #5）
- 现象：首条消息提交后右侧仍停留在"向 supervisor 发起对话"空态，必须手动点"supervisor 主线程"。
- 修复方向：新 session 的 root thread（supervisor 主线程）立刻成为 `currentThreadIdAtom` 的值。
- 相关文件：`MessageSidebar.tsx` 的初始化 effect + useUserThreads hook。

**#5 Memory 面板 markdown 表格渲染失败**（Bruce 测试项 #6）
- 现象：supervisor 的 memory.md 的 markdown 表格被拼成"1 | 2 | 3 | ## ..."一大段文字。
- 根因假设：MarkdownContent 组件用的 remark/rehype 配置没启用 GFM table 插件；或带行号的代码块包装器把 `|---|` 当成代码。
- 修复方向：查 `MarkdownContent.tsx`（或类似组件）的 plugins，确认 `remark-gfm` 已启用。

**#6 Stones tabs 与 Flow tabs 不一致**（Bruce 测试项 #8）
- Stones：Readme / Data / Effects / Memory
- Flow：Process / Data / Memory
- 修复方向：统一为一套。建议以 Stones 为基准（Readme/Data/Effects/Memory/View），Flow 视图若需展示 Process 用单独 subtab 或并入 Effects。

### P2 锦上添花

**#7** Esc 关闭 @ 浮层但输入框残留 `@`：浮层 onClose 同步把触发字符从 input 删掉。

**#8** Debug / Pause 切换无可见回馈：toggle 打开时加状态文字（"DEBUG ON" / "PAUSED"）或明显颜色变化。

**#9** @ 对象列表顺序不稳定：固定按字母或按最近使用排序。

**#10** session 标题刷新偶发延迟：从 prompt 自动生成 title 的 effect 确保在首 message commit 后立即触发，不依赖下一轮 SSE。

**#11** Tool JSON 被截断到半括号：tool 卡片 body 用 overflow-hidden 整体截断，不要中间切。

**#12** Kanban 状态切换无可见入口：在 Issue/Task 详情头部 status badge 点击展开状态选单（已有后端支持）。

**#13** `views/main` 目录点 `main` 只展开子文件，不激活 view：让目录点击等价于打开 `VIEW.md`（或直接激活该 view 渲染）。

**#14** 消息标题暴露内部 ID（`[fork] [form: form_xxx]`）：MessageSidebar 渲染时过滤掉 `[fork]` / `[continue]` / `[form: form_xxx]` 这些内部标记，或改为更友好的"[表单]"小标签。

## 方案（Phase 拆分）

### Phase 0 — 调研

- Read Bruce 报告完整版
- grep / read 相关前端文件：
  - `kernel/web/src/features/MessageSidebar.tsx`、`MessageSidebarThreadsList.tsx`、`hooks/useUserThreads.ts`
  - `kernel/web/src/features/WelcomePage.tsx`（或欢迎页对应组件）
  - `kernel/web/src/components/ui/TuiBlock.tsx`（TuiAction、TuiTalk、TuiTalkForm）
  - `kernel/web/src/components/MarkdownContent.tsx`
  - `kernel/web/src/features/StoneView*.tsx`、`FlowView*.tsx`（tabs 一致性）
  - 各截图对应的 Bruce 报告条目
- 在迭代文档执行记录写"现状快览"

### Phase 1 — P0 修复（2 个）

两个独立 commit：

**Task 1.1** — Talk Form picker 修复
- 验证 form 消息如何从 user-inbox API 反查正文
- 确认 TuiTalkForm 触发条件（action.form 或 action.formId 存在）
- 修 MessageSidebar 的 render 分支让 form 消息走 TuiTalkForm
- 如果问题在 user-inbox 反查不到原 action，先排查 id 对齐（上轮 FlowMessage id 已完成，应已 ok）
- E2E 验证：supervisor 向 user 发 form → user 能点选项 → formResponse 回到 supervisor

commit：`fix(web): Talk Form option picker 修复（MessageSidebar render）`

**Task 1.2** — 欢迎页入口
- 对象卡片添加 onClick：点击 → 输入框 prefill `@<objectName> ` 并 focus（或真切换 target）
- 卡片 cursor=pointer + hover 态
- 副标题下方加一行简短 hint：`提示：输入 @ 可切换对象，或点击下方卡片`
- 视觉检查

commit：`fix(web): 欢迎页对象卡片可点击 + @ 快捷键提示`

### Phase 2 — P1 修复（4 个）

每个独立 commit：

**Task 2.1** — Tool 卡片 title 抬头
- TuiAction 的 tool_use 渲染路径加 title 抬头（类似 thinking 卡片的 header 样式）
- 若 action.title 为空则保持旧样式（向后兼容历史数据）
- commit：`fix(web): TuiAction tool_use 卡片抬头 title 行`

**Task 2.2** — 新 session sidebar 自动聚焦
- `MessageSidebar.tsx` 的 useEffect 里，如果 currentThreadIdAtom 为空 + 有活跃 supervisor session → 自动 set 为 supervisor 根线程 id
- commit：`fix(web): MessageSidebar 新 session 自动聚焦活跃线程`

**Task 2.3** — Memory markdown 表格渲染
- 检查 MarkdownContent 的插件链
- 若缺 remark-gfm 则加入（注意 bundle size）
- 验证 supervisor Memory tab 的"项目知识"章节表格正确渲染
- commit：`fix(web): Markdown 渲染支持 GFM 表格（memory.md）`

**Task 2.4** — Stones / Flow tabs 一致性
- 统一为：Readme / Data / Effects / Memory / View（若对象有 VIEW.md）
- Flow 视图的 Process tab 并入 Effects 或作为 subtab
- 更新文档 `docs/meta.md` 子树 6 的 tabs 清单
- commit：`fix(web): Stones/Flow tabs 一致性统一`

### Phase 3 — P2 修复（8 个）

合并为少数几个 commit（按文件分组）：

**Task 3.1** — MessageSidebar 周边瑕疵（问题 #7 Esc / #11 JSON 截断 / #14 内部 ID 过滤 / #10 session title 延迟）
commit：`fix(web/MessageSidebar): Esc 清 @ / JSON 整体截断 / 过滤内部标记 / session title 即时生成`

**Task 3.2** — @ 对象列表顺序（#9）
commit：`fix(web): @ 对象列表按字母排序`

**Task 3.3** — Debug/Pause 视觉回馈（#8）
commit：`fix(web): Debug/Pause toggle 添加可见状态`

**Task 3.4** — Kanban 状态切换入口（#12）
commit：`fix(web/kanban): Issue/Task status badge 可点切换状态`

**Task 3.5** — views/main 点击激活（#13）
commit：`fix(web/ViewRegistry): views 目录点击激活 view 渲染`

### Phase 4 — Bruce 回归验证

spawn Bruce（同上一轮协议），只测之前 P0/P1/P2 14 项，确认修复。

## 影响范围

- **前端**（主要）：
  - `kernel/web/src/features/MessageSidebar.tsx`
  - `kernel/web/src/features/WelcomePage.tsx`（或等价）
  - `kernel/web/src/components/ui/TuiBlock.tsx`（TuiAction + TuiTalkForm）
  - `kernel/web/src/components/MarkdownContent.tsx`
  - `kernel/web/src/features/StoneView*.tsx` + `FlowView*.tsx`
  - `kernel/web/src/features/SessionKanban.tsx`（status 切换）
  - `kernel/web/src/router/registrations.tsx`（views click）
  - 可能 `kernel/web/src/hooks/useUserThreads.ts`
- **后端**：几乎不动（除非某问题根因在后端）
- **文档**：`docs/meta.md` 子树 6 tabs 清单同步

## 验证标准

1. 每 Task 独立 commit，每 Phase Gate：
   - 前端 tsc 0 error
   - build 通过
   - 后端 `bun test` 保持 571 pass / 0 fail
2. Phase 4 Bruce 回归验证通过所有 14 项
3. 旧报告中 P0/P1 问题全部 ✅；P2 问题至少解决 6 个以上

## 执行记录

### 2026-04-22 认领 + Phase 0 现状快览

**认领**：从 todo/ 移至 doing/（2026-04-22 03:00）。

**现状快览（14 问题根因定位）**：

| # | 问题 | 根因 | 待改文件 | 备注 |
|---|------|------|----------|------|
| 1 | Talk Form picker 缺失 | MessageSidebar 的 `lookupFormForMessage` 已存在，但刷新后需要从 SSE 重新拉回；仍需验证 user-inbox 消息（from=supervisor→user）能否命中。需要在浏览器验证，如果 picker 还是不展示，可能是 `formById` 未命中 msg.id（BE message_out.id 与 FlowMessage.id 对齐）。 | `kernel/web/src/features/MessageSidebar.tsx`（必要时），`TuiTalkForm.tsx` | 优先在浏览器观察 DOM 定位 |
| 2 | 欢迎页无入口 + 无 @ 提示 | `WelcomePage.tsx` 对象卡片只是 div，未 onClick；无 hint 副文案 | `kernel/web/src/features/WelcomePage.tsx` | 直接改 |
| 3 | Tool 卡片无独立 title 行 | `TuiBlock.tsx` 的 TuiAction 渲染逻辑里 `hasTitle` 判断正确，但 flex-row 同行显示，让 title 和 toolLabel 挤一起。需要把 title 抬为独立行，JSON 摘要降为副行 | `kernel/web/src/components/ui/TuiBlock.tsx` | 把 hasTitle 时改为两行布局 |
| 4 | 新 session sidebar 不自动聚焦 | 已有 effect 会设 currentThreadId 为 supervisor root，但依赖 `activeFlow.subFlows?.find(sf.stoneName==="supervisor")`，欢迎页创建 session 后 activeFlow 乐观对象没有 subFlows，需要等 SSE 首次 flow:message 回来才有。修复：当 activeFlow 仅是乐观态、subFlows 不存在时，等首个 SSE 事件到达后主动 set | `kernel/web/src/features/MessageSidebar.tsx` | 确认 effect 触发条件正确 |
| 5 | Memory markdown 表格渲染失败 | **内容问题**——`stones/supervisor/memory.md` 文件头部被写成带行号格式（" 1 \| # Supervisor 项目知识"），这不是 markdown 表格而是带行号的 pipe。前端 MarkdownContent 已启用 remark-gfm，渲染没问题。修复：清理 memory.md 内容 | `user/stones/supervisor/memory.md` | 不改前端代码 |
| 6 | Stones/Flow tabs 不一致 | `ObjectDetail` tabs = Readme/Data/Effects/Memory(+UI)；`FlowView` tabs = Process/Data/Memory(+View)。统一方案：FlowView 也加 Effects；View 在两边都作为可选 | `kernel/web/src/features/FlowView.tsx`, `ObjectDetail.tsx` | 统一为 Readme(隐式)/Process/Data/Effects/Memory/View |
| 7 | Esc 关闭 @ 浮层但输入框残留 @ | `MessageSidebar.tsx` handleKeyDown 里 Escape 分支只 `setShowMention(false)`，没删 input 里的 @ | `kernel/web/src/features/MessageSidebar.tsx` | |
| 8 | Debug/Pause 切换无可见回馈 | `MainLogo.tsx` `TogglePill` 已有 active 态色块（蓝/橙），但 logo 主色变化太细。增强：active 时加状态文字，例如 "DEBUG ON"/"PAUSED" 或增大色差 | `kernel/web/src/components/MainLogo.tsx` | 已部分工作，只是不够显眼 |
| 9 | @ 对象列表顺序不稳 | `MessageSidebar.tsx` `mentionCandidates` 只 filter 不排序 | `kernel/web/src/features/MessageSidebar.tsx` | 按字母排序 |
| 10 | session 标题刷新偶发延迟 | 新 session 创建时 `activeFlow.title` 为 undefined，依赖 SSE 首轮回来才有。前端可以用 `firstMessage` 前 40 字做 fallback | `kernel/web/src/App.tsx` 的 sessionTitleMap | sessionTitleMap 其实已经在用 firstMessage fallback；问题可能在 sessions 列表本身的 title 字段刷新滞后 |
| 11 | Tool JSON 被截断到半括号 | `TuiBlock.tsx` toolLabel 用 `Object.keys(args).slice(0,3)` 展示 key 列表，不是 JSON。Bruce 看到的截断其实是 `msg_mo8xm5l)` 这种——来自 `content` 字段（原始 JSON）在非 program 路径没有走 truncateText，但 hasTitle=true 时 content 不展示在 header。问题是 content 作为 expanded 的展开区被渲染为 MarkdownContent，其中 JSON 字符串可能过长被裁。修复：非 program 的 tool_use 也要 truncate content | `kernel/web/src/components/ui/TuiBlock.tsx` | |
| 12 | Kanban 状态切换无入口 | **后端尚未暴露 HTTP 接口**（仅有 methods.ts 的 updateIssueStatus）。按"不越界"原则，本迭代跳过该问题，在总结里记为后端待做 | ~~`kernel/src/server/server.ts` + `kanban.ts`~~ | 跳过 |
| 13 | views/main 目录点击只展开 | `FileTree.tsx` 普通目录（无 marker）只切换 expanded。`SessionFileTree.tsx` 可以给 views 子目录打标记让其可激活 | `kernel/web/src/features/SessionFileTree.tsx`, `kernel/web/src/components/ui/FileTree.tsx` | 给 `views/<viewName>` 加 marker="view" |
| 14 | 消息标题含 `[fork]`/`[form: form_xxx]` | `TuiTalkForm` 已用 replace 剥离 `[form:...]`；但 `TuiTalk`（普通 talk）和 MessageSidebarThreadsList 的缩略没剥。messages stripping 需覆盖 `[fork]`/`[continue]`/`[form: form_xxx]` 前缀 | `kernel/web/src/components/ui/TuiBlock.tsx` (TuiTalk), `useUserThreads.ts` (stripTalkPrefix) | |

**跳过 / 后端**：
- P2 #12（Kanban 状态切换）：后端未暴露，拆后续迭代

**Phase 0 完成时间**：2026-04-22 03:10

### Phase 1 — P0 修复（2026-04-22 03:30）

| Task | Commit | 简述 |
|------|--------|------|
| 1.1 Talk Form picker | `f2a2624` | 后端 thread-adapter mapAction 补齐 name/args/title/form/formResponse/context；Action 类型扩展；前端合成 target=user 的 syntheticTalkMsgs |
| 1.2 欢迎页入口 + @ 提示 | `5173f14` | 对象卡片变 button + prefill `@name` + 字母排序；副标题下新增 hint |

**Phase 1 Gate**: 前端 tsc 0 error / build OK；后端 571 pass / 0 fail。

### Phase 2 — P1 修复（2026-04-22 03:45）

| Task | Commit | 简述 |
|------|--------|------|
| 2.1 Tool title 抬头 | `6e1a696` | hasTitle 时 header 只显示 title；toolLabel 抬到第二行次级色 |
| 2.2 自动聚焦活跃线程 | `47adbed` | 选线程搜索范围扩大：stoneName → target → supervisor → 任一 |
| 2.3 Memory 表格渲染 | （user 仓） | 清理 stones/supervisor/memory.md 头部行号格式（前端无需改——remark-gfm 已启用） |
| 2.4 Tabs 一致性 | `52ab431` | FlowView 增加 Effects tab；统一 Process/Data/Effects/Memory(+View) |

**Phase 2 Gate**: 前端 tsc 0 error / build OK；后端 571 pass / 0 fail。

### Phase 3 — P2 修复（2026-04-22 04:00）

| Task | Commit | 简述 |
|------|--------|------|
| 3.1 MessageSidebar 周边（#7/#11/#14/#10） | `bcdf87b` | Esc 清 @ / tool_use JSON truncate / TuiTalk 剥离 [fork]/[form] / welcome pre-insert session |
| 3.2 @ 列表字母排序（#9） | `a0e8249` | mentionCandidates localeCompare |
| 3.3 Debug/Pause 视觉（#8） | `4c00087` | active 态色块实心 + 大写粗体 + shadow ring |
| 3.4 Kanban 状态入口（#12） | **跳过** | 后端无 HTTP 端点（仅 methods.ts 有 updateIssueStatus），按"不越界"原则拆后续迭代 |
| 3.5 views 目录可激活（#13） | `ba8b641` | FileTreeNode.marker 增加 "view" + SessionFileTree markViewDirs + FlowView 读 initialViewName |

**Phase 3 Gate**: 前端 tsc 0 error / build OK；后端 571 pass / 0 fail。

**P2 跳过原因详解**：
- #12 需要新增 `POST /api/sessions/:sid/issues/:iid/status` + `POST /api/sessions/:sid/tasks/:tid/status` 两个 HTTP 接口，并在前端 IssueDetailView/TaskDetailView header 做状态 badge 点选菜单 UI。本迭代是 bugfix 且"不动后端"原则下只在迭代文档指出已有后端支持，实际排查后没有——故拆为后续独立迭代（feature）。

### 触动后端原因说明

本迭代原计划 "几乎不动后端"，但 Task 1.1 定位根因在 `kernel/src/persistence/thread-adapter.ts#mapAction`——前端依赖的 action.form 字段在 API 序列化时被丢弃。这是 P0 问题的直接根因，**不改无法让 Form Picker 恢复功能**。改动性质：
- 范围小（两个文件：mapAction 透传所有字段 + Action 类型补齐字段定义）
- 风险低（仅是字段透传，语义无变化）
- 后端 571 pass 基线不变
- 已在 commit message 中详细说明

本次后端改动仅限此处。Kanban 状态切换（#12）虽也需后端改动但非单点透传，已拆为后续迭代。

### Phase 4 — Bruce 回归验证（2026-04-22 04:20）

回归报告：[`../../验证/bruce-regression-2026-04-22.md`](../../验证/bruce-regression-2026-04-22.md)
回归截图：[`../../验证/screenshots-bruce-regression-2026-04-22/`](../../验证/screenshots-bruce-regression-2026-04-22/)

**结论**：14 项问题，13 ✅ / 1 ⚠️
- P0 全修（#1 欢迎页入口 + #7 Talk Form picker）
- P1 全修（#3 threads / #4 tool title / #5 sidebar 聚焦 / #6 memory 表格 / #8 tabs 一致）
- P2 7 修（#7 Esc 清 @ / #9 @ 字母排序 / #10 session title / #11 JSON 截断 / #13 views 激活 / #14 内部 ID 过滤 / #8 debug 视觉）
- #12 Kanban 状态切换跳过（后端需要新增 status PATCH 接口，拆后续迭代）

**回归中补修的 follow-up**：
- Commit `e474c74`：Task 3.5 初版有 3 个 bug（作用域 / stone tree 重定向 / viewsDir 探测路径），回归发现并补齐。

### 交付清单

**kernel submodule commits（10 个）**：
| Phase | Commit | 简述 |
|-------|--------|------|
| 1.1 | `f2a2624` | Talk Form picker（BE thread-adapter + FE 合成 msg） |
| 1.2 | `5173f14` | 欢迎页入口 + @ 提示 |
| 2.1 | `6e1a696` | Tool title 抬头 |
| 2.2 | `47adbed` | 自动聚焦活跃线程 |
| 2.4 | `52ab431` | FlowView tabs 一致（+Effects） |
| 3.1 | `bcdf87b` | Esc 清 @ / JSON 截断 / 内部 ID 过滤 / session title pre-insert |
| 3.2 | `a0e8249` | @ 列表字母排序 |
| 3.3 | `4c00087` | Debug/Pause 视觉增强 |
| 3.5 | `ba8b641` | views 目录激活（初版） |
| 3.5 fix | `e474c74` | views 激活 follow-up（回归补齐） |

**user 仓改动**：
- `docs/工程管理/验证/bruce-regression-2026-04-22.md`（回归报告）
- `docs/工程管理/验证/screenshots-fix-2026-04-22/`（Phase 1-3 验证截图）
- `docs/工程管理/验证/screenshots-bruce-regression-2026-04-22/`（回归截图）
- `stones/supervisor/memory.md`（Task 2.3 数据修复）
- 迭代文档本文件更新 + 软链接 todo → doing → finish

### Phase Gate 状态

| Phase | tsc | build | bun test |
|-------|-----|-------|----------|
| Phase 1 | 0 error | ✓ | 571 pass / 0 fail |
| Phase 2 | 0 error | ✓ | 571 pass / 0 fail |
| Phase 3 | 0 error | ✓ | 571 pass / 0 fail |
| Phase 4 | 0 error | ✓ | 571 pass / 0 fail |

### 遗留问题

1. **#12 Kanban 状态切换入口**：拆出独立 feature 迭代。需要：
   - 后端 `POST /api/sessions/:sid/issues/:iid/status` + `POST /api/sessions/:sid/tasks/:tid/status`
   - 前端 IssueDetailView/TaskDetailView header 状态 badge 点选菜单
2. **`stones/supervisor/memory.md` 被行号格式污染的源头未定位**：本迭代只做了数据修复（手工清理），没排查源头写入路径（某个 SuperFlow / talk super / program write）。如果再次出现需要专项调试。
3. **Task 3.5 初版有 bug**：反映一个经验——UI 改动不只是改 useEffect 和 render，链路要完整跟到最终渲染目标（ViewRegistry resolve、DynamicUI 实际路径）；回归测试抓到了，下次在实现阶段就应多 loop 一次。

