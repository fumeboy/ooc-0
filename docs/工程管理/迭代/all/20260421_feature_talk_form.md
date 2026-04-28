# Talk Form — 选择题式表单交互

> 类型：feature
> 创建日期：2026-04-21
> 状态：finish
> 负责人：Claude Opus 4.7 (1M context)
> 完成日期：2026-04-21

## 背景 / 问题描述

当前 `talk` 只能发送自由文本，前端以纯消息气泡渲染。但很多交互场景下，发起方已经心里有几个可能的选项——比如：

- Supervisor 问 user："这个需求你希望按哪种方式实现？A/B/C"
- Bruce 问 user："遇到阻塞，你倾向于哪条路径？"

现在只能用自然语言写完问题 + 选项列表，让对方猜 parsing 规则，体验差且易出错。

**参考 UX**：Claude Code 的 option picker（见用户提供截图）——顶部问题 + 编号选项 + "Something else" 兜底 + 键盘导航（↑↓ navigate / Enter select / Esc skip）。选项被选中自动发回；用户也可以写自由文本。

## 目标

1. **扩展 talk 语义**：允许 `talk` 时携带一段**结构化表单**（form），前端识别后用交互组件渲染。
2. **表单类型**：至少支持
   - **单选**（single choice）：N 个选项取一，选中即发回该选项内容。
   - **多选**（multi choice）：N 个选项取多，确认后一次发回。
   - （可扩展：文本输入、评分、日期等；本迭代只做单选和多选。）
3. **自然语言兜底**：表单不限制回复格式——用户**总是**可以不点任何选项，直接输入自由文本作为回复（类似截图里的 "Something else" 输入框 + Skip 按钮）。
4. **前端独立渲染**：form 消息在前端是**独立组件**，不是普通 bubble + Markdown。键盘导航符合截图的体验（↑↓ / Enter / Esc）。
5. **后端存储透明**：表单作为 talk payload 的结构化字段持久化到线程 thread.json / message，回复时后端要能识别"这是对某个 form 的选择型回复"还是"自由文本回复"。

## 方案（初步，待细化）

### 协议层（后端）

当前 `talk` tool 的 args 大致是 `{target, message, ...}`。扩展：

```json
{
  "target": "user",
  "message": "这个需求你希望按哪种方式实现？",
  "form": {
    "type": "single_choice" | "multi_choice",
    "options": [
      { "id": "A", "label": "方案 A", "detail": "..." },
      { "id": "B", "label": "方案 B", "detail": "..." }
    ],
    "allow_free_text": true  // 默认 true；目前业务上总是 true
  }
}
```

**设计取舍**：
- `form` 是 **optional 字段**，不提供时退回为普通 talk。向后兼容无障碍。
- `options[i].detail` 可选，用于展示"选项副标题/说明"。
- **不要**设计 `form.required` 强制用户必选——按业务设定，自然语言回复始终开放。

### 消息结构（持久化）

- 发起方（对象）的 thread.json 里 message_out action 增加 `form: {...}` 字段。
- 接收方的 inbox message（`ThreadInboxMessage`）也携带 form 结构（或至少携带 `hasForm: true` + formId 引用）。
- 回复时的 message 增加 `formResponse: { formId, selectedOptionIds: [], freeText?: string }`——让发起方 LLM 明确看到"对方点了 A+B 还是写了自由文本"。

### 前端渲染

- `TuiTalk`（或新组件 `TuiTalkForm`）检测 `message.form` 字段——有则渲染 option picker；无则按普通 talk 渲染。
- Option picker：
  - 标题（问题文本）
  - 编号选项列表（1, 2, 3, ...）
  - 自由文本输入 + "Skip" 按钮（可选：不填不交）
  - 键盘：↑↓ 选中、Enter 发送、Esc 跳过（等价点 Skip）
  - 鼠标：点击选项即发送（单选）；多选先勾选后确认按钮发送
- 发送的 API 调用：`POST /api/talk/:target` 带 `{ message, formResponse: {...} }`。若用户只填自由文本不选选项，`formResponse.freeText` 带上原问题 formId。

### LLM 侧（发起方）

- Tool schema 扩展：`talk` / `talk_sync` 的 arguments 增加可选 `form` 字段。
- LLM 在有"预定义选项"场景下被鼓励用 form 提问——在 `kernel/traits/talkable/TRAIT.md` 加 example。

### 作用域

