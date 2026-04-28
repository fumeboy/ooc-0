# Bruce 体验测试报告 · 2026-04-22（首轮）

> 测试者：Bruce（用户视角）
> 环境：macOS + Chrome via Playwright MCP
> 后端：`localhost:8080`（bun kernel/src/cli.ts start 8080） — 启动时 world 载入 8 对象（iris, sophia, user, bruce, nexus, debugger, kernel, supervisor）
> 前端：`localhost:5173`（kernel/web 的 vite dev）
> 截图目录：`screenshots-bruce-2026-04-22/`

---

## 测试项 #1：首次打开前端 + 欢迎页

- **步骤**：浏览器访问 `http://localhost:5173/`。
- **期望**：能看到入口页面，清楚告诉我怎么开始。
- **实际**：欢迎页展示 "OOC World" 标题、一段副标题"每个对象都是一个活的 Agent……向 supervisor 提问，或直接与任何对象对话"，外加 7 张对象卡片（iris / sophia / bruce / nexus / debugger / kernel / supervisor）和底部 "Message supervisor..." 输入框。
- **截图**：`01-welcome.png`
- **分类**：⚠️ 能用但有瑕疵
- **四维**：
  - 能用吗？可以直接在输入框里问 supervisor。
  - 意外行为？**对象卡片看起来像按钮但完全不可点击**（cursor 是 auto 而非 pointer）。副标题写"直接与任何对象对话"，却没有任何可见的对象切换入口。
  - 界面清晰？布局大体 ok，但卡片的"非交互性"属于视觉陷阱——我以为点 bruce 就会切到 bruce 对话。
  - 说明缺失？**"输入 @ 切换对象"这个关键快捷键完全没在欢迎页提示**——我是进到新会话右侧面板才发现的。对新用户而言"怎么和 supervisor 之外的对象聊天"一片黑。

---

## 测试项 #2：给 supervisor 发第一条消息

- **步骤**：在输入框输入"你好，请一句话介绍一下 OOC 项目"，回车提交。
- **期望**：看到一次思考→工具调用→回复的流。
- **实际**：8 秒内收到答复 "OOC（Object-Oriented Context）是一种 AI 智能体架构……"。右侧 MessageSidebar 依次显示：thinking → tool(open) → inject → thinking → tool(submit) → mark → talk(supervisor → user)。主面板展示 "supervisor 主线程 7 actions 刚刚" 摘要。
- **截图**：`02-first-reply.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？完全跑通，响应速度可接受。
  - 意外行为？无明显问题。
  - 界面清晰？流式展示层次清晰（图标 ◆/⚙/›/✓/❯ 区分动作类别不错）。
  - 说明缺失？对新用户：`thinking` / `inject` / `mark` 这些专业术语没 tooltip；但不影响基本使用。

---

## 测试项 #3：MessageSidebar 多线程中心（threads 列表 + 未读）

- **步骤**：发消息后点击右侧头部的消息气泡图标（hover 提示"查看所有线程"），查看"我发起的"/"收到的"双栏。之后观察 bruce 委派完成后的未读角标。
- **期望**：有双栏分组、按对象聚合、有红色未读数字。
- **实际**：
  - 双栏正确："我发起的 (1) - supervisor 主线程"、"收到的 (0) - 暂无其他对象对 user 的消息"。
  - 委派 bruce 完成后，右侧 header 出现"1 条未读"按钮（title）+ 红色小圆点；切到线程树后 收到的(1) 里 bruce 行右侧显示红色"1"角标，消息缩略"你好，我是 Bruc..."，有 "1m" 时间戳。
  - 点进去后再刷新页面，角标消失 → 已读状态持久化成功（测试项 #11 对应）。
- **截图**：`03-threads-list.png`、`17-threads-list-with-form.png`、`31-unread-threads.png`、`32-bruce-msg-open.png`、`34-after-reload.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？双栏、聚合、红点、持久化全部按预期。
  - 意外行为？发到 user 的表单消息在 "收到的" 分栏里点开后展示的是嵌套子 thread，用户需要二级点击才能看到内容，不直观（见 #7）。
  - 界面清晰？未读角标+ "1 条未读" tooltip + 红点 + 时间戳的组合告知到位。
  - 说明缺失？暂无大问题。

---

