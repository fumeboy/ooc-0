# Trait 架构升级 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 trait progressive disclosure 机制 + 增强/新增 kernel traits

**Architecture:** TraitDefinition 新增 description 字段，loader 解析 frontmatter description，builder 构建 trait catalog window 并按 focus 路径决定注入完整 readme 还是仅 description。所有 kernel traits 添加 description，verifiable hook 升级，plannable 补充反合理化表，新增 testable 和 reviewable traits。

**Tech Stack:** TypeScript, Bun test

---

## Chunk 1: Progressive Disclosure 机制

### Task 1: TraitDefinition 新增 description 字段

**Files:**
- Modify: `src/types/trait.ts:52-65`

- [ ] **Step 1: 添加 description 字段到 TraitDefinition**

```typescript
// src/types/trait.ts — 在 TraitDefinition 的 when 和 readme 之间插入
/** 一行摘要（~50字），用于 trait catalog 展示 */
description: string;
```

- [ ] **Step 2: 运行类型检查确认编译错误位置**

Run: `cd /Users/zhangzhefu/x/ooc && bunx tsc --noEmit 2>&1 | head -20`
Expected: 编译错误指向 loader.ts 和 test 文件中缺少 description 字段的地方

### Task 2: Loader 解析 frontmatter description

**Files:**
- Modify: `src/trait/loader.ts:30-51`

- [ ] **Step 1: 在 loadTrait 中解析 description**

在 `loader.ts:32` 的变量声明区域添加：
```typescript
let description = "";
```

在 `loader.ts:40`（`when = typeof data.when ...` 之后）添加：
```typescript
description = typeof data.description === "string" ? data.description : "";
```

修改 `loader.ts:51` 的 return：
```typescript
return { name: traitName, when, description, readme, methods, deps, hooks };
```

- [ ] **Step 2: 运行现有测试确认不破坏**

Run: `cd /Users/zhangzhefu/x/ooc && bun test tests/trait.test.ts`
Expected: 编译错误 — 测试中的 TraitDefinition 字面量缺少 description

- [ ] **Step 3: 修复测试中的 TraitDefinition 字面量**

在 `tests/trait.test.ts` 中所有 `TraitDefinition` 字面量添加 `description: ""`。
涉及行：113-116, 126-130, 139-141, 153-167, 177-188。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test tests/trait.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 添加 description 解析测试**

在 `tests/trait.test.ts` 的 `describe("loadTrait")` 中添加：
```typescript
test("解析 frontmatter description", async () => {
  const traitDir = join(TEST_DIR, "desc_trait");
  mkdirSync(traitDir, { recursive: true });
  writeFileSync(
    join(traitDir, "readme.md"),
    `---\nwhen: always\ndescription: "一行摘要"\n---\n完整内容`,
    "utf-8",
  );
  const trait = await loadTrait(traitDir, "desc_trait");
  expect(trait!.description).toBe("一行摘要");
});

test("无 description 时默认空字符串", async () => {
  const traitDir = join(TEST_DIR, "no_desc");
  mkdirSync(traitDir, { recursive: true });
  writeFileSync(
    join(traitDir, "readme.md"),
    `---\nwhen: always\n---\n内容`,
    "utf-8",
  );
  const trait = await loadTrait(traitDir, "no_desc");
  expect(trait!.description).toBe("");
});
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test tests/trait.test.ts`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/trait.ts src/trait/loader.ts tests/trait.test.ts
git commit -m "feat: TraitDefinition 新增 description 字段 + loader 解析"
```

### Task 3: Builder 实现 progressive disclosure 注入

**Files:**
- Modify: `src/context/builder.ts:50-110`

- [ ] **Step 1: 构建 trait catalog window**

在 `buildContext` 函数中，`const activeTraits = getActiveTraits(...)` 之后，现有的 `KERNEL_TRAIT_NAMES` 之前，添加 trait catalog 构建逻辑：

```typescript
/* Progressive Disclosure: 构建 trait catalog */
const activeTraitNames = new Set(activeTraits.map(t => t.name));
const scopeSet = new Set(scopeChain);
const catalogLines: string[] = ["## Available Traits"];
for (const t of traits) {
  if (t.when === "never") continue;
  const isActive = activeTraitNames.has(t.name);
  const marker = isActive ? "[active] " : "";
  const desc = t.description || t.name;
  catalogLines.push(`- ${marker}${t.name}: ${desc}`);
}
const traitCatalog: ContextWindow = { name: "_trait_catalog", content: catalogLines.join("\n") };
```

- [ ] **Step 2: 修改 instructions 和 userTraitWindows 的注入逻辑**

将现有的 instructions 和 userTraitWindows 构建逻辑改为 progressive disclosure：

```typescript
/* 区分 kernel traits（系统指令）和 user traits（领域知识） */
const KERNEL_TRAIT_NAMES = new Set(["computable", "talkable", "object_creation", "verifiable", "debuggable", "plannable", "reflective", "web_search", "testable", "reviewable"]);