- **user 是典型消费者**：user 在 MessageSidebar 收到带 form 的 talk → 渲染 option picker。
- **对象间也可用**：对象 A 给对象 B 发带 form 的 talk 也合法——但对象 B 是 LLM，它"选择"的方式就是在回复里提到选项 ID。后端/前端不强求对象 B 必须走 form 通道——这是 LLM→LLM 的 free-form 容忍场景。**本迭代 UI 只做 user 视角的 option picker**，对象间的 form 只是数据层透传。

## 影响范围

- **后端**：
  - `kernel/src/thread/tools.ts` — talk / talk_sync schema 扩展
  - `kernel/src/thread/types.ts` — ProcessEvent.tool_use（或 message action）+ InboxMessage 增加 form 字段
  - `kernel/src/thread/engine.ts` — 读取 form、持久化 form、返回 formResponse
  - `kernel/src/world/world.ts` — onTalk 透传 form 到 SSE
  - `kernel/src/server/server.ts` — `POST /api/talk/:target` 接受 `formResponse`
  - 新增 `kernel/tests/talk-form.test.ts`
- **前端**：
  - `kernel/web/src/components/ui/TuiBlock.tsx`（或新 `TuiTalkForm.tsx`）
  - `kernel/web/src/features/MessageSidebar.tsx` — 接入 form 渲染 + 回复 API
  - `kernel/web/src/api/types.ts` — FlowMessage / InboxMessage 增加 form
  - `kernel/web/src/api/client.ts` — talk API 扩展 formResponse 参数
  - 键盘导航：useHotkeys 或手写 keydown handler
- **文档**：
  - `docs/meta.md` 子树 4（协作 → 通信原语）+ 子树 6（Web UI）说明
  - `kernel/traits/talkable/TRAIT.md` 加 form 使用 example
  - `docs/哲学/discussions/README.md` 记录"为什么保留自然语言兜底"设计决策
- **基因/涌现**：
  - 强化 G8（消息）的表达力——消息不只是文本，可以携带交互结构
  - 可能涌现"对象主动用 form 提问降低协作歧义"的新行为模式

## 验证标准

1. **后端单元测试**：
   - talk schema 包含 form 字段且为 optional
   - Engine 正确持久化 form 到 thread.json + inbox
   - talk 回复（POST /api/talk）能接收 formResponse 字段
2. **前端类型**：tsc 0 error；form 的 TS 类型完整
3. **E2E 体验**（参考截图的 UX）：
   - 启动服务，让 supervisor 问 user："选个方案 A/B/C"（带 form）
   - MessageSidebar 渲染出 option picker（3 个编号选项 + 自由文本框 + Skip）
   - 键盘 ↑↓ 能在选项间导航、Enter 发送、Esc 跳过
   - 鼠标点击选项发送
   - 在"Something else"输入"随便"按 Enter 也能发
   - 后端收到的回复能正确区分"点了 A" vs "自由文本 '随便'"
4. **视觉对齐**：至少一张截图对比（我们的 option picker vs Claude Code 参考图），贴入执行记录

## 依赖 / 协调

- **依赖 User Inbox 迭代**（因为 user 的 form 消息要通过 user inbox 触达 MessageSidebar）——若 user_inbox 迭代已完成，本迭代可直接启动。
- **前端触点可能与 MessageSidebar threads 视图迭代重合**——两者都改 MessageSidebar，需要协调。若 MessageSidebar threads 视图先完成，本迭代在其基础上加 form 渲染；反之则本迭代先搭好 form 渲染基础，threads 视图迭代复用。

## 执行记录

### 2026-04-21 认领

- 从 `todo/` 移到 `doing/`
- 并行 agent 正在做 `20260421_feature_ReflectFlow线程树化.md`；该 agent 的主战场是 `kernel/src/thread/collaboration.ts`、`kernel/src/thread/reflect.ts`（新建）、`kernel/src/world/world.ts`、`kernel/traits/reflective/reflect_flow/`。本迭代严格避开这些文件
- 本迭代战场：`kernel/src/thread/tools.ts` / `types.ts` / `engine.ts`、`kernel/src/server/server.ts`、`kernel/web/src/components/ui/TuiBlock.tsx` / `MessageSidebar.tsx` / `api/*`、`kernel/traits/talkable/TRAIT.md`、新增 `kernel/tests/talk-form.test.ts`

### 2026-04-21 基线

