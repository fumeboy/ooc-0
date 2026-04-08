# 体验报告：线程树架构 Web 端首次验证

> 日期：2026-04-07
> 验证者：Candy
> 场景目的：验证线程树架构在 Web 端的基本可用性

## 操作过程

### 场景 1：初次访问

1. **打开 http://localhost:5173** → 页面在 ~3 秒内加载完成（含 React 渲染），标题 "OOC World"
   - 感受：加载速度可接受。首屏有一个精致的四角星 logo + "Oriented Object Context" 标题 + 绿色在线指示灯，视觉上干净清爽。

2. **浏览首屏布局** → 左侧边栏有三个 tab（Flows / Stones / World），Flows 下显示 SESSIONS 列表（2 个旧 session），主区域居中显示 "What would you like to do? Start a conversation with supervisor" + 输入框
   - 感受：信息层次清晰，引导明确。但 "What would you like to do?" 和 "Start a conversation with supervisor" 都是英文，与系统中文定位不一致。新用户能理解这是一个对话系统，但不知道 supervisor 是谁、能做什么。

3. **切换到 Stones tab** → 显示 9 个对象列表：bruce, debugger, iris, kernel, nexus, sophia, supervisor, test_validator, user。每个对象有齿轮图标，可展开。
   - 感受：对象一览清晰，能看到系统中有哪些"角色"。但没有任何身份描述（whoAmI），只有名字。作为新用户，我不知道 sophia 和 iris 分别是什么。

4. **切换到 World tab** → 显示项目文件树（.git, .temp, docs, flows, library, stones, .env 等）
   - 感受：这是一个文件浏览器视图，对开发者有用，但对普通用户来说信息过载。.env 文件直接暴露在列表中（安全隐患）。

### 场景 2：与 sophia 对话（失败）

5. **在 Stones 列表中寻找 sophia** → sophia 在 Stones tab 中可见，但 Flows tab 的 welcome 页面只能与 supervisor 对话，没有选择其他对象的入口
   - 感受：作为用户，我想和 sophia 聊天，但 welcome 页面把我锁定在 supervisor。输入框 placeholder 写着 "Message supervisor..."，没有切换对象的方式。虽然提示说"输入 @ 选择对象"，但这个提示只出现在 session 页面，不在 welcome 页面。

6. **在 welcome 页面输入消息并发送** → 输入 "请简要介绍一下 OOC 的 G1 基因是什么？"，点击发送按钮（纸飞机图标）→ 页面无任何反应，消息未发送，URL 未变化
   - 感受：这是一个严重的 bug。发送按钮看起来可点击，但点击后什么都没发生。没有错误提示，没有 loading 状态，用户完全不知道发生了什么。（注：这可能是 Playwright 自动化测试中 `page.fill()` 未触发 React onChange 的问题，需要在真实浏览器中验证）

### 场景 3：与 supervisor 对话

7. **点击 "Start a conversation with supervisor"** → 在第一次测试中成功跳转到 session 页面（URL 变为 `flows > session_20260407084538_ypi1 > objects > supervisor`），但在后续测试中点击无反应
   - 感受：行为不一致，有时能跳转有时不能。

8. **进入 session 页面后** → 页面显示三栏布局：左侧文件树（index + objects），中间主区域显示 "加载中..."，右侧显示 supervisor 信息面板（名称、session ID、"输入消息开始对话，输入 @ 选择对象"）
   - 感受：三栏布局信息丰富。右侧面板有对象身份信息和输入提示，设计合理。但中间区域永远停留在 "加载中..."，等待 45 秒后仍未加载完成。

9. **通过 API 直接测试** → `POST /api/talk/supervisor` 成功返回，后端确实生成了回复（summary: "你好！我是 Alan Kay，OOC 项目的 Supervisor。有什么我可以帮你的吗？"），但回复未作为 outgoing message 记录在 messages 数组中，且新创建的 session 无法通过 `GET /api/flows/:sessionId` 查询
   - 感受：后端核心逻辑在工作，LLM 能正确回复，但数据流断裂——回复生成了却没有正确传递到前端。