/* Progressive Disclosure: 只有 focus 路径上的 trait 注入完整 readme */
const instructions: ContextWindow[] = activeTraits
  .filter((t) => t.readme && KERNEL_TRAIT_NAMES.has(t.name))
  .filter((t) => !t.description || scopeSet.has(t.name) || t.when === "always")
  .map((t) => ({ name: t.name, content: t.readme }));

const userTraitWindows: ContextWindow[] = activeTraits
  .filter((t) => t.readme && !KERNEL_TRAIT_NAMES.has(t.name))
  .filter((t) => !t.description || scopeSet.has(t.name))
  .map((t) => ({ name: t.name, content: t.readme }));
```

注意：有 description 的 trait 只在 scope chain 中时注入完整 readme；没有 description 的 trait（向后兼容）始终注入完整 readme。`when: always` 的 kernel trait 始终注入完整 readme（因为它们是基础能力）。

- [ ] **Step 3: 将 traitCatalog 加入 knowledge 输出**

修改 return 语句中的 knowledge 数组，在最前面加入 traitCatalog：

```typescript
knowledge: [traitCatalog, ...memoryWindows, ...userTraitWindows, ...extraWindows, ...dynamicWindows, ...mirrorWindows, ...sessionWindows],
```

- [ ] **Step 4: 运行现有测试确认不破坏**

Run: `cd /Users/zhangzhefu/x/ooc && bun test tests/context.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 添加 progressive disclosure 测试**

在 `tests/context.test.ts` 中添加：

```typescript
test("trait catalog 包含所有非 never trait", () => {
  const stone: StoneData = {
    name: "researcher",
    thinkable: { whoAmI: "研究员" },
    talkable: { whoAmI: "研究员", functions: [] },
    data: {},
    relations: [],
    traits: [],
  };
  const flow: FlowData = {
    taskId: "t1",
    stoneName: "researcher",
    status: "running",
    messages: [],
    process: createProcess("task"),
    data: {},
    createdAt: 1,
    updatedAt: 1,
  };
  const traits = [
    { name: "computable", when: "always" as const, description: "核心 API", readme: "长内容", methods: [], deps: [] },
    { name: "hidden", when: "never" as const, description: "隐藏", readme: "x", methods: [], deps: [] },
    { name: "plannable", when: "条件" as const, description: "规划", readme: "y", methods: [], deps: [] },
  ];
  const ctx = buildContext(stone, flow, [], traits);
  const catalog = ctx.knowledge.find(w => w.name === "_trait_catalog");
  expect(catalog).toBeDefined();
  expect(catalog!.content).toContain("computable: 核心 API");
  expect(catalog!.content).not.toContain("hidden");
  expect(catalog!.content).toContain("plannable: 规划");
});
```