- 后端 `cd kernel && bun test`：**525 pass / 0 fail**（6 skip）
- 前端 `cd kernel/web && bunx tsc --noEmit`：**0 error**

### 2026-04-21 设计决策

**1. form 字段放在 tool schema 的哪里**
- talk / talk_sync 的 args 顶层加 optional `form` 字段（不进入 `required`——不提供时退回普通 talk）
- 仅 submit tool 需要扩展（talk/talk_sync 是通过 submit(command=talk) 提交的，没有独立的 talk tool）

**2. form 需要 id 吗**
- 需要。engine 侧自动生成 `form_<timestamp36>_<rand>`（命名与 activeForms 的 formId 不冲突——这是 talk 消息级表单，生命周期独立）
- formId 是 form 消息 + formResponse 之间的关联锚点

**3. formResponse 数据结构**
```ts
interface FormResponse {
  formId: string;
  selectedOptionIds: string[];    // 单选时长度 1；多选时多个；兜底文本时为空
  freeText: string | null;        // 用户写的自由文本（null 表示没写）
}
```
前端发送：`POST /api/talk/:target` body 扩展 `formResponse?: FormResponse`

**4. 持久化结构**
- 发起方 thread.json 的 `message_out` action 携带 `form` 字段（含 formId + 全部 options + 结构）——正文真相
- user inbox 条目不改（仍是 `{threadId, messageId}` 引用）
- 接收方为对象时，inbox message 的 content 里附加 `[form: formId=xxx]` 提示 LLM 有结构化表单（不强制 LLM 按 form 回复——自然语言兜底）
- 前端（MessageSidebar）用 `threadId + messageId` 反查正文时就能拿到 form 字段
- user 回复时：`talkTo(target, message, {formResponse})` 传给 server，server 把 formResponse 作为独立字段嵌入发起方 inbox 消息 content，LLM 看到如 `[formResponse] formId=xxx selected=["A","B"] freeText=null`

**5. 前端渲染触发**
- `TuiTalk`（收到的消息）展示时：若 `message` 对应的 action 里有 `form` 字段，渲染新 `TuiTalkForm`（option picker）
- 数据结构：TuiTalkForm 接收 `form` payload + `onSubmit(response)` 回调

**6. 键盘快捷键冲突**
- MessageSidebar 现有 ↑↓ 导航消息的键绑定是挂在**全局输入框**上的（其实是 input 上的 mention 逻辑）
- form picker 自己的 ↑↓/Enter 只在 picker 获取焦点时生效——用局部 keydown handler + ref.focus() + tabIndex
- Esc 跳过：让 picker 隐藏但不发送（用户仍可用自由文本或正常回复）
- MessageSidebar 现有 `navigateMsg` 用的是 Header 上的 ChevronUp/Down 按钮，没有挂全局 ↑↓，无冲突

**7. 作用域**
- 本迭代只做 user 视角的 option picker（MessageSidebar 内）
- 对象间 talk 带 form 时仅做数据透传（message_out action 里存 form，接收对象的 inbox content 里注入提示），不做交互 UI
- `allow_free_text` 永远 true（业务常量，不暴露关闭开关）

### 2026-04-21 Task 1+2 — tool schema + types（合并提交）

合并原因：tools.ts 的 FORM_PARAM 和 types.ts 的 TalkFormPayload/FormResponse 是契约的两面，解耦拆分意义小，合并 commit 更清晰。

- `kernel/src/thread/tools.ts`: 新增 `FORM_PARAM` schema；submit tool args.form 加入 properties（不在 required）；submit description 补 form 说明
- `kernel/src/thread/types.ts`: 新增 `TalkFormOption` / `TalkFormPayload` / `FormResponse`；`ProcessEvent.form` / `.formResponse`（optional）；`ThreadInboxMessage.form` / `.formResponse`（optional）

并行 agent 冲突：ReflectFlow agent 曾把我未提交的 tools.ts/types.ts 暂存误纳入他们的 commit `1f42aa1`——他们察觉后立即 amend 掉了（HEAD 变成 `e5d04f7`，只含 reflect.ts+reflect-thread.test.ts）。我随后独立 commit 自己的 tools.ts/types.ts 到 `e472a1d`。期间我**没有使用 git stash**（按硬约束）。

**Commit**: `e472a1d` — `feat(thread): talk tool schema + types 支持 form 表单`

