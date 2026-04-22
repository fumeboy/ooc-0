# LLM Input 结构化呈现（XML 缩进 + 前端结构化浏览器）

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P0（调试与理解 Context 的关键基础设施）

## 背景 / 问题描述

OOC 的 `llm.input.txt` 本已是 XML 标签结构（`<system>` / `<instructions>` / `<knowledge name="X" lifespan="pinned">` / `<active-forms>` / `<form>` / ...），但输出是**完全扁平的文本拼接**：标签之间没有缩进，嵌套关系视觉上看不出来；156KB 的 input 文件对人来说几乎是一团浆糊。

调试需求一直很高（Bruce 体验测试 / 问题定位 / 理解 LLM 为什么做某决定），但目前：
- 打开 `llm.input.txt` 只能看到 FlatView
- 想定位"当前有哪些 trait 被注入"要在 XML 标签之间 grep
- 想看"memory 到底多大"、"inbox 里有几条未读"都要数行

## 目标

### 1. 后端：XML 容器按嵌套层级**缩进输出**

- 容器标签（`<system>`, `<instructions>`, `<knowledge>`, `<user>`, `<inbox>`, `<active-forms>` 等）按嵌套深度用 2 空格缩进
- **内容保持原样不动**（TRAIT.md 里的 Markdown 表格 / 代码块 / 长段文本不能被前导空格破坏）
- 策略：**只缩进 open/close 标签行，不缩进内容行**。像这样：

```xml
<system>
  <instructions>
    <instruction name="kernel:base">
# 指令系统基座
open/submit/close/wait 四原语...
（内容保持 0 缩进，不动）
    </instruction>
  </instructions>
  <knowledge>
    <window name="self:reporter" lifespan="pinned">
# Reporter...
    </window>
  </knowledge>
</system>
<user>
  <inbox unread="2">
    <message id="msg_xxx" from="user" source="talk">
hi
    </message>
  </inbox>
  <process iterations="5">
    ...
  </process>
</user>
```

### 2. 前端：`LLMInputViewer` 组件

- 注册到 ViewRegistry：路径匹配 `.*/llm\.input\.txt$` 时优先走此 viewer
- 左侧：XML 树形导航（每个顶层 section + 可展开到 <instruction>/<window>/<message> 等子节点）
- 右侧：选中节点的内容（Markdown 渲染或 syntax highlight）
- 每个节点显示：
  - 节点名（含属性：`window name="reporter" lifespan="pinned"`）
  - 字符数 / 粗略 token 数（`len(content)/4` 估算）
  - 可折叠
- 顶栏总览：总字符数、总估算 token、顶层段数
- 搜索框：跨 section 全文搜索

## 方案

### Phase 1 — 后端结构化输出（~半天）

**改动点**：`kernel/src/thread/engine.ts` 的 `contextToMessages` 函数（约 line 306-340）+ debug 写文件逻辑。

**核心抽象**：引入 XmlNode 数据结构 + 序列化函数

```ts
type XmlNode = {
  tag: string;
  attrs?: Record<string, string | number>;
  /** 子节点或原样内容字符串（二选一） */
  children?: XmlNode[];
  content?: string;
  /** 附加注释（渲染为 <!-- ... --> 在标签前） */
  comment?: string;
};

function serializeXml(nodes: XmlNode[], depth = 0): string {
  // 只缩进标签行，content 原样输出
  // <tag attr="val">\n{content}\n  </tag>
}
```

**section 重组**（不破坏现有语义，只是加父容器）：
- `<system>` 包裹 `<identity>` / `<instructions>` / `<knowledge>` / `<tools-hint>`
- `<user>` 包裹 `<parent-expectation>` / `<scope-chain>` / `<process>` / `<inbox>` / `<active-forms>` / `<children-summary>`