- [ ] **Step 6: 运行全部测试**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/context/builder.ts tests/context.test.ts
git commit -m "feat: progressive disclosure — trait catalog + focus 路径注入"
```

---

## Chunk 2: Kernel Traits 增强与新增

### Task 4: 为所有现有 kernel traits 添加 description

**Files:**
- Modify: `.ooc/kernel/traits/computable/readme.md` (frontmatter)
- Modify: `.ooc/kernel/traits/talkable/readme.md` (frontmatter)
- Modify: `.ooc/kernel/traits/reflective/readme.md` (frontmatter)
- Modify: `.ooc/kernel/traits/verifiable/readme.md` (frontmatter + hook)
- Modify: `.ooc/kernel/traits/debuggable/readme.md` (frontmatter)
- Modify: `.ooc/kernel/traits/plannable/readme.md` (frontmatter + 反合理化表)
- Modify: `.ooc/kernel/traits/object_creation/readme.md` (frontmatter)
- Modify: `.ooc/kernel/traits/web_search/readme.md` (frontmatter)

- [ ] **Step 1: computable — 添加 description**

在 frontmatter 中 `when: always` 后添加：
```yaml
description: "思考-执行循环核心 API，定义 Program 语法和所有可用方法"
```

- [ ] **Step 2: talkable — 添加 description**

在 frontmatter 中 `when: always` 后添加：
```yaml
description: "对象间通信协议，talk/delegate/reply 消息传递"
```

- [ ] **Step 3: reflective — 添加 description**

在 frontmatter 中 `when: always` 后添加：
```yaml
description: "经验结晶与自我反思，ReflectFlow 驱动的持续学习"
```

- [ ] **Step 4: debuggable — 添加 description**

在 frontmatter 中 `when:` 后添加：
```yaml
description: "系统化调试四阶段流程，根因先于修复"
```

- [ ] **Step 5: object_creation — 添加 description**

在 frontmatter 中 `when:` 后添加：
```yaml
description: "创建新对象或完善对象身份的指南"
```

- [ ] **Step 6: web_search — 添加 description**

在 frontmatter 中 `when: always` 后添加：
```yaml
description: "互联网搜索和网页抓取能力"
```

- [ ] **Step 7: plannable — 添加 description + 反合理化表**

在 frontmatter 中 `when:` 后添加：
```yaml
description: "任务拆解和行为树规划，先想清楚再动手"
```

在 readme.md 末尾（Red Flags 之后）追加：

```markdown

## 常见的合理化借口

| 借口 | 现实 |
|------|------|
| "这个很简单不需要规划" | 简单任务是未检查假设最多的地方 |
| "我边做边想" | 边做边想 = 边做边返工 |
| "先写代码再重构" | 先写错再改 ≠ 规划 |
| "规划太慢了，直接开始更快" | 不规划导致的返工更慢 |
```

- [ ] **Step 8: verifiable — 添加 description + 升级 hook**

替换整个 frontmatter 为：
```yaml
---
when: always
description: "证据先于结论，完成前必须运行验证，禁止凭记忆声称通过"
hooks:
  when_finish:
    inject: |
      [验证门禁] 你即将声明完成。回答以下问题：
      1. 你运行了什么验证命令？（必须是本轮执行的，不是之前的）
      2. 输出是什么？（引用具体输出，不是"测试通过了"）
      3. 输出是否支持你的结论？
      如果任何一项答不上来，先运行验证再 [finish]。
    once: true
---
```

- [ ] **Step 9: 运行全部测试确认不破坏**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 全部 PASS

- [ ] **Step 10: Commit**

```bash
git add .ooc/kernel/traits/
git commit -m "feat: 所有 kernel traits 添加 description + verifiable hook 升级 + plannable 反合理化表"
```

### Task 5: 新增 testable trait

**Files:**
- Create: `.ooc/kernel/traits/testable/readme.md`

- [ ] **Step 1: 创建 testable trait 目录和 readme.md**

```markdown
---
when: 当任务涉及编写或修改代码时
description: "RED-GREEN-REFACTOR 循环，测试先于代码，失败先于通过"
deps: [verifiable]
hooks:
  before:
    inject: "提醒：如果你要写代码，先写测试。先看到测试失败。"
---

# 测试驱动能力

写代码之前先写测试。看到测试失败之后再写实现。

## 铁律

**没有失败的测试，不写任何实现代码。**

测试通过后才能重构。重构不改变行为。

## RED-GREEN-REFACTOR