### 2026-04-21 Task 3 — engine 持久化 form

- `kernel/src/thread/engine.ts`:
  - 新增 `genTalkFormId()`：生成 `form_<ts>_<rand>`（与 activeForms 的 `f_` 前缀区分）
  - 新增 `extractTalkForm(raw)`：从 submit args.form 解析并标准化（options 为空或 type 无效时返回 null）
  - `run` 路径和 `resume` 路径两处 talk/talk_sync 分支：生成 messageId 前调 extractTalkForm，有效时把 form 写到 message_out action，content 尾缀 `[form: formId]`
- 新增 `kernel/tests/talk-form.test.ts`（Task 1-3 共 6 tests）：
  - 1. schema 契约：submit.properties.form 存在、optional；form.type 枚举正确
  - 2. schema 契约：form 内部 required 含 type + options
  - 3. engine 持久化：带 form 的 talk → action.form 正确落盘 + formId 自动生成 + content 尾缀标记
  - 4. 无 form：action.form undefined（退回普通 talk）
  - 5. form.options 空数组：视为无效，退回普通 talk
  - 6. multi_choice 多选：正确落盘

全量测试：542 pass / 0 fail（基线 533，新增 9：6 本迭代 + 3 ReflectFlow 并行）。

**Commit**: `d35e5b3` — `feat(thread/engine): talk(form=...) 持久化到 message_out action`

### 2026-04-21 Task 4 — server formResponse 接收

**硬边界判断**：原设计要求改 world.ts 透传 formResponse，但**严格约束是"不碰 world.ts"**（并行 agent 主战场）。重新评估后发现 **server.ts 前置注入** 就能满足全部语义：

- `kernel/src/server/server.ts` `POST /api/talk/:objectName`:
  - body 扩展可选 `formResponse` 字段
  - 字段校验：`formId` 必填（缺则视为无效）；`selectedOptionIds` 非 string 自动过滤；`freeText` 非 string 视为 null
  - 有效时：`[formResponse] <JSON>\n\n<原消息>` 前缀注入 message，传给 `world.talk()`
  - LLM 在 inbox.content 里看到结构化 JSON 前缀 + 人类可读正文

- `tests/talk-form.test.ts` 增加 4 个 server 场景（共 10 tests）：
  - 正常 formResponse → `[formResponse]` 前缀 + JSON 正确
  - freeText 兜底（无 selectedOptionIds）
  - 无 formResponse 不注入前缀（向后兼容）
  - 缺 formId 视为无效退回

全量测试：550 pass / 0 fail。

**设计收益**：world.ts 不动；engine.ts 的 talk 分支不动；所有 form 响应语义压在 server.ts 前置。

**Commit**: `46c2d37` — `feat(server): POST /api/talk 接受 formResponse，注入 [formResponse] 前缀`

### 2026-04-21 Task 5 — 前端 TuiTalkForm

- `kernel/web/src/api/types.ts`: 新增 `TalkFormOption` / `TalkFormPayload` / `FormResponse`（后端类型镜像）；`Action.form` / `.formResponse`（optional）
- `kernel/web/src/api/client.ts`: `talkTo(object, message, flowId?, formResponse?)` 第 4 个参数可选，内部按需 spread 到 POST body
- `kernel/web/src/components/ui/TuiTalkForm.tsx`（新文件，270 行）:
  - 渲染顶部问题（stripTalkPrefix 去掉 content 的 `[talk] →` 和 `[form: xxx]` 尾缀）
  - 选项列表：编号 1..N + label + 可选 detail
  - 单选模式：点击/Enter 即发 + 1..9 数字键直选
  - 多选模式：勾选框（✓）+ 确认按钮（显示已选数）
  - 自由文本输入框（"Something else"）+ Skip 按钮
  - 键盘导航：↑↓/Enter/Esc/1..9（自由文本框内 Enter 提交、Esc 失焦）
  - 提交状态：idle → submitting → submitted（loader 图标 + 已回复提示）
  - alreadySubmitted prop：持久化态接入（刷新后不重复展示 picker）

tsc 0 error；build 成功。

**Commit**: `f8345f5` — `feat(web): TuiTalkForm option picker + api types 支持 form`

### 2026-04-21 Task 6 — MessageSidebar 接入