**兼容性**：
- LLM 对 XML 缩进不敏感（Claude 训练时 XML 既有缩进的也有扁平的）
- Token 成本：只加标签缩进，content 不动 —— 额外 token < 2%
- 单元测试：`contextToMessages` snapshot 比对（之前的"扁平 grep 测试"要同步更新）

### Phase 2 — 前端 LLMInputViewer（~1 天）

**新文件**：`kernel/web/src/features/LLMInputViewer.tsx`

**依赖**：浏览器原生 `DOMParser` 解析 XML（llm.input.txt 是 XML-like，严格合法的话可直接 parse）

**布局**：
```
┌──────────────────────────┐
│ llm.input.txt (156 KB / ~40K tokens) │
├───────────┬──────────────┤
│ Tree      │ Detail       │
│           │              │
│ ▼ system  │ <knowledge   │
│   ▼ instr │  name=...    │
│   ▼ knowl │  lifespan=   │
│     reporter          │  pinned>     │
│     memory │ ...          │
│   ▶ tools │              │
│ ▼ user    │              │
│   inbox   │              │
│   process │              │
│   active  │              │
└───────────┴──────────────┘
```

**ViewRegistry 注册**（参考 `registrations.tsx` pattern）：
```ts
viewRegistry.register({
  name: "LLMInputViewer",
  component: LLMInputAdapter,
  match: (p) => /\/llm\.input\.txt$/.test(p),
  priority: 90, // 高于默认 CodeViewer (0)
  tabKey: (p) => p,
  tabLabel: () => "Context",
});
```

**关键 UI 要素**：
- Tree：可折叠、点击滚动到对应 detail
- Detail：Markdown 内容用 `MarkdownContent` 组件渲染；代码块 CodeMirror；其他纯文本
- 节点 badge：字符数 + token 估算；lifespan="pinned" 显示 📌 图标
- 顶部搜索框：输入后高亮匹配节点，Enter 跳转
- 空态：非 XML 文件回退到普通 CodeMirror

### Phase 3（可选）— Debug view 增强

- 旁注每个 section 的"为什么会在这里"：
  - knowledge 的 trait 为什么被激活？hover 显示 scope chain 推导
  - inbox 消息状态（unread / marked）
- 对比视图：选择两个 llm.input.txt 做 diff（观察 Context 如何随线程进展变化）

## 影响范围

- **后端**：
  - `kernel/src/thread/engine.ts`（`contextToMessages` 函数重写）
  - 可能 `kernel/src/thread/debug.ts` 写文件逻辑
  - `kernel/tests/thread-engine.test.ts` / `context-builder.test.ts` snapshot 更新
- **前端**：
  - `kernel/web/src/features/LLMInputViewer.tsx`（新）
  - `kernel/web/src/router/registrations.tsx`（注册 viewer）
  - 可能 `kernel/web/src/lib/xml-parse.ts`（解析工具）
- **文档**：
  - `docs/meta.md` 子树 2（认知构建 Context）新增"XML 结构化输出"说明
  - `docs/meta.md` 子树 6（Web UI）新增 LLMInputViewer

## 非目标（本迭代不做）

- 不做"Markdown 内容改 XML"（section 内仍是 Markdown）
- 不改变注入 LLM 的语义（只是排版）
- 不做 XML schema 校验 / lint
- 不扩展 section（新增 scope-chain / state-machine 那些在单独迭代）

## 验证标准

- **Phase 1**：
  - `llm.input.txt` 打开后肉眼能识别嵌套结构（Bruce 测试 / 人工确认）
  - token 统计：对比同一场景 before/after，增量 < 3%
  - `bun test` 保持 0 fail（snapshot 测试同步更新）
- **Phase 2**：
  - 前端打开某 llm.input.txt → 看到树形导航 + 详情
  - 点击 tree 节点滚动/切换 detail 正常
  - 搜索 "reporter" 能高亮定位
  - 非 XML 文件仍走 CodeViewer（fallback）
- **Phase 3（可选）**：对比视图能用