### RED: 写失败测试

1. 测试描述期望行为，不是实现细节
2. 运行测试，确认失败
3. 失败信息必须指向正确的原因（不是语法错误，而是"功能不存在"）

### GREEN: 最小实现

1. 只写让测试通过的代码，不多写
2. 不要"顺便"加功能
3. 运行测试，确认通过

### REFACTOR: 清理

1. 测试通过后才重构
2. 重构不改变行为（测试仍然通过）
3. 每次重构后运行测试

## Red Flags

- "先写代码再补测试" → 停下来，先写测试
- "这个太简单不需要测试" → 简单函数组合出复杂 bug
- "测试立刻通过了" → 检查测试是否真的在测你想测的
- "重构一下顺便加个功能" → 重构不加功能，加功能先写测试

## 常见的合理化借口

| 借口 | 现实 |
|------|------|
| "先写代码再补测试" | 补的测试只验证你写了什么，不验证该写什么 |
| "这个函数太简单不需要测试" | 简单函数组合出复杂 bug |
| "测试会拖慢速度" | 没测试的代码拖慢的是调试速度 |
| "测试立刻通过了" | 从未失败的测试证明不了任何事 |
```

- [ ] **Step 2: 运行全部测试**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add .ooc/kernel/traits/testable/
git commit -m "feat: 新增 testable kernel trait — TDD 红绿重构循环"
```

### Task 6: 新增 reviewable trait

**Files:**
- Create: `.ooc/kernel/traits/reviewable/readme.md`

- [ ] **Step 1: 创建 reviewable trait 目录和 readme.md**

```markdown
---
when: 当完成一个功能或修复后，需要审查质量时
description: "两阶段审查：先验证合规性（做对了吗），再验证质量（做好了吗）"
deps: [verifiable]
---

# 审查能力

完成功能后进行两阶段审查，确保做对了且做好了。

## 铁律

**合规性先于代码质量。做对了比做好了重要。**

## 两阶段审查

### Stage 1: 合规审查

对照需求/spec 逐项检查：

1. 每个需求点是否实现？
2. 每个需求点是否有测试覆盖？
3. 是否有遗漏的需求？
4. 实现是否偏离了 spec？

遗漏的需求 > 代码风格问题。

### Stage 2: 质量审查

在合规确认后检查：

1. 代码可读性（命名、结构、注释）
2. 边界情况处理
3. 性能和安全
4. 是否过度工程（YAGNI）

## 审查响应纪律

- 理解评审意见再回应（不要条件反射式同意）
- 不同意时给出技术理由
- 一次改一个问题，改完验证
- 禁止表演性同意（"好的好的我改"但不理解为什么）

## Red Flags

- "代码能跑就行" → 能跑 ≠ 正确
- "我自己看过了没问题" → 自己审查自己 = 确认偏误
- "这次改动太小" → 小改动的审查成本也小

## 常见的合理化借口

| 借口 | 现实 |
|------|------|
| "代码能跑就行" | 能跑 ≠ 正确，审查发现的是你没想到的 |
| "我自己审查过了" | 自己审查自己 = 确认偏误 |
| "这次改动太小不需要审查" | 小改动的审查成本也小，没理由跳过 |
| "审查太慢了" | 不审查导致的返工更慢 |
```

- [ ] **Step 2: 运行全部测试**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add .ooc/kernel/traits/reviewable/
git commit -m "feat: 新增 reviewable kernel trait — 两阶段审查"
```

### Task 7: 最终验证

- [ ] **Step 1: 运行全部测试**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 全部 PASS，0 fail

- [ ] **Step 2: TypeScript 类型检查**

Run: `cd /Users/zhangzhefu/x/ooc && bunx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 验证 trait 加载**

Run: `cd /Users/zhangzhefu/x/ooc && bun -e "import { loadAllTraits } from './src/trait/loader.js'; const t = await loadAllTraits('.ooc/stones/supervisor/traits', '.ooc/kernel/traits'); console.log(t.map(x => x.name + ': ' + (x.description || '(none)')))"`
Expected: 所有 kernel traits 显示 description
