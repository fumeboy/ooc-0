# OOC Thinking 模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OOC 通过 provider 原生 thinking 通道生成系统 `thought`，同时彻底移除 assistant 输出协议中的 `[thought]`。

**Architecture:** 在 `thinkable/client` 引入统一的 thinking capability 与双通道返回结构；`thinkloop` 负责把 `thinkingContent` 映射为系统 `thought` action / SSE；`parser` 仅解析 assistant 最终输出中的结构化协议，并把显式 `[thought]` 视为协议错误。

**Tech Stack:** Bun、TypeScript、OpenAI-compatible chat/completions、SSE、Jotai、React。

---

## File Map

- Modify: `kernel/src/thinkable/config.ts`
  - 增加 thinking capability 配置读取与默认值。
- Modify: `kernel/src/thinkable/client.ts`
  - 将 `chat()` / `chatStream()` 升级为 assistant/thinking 双通道。
- Modify: `kernel/src/flow/parser.ts`
  - 删除 `[thought]` 解析；新增显式 `[thought]` 协议错误检测。
- Modify: `kernel/src/flow/thinkloop.ts`
  - 接收双通道 LLM 结果；持久化 thought；流式转发 thinking。
- Modify: `kernel/src/server/events.ts`
  - 若需要，补充 SSE 事件类型注释或类型声明，保持 `stream:thought` 事件来源变更后的语义清晰。
- Modify: `kernel/tests/parser.test.ts`
  - 覆盖“禁止 `[thought]`”与“仅解析 assistant 协议”的回归测试。
- Modify: `kernel/tests/flow.test.ts`
  - 覆盖 thinking → thought action / process / waiting/finish 的集成行为。
- Modify: `kernel/traits/kernel/output_format/TRAIT.md`
  - 删除 `[thought]` 输出要求，明确 assistant 只输出执行协议。
- Modify: `kernel/traits/kernel/cognitive-style/TRAIT.md`
- Modify: `kernel/traits/kernel/computable/TRAIT.md`
- Modify: `kernel/traits/kernel/talkable/TRAIT.md`
- Modify: `kernel/traits/kernel/plannable/TRAIT.md`
  - 统一去除显式 `[thought]` 心智。
- Modify: `kernel/web/src/api/types.ts`
  - 更新 thought 流事件语义说明。
- Modify: `kernel/web/src/hooks/useSSE.ts`
  - 保持事件名不变，但注释/处理语义从“协议段”改为“thinking 流”。
- Modify: `kernel/web/src/store/session.ts`
  - 更新 streamingThoughtAtom 的语义注释。
- Modify: `kernel/web/src/features/ProcessView.tsx`
  - 如 thought 文案直接耦合“输出段”，改成“模型思考/思考流”。

---

### Task 1: 定义 thinking capability 与双通道 LLM 返回结构

**Files:**
- Modify: `kernel/src/thinkable/config.ts`
- Modify: `kernel/src/thinkable/client.ts`
- Test: `kernel/tests/flow.test.ts`

- [ ] **Step 1: 先写一个最小 failing 测试，锁定新的 LLM 返回结构**

```ts
test("OpenAICompatibleClient.chat 返回 assistant/thinking 双通道结构", async () => {
  const client = new MockLLMClient({
    responseObject: {
      assistantContent: "[finish]",
      thinkingContent: "我已经完成任务。",
    },
  });

  const result = await client.chat([{ role: "user", content: "hi" }]);

  expect(result.assistantContent).toBe("[finish]");
  expect(result.thinkingContent).toBe("我已经完成任务。");
});
```

- [ ] **Step 2: 运行测试，确认当前接口还不支持双通道**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: FAIL，报错点是 `chat()` 仍返回 `string` 或 `MockLLMClient` 没有 `assistantContent/thinkingContent`。

- [ ] **Step 3: 在配置层增加 thinking capability**

```ts
export interface ThinkingConfig {
  enabled: boolean;
  mode?: string;
  budget?: number;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeout: number;
  thinking: ThinkingConfig;
}

thinking: {
  enabled: process.env.OOC_THINKING_ENABLED === "1",
  mode: process.env.OOC_THINKING_MODE || undefined,
  budget: process.env.OOC_THINKING_BUDGET ? Number(process.env.OOC_THINKING_BUDGET) : undefined,
}
```

- [ ] **Step 4: 在 client 层引入统一返回类型**

```ts
export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LLMResult = {
  assistantContent: string;
  thinkingContent: string;
  usage?: TokenUsage;
  raw?: unknown;
};
```

