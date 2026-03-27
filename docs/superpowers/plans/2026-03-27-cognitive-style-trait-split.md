# Cognitive-Style Trait Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `plannable` trait into `cognitive-style` (always-on mindset) + `plannable` (conditional API + before hook), and wire up the dead `before` hook mechanism in ThinkLoop.

**Architecture:** Pure trait-layer split + minimal ThinkLoop fix. `cognitive-style` teaches objects when to decompose tasks; `plannable` provides the API and evaluation prompt via before hook. `collectAndFireHooks` gets per-node `once` semantics and `"before"` event call site.

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `user/docs/superpowers/specs/2026-03-27-cognitive-style-trait-design.md`

---

## Chunk 1: Engine fixes — before hook wiring + per-node once semantics

### Task 1: Fix `collectAndFireHooks` once semantics to per-node

**Files:**
- Modify: `kernel/src/flow/thinkloop.ts:665`
- Test: `kernel/tests/cognitive-stack.test.ts`

- [ ] **Step 1: Write failing test for per-node once semantics**

Add to `kernel/tests/cognitive-stack.test.ts` in the `collectFrameHooks` describe block:

```typescript
test("once hook 在不同 focusNodeId 下各触发一次", () => {
  const traits = [
    makeTrait("plannable", { before: { inject: "评估任务", once: true } }),
  ];
  const fired = new Set<string>();

  // 第一个节点触发
  const r1 = collectFrameHooks("before", traits, [], fired, "node-1");
  expect(r1).toContain("评估任务");

  // 同一节点不再触发
  const r2 = collectFrameHooks("before", traits, [], fired, "node-1");
  expect(r2).toBeNull();

  // 不同节点再次触发
  const r3 = collectFrameHooks("before", traits, [], fired, "node-2");
  expect(r3).toContain("评估任务");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/cognitive-stack.test.ts`
Expected: FAIL — `collectFrameHooks` doesn't accept 5th parameter

- [ ] **Step 3: Update `collectFrameHooks` to accept `focusNodeId` and use per-node key**

In `kernel/src/process/cognitive-stack.ts`, change `collectFrameHooks`:

```typescript
export function collectFrameHooks(
  event: "before" | "after",
  traits: TraitDefinition[],
  scopeChain: string[],
  firedHooks: Set<string>,
  focusNodeId?: string,
): string | null {
  const scopeSet = new Set(scopeChain);
  const injections: string[] = [];

  for (const trait of traits) {
    if (trait.when !== "always" && !scopeSet.has(trait.name)) continue;
    if (!trait.hooks) continue;

    const hook = trait.hooks[event];
    if (!hook) continue;

    /* per-node key: 同一 hook 在不同节点上各触发一次 */
    const hookId = focusNodeId
      ? `${trait.name}:${event}:${focusNodeId}`
      : `${trait.name}:${event}`;

    if (hook.once !== false && firedHooks.has(hookId)) continue;

    injections.push(hook.inject);
    firedHooks.add(hookId);
  }

  if (injections.length === 0) return null;
  return `>>> [系统提示 — ${event}]\n${injections.join("\n\n")}`;
}
```

- [ ] **Step 4: Update `collectAndFireHooks` in thinkloop.ts to use per-node key**

In `kernel/src/flow/thinkloop.ts`, change `collectAndFireHooks` (around line 665):

```typescript
const focusNodeId = flow.process.focusId;
const hookId = `${trait.name}:${event}:${focusNodeId}`;
```

Also update the JSDoc comment (line 641) to reflect the new per-node semantics:

```typescript
/**
 * 收集并触发指定事件的 Trait Hooks
 *
 * 从当前激活的 traits 中收集指定事件的 hooks，
 * 跳过已触发的 once hooks（per-node 粒度），合并注入文本。
 *
 * @returns 合并后的注入文本，如果没有 hook 需要触发则返回 null
 */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/cognitive-stack.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add kernel/src/process/cognitive-stack.ts kernel/src/flow/thinkloop.ts kernel/tests/cognitive-stack.test.ts && git commit -m "feat: collectFrameHooks once 语义改为 per-node 粒度"
```

---

### Task 2: Wire `before` hook into ThinkLoop

**Files:**
- Modify: `kernel/src/flow/thinkloop.ts:208` (after buildContext, before `messages` array construction)

- [ ] **Step 1: Add `before` hook injection in ThinkLoop**