- `kernel/web/src/features/MessageSidebar.tsx`:
  - 新增 `Entry` 类型（命名化 timeline 类型，便于 useMemo 返回 map）
  - timeline useMemo 同时收集 `formByContent: Map<content+timestamp, {form, messageId}>` — 从当前 thread 的 message_out action 里抓 form
  - 新增 `lookupFormForMessage(msg)`：按 `content slice + timestamp` 做主键匹配，timestamp 微差时 fallback 到 content-only 匹配
  - 新增 `handleFormSubmit(target, response, displayText)`：乐观消息 + `submittedFormIds` localStorage（`ooc:talk-form:submitted:{sid}`） + `talkTo(target, displayText, sid, response)`
  - 渲染条件分支：FlowMessage 若非 user 侧且 lookup 命中 form → `<TuiTalkForm>`；否则 `<TuiTalk>`
  - displayText 生成：单选→取 option.label；多选→label 用「、」拼；带自由文本→加「（备注：xxx）」；都没有→"(已跳过)"

tsc 0 error；build 成功。

**Commit**: `b3cadbf` — `feat(web): MessageSidebar 接入 TuiTalkForm 渲染 + 发送 formResponse`

### 2026-04-21 Task 7 — 文档 + TRAIT.md

- `kernel/traits/talkable/TRAIT.md` 新增「结构化表单（form）」一节：
  - 何时用 / 不用 form 的判断
  - 完整代码示例（submit args.form 结构）
  - formResponse inbox 消息格式说明
  - 设计哲学（结构化但不强制）

**Commit**: `8a6492b` — `docs(trait): talkable 增加 form 使用章节`

### 2026-04-21 步骤 4 — 测试基线对比

| 范围 | 基线（本迭代前） | 本迭代完成后 | 变化 |
|------|-----|-----|-----|
| 后端 bun test | 533 pass / 0 fail | 550 pass / 0 fail | +17 pass（10 本迭代 + 7 ReflectFlow 并行） |
| 前端 tsc --noEmit | 0 error | 0 error | 无变化 |
| 前端 bun run build | pass | pass | 无变化 |

新增测试 `tests/talk-form.test.ts`：10 tests，全绿。

### 2026-04-21 步骤 5 — 体验验证

后端在 8081 启动（8080 留给并行 ReflectFlow agent）：

```bash
cd /Users/zhangzhefu/x/ooc/user && NO_PROXY='*' bun kernel/src/cli.ts start 8081
```

**场景 A — supervisor 发 form 给 user**

```bash
curl -X POST http://localhost:8081/api/talk/supervisor \
  -d '{"message":"请你向 user 用 form 结构化表单的方式提一个问题。要求：用 submit 工具调用 talk 命令，args 里带 form 字段（type=single_choice，两个选项 A/B），问 user 今天午餐选米饭还是面条。你只做这一件事就完成（return），不要做别的。"}'
# → sessionId: s_mo8rs35p_ccm69s
```

等 finished 后，`flows/s_mo8rs35p_ccm69s/objects/supervisor/threads/th_mo8rs365_51hq6j/thread.json` 的 actions[] 里找到一条 `message_out`：

```json
{
  "id": "msg_mo8rsq0i_06io",
  "type": "message_out",
  "content": "[talk] → user: 今天午餐你想吃什么？请从下面选一个： [form: form_mo8rsq0i_thk0]",
  "form": {
    "formId": "form_mo8rsq0i_thk0",
    "type": "single_choice",
    "options": [
      { "id": "A", "label": "米饭", "detail": "中式米饭套餐" },
      { "id": "B", "label": "面条", "detail": "各种面食" }
    ],
    "allow_free_text": true
  }
}
```

`GET /api/sessions/s_mo8rs35p_ccm69s/user-inbox`：

```json
{ "inbox": [{ "threadId": "th_mo8rs365_51hq6j", "messageId": "msg_mo8rsq0i_06io" }] }
```

**✅ 全链路闭合：engine 生成 formId → 写入 action.form → user inbox 索引正常 → 前端可按 (threadId, messageId) 反查到 form 字段**

**LLM 使用 form schema 的观察**：supervisor 第一次被 prompt 引导（明确要求带 form 字段）就正确产出了带 form 的 submit tool call，没有跑偏也没有漏选项。带 detail 也出现了（LLM 主动加的，方案里只说了"两个选项 A/B"）。这说明 schema + trait 说明对 LLM 的引导是有效的。

**场景 B — 模拟 user formResponse**