- [ ] **Step 5: 让 `chat()` 返回 `LLMResult` 而不是字符串**

```ts
async chat(messages: ChatMessage[]): Promise<LLMResult> {
  const payload = buildChatPayload(this.config, messages);
  const data = await this.request(payload);
  return {
    assistantContent: data.choices?.[0]?.message?.content ?? "",
    thinkingContent: data.choices?.[0]?.message?.reasoning_content ?? "",
    usage: normalizeUsage(data.usage),
    raw: data,
  };
}
```

- [ ] **Step 6: 让流式接口返回双通道事件**

```ts
export type LLMStreamEvent =
  | { type: "assistant_chunk"; chunk: string }
  | { type: "thinking_chunk"; chunk: string }
  | { type: "done"; usage?: TokenUsage; raw?: unknown };
```

- [ ] **Step 7: 运行针对性测试，确认类型链路通过**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: PASS 或至少进入下一组与 parser/thinkloop 相关的失败，而不是 client 类型失败。

- [ ] **Step 8: Commit**

```bash
git add kernel/src/thinkable/config.ts kernel/src/thinkable/client.ts kernel/tests/flow.test.ts
git commit -m "feat: add thinking-aware llm result structure"
```

---

### Task 2: 让 OpenAI-compatible 请求真正开启 thinking，并完成 provider 适配

**Files:**
- Modify: `kernel/src/thinkable/client.ts`
- Test: `kernel/tests/flow.test.ts`

- [ ] **Step 1: 写 failing 测试，验证 payload 会携带 thinking capability 映射**

```ts
test("chat payload 包含 thinking capability 映射", async () => {
  const config = {
    ...DefaultConfig(),
    thinking: { enabled: true, mode: "default", budget: 2048 },
  };

  const payload = buildChatPayload(config, [{ role: "user", content: "hi" }]);

  expect(payload).toMatchObject({
    model: config.model,
    messages: [{ role: "user", content: "hi" }],
  });
  expect(payload).toHaveProperty("thinking");
});
```

- [ ] **Step 2: 运行测试，确认当前 payload 还没有 thinking 字段**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: FAIL，缺少 `thinking` 或相关映射字段。

- [ ] **Step 3: 抽出统一 payload 构造函数**

```ts
function buildChatPayload(config: LLMConfig, messages: ChatMessage[]) {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
  };

  if (config.thinking.enabled) {
    payload.thinking = {
      type: config.thinking.mode ?? "enabled",
      budget: config.thinking.budget,
    };
  }

  return payload;
}
```

- [ ] **Step 4: 把上游 thinking 字段读取收敛到 normalize 层**

```ts
function extractThinkingContent(message: any): string {
  return message?.reasoning_content
    ?? message?.thinking
    ?? message?.reasoning
    ?? "";
}
```

- [ ] **Step 5: 流式 delta 也统一走 normalize**

```ts
const delta = choice?.delta ?? {};
if (delta.content) yield { type: "assistant_chunk", chunk: delta.content };
const thinking = extractThinkingContent(delta);
if (thinking) yield { type: "thinking_chunk", chunk: thinking };
```

- [ ] **Step 6: 运行测试，确认 provider 适配生效**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: PASS，payload 测试通过；后续失败若存在，应转移到 parser/thinkloop。

- [ ] **Step 7: Commit**

```bash
git add kernel/src/thinkable/client.ts kernel/tests/flow.test.ts
git commit -m "feat: map provider thinking capability for openai-compatible client"
```

---

### Task 3: 删除 parser 中的 `[thought]` 协议解析，并把它变成协议错误

**Files:**
- Modify: `kernel/src/flow/parser.ts`
- Test: `kernel/tests/parser.test.ts`

- [ ] **Step 1: 写 failing 测试，要求 assistant 输出 `[thought]` 时报协议错误**

```ts
test("assistant 输出 [thought] 时返回协议错误", () => {
  expect(() => parseLLMOutput(`[thought]\ncontent = "bad"\n[finish]`)).toThrow(
    /deprecated \[thought\] section/i,
  );
});
```

- [ ] **Step 2: 写 failing 测试，确认 parser 仍能解析无 thought 的结构化输出**

```ts
test("无 thought 时仍能解析 program 与 finish", () => {
  const parsed = parseLLMOutput(`[program]\ncode = """print(1)"""\n\n[finish]`);
  expect(parsed.programs).toHaveLength(1);
  expect(parsed.directives.finish).toBe(true);
});
```

