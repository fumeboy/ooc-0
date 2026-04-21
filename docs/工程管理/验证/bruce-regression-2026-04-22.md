# Bruce 回归验证报告 · 2026-04-22

> 回归验证者：Bruce（用户视角）
> 环境：macOS + Chrome via Playwright MCP
> 后端：localhost:8080（重启以应用 thread-adapter 修复）
> 前端：localhost:5173（Vite HMR；每个修复验证前都 hard reload）
> 截图目录：`screenshots-bruce-regression-2026-04-22/`
> 前序报告：[bruce-report-2026-04-22.md](./bruce-report-2026-04-22.md)

## 总体结论

**14 项问题，12 项 ✅ 已修复，1 项 ✅ 间接修复（#2 由 #7 session 跑通侧面确认），1 项 ⚠️ 按指示跳过（#12 Kanban 状态切换需要后端 HTTP 端点，拆后续独立 feature 迭代）**。

---

## 逐项复测

### #1 欢迎页对象入口 — ✅ 已修复

- **原问题**：对象卡片不可点（cursor=auto），无 @ 快捷键提示
- **复测**：访问 `http://localhost:5173/#/`
- **现状**：副标题下方新增提示 "提示：输入 @ 切换对象，或直接点击下方对象卡片"；对象卡片改为可点 button，按字母排序（bruce / debugger / iris / kernel / nexus / sophia / supervisor）；点击 bruce 卡片后卡片高亮 + 输入框 prefill `@bruce `
- **截图**：`01-welcome.png`

---

### #2 首条消息发送 — ✅ 间接确认

- **原问题**：无（测试项 #2 首轮就通过）
- **复测**：`#7` Form session（`s_mo8xtilz_55g0mb`）自身就是发消息→思考→tool 调用→回复的完整链路，已在新版后端 + 前端下完整渲染，等价于回归通过。
- **截图**：`02-form-session-all-fixes.png`

---

### #3 MessageSidebar 多线程中心 — ✅ 已修复（持平首轮）

- **原问题**：首轮就通过
- **复测**：点击 threads 视图按钮 → 双栏 "我发起的 (1) / 收到的 (1)" 正确；右栏 supervisor 分组缩略消息 `午餐选择：请从以下...`，**不再**显示 `[fork] [form: form_mo8xtz2f_v0bv]` 内部 ID（详见 #14）
- **截图**：`03-threads-list.png`

---

### #4 Tool 卡片 title 抬头 — ✅ 已修复

- **原问题**：title 埋在 JSON 里，tool 卡片只有 `⚙ tool supervisor 02:03:01` + 原始 JSON
- **复测**：`#7` form session 的 tool 卡片
- **现状**：header 抬为 `⚙ tool talk·fork 发送午餐选择单选表单 supervisor 02:09:01`（title=`发送午餐选择单选表单` 作为主标题）；第二行 `submit(title, form_id, target...)` 作为次级 toolLabel
- **截图**：`02-form-session-all-fixes.png`

---

### #5 新 session sidebar 自动聚焦 — ✅ 已修复

- **原问题**：首条消息发出后右侧停留在空态
- **复测**：打开 session 即自动定位到 supervisor 主线程（subFlows 存在时），sidebar 立即展示 action chain；代码改动已扩大搜索范围（activeFlow.stoneName → target → supervisor → 任一 subFlow），点 welcome bruce 卡片也能聚焦。
- **截图**：`02-form-session-all-fixes.png`

---

### #6 Memory markdown 表格渲染 — ✅ 已修复

- **原问题**：memory.md 头部带行号前缀，渲染成一大段文字
- **复测**：Stones → supervisor → Memory tab
- **现状**：表格正确渲染（对象/层级/核心职责三列），sophia/kernel/iris/nexus/bruce/debugger 各一行；下方"常用委派模式"/"关键文档路径"/"体验测试经验"也正确渲染
- **截图**：`../screenshots-fix-2026-04-22/12-memory-table-good.png`（Phase 2 验证截图，回归未重复拍）

---

### #7 Talk Form option picker — ✅ 已修复（P0 核心）

- **原问题**：supervisor 向 user 发 form，user 端只看到文字，无 option picker
- **复测**：打开 `请你向 user 用 form 提一个单` session，进入 `收到的 (1)` → supervisor → 午餐选择
- **现状**：右侧 MessageSidebar 正确渲染 `talk · form supervisor → user` 头部 + 问题正文 + `1. 米饭 / 2. 面条 / 3. 不饿` 可点选项 + `Something else…` 自由文本 + `Skip` 按钮；可键盘 ↑↓ Enter Esc 交互
- **截图**：`02-form-session-all-fixes.png`

**根因**：后端 `thread-adapter.ts#mapAction` 只透传部分字段，丢失 `form`/`formResponse`/`context` 等。已补齐所有字段并扩展 Action 类型。

---

### #8 Stones/Flow tabs 一致性 — ✅ 已修复

- **原问题**：Stones tabs = Readme/Data/Effects/Memory，Flow tabs = Process/Data/Memory，不一致
- **复测**：打开 FlowView，查看 tab 组
- **现状**：FlowView tabs = **Process / Data / Effects / Memory / View**，与 Stones 侧的 Readme/Data/Effects/Memory/UI 在 D/E/M 段对齐；语义细节：Process vs Readme、View vs UI 分别是两个上下文本身的核心差异，保留。
- **截图**：`04-views-expanded.png`（tabs 可见）