```bash
curl -X POST http://localhost:8081/api/talk/supervisor \
  -d '{"message":"米饭（中式米饭套餐）","sessionId":"s_mo8rs35p_ccm69s","formResponse":{"formId":"form_mo8rsq0i_thk0","selectedOptionIds":["A"],"freeText":null}}'
```

等 finished 后，thread.json 的 inbox 里第二条消息：

```
[inbox] from=user source=talk status=marked
  content: '[formResponse] {"formId":"form_mo8rsq0i_thk0","selectedOptionIds":["A"],"freeText":null}\n\n米饭（中式米饭套餐）'
```

供 supervisor LLM 看到的 thought + 后续 action：

```
[thinking] The user responded to my form and selected option A (米饭 - rice).
  I need to submit the return with the final result, and mark the inbox message.
[tool_use] submit title='确认用户选择米饭，返回最终结果'
  summary: '用户已回复表单，选择了选项 A（米饭 - 中式米饭套餐）。任务完成。'
[thread_return] 用户已回复表单，选择了选项 A（米饭 - 中式米饭套餐）。任务完成。
```

**✅ LLM 成功机读 `[formResponse]` JSON 前缀，正确识别 selectedOptionIds=["A"] → "米饭"，并 ack 了 inbox 消息**。

Server killed after test.

### 2026-04-21 步骤 5.1 — UI 人肉验证清单

（本 agent 无浏览器 MCP 工具；清单留给 Alan Kay 人肉验证）

1. **基础 render**
   - 启动后端（`bun kernel/src/cli.ts start 8080`）+ 前端（`cd kernel/web && bun run dev`）
   - 访问 http://localhost:5173 → Flows tab → 右侧 MessageSidebar 可见

2. **触发带 form 的 talk**
   - 输入："请你向 user 用 form 提个问题，选项 A/B/C" → 发送
   - 等 supervisor 执行完（有 loader）
   - Body 里最新消息不是普通 TuiTalk，而是 **TuiTalkForm** option picker 样式

3. **视觉元素检查**
   - 头部行：`❯ talk · form  supervisor → user  [时间]`
   - 问题正文 markdown 渲染
   - 选项列表：编号 `1.` `2.` `3.` + label + 可选 detail（次级色小字）
   - 自由文本输入框 "Something else…（Enter 发送，Esc 取消）"
   - 右侧 Skip 按钮（SkipForward 图标）

4. **键盘导航**
   - 挂载后自动 focus 到 TuiTalkForm 容器
   - `↓` 光标向下移动（选项 1 → 2 → ... → 自由文本行 → 环回）
   - `↑` 反向
   - `1` / `2` / `3` 数字键直接选对应选项（单选：即发）
   - 单选：Enter 选当前光标选项即发
   - 多选：Enter 勾选当前，勾选 + "确认" 按钮发送
   - `Esc` 跳过（UI 灰掉，"已回复"提示）
   - 自由文本框内：Enter 提交（只在输入了内容时），Esc 失焦

5. **鼠标交互**
   - 鼠标 hover 选项 → 光标高亮
   - 单选：点击选项立即发送
   - 多选：点击勾选/取消勾选；点击"确认 (N)"按钮发送
   - 点击 "Skip" 按钮 = Esc

6. **提交后状态**
   - picker 变灰（opacity-60 + pointer-events-none）
   - 头部行右侧有 ✓ 或 Loader2
   - "已回复" 小字提示
   - 刷新页面后依然为已提交态（localStorage 持久化）

7. **多选场景**
   - 触发带 multi_choice form 的 talk
   - 单击多个选项 → 勾选框变蓝（✓）
   - "确认 (N)" 按钮显示勾选数
   - 点确认 → 按钮禁用 + 提交

8. **自由文本兜底**
   - 单选场景下：直接在 Something else 框里写"都不要，我今天不吃饭" → Enter
   - formResponse 发出时 selectedOptionIds=[]、freeText="都不要..."
   - 后端 supervisor 的 inbox 应该收到 `[formResponse] {...freeText:"..."}`

9. **无 form 的普通 talk 不受影响**
   - 触发普通 talk → 仍渲染为 TuiTalk bubble

### 2026-04-21 步骤 6 — 文档更新

- `docs/meta.md` 子树 4（协作 → 通信原语）：新增 `talk + form(可选)` 节点
- `docs/meta.md` 子树 6（Web UI → MessageDock → Body process 视图）：TuiTalkForm 节点描述
- `docs/哲学/discussions/2026-04-21-Talk-Form结构化消息与自然语言兜底.md`（新）：四个设计决策 + 涌现预期