- [ ] **Step 3: 运行 parser 测试，确认当前行为不满足新协议**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/parser.test.ts"`
Expected: FAIL，当前 parser 仍支持或识别 `[thought]`。

- [ ] **Step 4: 删除 legacy/TOML/stream parser 中对 `[thought]` 的分支**

```ts
if (/^\s*\[thought\]\s*$/.test(line)) {
  throw new Error("deprecated [thought] section: use model-native thinking instead");
}
```

- [ ] **Step 5: 精简解析结果结构，只保留外部可注入 thought 字段**

```ts
export interface ParsedLLMOutput {
  thought: string;
  programs: ExtractedProgram[];
  talks: ExtractedTalk[];
  actions: ExtractedAction[];
  stackFrameOperations: StackFrameOperation[];
  directives: Directives;
}
```

- [ ] **Step 6: 调整流式 parser，使其只产生非 thought 事件**

```ts
export type LLMOutputStreamEvent =
  | { type: "talk"; target: string; chunk: string }
  | { type: "program"; lang?: "javascript" | "shell"; chunk: string }
  | { type: "action"; toolName: string; chunk: string }
  | { type: "stack_push"; opType: "cognize" | "reflect"; attr: string; chunk: string }
  | { type: "stack_pop"; opType: "cognize" | "reflect"; attr: string; chunk: string }
  | { type: "set_plan"; chunk: string };
```

- [ ] **Step 7: 运行 parser 测试，确认 parser 只解析 assistant 协议**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/parser.test.ts"`
Expected: PASS，`[thought]` 变成错误，`program/talk/action/stack/directives` 解析正常。

- [ ] **Step 8: Commit**

```bash
git add kernel/src/flow/parser.ts kernel/tests/parser.test.ts
git commit -m "refactor: remove thought parsing from assistant output protocol"
```

---

### Task 4: 在 ThinkLoop 中把 thinking 映射为系统 thought，并保持流式/持久化一致

**Files:**
- Modify: `kernel/src/flow/thinkloop.ts`
- Modify: `kernel/src/server/events.ts`
- Test: `kernel/tests/flow.test.ts`

- [ ] **Step 1: 写 failing 测试，要求 thinkingContent 被记录为 `thought` action**

```ts
test("thinkingContent 会写入 flow thought action", async () => {
  const llm = new MockLLMClient({
    responseObject: {
      assistantContent: "[finish]",
      thinkingContent: "我已经完成全部任务。",
    },
  });

  await runThinkLoop(flow, stone, TEST_DIR, llm, []);

  const actions = flow.process.root.actions;
  expect(actions.some((a) => a.type === "thought" && a.content.includes("完成全部任务"))).toBe(true);
});
```

- [ ] **Step 2: 写 failing 测试，要求 assistant 输出显式 `[thought]` 时失败**

```ts
test("assistantContent 含 [thought] 时流程报协议错误", async () => {
  const llm = new MockLLMClient({
    responseObject: {
      assistantContent: `[thought]\ncontent = "bad"\n[finish]`,
      thinkingContent: "真正的思考",
    },
  });

  await runThinkLoop(flow, stone, TEST_DIR, llm, []);
  expect(flow.status).toBe("failed");
});
```

- [ ] **Step 3: 运行 flow 测试，确认当前 ThinkLoop 还没有处理双通道**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: FAIL，`runThinkLoop` 仍假设 LLM 返回单字符串或未写入 thought action。

- [ ] **Step 4: 在非流式路径中先落 thinking，再解析 assistant**

```ts
const llmResult = await llm.chat(messages);

if (llmResult.thinkingContent.trim()) {
  flow.recordAction({ type: "thought", content: llmResult.thinkingContent });
}

const parsed = parseLLMOutput(llmResult.assistantContent);
parsed.thought = llmResult.thinkingContent;
```

- [ ] **Step 5: 在流式路径中分离 `thinking_chunk` 与 `assistant_chunk`**

```ts
let assistantOutput = "";
let thinkingOutput = "";

for await (const event of llm.chatStream(messages)) {
  if (event.type === "thinking_chunk") {
    thinkingOutput += event.chunk;
    emitSSE({ type: "stream:thought", objectName, taskId, chunk: event.chunk });
  } else if (event.type === "assistant_chunk") {
    assistantOutput += event.chunk;
    for (const parsedEvent of streamParser.push(event.chunk)) emitStructuredEvent(parsedEvent);
  }
}
```