## 测试项 #4：Tool 调用 title 展示

- **步骤**：观察 MessageSidebar 中每一条 `tool` 卡片是否显示一句话行动描述。
- **期望**：每个 tool 动作之上有独立的 title 行（如"回复用户关于 OOC 的介绍"），便于扫读。
- **实际**：**没有独立的 title 行**。tool 卡片只显示 `⚙ tool supervisor 02:03:01` + 原始 JSON 如 `open({"title":"回复用户关于 OOC 的介绍","type":"command","command":"return","description":"……"})`。title 字段埋在 JSON 里，需要用户自己读。
- **截图**：`02-first-reply.png`、`30-delegation-done.png`（多处可见）
- **分类**：❌ 不能用（如果"每个 tool 有独立 title 行"是验收标准的话）
- **四维**：
  - 能用吗？JSON 仍然可读，用户能推断意图。
  - 意外行为？无。
  - 界面清晰？JSON blob 对非技术用户不友好，长 JSON 甚至会被截断（例如 submit 调用的 mark 字段只露出"msg_mo8xm5l)"的半截括号，见 `02-first-reply.png`）。
  - 说明缺失？tool 的 `title` / `description` 并未在 UI 上抬头展示。

---

## 测试项 #5：think/talk 四模式（fork + continue）

- **步骤**：新建 session，让 supervisor 把任务委派给 bruce："请用 think(context=\"fork\") 开子线程想 OOC 最大亮点，再用 talk(context=\"continue\") 告诉 user 结论"。
- **期望**：supervisor 先 talk(fork) 给 bruce，bruce 再 think(fork) 开子线程，最后 talk(continue) 给 user。
- **实际**：全部跑通。
  - supervisor 调用 `open(talk)` → `submit(target=bruce, context=fork)`，收到 `remote_thread_id = th_mo8xzzod_wrcysb`。
  - bruce 的子线程输出了 "身份即架构——OOC 让 AI 从聊天框变成了有身份、有边界、能协作的团队成员"，通过 talk(continue) 直接回到 user。
  - 右侧线程区能同时看到 `supervisor 主线程`、`bruce 主线程` 两个线程节点（我发起的/收到的）。
- **截图**：`25-bruce-delegate.png`、`27-thread-clicked.png`、`30-delegation-done.png`、`31-unread-threads.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？think/talk 四模式功能正确。
  - 意外行为？**新 session 提交后，右侧 MessageSidebar 并没有自动锁定到当前活跃线程**，而是停留在"向 supervisor 发起对话，输入 @ 切换对象"的空态（截图 #25）。用户必须手动去主面板点 "supervisor 主线程" 才能看到消息流。
  - 界面清晰？一旦进去后，线程/子线程的层级很清楚。
  - 说明缺失？新 session 默认状态的 hint "输入 @ 切换对象" 很好，但 sidebar 不跟随当前活跃线程的行为是反直觉。

---

## 测试项 #6：SuperFlow 反思（super 关键词）

- **步骤**：打开已有会话 "请 talk 给你自己的 super 记下一条经验：读 meta.md 需要分段看子树而不是一口气通读"。
- **期望**：supervisor 能理解 "super" 指的是反思镜像（不是 supervisor 自己），把经验写到它自己的 memory.md。
- **实际**：
  - 主面板显示两个 thread："supervisor 主线程：已收到并记录 Bruce 的体验测试经验" 和 "bruce 主线程：已通过 talk 将经验..."。
  - Stones → supervisor → Memory 里能看到"体验测试经验 / meta.md 分段阅读策略（bruce）"，其下正确渲染为 bulleted list。经验确实沉淀到了 `supervisor/memory.md` 的"体验测试经验"章节。
- **截图**：`09-stone-memory.png`、`35-super-reflection.png`、`39-main-display.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？反思写入 memory 正确，LLM 也没把 super 误解成 supervisor。
  - 意外行为？**Memory 面板里 supervisor 的项目知识是 markdown 表格，但当前渲染将原文按行号拼成一个大段落**（见 `09-stone-memory.png` 里的 "1 | # Supervisor 项目知识 2 | 3 | ## 组织结构速查 4 | 5 | | 对象 | 层级 | 核心职责 | 6 | |------|------|---------|..."），markdown 表格没有被解析成表格。下半段的"体验测试经验"却正确渲染 — 所以是只对某类 markdown 构造渲染失败。
  - 界面清晰？有瑕疵（上面这条）。
  - 说明缺失？暂无。