## 依赖 / 协调

- 与 "Prompt 结构化升级"（之前我提的 scope-chain / inbox structured 迭代）**可配合**但不强依赖
- 不阻塞 Code Index / Build Feedback 等 P0 迭代（这些主要动 trait，不动 context 构建）

## 执行记录

### 2026-04-22 — Phase 1 后端 XML 缩进输出（完成）

- commit: `c5bdbf4`（kernel main，已推送 github）
- 改动：`kernel/src/thread/engine.ts` 的 `contextToMessages` 函数
  - 引入 `XmlNode` 中间结构（tag/attrs/children/content/comment/selfClosing）
  - 新增 `serializeXml(nodes, depth)` 只缩进标签行，内容原样输出
  - `<system>` 容器包裹 `<identity>` / `<instructions>`（`<instruction>×n`）/ `<knowledge>`（`<window>×n`）
  - `<user>` 容器包裹 `<task>` / `<creator>` / `<plan>` / `<process>` / `<locals>` / `<inbox>`（`<message>×n` 带 unread/marked 计数）/ `<todos>` / `<defers>` / `<children>` / `<ancestors>` / `<siblings>` / `<directory>`（`<object>×n`）/ `<paths>` / `<status>`
- 新增测试 `kernel/tests/thread-engine-xml-structure.test.ts`：2 tests 验证顶层容器、2/4 空格缩进、Markdown 表格和代码块 content 原样
- 测试基线：`bun test` 654 pass / 0 fail（比基线 624 pass 多 2 个新测试 + 既有 28 个其他迭代新增）

**限制**：`<active-forms>` 由外部 append 逻辑（engine.ts line 877/2064）在 `</user>` 之后追加，硬约束"只改 contextToMessages"下无法将其纳入 `<user>` 子节点。它现在作为 `<user>` 的兄弟节点存在——前端 DOMParser 把它当作另一个顶层块解析，UI 上不影响。

### 2026-04-22 — Phase 2 前端 LLMInputViewer（完成）

- commit: `93d9983`（kernel main，已推送 github）
- 新增：`kernel/web/src/features/LLMInputViewer.tsx`（约 420 行）
- 注册：`kernel/web/src/router/registrations.tsx` 新增 ViewRegistry 项
  - match: `/\/llm\.input\.txt$/` 和 `/\/loop_\d+\.input\.txt$/`
  - priority: 90（高于默认 FileViewer=0）
- 功能：
  - 左侧树形导航：可折叠、显示关键属性（name/id/command/status）、徽标（📌pinned/unread/marked/unread 计数）
  - 右侧详情面板：属性表 + 字符数 + token 估算（len/3）；Markdown/JSON/纯文本三路渲染
  - 顶栏：文件名、总字符数、总 token、块数、搜索框
  - 搜索自动展开匹配节点祖先路径
  - 非 XML 文件 fallback CodeMirror（带黄色提示条）
- 解析：浏览器原生 DOMParser，按 `--- role ---` 切块再逐块 parse（单块失败不影响其他）
- 构建：`vite build` 成功（tsc 仅有 1 个 sibling 遗留 SessionKanban 未使用变量错误）

**未做截图**：Playwright MCP browser 在本环境无法启动（proxy/binary 原因），需 Bruce 或用户手动体验验证。建议重启后端后新发起一轮对话，然后在前端打开任意 `flows/.../threads/.../llm.input.txt`。

### Phase 3（未做）

时间分配优先给 Phase 1/2 的安全提交与推送，Phase 3 对比视图留待后续迭代。

### Sibling 交互

- Phase 1 commit 极速完成（< 10 分钟内），其他 sibling agent 未触及 engine.ts 的 contextToMessages 部分，零 rebase。
- Phase 2 web 只动 LLMInputViewer（新文件）+ registrations.tsx（小改），未与 Running-Summary-Agent 的 SessionKanban.tsx/server.ts 冲突。