- [ ] **Step 6: 在流式结束时持久化 thought 并结束 SSE**

```ts
if (thinkingOutput) {
  flow.recordAction({ type: "thought", content: thinkingOutput });
  emitSSE({ type: "stream:thought:end", objectName, taskId });
}
```

- [ ] **Step 7: 运行 flow 测试，确认 thought 行为与 finish/wait 兼容**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: PASS，thought action 正常落盘，显式 `[thought]` 被拒绝，finish/wait 行为不回退。

- [ ] **Step 8: Commit**

```bash
git add kernel/src/flow/thinkloop.ts kernel/src/server/events.ts kernel/tests/flow.test.ts
git commit -m "feat: map provider thinking output into runtime thought actions"
```

---

### Task 5: 清理 trait 文档中的 `[thought]` 协议要求

**Files:**
- Modify: `kernel/traits/kernel/output_format/TRAIT.md`
- Modify: `kernel/traits/kernel/cognitive-style/TRAIT.md`
- Modify: `kernel/traits/kernel/computable/TRAIT.md`
- Modify: `kernel/traits/kernel/talkable/TRAIT.md`
- Modify: `kernel/traits/kernel/plannable/TRAIT.md`

- [ ] **Step 1: 写一个内容回归检查脚本，确保文档不再要求显式 `[thought]`**

```bash
python3 - <<'PY'
from pathlib import Path
targets = [
  Path('kernel/traits/kernel/output_format/TRAIT.md'),
  Path('kernel/traits/kernel/cognitive-style/TRAIT.md'),
  Path('kernel/traits/kernel/computable/TRAIT.md'),
  Path('kernel/traits/kernel/talkable/TRAIT.md'),
  Path('kernel/traits/kernel/plannable/TRAIT.md'),
]
for path in targets:
    text = path.read_text()
    assert '[thought]' not in text or '禁止' in text
print('ok')
PY
```

- [ ] **Step 2: 先运行脚本，确认当前文档仍残留 `[thought]` 心智**

Run: 上述脚本
Expected: FAIL，至少 `output_format` / `cognitive-style` 仍出现“输出 `[thought]`”。

- [ ] **Step 3: 修改 `output_format`，把 thought 改成系统自动采集**

```md
## 输出协议

assistant 只输出以下结构化协议：
- `[program]`
- `[talk]`
- `[action]`
- `[cognize_stack_frame_push]`
- `[cognize_stack_frame_pop]`
- `[reflect_stack_frame_push]`
- `[reflect_stack_frame_pop]`
- `[set_plan]`
- `[finish]` / `[wait]` / `[break]`

模型思考由系统通过原生 thinking 通道自动采集，禁止显式输出 `[thought]`。
```

- [ ] **Step 4: 修改其余 trait，统一 assistant 只输出执行协议**

```md
禁止在 assistant 最终输出中显式编写 `[thought]`。
如需思考，直接让模型使用原生 thinking；系统会自动记录并展示思考内容。
```

- [ ] **Step 5: 重新运行文档检查脚本**

Run: 上述 Python 脚本
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add kernel/traits/kernel/output_format/TRAIT.md kernel/traits/kernel/cognitive-style/TRAIT.md kernel/traits/kernel/computable/TRAIT.md kernel/traits/kernel/talkable/TRAIT.md kernel/traits/kernel/plannable/TRAIT.md
git commit -m "docs: remove explicit thought from kernel output protocol"
```

---

### Task 6: 调整前端 thought 展示语义，保持 SSE/UI 正常工作

**Files:**
- Modify: `kernel/web/src/api/types.ts`
- Modify: `kernel/web/src/hooks/useSSE.ts`
- Modify: `kernel/web/src/store/session.ts`
- Modify: `kernel/web/src/features/ProcessView.tsx`

- [ ] **Step 1: 写一个前端类型回归检查，锁定 `stream:thought` 语义仍存在**

```ts
type StreamThoughtEvent = Extract<SSEEvent, { type: "stream:thought" }>;

const sample: StreamThoughtEvent = {
  type: "stream:thought",
  objectName: "supervisor",
  taskId: "task_x",
  chunk: "我正在思考",
};