---

## 测试项 #7：Talk Form（options 选择器）

- **步骤**：让 supervisor 向 user 发一个带 form 的 talk："请你向 user 用 form 提一个单选问题，三个选项 A/B/C 分别是 米饭/面条/不饿"。
- **期望**：右侧 MessageSidebar 收到消息后，渲染一个可点选的 option picker，支持键盘 ↑↓/Enter/Esc + 自由文本兜底。
- **实际**：
  - supervisor 成功调用 `submit(target=user, form={...}, context=fork)`，主面板显示"午餐选择：请从以下选项中选一个！ [fork] [form: form_mo8xtz2f_v0bv]"。
  - "收到的 (1)" 分栏里能看到这条消息，但**点进去后右侧只展示 supervisor 主线程的 action chain（thinking/tool/talk）和 talk summary 文本**；**没有任何可点选的选项 UI**。搜索 DOM 也找不到 `米饭/面条/不饿` 对应的 radio / listbox / picker 元素。
  - 尝试 `Escape` / 键盘输入都没有相应反应。
- **截图**：`15-form-ask.png`、`16-form-sent.png`、`17-threads-list-with-form.png`、`18-form-open.png`、`19-form-picker.png`
- **分类**：❌ 不能用
- **四维**：
  - 能用吗？作为"收到 form 的一方"完全不能交互选项。
  - 意外行为？消息标题含原始 `[fork] [form: form_mo8xtz2f_v0bv]` 这种内部 ID，对用户是噪声。
  - 界面清晰？谈不上，因为关键 UI 缺失。
  - 说明缺失？键盘快捷键无从验证。

---

## 测试项 #8：Trait Namespace + Views（Stones 对象详情）

- **步骤**：左侧 Stones 切换到 supervisor，观察 Readme / Data / Effects / Memory 标签和侧边子目录 files / super / views。之后展开 `views/main`，再把 flows 下的 supervisor 视图也点开。
- **期望**：有一个清晰的对象"首页"视图（包含身份、traits、最近会话、记忆），可点 view 进行切换。
- **实际**：
  - Readme 面板：左侧 bio + 思维偏置 + 职责边界（markdown 正常），右侧彩色 header + 头像 + "OOC 项目的 Supervisor，1+3 组织的总指挥" + TRAITS (12) 列表（kernel:debuggable / kernel:reviewable / kernel:talkable / kernel:object_creation / kernel:verifiable …）。观感非常专业。
  - Data 面板：曾显示对象级默认 trait 配置；该配置入口已在 2026-04-28 退役。
  - Effects 面板：最近 session 列表（例如 "1min ago · finished · 2 msg · 7 act · 你好，请一句话介绍一下 OOC 项目"）— 非常有用的"对象行为流水"。
  - Memory 面板：结构见 #6。
  - 侧边 `views/main` 子目录里有 `backend.ts / frontend.tsx / VIEW.md`。**点击"main"这个 view 文件夹仅展开子文件列表，并不会渲染/切换到该 view** — 用户找不到"激活 view 渲染"的入口。
  - 而从 Flows 会话里的文件树进入 `objects/supervisor/views/` 时，主面板会自动渲染一个"view 布局"（Process / Data / Memory 三个标签，左中右三栏），这就是 `ooc://view/` 协议的效果——但触发点太隐蔽（没有任何 "Open view" 按钮）。
- **截图**：`06-supervisor-stone.png`、`07-stone-data.png`、`08-stone-effects.png`、`09-stone-memory.png`、`10-view-main.png`、`12-view-rendered-in-flow.png`
- **分类**：⚠️ 能用但有瑕疵
- **四维**：
  - 能用吗？四个标签 + 侧边树能翻到所有信息。
  - 意外行为？Stones 视图的标签是 "Readme/Data/Effects/Memory"；而 Flow 视图里的标签是 "Process/Data/Memory"（少了 Readme、多了 Process）。**两套 tab 不一致**，对新用户造成认知分裂。
  - 界面清晰？大体不错，细节上不够统一。
  - 说明缺失？无处说明 "view" 是什么、怎么主动触发。