In `kernel/src/flow/thinkloop.ts`, insert between line 208 (`chatMessages = formatContextAsMessages(ctx);`) and line 211 (`const messages: Message[] = [`). This is critical — the injection must happen BEFORE the `messages` array is constructed from `chatMessages`, otherwise the injected content won't reach the LLM.

```typescript
      /* 1.5 注入 before hooks（G13 认知栈：进入新节点时的提示） */
      const beforeInjection = collectAndFireHooks(traits, flow, "before", firedHooks);
      if (beforeInjection) {
        chatMessages.push({ role: "user", content: beforeInjection });
      }
```

- [ ] **Step 2: Run all tests to verify nothing breaks**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: ALL PASS (before hook injection is additive, no existing traits have `before` hooks)

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add kernel/src/flow/thinkloop.ts && git commit -m "feat: ThinkLoop 接入 before hook — context 构建后、LLM 调用前注入"
```

---

## Chunk 2: Trait layer — cognitive-style + plannable refactor

### Task 3: Create `cognitive-style` trait

**Files:**
- Create: `kernel/traits/cognitive-style/readme.md`

- [ ] **Step 1: Create the trait directory**

```bash
mkdir -p /Users/zhangzhefu/x/ooc/kernel/traits/cognitive-style
```

- [ ] **Step 2: Write `cognitive-style/readme.md`**

Create `kernel/traits/cognitive-style/readme.md` with the following content:

```markdown
---
when: always
description: "认知栈思维模式 — 用行为树结构化你的思考过程"
deps: []
---

# 认知栈思维模式

你的行为树不只是任务清单，它是你的思维结构。每个节点是一个独立的认知帧，有自己的上下文、traits、局部变量。当一个子帧完成后，它的详细 actions 被遗忘，只留下 summary — 这让你的 context 保持精简。善用这个结构。

## 什么时候应该创建子节点

| # | 场景 | 信号 | 做法 |
|---|------|------|------|
| 1 | **多步骤任务** | 收到的任务包含 2 个以上逻辑独立的步骤 | 拆解为子节点，每步独立执行 |
| 2 | **异常/错误隔离** | 执行中遇到意外错误或异常 | push 子帧处理错误，完成后 pop 回来，主流程只看到 summary |
| 3 | **上下文切换** | 需要从当前思维模式切换到另一种（如"写作"→"调研"） | 新子帧携带不同 traits，切换认知上下文 |
| 4 | **中途发现子问题** | 做着做着发现一个需要单独处理的子问题 | push 子帧处理，避免主流程 actions 被污染 |
| 5 | **协作等待** | 需要向其他对象请求信息，等待回复 | 当前帧 yield，回复到达后恢复 |
| 6 | **信息收集与分析分离** | 先收集再分析，两个阶段的认知需求不同 | 分成两个子帧，收集帧完成后 summary 传递给分析帧 |
| 7 | **验证/测试** | 完成主要工作后需要验证结果 | 独立子帧验证，保持主流程干净 |

## 如何创建子节点

当你判断需要拆解时，使用以下 API：

- `createPlan(title, description)` — 创建完整的多步骤计划
- `create_plan_node(parentId, title, description, traits?)` — 在计划中添加步骤
- `add_stack_frame(title, description?)` — 快速压入一个子帧（适合临时子任务，如错误处理）
- `finish_plan_node(summary)` / `stack_return(summary)` — 完成当前子帧，focus 自动回到父节点

简单场景用 `add_stack_frame`，复杂场景用 `createPlan` + `create_plan_node`。详细参数说明见 plannable trait。

## 反模式

不要在一个节点的 actions 里堆积大量不同性质的操作。

**坏的例子**：一个节点的 actions 包含"搜索了 3 个网站 → 对比了数据 → 写了报告 → 发现引用错误 → 修复了引用 → 重新验证"。这 6 个操作涉及 3 种不同的认知模式，应该拆成至少 3 个子帧。

**好的例子**：
```
[*] 写调研报告
  [✓] 收集信息 (从 3 个来源收集了关键数据)
  [✓] 分析数据 (AI 安全分为 3 个主要方向：对齐、可解释性、治理)
  [*] 撰写报告 ← focus
```

## 拆解的收益