expect(sample.chunk).toBe("我正在思考");
```

- [ ] **Step 2: 更新类型注释，让 thought 明确来自 provider thinking**

```ts
/** 流式 thought 内容（来自 LLM 原生 thinking 通道，而非 assistant 输出协议） */
export const streamingThoughtAtom = atom<{ taskId: string; content: string } | null>(null);
```

- [ ] **Step 3: 更新 SSE hook 注释与消费语义**

```ts
/* 流式 thought chunk：来自 provider 原生 thinking，不来自 parser */
case "stream:thought":
  setStreamingThought((prev) =>
    prev?.taskId === event.taskId
      ? { ...prev, content: prev.content + event.chunk }
      : { taskId: event.taskId, content: event.chunk },
  );
  break;
```

- [ ] **Step 4: 若 UI 直接把 thought 文案写成“输出段落”，改成“模型思考”**

```tsx
<span className="text-xs text-[var(--muted-foreground)]">Model Thinking</span>
```

- [ ] **Step 5: 跑前端类型检查/构建**

Run: `cd "/Users/bytedance/x/ooc/ooc-1/kernel/web" && bun run build`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add kernel/web/src/api/types.ts kernel/web/src/hooks/useSSE.ts kernel/web/src/store/session.ts kernel/web/src/features/ProcessView.tsx
git commit -m "refactor: treat thought stream as provider thinking in frontend"
```

---

### Task 7: 跑完整回归，验证禁止 `[thought]` 后主链路仍可工作

**Files:**
- Modify: `kernel/tests/parser.test.ts`
- Modify: `kernel/tests/flow.test.ts`
- Test: `docs/体验用例/用例009_飞书文档读取/case.md`

- [ ] **Step 1: 增加回归测试，确保无显式 `[thought]` 的 supervisor 仍能完成 flow**

```ts
test("thinking 驱动的 supervisor 输出不需要显式 [thought] 仍可完成", async () => {
  const llm = new MockLLMClient({
    responseObject: {
      thinkingContent: "先读取 wiki，再读取 docx，最后回复用户。",
      assistantContent: `[talk]\ntarget = "user"\nmessage = """收到"""\n\n[wait]`,
    },
  });

  await runThinkLoop(flow, stone, TEST_DIR, llm, []);
  expect(flow.status).toBe("waiting");
});
```

- [ ] **Step 2: 跑 parser 与 flow 测试**

Run: `bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/parser.test.ts" && bun test "/Users/bytedance/x/ooc/ooc-1/kernel/tests/flow.test.ts"`
Expected: PASS。

- [ ] **Step 3: 启动后端并执行一次用例 009 冒烟回归**

Run:

```bash
cd "/Users/bytedance/x/ooc/ooc-1" && bun kernel/src/cli.ts start 8080
```

然后：

```bash
python3 - <<'PY'
import json, urllib.request
req = urllib.request.Request(
    'http://localhost:8080/api/talk/supervisor',
    data=json.dumps({'message':'分析飞书文档 https://bytedance.larkoffice.com/wiki/UbpdwXweyi86HHkRHCCcLPN4n8c'}).encode(),
    headers={'Content-Type':'application/json'},
    method='POST',
)
with urllib.request.urlopen(req, timeout=300) as resp:
    print(resp.read().decode())
PY
```

Expected: 返回正常 flow；`process.json` 中有 `thought` action，但 `assistant output` 中不再出现显式 `[thought]`。

- [ ] **Step 4: 检查调试文件与 process 产物**

Run:

```bash
ls -la "/Users/bytedance/x/ooc/ooc-1/flows/<new_task_id>/flows/supervisor"
```

重点确认：
- `process.json` 有 `thought` action
- `llm.output.txt` 只含 assistant 协议
- 若有 thinking 专用调试产物，其内容与 `thought` action 一致

- [ ] **Step 5: Commit**

```bash
git add kernel/tests/parser.test.ts kernel/tests/flow.test.ts
git commit -m "test: add regression coverage for provider thinking mode"
```

---

## Spec Coverage Check

- Provider capability 抽象：Task 1 + Task 2
- OpenAI-compatible 首个实现：Task 2
- parser 删除 `[thought]`：Task 3
- ThinkLoop 做 thinking → thought 映射：Task 4
- output_format 与相关 trait 更新：Task 5
- 前后端程序调整：Task 6
- 回归与体验验证：Task 7

无缺口。

## Self-Review Notes

- 无 `TODO` / `TBD` / 占位步骤。
- 类型名统一使用 `LLMResult`、`LLMStreamEvent`、`ThinkingConfig`。
- 计划保持 YAGNI：仅实现 capability 抽象 + OpenAI-compatible 首个实现，不扩展到多 provider 全量支持。