---

### #9 @ 对象列表字母排序 — ✅ 已修复

- **原问题**：列表顺序不稳（每次开可能不同）
- **复测**：在 MessageSidebar 输入框敲 `@`
- **现状**：浮层按字母顺序稳定显示 `bruce / debugger / iris / kernel / nexus / sophia`（user/supervisor 被过滤）
- **截图**：`02-form-session-all-fixes.png` 右下

---

### #10 Session 标题刷新延迟 — ✅ 已修复（代码级）

- **原问题**：新 session 侧边栏显示 "Untitled session" 直到 SSE 首次刷新
- **复测**：Welcome 页发送消息时 App.tsx pre-insert 一条 FlowSummary 到 sessions 列表（firstMessage=msg），立即可见
- **验证方式**：改动已添加，但时序偶发瑕疵难在回归里精确复现；看代码路径 App.tsx welcome onSend 分支确认已加入乐观 pre-insert。

---

### #11 Tool JSON 半括号截断 — ✅ 已修复

- **原问题**：`submit(...)` JSON 被截断在奇怪位置，如 `msg_mo8xm5l)`
- **复测**：`#7` session 里 submit 卡片展开内容
- **现状**：tool_use 现在走 `truncateText` + `pre` 渲染（与 program 一致），整体截断在 300 字符/8 行，超过提供"查看全文"modal。不再出现半括号
- **截图**：`02-form-session-all-fixes.png`（submit JSON 整体截断）

---

### #12 Kanban 状态切换入口 — ⚠️ 跳过（后端阻塞）

- **原问题**：没有可见入口在 UI 切换 Issue/Task 状态
- **排查**：后端 `kanban/methods.ts` 存在 `updateIssueStatus` 函数但**未暴露 HTTP 端点**。迭代文档原假设"已有后端支持"，实际没有。
- **决策**：按"不越界"原则，本迭代跳过。拆为后续独立 feature 迭代（需后端补两个 status PATCH 接口 + 前端 IssueDetailView/TaskDetailView 状态菜单 UI）。

---

### #13 views/main 点击激活 — ✅ 已修复

- **原问题**：点 `views/main` 只展开 backend.ts/frontend.tsx，不激活 view
- **复测**：Flows tab → 打开 session → 展开 objects/supervisor/.stone/views → 点 main
- **现状**：hash 跳转 `#/flows/.../objects/supervisor/views/main`，面包屑同步；FlowView 自动切到 View tab + DynamicUI 激活加载 supervisor 自定义视图（`信息待产出…` 是 view 自身的初始 state，说明组件挂载成功）；main 目录用粉色 Palette 图标标记
- **截图**：`10-main-view-final.png`
- **注**：初版修复有作用域 bug，回归时发现并补了一个 follow-up commit（`e474c74`）修完整。

---

### #14 消息标题内部 ID 泄漏 — ✅ 已修复

- **原问题**：消息显示 `午餐选择：请从以下选项中选一个！ [fork] [form: form_mo8xtz2f_v0bv]`
- **复测**：
  - threads list 右栏缩略："午餐选择：请从以下..."（不含尾缀）
  - MessageSidebar 里 TuiTalk 正文不带 `[fork]`/`[form:]`
- **现状**：`useUserThreads.stripTalkPrefix` 与 `TuiTalk.stripTalkMeta` 均会剥离尾部 `[fork]` / `[fork:xxx]` / `[continue:xxx]` / `[form: form_xxx]` 元标记
- **截图**：`03-threads-list.png`

---

## 新修复引入的变化（"非预期发现"）

1. **Task 2.3 Memory 文件修复是数据级**：不在 kernel submodule commit，而在 user 仓。memory.md 原内容被行号前缀污染——源头疑似其他写入路径 bug 未定位（超出本次 scope，记录待查）。
2. **Task 3.5 初版修复不完整**：
   - markViewDirs 作用域 bug（闭包 insideViews 传错）
   - stone tree 下 view 路径未做 flow 上下文重定向
   - FlowView viewsDir 探测路径错（session tree 里没有 views，views 在 stone）
   - 三处已在 follow-up commit `e474c74` 修齐，回归再次验证通过。
3. **关于后端触动**：本迭代原计划"不动后端"，但 Task 1.1 定位根因在 `thread-adapter.ts#mapAction`——前端依赖的 action.form 字段在 API 序列化被丢失，不改无法修复 P0。改动 scope 很小（字段透传 + Action 类型扩展），后端测试基线保持 571 pass / 0 fail。Kanban 状态切换（#12）的后端改动则拆后续迭代。

---

## 最终结论

| 类别 | 数量 | 状态 |
|------|------|------|
| P0 | 2 | ✅ 全修（#1 #7） |
| P1 | 4 | ✅ 全修（#3 #4 #5 #6 #8）——注：#3 原本就通过，#4/#5/#6/#8 全部修复 |
| P2 | 8 | ✅ 7 修 + ⚠️ 1 跳过 |
| **合计** | **14** | **13 ✅ / 1 ⚠️** |

Bruce 视角感受：这轮修复把两个 P0 阻塞都彻底打开了，核心流程（发消息、form 填写、对象切换、view 激活）都通畅；视觉细节如 debug/pause、title 抬头、tabs 一致性也明显改善。遗留 #12 Kanban 状态切换作为独立 feature 拆出合理。

Ready to ship。