- **Context 精简**：每个子帧完成后 summary 保留，详细 actions 被遗忘
- **Trait 按需激活**：不同子帧可以激活不同 traits（如"调研"帧激活 web_search）
- **错误隔离**：出错时只影响当前子帧，不污染主流程
- **可恢复性**：子帧失败可以重试，不需要从头开始
```

- [ ] **Step 3: Verify trait loads correctly**

Run: `cd /Users/zhangzhefu/x/ooc && bun -e "import { loadTrait } from './kernel/src/trait/loader.js'; const t = await loadTrait('./kernel/traits/cognitive-style', 'cognitive-style'); console.log(t.name, t.when, t.description, 'readme length:', t.readme.length)"`
Expected: `cognitive-style always 认知栈思维模式 — 用行为树结构化你的思考过程 readme length: <number>`

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add kernel/traits/cognitive-style/readme.md && git commit -m "feat: 新建 cognitive-style trait — always-on 认知栈思维模式"
```

---

### Task 4: Refactor `plannable` trait — add before hook + slim down readme

**Files:**
- Modify: `kernel/traits/plannable/readme.md`

- [ ] **Step 1: Rewrite `plannable/readme.md` with before hook and slimmed content**

Replace the entire content of `kernel/traits/plannable/readme.md` with:

```markdown
---
when: 当任务包含多个步骤、需要拆解、或不确定从哪里开始时
description: "任务拆解和行为树规划，先想清楚再动手"
deps: []
hooks:
  before:
    inject: |
      你刚进入一个新的任务节点。在开始执行之前，先评估：
      - 这个任务是否包含多个逻辑独立的步骤？
      - 是否需要在不同步骤中使用不同的思维方式或 traits？
      - 直接在当前节点完成，actions 会不会变得冗长混乱？
      如果以上任一为"是"，请先用 createPlan 拆解为子节点，再逐步执行。
      如果任务简单直接，可以直接在当前节点完成。
    once: true
---

# 规划能力

## 规划 API

### createPlan(title, description)

创建完整的多步骤计划，替换当前行为树：

```javascript
const root = createPlan("任务名称", "任务的具体目标描述");
```

### create_plan_node(parentId, title, description, traits?)

在计划中添加步骤，所有步骤挂在 root 下平级排列：

```javascript
create_plan_node(root, "收集信息", "从 3 个来源收集数据", ["web_search"]);
create_plan_node(root, "分析数据", "对比各来源观点");
create_plan_node(root, "撰写报告", "整理结论并回复用户");
```

每个步骤应该：
- 有明确的完成标准
- 可以独立验证
- 足够小（一两轮思考能完成）
- 声明需要的 traits（让系统自动加载相关知识）

### finish_plan_node(summary)

完成当前步骤，focus 自动推进到下一个待办节点：

```javascript
finish_plan_node("从 3 个来源收集了关键数据");
```

## 栈帧语义 API

| API | 作用 | 等价操作 |
|-----|------|---------|
| `add_stack_frame(title, description?)` | 压栈 — 快速创建子帧 | createPlan 的轻量版 |
| `stack_return(summary?, artifacts?)` | 弹栈 — 完成当前帧 | finish_plan_node |
| `go(nodeId)` | 跳转到指定节点 | moveFocus |
| `compress(actionIds)` | 折叠多条 actions 为摘要 | — |

## 按步骤执行

- 一次只做一步
- 每步完成后用 `finish_plan_node(summary)` 标记，focus 自动推进到下一步
- 验证当前步骤的结果后再进入下一步
- 如果发现计划需要调整，用 `create_plan_node` 添加新步骤

## YAGNI 原则

不做没被要求的事：
- 不添加"以防万一"的功能
- 不做"顺便优化"
- 不解决没被提到的问题
- 当前任务需要什么就做什么

## Red Flags

- "这个很简单，不需要计划" → 拆解后再判断
- "我先把所有东西都做了再说" → 一次只做一步
- "顺便把这个也改了" → 不在计划内的不做
- 做了 3 轮还没有明确进展 → 停下来重新规划
```

- [ ] **Step 2: Verify trait loads correctly with hooks**

Run: `cd /Users/zhangzhefu/x/ooc && bun -e "import { loadTrait } from './kernel/src/trait/loader.js'; const t = await loadTrait('./kernel/traits/plannable', 'plannable'); console.log(t.name, t.when, JSON.stringify(t.hooks))"`
Expected: `plannable 当任务包含多个步骤、需要拆解、或不确定从哪里开始时 {"before":{"inject":"你刚进入一个新的任务节点...","once":true}}`

- [ ] **Step 3: Run all tests**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add kernel/traits/plannable/readme.md && git commit -m "refactor: plannable trait 精简为纯 API 文档 + before hook 评估提示"
```

---

## Chunk 3: Verification + documentation

### Task 5: Add integration tests

**Files:**
- Modify: `kernel/tests/cognitive-stack.test.ts`

- [ ] **Step 1: Write test for cognitive-style always-on activation**

Add to `kernel/tests/cognitive-stack.test.ts`:

```typescript
import { getActiveTraits } from "../src/trait/activator.js";