## 体验评估

| 维度 | 评分(1-5) | 说明 |
|------|-----------|------|
| 第一印象与可理解性 | 3 | Logo 精致，布局清晰，但缺少中文引导和对象身份说明 |
| 对话体验 | 1 | 核心对话流程完全不可用：welcome 页发送无反应，session 页永远加载中 |
| 对象浏览体验 | 3 | Stones 列表完整，但缺少 whoAmI 描述，无法快速了解每个对象的角色 |
| 任务完成能力 | 1 | 无法完成任何对话任务，后端有回复但前端无法展示 |
| 响应速度与进度反馈 | 2 | 页面加载快，但 "加载中..." 无限等待，无超时处理，无进度指示 |
| 视觉与交互质量 | 4 | 视觉设计统一优雅，配色舒适，布局合理，交互反馈（除对话外）流畅 |

## 发现的问题

### ISSUE-1 [CRITICAL] 对话流程完全不可用
- Welcome 页面发送消息后无任何反应（可能是 React 状态未同步，需真实浏览器验证）
- Session 页面中间区域永远显示 "加载中..."，无法加载 flow 数据
- 根因：`GET /api/flows/:sessionId` 对新创建的 session 返回 "Flow 不存在"，前端无法获取 flow 数据

### ISSUE-2 [CRITICAL] 回复消息未记录到 messages 数组
- 后端 LLM 生成了正确回复（存在 data.json 的 summary 字段中）
- 但 messages 数组只有用户的 inbound 消息，没有 outbound 回复
- 这意味着即使 "加载中" 问题修复，对话历史中也看不到 AI 的回复

### ISSUE-3 [HIGH] 新线程树 session 不在 flows 列表中显示
- 磁盘上有大量 `s_*` 格式的新 session 目录（线程树架构创建）
- `GET /api/flows` 只返回 2 个旧格式 session，新 session 完全不可见
- 用户无法在侧边栏看到或访问新创建的会话

### ISSUE-4 [MEDIUM] Welcome 页面缺少对象选择能力
- 只能与 supervisor 对话，无法选择其他对象（sophia, iris 等）
- Session 页面有 "输入 @ 选择对象" 提示，但 welcome 页面没有
- 用户被迫先创建 supervisor 会话，再在会话中切换对象

### ISSUE-5 [MEDIUM] Stones 列表缺少身份描述
- 对象列表只显示名称，不显示 whoAmI
- 后端 API 返回了 whoAmI 数据（如 sophia: "OOC 最高哲学设计层，负责基因维护、涌现推演与设计决策"）
- 但前端 Stones 列表未展示这些信息

### ISSUE-6 [LOW] 语言不一致
- 系统定位为中文（CLAUDE.md 全中文，对象 whoAmI 全中文）
- 但 welcome 页面是英文（"What would you like to do?"、"Start a conversation with supervisor"）
- Session 页面混合中英文（"加载中..."、"输入消息开始对话"是中文，breadcrumb 是英文）

### ISSUE-7 [LOW] World tab 暴露敏感文件
- .env 文件（177B）直接显示在文件树中，可被点击查看
- 建议在文件树中过滤敏感文件

## 总体感受

视觉设计是这个系统最大的亮点——干净、现代、有品味。三 tab 布局（Flows/Stones/World）的信息架构也很合理。但核心对话功能完全不可用，这是线程树架构集成后的致命问题。后端 LLM 能正确生成回复（通过 API 直接调用验证），但数据流在"回复记录"和"flow 查询"两个环节断裂，导致前端既无法加载会话数据，也无法展示 AI 回复。建议优先修复 ISSUE-1 和 ISSUE-2，这两个问题解决后对话体验才能开始评估。