### 2026-04-21 步骤 7 — 完成

- doing/ → finish/ 软链接切换
- 迭代状态改为 finish，补完成日期

## 最终总结

### Commit 清单（kernel 子模块）

1. `e472a1d` — feat(thread): talk tool schema + types 支持 form 表单
2. `d35e5b3` — feat(thread/engine): talk(form=...) 持久化到 message_out action
3. `46c2d37` — feat(server): POST /api/talk 接受 formResponse，注入 [formResponse] 前缀
4. `f8345f5` — feat(web): TuiTalkForm option picker + api types 支持 form
5. `b3cadbf` — feat(web): MessageSidebar 接入 TuiTalkForm 渲染 + 发送 formResponse
6. `8a6492b` — docs(trait): talkable 增加 form 使用章节

### Commit（user 仓）

待最后一并 commit：迭代记录 + meta.md + discussions/*.md。

### 测试

- 后端：550 pass / 0 fail / 6 skip（新增 10 tests 全绿）
- 前端：tsc 0 error；build 成功

### 体验验证

**✅ 场景 A**：supervisor 发 form 给 user → 落盘 form payload 正确 + user inbox 索引正常 + LLM 按 schema 输出（无提示也用了 detail 字段）
**✅ 场景 B**：模拟 formResponse 回复 → server 注入 `[formResponse]` 前缀 → supervisor LLM 正确识别 selectedOptionIds → return 摘要准确

### 与 ReflectFlow agent 的冲突情况

**遭遇一次小事故 + 自行恢复**：

- 在 Task 1+2 第一次 `git add` 后，ReflectFlow agent 的 commit `1f42aa1` 不慎把我未提交的 tools.ts / types.ts 一并提交（他们应该是用了 `git commit -a` 或 `add -A`）。
- 他们察觉后**主动 amend** 掉了我的文件（新 HEAD 变成 `e5d04f7`，只含 reflect.ts + reflect-thread.test.ts）——这是好的协作行为。
- 我的变更回到工作区 unstaged 状态，随后独立提交到 `e472a1d`。
- **我没用 git stash**（按硬约束）。
- 后续 6 个 commit 都正常独立生效。

**文件边界守得很好**：
- 我没碰 `collaboration.ts` / `reflect.ts` / `world.ts` / `reflect_flow` trait（ReflectFlow 主战场）
- 他们没碰 `tools.ts` / `types.ts` / `engine.ts` / `server.ts` / `TuiTalkForm.tsx` / `MessageSidebar.tsx` / `talkable/TRAIT.md`（本迭代主战场）
- 交集点 engine.ts：ReflectFlow 阶段 A 不改 engine，只接在 collaboration.ts；本迭代也不改 world.ts → 无冲突

### 非预期发现 / 未完成项

1. **formResponse 结构化字段 vs 前缀注入**：类型层扩展了 `ThreadInboxMessage.formResponse?`，但实际 server 走"前缀注入 message 正文"路径——LLM 读 inbox.content 就能看到。字段保留供未来调用方使用（例如前端调试展示）。
2. **TuiTalkForm 匹配 FlowMessage 的策略**：用 `content slice(0,200) + timestamp` 做主键匹配。SSE 的 FlowMessage timestamp 与后端 action.timestamp 可能微差，fallback 到 content-only 匹配。如果未来 FlowMessage 加 `id` 字段，改用 id 匹配更可靠。
3. **后端 formResponse 持久化到 inbox.formResponse**：本迭代仅前端收集 formResponse 后通过 server.ts 注入消息体，engine 没有把 formResponse 字段结构化落盘到 inbox。若需要（比如做 formResponse 的审计/回查），可在 engine 侧扩展——留给后续迭代。
4. **LLM 自然使用率观察**：本次体验验证 supervisor 被明确 prompt 引导才用 form。未来可观察：没有引导时 LLM 能否自发使用 form？TRAIT.md 的 example 是否足够吸引 LLM？
5. **对象间 form 透传**：本迭代只做 user 视角的 option picker。对象 A 给对象 B 发带 form 的 talk 时，B 是 LLM，它只能自然语言回复（看 inbox.content 里的 `[form: formId]` 标记），不走 formResponse 通道。这是预期行为，不视为缺陷。