describe("cognitive-style trait 激活", () => {
  test("cognitive-style (when: always) 始终被激活", () => {
    const traits: TraitDefinition[] = [
      {
        name: "cognitive-style",
        when: "always",
        description: "认知栈思维模式",
        readme: "...",
        methods: [],
        deps: [],
      },
      {
        name: "plannable",
        when: "当任务包含多个步骤时",
        description: "规划能力",
        readme: "...",
        methods: [],
        deps: [],
        hooks: { before: { inject: "评估任务", once: true } },
      },
    ];

    // 空 scopeChain — cognitive-style 仍然激活
    const active = getActiveTraits(traits, []);
    const names = active.map(t => t.name);
    expect(names).toContain("cognitive-style");
    expect(names).not.toContain("plannable");
  });

  test("plannable 在 scopeChain 中时被激活，before hook 可触发", () => {
    const traits: TraitDefinition[] = [
      {
        name: "cognitive-style",
        when: "always",
        description: "认知栈思维模式",
        readme: "...",
        methods: [],
        deps: [],
      },
      {
        name: "plannable",
        when: "当任务包含多个步骤时",
        description: "规划能力",
        readme: "...",
        methods: [],
        deps: [],
        hooks: { before: { inject: "评估任务", once: true } },
      },
    ];

    const active = getActiveTraits(traits, ["plannable"]);
    const names = active.map(t => t.name);
    expect(names).toContain("cognitive-style");
    expect(names).toContain("plannable");

    // before hook 可触发
    const plannable = active.find(t => t.name === "plannable")!;
    expect(plannable.hooks?.before?.inject).toContain("评估任务");
  });
});
```

- [ ] **Step 2: Write test for before hook injection into chatMessages**

Add to `kernel/tests/cognitive-stack.test.ts`:

```typescript
describe("before hook 注入集成", () => {
  test("plannable before hook 通过 collectFrameHooks 注入到 chatMessages", () => {
    const traits: TraitDefinition[] = [
      {
        name: "plannable",
        when: "当任务包含多个步骤时",
        description: "规划能力",
        readme: "...",
        methods: [],
        deps: [],
        hooks: { before: { inject: "你刚进入一个新的任务节点。在开始执行之前，先评估", once: true } },
      },
    ];

    const fired = new Set<string>();
    // 模拟 plannable 在 scopeChain 中
    const result = collectFrameHooks("before", traits, ["plannable"], fired, "node-1");

    // 验证注入文本包含评估提示
    expect(result).not.toBeNull();
    expect(result).toContain("你刚进入一个新的任务节点");
    expect(result).toContain("先评估");

    // 模拟将注入文本追加到 chatMessages
    const chatMessages: Array<{ role: string; content: string }> = [
      { role: "user", content: "请帮我调研 AI 安全" },
    ];
    if (result) {
      chatMessages.push({ role: "user", content: result });
    }

    // 验证 chatMessages 包含 before hook 注入
    expect(chatMessages).toHaveLength(2);
    expect(chatMessages[1]!.content).toContain("先评估");
  });

  test("before hook 不在 scopeChain 中时不注入", () => {
    const traits: TraitDefinition[] = [
      {
        name: "plannable",
        when: "当任务包含多个步骤时",
        description: "规划能力",
        readme: "...",
        methods: [],
        deps: [],
        hooks: { before: { inject: "评估任务", once: true } },
      },
    ];

    const fired = new Set<string>();
    // plannable 不在 scopeChain 中
    const result = collectFrameHooks("before", traits, [], fired, "node-1");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/cognitive-stack.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add kernel/tests/cognitive-stack.test.ts && git commit -m "test: cognitive-style 激活 + plannable before hook 注入集成测试"
```

---

### Task 6: Update documentation cross-references

**Files:**
- Modify: `user/docs/meta.md` (if it references plannable, add cognitive-style)

- [ ] **Step 1: Check meta.md for plannable references**

Read `user/docs/meta.md` and search for "plannable". If found, add `cognitive-style` alongside it.

- [ ] **Step 2: Run full test suite as final verification**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: ALL PASS, 0 failures

- [ ] **Step 3: Final commit**

```bash
cd /Users/zhangzhefu/x/ooc && git add user/docs/meta.md && git commit -m "docs: 更新文档交叉引用 — cognitive-style trait"
```