---

## 测试项 #9：Kanban 看板（Issues / Tasks）

- **步骤**：在 flow 主面板底部点 ISSUES 的 +，填标题"Bruce 测试：Issue 创建 OK?"，创建。进入 issue 详情，提交一条评论"测试评论：Bruce 进来看看"。再试 Tasks 的 +。
- **期望**：能创建、能评论、能分组。
- **实际**：
  - 创建 Issue 模态简洁（Title + 可选 Description + 取消/创建）。
  - 创建后底部 ISSUES 区显示分组 "讨论中 (1) / Bruce 测试：Issue 创建 OK?"。
  - 点进去：描述 / 评论(0) / 关联 Tasks(0) 三标签 + 头部有"讨论中"状态 badge、`参与者: 无`、左上有返回箭头、底部有评论输入 + 发送。评论后 "评论 (1)" 并显示 "你 0m ago 测试评论：…"。
  - Tasks 的 + 同样弹出 "创建 Task" 模态，UI 一致。
- **截图**：`21-issue-create.png`、`22-issue-created.png`、`23-issue-detail.png`、`24-issue-comment.png`、`40-task-create.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？创建 + 评论完整可用。
  - 意外行为？暂无。
  - 界面清晰？干净。
  - 说明缺失？没有说明"讨论中"有哪些状态（ready / done / blocked 之类）可选。

---

## 测试项 #10：HTTP call_method 端点

- **步骤**：用户角度看"有没有 UI 引导我试 call_method"。另外手动 curl：
  ```bash
  curl -X POST http://localhost:8080/api/flows/<sid>/objects/supervisor/call_method \
    -H "Content-Type: application/json" \
    -d '{"traitId":"self:main","method":"ping","args":{}}'
  ```
- **期望**：端点可用；docs/ 有清晰说明；UI 里或多或少有引导。
- **实际**：
  - 后端：
    - 无 `traitId` → `{"success":false,"error":"缺少 traitId 字段"}`
    - `traitId:"kernel:talkable"` → `{"error":"只允许调用 self: namespace 的 traitId"}`
    - `traitId:"self:main", method:"readme"` → `{"error":"方法 \"readme\" 未在 self:main 的 ui_methods 中声明（可用：ping）"}`
    - `traitId:"self:main", method:"ping"` → `{"success":true,"data":{"result":{"ok":true,"from":"unknown","at":...}}}`
  - 错误提示友好。白名单、"自写/非 view / ui_methods" 三层校验都在。
  - UI 没有任何地方提示用户 "这里可以调用 object 的方法"；只在 meta.md / specs/ 里有说明，对非开发者用户不可见。
- **截图**：无（命令行）
- **分类**：✅ 能用（仅限开发者）
- **四维**：
  - 能用吗？端点功能正常、错误信息有指引。
  - 意外行为？无。
  - 界面清晰？API 错误信息清晰。
  - 说明缺失？Web UI 无任何入口 / 演示 / 一键调用按钮。

---

## 测试项 #11：用户 inbox 已读持久化

- **步骤**：让 bruce 委派完成，右侧出现"1 条未读"；点进 bruce 收到的消息；然后刷新页面。
- **期望**：未读数消失 / 红点消失 / 消息行不再显示 `1` 角标。
- **实际**：刷新后"1 条未读"按钮消失，bruce 行的红色 "1" 角标也消失，消息状态持久化成功。
- **截图**：`31-unread-threads.png` (前) / `32-bruce-msg-open.png`、`34-after-reload.png` (后)
- **分类**：✅ 能用

---

## 测试项 #12：@ 对象切换器

- **步骤**：在输入框里敲 `@`。
- **期望**：弹出对象列表，可选人。
- **实际**：立刻弹出一个浮层 `iris / sophia / user / bruce / nexus / debugger`（顺序没有按字母或按使用频率）。按 `Escape` 关闭浮层，但输入框里的 `@` 字符留存了下来（用户必须手动删除）。
- **截图**：`29-at-shortcut.png`
- **分类**：⚠️ 能用但有瑕疵
- **四维**：
  - 能用吗？能列出对象。
  - 意外行为？Esc 关闭浮层没同步把触发的 `@` 删除；列表顺序不稳定。
  - 界面清晰？浮层本身很漂亮（带 avatar + 首字母）。
  - 说明缺失？**欢迎页/副标题完全没提这个快捷键**，我是进了新 session 才在空态提示里看到 "输入 @ 切换对象"。

---

## 测试项 #13：Debug / Pause / Online 状态切换

- **步骤**：点击左上角 `debug` 开关；点 `pause` 开关。
- **期望**：切换明显可见。
- **实际**：
  - `debug` 打开时 logo 染上淡蓝色，但没有可见的"多余信息"显示（没多出 debug 面板、没 console overlay）。外行看不出差异。
  - `pause` 看不出变化（online 角标还是绿色 "online"）。
- **截图**：`38-debug-mode.png`
- **分类**：⚠️ 能用但有瑕疵（功能层不可见）

---

## 测试项 #14：主页展示 vs 侧边展示切换

- **步骤**：点右侧面板 hover 提示"切换到主页展示"的按钮。
- **期望**：将右侧 MessageSidebar 扩展到主面板位置。
- **实际**：正常工作——主面板被 MessageSidebar 全宽取代，原 action chain 变成全屏列表。按钮 title 改为 "切换到侧边展示"，再点回来可复原。
- **截图**：`39-main-display.png`
- **分类**：✅ 能用

---

## 测试项 #15：Ctx View（线程上下文可见性 4 色）

- **步骤**：Flow 主面板点 `Ctx View` 开关。
- **期望**：看到一个 4 色图例（detailed / summary / title_only / hidden），线程行能按当前可见性着色。
- **实际**：开启后顶部出现 `focus: supervisor 主线程 | detailed (完整可见) | summary (title + 摘要) | title_only (仅 title) | hidden (不可见)` 的图例，supervisor 主线程那行确实带紫色左边框表示 detailed。
- **截图**：`04-ctx-view.png`
- **分类**：✅ 能用
- **四维**：
  - 能用吗？4 色 legend 对我理解 "context builder 到底把哪些线程放进 LLM 上下文" 很有帮助。
  - 意外行为？无。
  - 界面清晰？legend 挤在一行，字体小；如果屏幕窄会挤压。
  - 说明缺失？legend 里只有颜色+名字，没点击/筛选行为；一开始我以为可以点颜色来过滤。

---

## 测试项 #16：Session 标题 + 重命名

- **步骤**：新建 session 后观察 session 标签；hover 之后看是否能编辑。
- **期望**：自动用首条消息做标题 / 能点改名。
- **实际**：
  - 发出首条消息后，session 标签立刻变成 prompt 的前 20 字（"请你向 user 用 form 提一个单…"），左侧 Sessions 列表也显示截断版。
  - 但 "请委派 bruce：用 think(context=..." 那个 session **左侧列表显示"Untitled session"直到过了一会儿才刷新成 prompt**。体感偶发。
  - 有 `title="Click to rename"` 元素（在 breadcrumb 的 session 标签上），说明重命名是支持的，但没点开测。
- **截图**：`25-bruce-delegate.png`、`26-bruce-delegate-progress.png`
- **分类**：⚠️ 能用但有瑕疵

---

## 测试项 #17：控制台错误

- **步骤**：观察 Chrome DevTools console。
- **实际**：只有 3 条 Vite dev 相关错误：
  ```
  WebSocket connection to 'ws://0.0.0.0:18080/?token=vun-Ngbjo38y' failed: Establishing a tunnel via proxy server failed.
  [vite] failed to connect to websocket
  ```
  没有应用层 React / Jotai / API 错误。后端 API 调用（REST、SSE）工作正常。
- **分类**：✅ 能用（仅 HMR 代理问题，非功能性）

---

## 测试项 #18：World 视图（文件树）

- **步骤**：点左侧 nav 的 World tab。
- **期望**：文件系统概览。
- **实际**：显示 `.git / .temp / docs / flows / kernel / library / stones / .env / .gitignore / .gitmodules / CLAUDE.md / README.md`。点击 docs 或 CLAUDE.md 能进一步展开/打开。
- **截图**：`05-world.png`
- **分类**：✅ 能用

---

## 总体印象

- OOC 前端的基础交互（发消息、看线程、看 stone、开 issue）已经能顺畅跑通，核心概念（对象 / 线程 / 身份 / trait / context-view / memory）全部以 UI 形式呈现，这是很震撼的一件事。
- 但 **"让用户发现和使用"** 这一层还有明显断点：新用户进来后找不到"怎么选对象对话"，找不到"form 怎么填"，找不到"tool 在做什么"——这些核心体验点要么被埋在 UX 之下，要么根本没渲染对应 UI。
- 一些语义不一致（Stones tabs vs Flow-view tabs；session 标题刷新时机；Esc 不清 `@`）是小瑕疵，但每一个都会被新用户第一次碰到。
- 整体 UI 美学很高（配色、字体、节奏），但"可用性兜底"还差一点。

---

## 优先级建议

### P0 阻塞（严重影响首次使用）

1. **Talk Form 的 option picker 完全缺失**（测试项 #7）
   - 现象：supervisor 向 user 发 form，user 端收到消息却无法选择，只能看到 talk summary 文本。
   - 影响：核心的 "结构化对话 / 选项 / 表单" 闭环走不通，整个 form 机制看不到效果。
   - 修复方向：在 MessageSidebar 的消息渲染里添加 `form` 字段检测 → 渲染 radio 列表 + 键盘 ↑↓ Enter Esc + "自由输入" 兜底选项。

2. **欢迎页没有可点的对象入口 + 没有 "@ 切换对象" 提示**（测试项 #1、#12）
   - 现象：对象卡片 cursor=auto 不可点；新用户完全不知道怎么和 supervisor 之外的对象直接对话。
   - 修复方向：要么让卡片点击 = 新建一个 `target=<obj>` 的 session；要么在欢迎页副标题下加一行 hint："想和某个对象直接对话？输入 @ 或点击对象卡片。"

### P1 重要（明显体验瑕疵）

3. **Tool 卡片没有显式 title 行**（测试项 #4）
   - 现象：每条 tool 动作只渲染原始 JSON，title 字段埋在里面，长 JSON 还会被截断。
   - 修复方向：在 tool 卡片顶端抬一行 `<title>`（粗体/灰色），主体保留折叠的 JSON。与 inject 卡片的 `›` 折叠样式一致。

4. **新 session 的 MessageSidebar 没自动聚焦活跃线程**（测试项 #5）
   - 现象：提交首条消息后右侧仍停留在 "向 supervisor 发起对话，输入 @ 切换对象" 空态，用户必须手动点 "supervisor 主线程"。
   - 修复方向：新 session 的 root thread 立刻成为 sidebar 的 activeThread。

5. **Memory 面板 markdown 表格渲染失败**（测试项 #6）
   - 现象：表格行被拼成"1 | 2 | 3 | ## ..." 一大段文本。
   - 修复方向：确认当前 markdown 渲染 pipeline 对 `|---|` 表头的处理；或把 memory.md 转成非表格格式。

6. **Stones view tabs 与 Flow-view tabs 不一致**（测试项 #8）
   - Stones: Readme / Data / Effects / Memory
   - Flow-view: Process / Data / Memory
   - 建议选其一并全局统一。

### P2 锦上添花

7. **Esc 关闭 @ 浮层后输入框残留 `@` 字符**（测试项 #12）
8. **Debug / Pause 切换对视觉没有可见回馈**（测试项 #13）
9. **对象卡片列表顺序不稳定**（@ 浮层里每次开顺序可能不同）
10. **session 标题刷新偶发延迟**（测试项 #16）
11. **tool JSON 被截断到一半括号**（比如 `submit({"title":"...","mark":[{"messageId":"msg_mo8xm5l)`）
12. **Kanban 状态切换（讨论中 → ready → done）没可见入口**
13. **`views/main` 子目录里点 `main` 不会激活 view 渲染，只展开子文件**
14. **消息标题里暴露内部 ID**（`[fork] [form: form_mo8xtz2f_v0bv]`）

---

## 小结（给 Alan Kay 的 TL;DR）

核心功能都跑通了，线程树 + 身份系统 + trait memory 的架构美感很好；但两个 **P0 阻塞** 直接影响"新用户第一次能不能把流程走通"：

1. Form 选项完全不可点 — 影响最大
2. 对象切换入口不可见 — 影响最广

建议先修这两处，再收一轮 P1 瑕疵。
