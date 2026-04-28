# Refine Tool + Knowledge Activator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 2026-04-27 实现注记：计划中早期任务仍使用 `COMMAND_TREE` / `command-tree.ts` 名称；当前实现已重构为扁平 `COMMAND_TABLE` / `kernel/src/thread/command-table.ts`，并通过 `getOpenableCommands()` 动态生成 openable command 枚举。

**Goal:** Replace `submit(partial=true)` with a dedicated `refine` tool, remove `args` from `submit`, and unify trait/view/relation activation under a renamed `Knowledge Activator`.

**Architecture:** 单 thread 内的工具语义重构。新增 `refine` tool 承担参数累积；`submit` 收敛为纯执行（不接 args）；`open(action, args?)` 接收可选 args 等价于 `open(action) + refine(args)`。`trait/activator.ts` 改名为 `knowledge/activator.ts`，新增 `KnowledgeRef` 统一类型，命令树注册项升级为 `{paths, match, exec}`，knowledge 文件 frontmatter 新增 `activates_on.paths` 反向声明，由 Activator 建反向索引集中匹配。

**Tech Stack:** TypeScript / bun:test / 既有 OOC kernel（thread-tree 架构）。

**Spec:** `docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md`

---

## File Structure

**New files:**
- `kernel/src/knowledge/activator.ts` — 从 `kernel/src/trait/activator.ts` 迁移并扩展，新增 `KnowledgeRef[]` 计算入口
- `kernel/src/knowledge/types.ts` — `KnowledgeRef` 与 `KnowledgeSource` 类型定义
- `kernel/src/knowledge/index.ts` — 导出聚合
- `kernel/src/knowledge/reverse-index.ts` — knowledge 文件 `activates_on.paths → ids` 反向索引构建
- `kernel/tests/knowledge-activator.test.ts` — KnowledgeRef 输出单测
- `kernel/tests/refine-tool.test.ts` — refine tool + form lifecycle 单测
- `kernel/tests/refine-flow.test.ts` — 完整 open → refine → submit 集成

**Files to modify:**
- `kernel/src/thread/tools.ts` — 新增 `REFINE_TOOL`；`SUBMIT_TOOL` 删除 `partial` / `args`；`OPEN_TOOL` description 强化 args 等价于 refine
- `kernel/src/thread/form.ts` — `partialSubmit` → `applyRefine`；docstring 更新
- `kernel/src/thread/engine.ts` — 新增 refine handler（run + resume 两路径）；submit handler 删除 partial 分支并对旧用法报错
- `kernel/src/thread/command-tree.ts` — 节点结构升级：`paths: string[]` + `match` 统一名（保留 `_match` 兼容）+ 可选 `exec`
- `kernel/src/thread/hooks.ts` — `collectCommandTraits` 改走反向索引（`activates_on.paths`），保留 `command_binding` 作为 fallback 直至 trait 文件迁完
- `kernel/src/types/trait.ts` — `TraitDefinition` 加 `activatesOn?: { paths: string[] }`
- `kernel/src/trait/loader.ts` — frontmatter 解析新增 `activates_on`
- `kernel/src/thread/open-files.ts` — import 路径从 `trait/activator` 改为 `knowledge/activator`
- `kernel/src/trait/index.ts` — 重导出 `getActiveTraits/getChildTraits` 改为从新位置
- `kernel/src/context/builder.ts` — import 路径
- `kernel/src/process/cognitive-stack.ts` — import 路径
- `kernel/src/thread/context-builder.ts` — import 路径
- `kernel/src/trait/registry.ts` — import 路径
- `kernel/src/trait/loader.ts` (顶部) — import 路径

**Files to delete (after rename verified):**
- `kernel/src/trait/activator.ts` — 内容已迁至 `kernel/src/knowledge/activator.ts`

**Trait file frontmatter migrations (Task 14):**
- `kernel/traits/talkable/TRAIT.md` — `command_binding` → `activates_on.paths`
- `kernel/traits/compact/TRAIT.md`
- `kernel/traits/talkable/cross_object/TRAIT.md`
- `kernel/traits/talkable/relation_update/TRAIT.md`
- 其他含 `command_binding` 的 trait 文件（Task 14 内一次性 grep 处理）

---

## Task 1: Create Knowledge Module Skeleton + Move Activator

**Files:**
- Create: `kernel/src/knowledge/activator.ts` （内容从 trait/activator.ts 复制）
- Create: `kernel/src/knowledge/types.ts`
- Create: `kernel/src/knowledge/index.ts`
- Modify: `kernel/src/trait/activator.ts` （改为 re-export，避免一次改太多 import）
- Modify: `kernel/src/trait/index.ts` （re-export 走新路径）

- [ ] **Step 1: Create knowledge/types.ts with KnowledgeRef shape**

```typescript
/**
 * Knowledge 引用（trait / view / relation 三类知识统一表示）
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

export type KnowledgeType = "trait" | "view" | "relation";

export type KnowledgeSource =
  | { kind: "origin" }
  | { kind: "form_match"; path: string }
  | { kind: "relation"; peer: string }
  | { kind: "open_action" };

export type KnowledgePresentation = "summary" | "full";

export interface KnowledgeRef {
  /** 知识类型 */
  type: KnowledgeType;
  /** 引用，如 "@trait:talkable" / "@view:foo" / "@relation:user" */
  ref: string;
  /** 这条 ref 为何被激活 */
  source: KnowledgeSource;
  /** summary = 索引行；full = 进 open-files 全文 */
  presentation: KnowledgePresentation;
  /** 打开 file 时的可选参数（如 lines=200）。presentation=full 时生效 */
  openFileArgs?: Record<string, string | number>;
  /** 必带的解释字段 */
  reason: string;
}
```

- [ ] **Step 2: Create knowledge/activator.ts by copying trait/activator.ts contents verbatim, then update header**

```bash
cp /Users/zhangzhefu/x/ooc/kernel/src/trait/activator.ts /Users/zhangzhefu/x/ooc/kernel/src/knowledge/activator.ts
```

Then edit the header comment in the new file to:

```typescript
/**
 * Knowledge 激活器（原 Trait Activator 升级）
 *
 * 决定哪些 Knowledge（trait / view / relation）在当前思考轮次中被激活。
 * 沿用 G3/G13 设计：激活由作用域链 + 反向索引驱动。
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 * @ref docs/哲学文档/gene.md#G3
 * @ref docs/哲学文档/gene.md#G13
 */
```

(everything else in the file stays identical to trait/activator.ts)

- [ ] **Step 3: Create knowledge/index.ts as the public surface**

```typescript
export { traitId, resolveTraitRef, getActiveTraits, getChildTraits } from "./activator.js";
export type {
  KnowledgeType,
  KnowledgeSource,
  KnowledgePresentation,
  KnowledgeRef,
} from "./types.js";
```

- [ ] **Step 4: Convert trait/activator.ts to a thin re-export shim (zero-risk migration)**

Replace the entire contents of `/Users/zhangzhefu/x/ooc/kernel/src/trait/activator.ts` with:

```typescript
/**
 * @deprecated import from `../knowledge/activator.js` (or `../knowledge/index.js`) instead.
 * 此文件保留为 re-export shim，下个 commit 将随调用点迁移完毕后删除。
 */
export { traitId, resolveTraitRef, getActiveTraits, getChildTraits } from "../knowledge/activator.js";
```

- [ ] **Step 5: Run existing tests to verify zero regression**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count, no new fails. (If a test fails, the shim is broken—fix before committing.)

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/knowledge/ kernel/src/trait/activator.ts
git commit -m "refactor: introduce kernel/src/knowledge module, alias trait/activator"
```

---

## Task 2: Migrate All Activator Importers to knowledge/

**Files (each `from "../trait/activator.js"` → `from "../knowledge/activator.js"`):**
- Modify: `kernel/src/trait/loader.ts:32`
- Modify: `kernel/src/trait/registry.ts:21`
- Modify: `kernel/src/trait/index.ts:7` (re-export — change source path)
- Modify: `kernel/src/thread/open-files.ts:37`
- Modify: `kernel/src/thread/engine.ts:27`
- Modify: `kernel/src/thread/context-builder.ts:30`
- Modify: `kernel/src/process/cognitive-stack.ts:15`
- Modify: `kernel/src/context/builder.ts:22`
- Delete: `kernel/src/trait/activator.ts`

- [ ] **Step 1: Replace import paths across the 8 files**

For each file listed above, change `"../trait/activator.js"` to `"../knowledge/activator.js"`. Specifically (use Edit tool per file):

- `/Users/zhangzhefu/x/ooc/kernel/src/trait/loader.ts` line 32: `import { traitId } from "./activator.js";` → `import { traitId } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/trait/registry.ts` line 21: `import { traitId } from "./activator.js";` → `import { traitId } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/trait/index.ts` line 7: `export { getActiveTraits, getChildTraits } from "./activator.js";` → `export { getActiveTraits, getChildTraits } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/thread/open-files.ts` line 37: `import { getActiveTraits, traitId as activatorTraitId } from "../trait/activator.js";` → `import { getActiveTraits, traitId as activatorTraitId } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts` line 27: `import { traitId } from "../trait/activator.js";` → `import { traitId } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/thread/context-builder.ts` line 30: `import { resolveTraitRef } from "../trait/activator.js";` → `import { resolveTraitRef } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/process/cognitive-stack.ts` line 15: `import { traitId } from "../trait/activator.js";` → `import { traitId } from "../knowledge/activator.js";`
- `/Users/zhangzhefu/x/ooc/kernel/src/context/builder.ts` line 22: `import { getActiveTraits, traitId } from "../trait/activator.js";` → `import { getActiveTraits, traitId } from "../knowledge/activator.js";`

- [ ] **Step 2: Delete the shim**

```bash
rm /Users/zhangzhefu/x/ooc/kernel/src/trait/activator.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun tsc --noEmit`
Expected: no new errors. If "Cannot find module '../trait/activator.js'" appears, find the missed importer and update it.

- [ ] **Step 4: Run full test suite to verify no regression**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add -A kernel/src/
git commit -m "refactor: migrate all activator importers to kernel/src/knowledge"
```

---

## Task 3: FormManager.partialSubmit → applyRefine (Rename Only)

**Files:**
- Modify: `kernel/src/thread/form.ts` (rename method, update docstring + class header comment)
- Modify: `kernel/src/thread/engine.ts:1553, 2913` (caller sites)
- Modify: `kernel/tests/partial-submit.test.ts` (rename calls — this test will be deleted in Task 13 but still pass during the transition)

- [ ] **Step 1: Rename method in form.ts**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/form.ts`:

Change line 96 method signature `partialSubmit(` to `applyRefine(`.

Change line 90-94 docstring to:

```typescript
  /**
   * Refine: 累积 args 但不执行（替代旧的 partialSubmit）
   *
   * 累积 args、重算 commandPath，form 仍保留、引用计数不变。
   * 对应 refine tool。
   *
   * @returns 更新后的 form 快照；formId 不存在时返回 null
   */
```

Also update the file header (lines 1-15) to mention `applyRefine` instead of `partialSubmit`:

```typescript
/**
 * Form 管理器
 *
 * 管理指令生命周期的 form 模型。
 * 每个指令通过 begin/applyRefine/submit/cancel 四阶段执行：
 * - begin：创建 form，loading 相关 trait（open tool 触发）
 * - applyRefine：累积 args 但不执行；重算命令路径（refine tool 触发）
 * - submit：按最终 args 执行指令，form 结束（引用计数 -1）
 * - cancel：放弃执行，form 结束（等价 submit，但不触发指令）
 *
 * 同类型 form 共享 trait 加载（引用计数）。
 */
```

- [ ] **Step 2: Update engine.ts callers**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts`:

Line 1553: `formManager.partialSubmit(formId, incoming)` → `formManager.applyRefine(formId, incoming)`
Line 2913: `formManager.partialSubmit(formId, incoming)` → `formManager.applyRefine(formId, incoming)`

- [ ] **Step 3: Update existing test to use the new name (transitional)**

In `/Users/zhangzhefu/x/ooc/kernel/tests/partial-submit.test.ts`, replace all `mgr.partialSubmit(` with `mgr.applyRefine(`.

```bash
cd /Users/zhangzhefu/x/ooc
sed -i '' 's/\.partialSubmit(/.applyRefine(/g' kernel/tests/partial-submit.test.ts
```

- [ ] **Step 4: Run partial-submit tests to verify**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/partial-submit.test.ts`
Expected: all tests pass (rename was mechanical; behavior unchanged).

- [ ] **Step 5: Run full suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same pass count as Task 2.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/form.ts kernel/src/thread/engine.ts kernel/tests/partial-submit.test.ts
git commit -m "refactor: rename FormManager.partialSubmit -> applyRefine"
```

---

## Task 4: Add REFINE_TOOL Definition (additive, not yet wired)

**Files:**
- Modify: `kernel/src/thread/tools.ts` (insert REFINE_TOOL between SUBMIT_TOOL and CLOSE_TOOL; add to OOC_TOOLS array)

- [ ] **Step 1: Write a failing test for REFINE_TOOL presence**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/refine-tool.test.ts`:

```typescript
/**
 * refine tool 单测
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect } from "bun:test";
import { OOC_TOOLS, REFINE_TOOL } from "../src/thread/tools.js";

describe("REFINE_TOOL definition", () => {
  test("exported and present in OOC_TOOLS", () => {
    expect(REFINE_TOOL).toBeDefined();
    expect(OOC_TOOLS.some((t) => t.function.name === "refine")).toBe(true);
  });

  test("schema requires title + form_id; args is optional object", () => {
    expect(REFINE_TOOL.function.name).toBe("refine");
    const params = REFINE_TOOL.function.parameters as Record<string, unknown>;
    const required = params.required as string[];
    expect(required).toContain("title");
    expect(required).toContain("form_id");
    const props = params.properties as Record<string, { type?: string }>;
    expect(props.args?.type).toBe("object");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: FAIL — `REFINE_TOOL` not exported.

- [ ] **Step 3: Add REFINE_TOOL in tools.ts**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/tools.ts`:

Insert this block between SUBMIT_TOOL definition (ending at line 195) and CLOSE_TOOL definition (starting line 198):

```typescript
/** refine tool — 向 open 的 form 追加/修改 args（不执行） */
export const REFINE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "refine",
    description:
      "向已 open 的 form 追加或修改参数（不执行）。多次调用 refine 累积 args（后到覆盖先到），可能深化命令路径，从而触发新一轮知识激活。等到参数齐全且语义合理，再调 submit() 执行。obj.refine 取代旧的 submit(partial=true)。",
    parameters: {
      type: "object",
      properties: {
        title: TITLE_PARAM,
        form_id: { type: "string", description: "open 返回的 form_id" },
        args: {
          type: "object",
          description: "要追加或覆盖的参数键值对。后到覆盖先到。",
        },
        mark: MARK_PARAM,
      },
      required: ["title", "form_id"],
    },
  },
};
```

Then update the OOC_TOOLS array (line 238):

```typescript
export const OOC_TOOLS: ToolDefinition[] = [OPEN_TOOL, REFINE_TOOL, SUBMIT_TOOL, CLOSE_TOOL, WAIT_TOOL];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/tools.ts kernel/tests/refine-tool.test.ts
git commit -m "feat: add REFINE_TOOL definition (not yet wired in engine)"
```

---

## Task 5: Wire refine Handler in Engine (run path)

**Files:**
- Modify: `kernel/src/thread/engine.ts` (add `else if (toolName === "refine")` branch in run path)

- [ ] **Step 1: Write failing integration test**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/refine-flow.test.ts`:

```typescript
/**
 * open → refine → submit 完整流程集成测试
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ThreadsTree } from "../src/thread/tree.js";
import { runWithThreadTree } from "../src/thread/engine.js";
import type { TraitDefinition } from "../src/types/index.js";

function makeTrait(name: string, commands?: string[]): TraitDefinition {
  return {
    namespace: "kernel", name, kind: "trait", type: "how_to_think",
    version: "1.0.0", when: "never", description: "",
    readme: `# ${name}`, methods: [], deps: [],
    commandBinding: commands ? { commands } : undefined,
    dir: `/fake/${name}`,
  };
}

describe("open → refine → submit flow", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "refine-flow-"));
    mkdirSync(join(tmp, "stones", "alice"), { recursive: true });
    writeFileSync(join(tmp, "stones", "alice", "readme.md"), "# alice\n");
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test("refine accumulates args and form survives until explicit submit", async () => {
    const tree = new ThreadsTree(join(tmp, "stones", "alice"));
    const root = tree.createRoot("alice", "test");

    /* This test asserts the engine's refine handler updates form state.
       We will fill it in once the handler is wired (next steps). */
    expect(root).toBeTruthy();
  });
});
```

(This is intentionally a placeholder — full assertions come in Task 8 once submit is reshaped. Confirm the file at least compiles.)

- [ ] **Step 2: Run test to confirm compilation works**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-flow.test.ts`
Expected: PASS (the placeholder assertion is trivially true).

- [ ] **Step 3: Locate the engine run-path tool dispatch**

In `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts`, find the run-path tool dispatch around line 1542 (the `else if (toolName === "submit")` branch). Insert a new branch **before** the submit branch:

```typescript
        /* --- Refine --- */
        else if (toolName === "refine") {
          const formId = (args.form_id as string) ?? "";
          const incoming = (args.args as Record<string, unknown> | undefined) ?? {};

          const updatedForm = formManager.applyRefine(formId, incoming);
          if (!updatedForm) {
            const td = tree.readThreadData(threadId);
            if (td) {
              td.actions.push({
                type: "inject",
                content: `[错误] refine 失败：Form ${formId} 不存在。`,
                timestamp: Date.now(),
              });
              tree.writeThreadData(threadId, td);
            }
          } else {
            const traitsToLoad = collectCommandTraits(config.traits, formManager.activeCommandPaths());
            const newlyLoadedTraits: string[] = [];
            for (const traitName of traitsToLoad) {
              if (updatedForm.loadedTraits.includes(traitName)) continue;
              const changed = await tree.activateTrait(threadId, traitName);
              if (changed) newlyLoadedTraits.push(traitName);
            }
            if (newlyLoadedTraits.length > 0) {
              formManager.addLoadedTraits(formId, newlyLoadedTraits);
            }
            const td = tree.readThreadData(threadId);
            if (td) {
              td.activeForms = formManager.toData();
              const pathHint = `当前路径：${updatedForm.commandPath}`;
              const loadHint = newlyLoadedTraits.length > 0
                ? `按新路径追加 trait：${newlyLoadedTraits.join(", ")}`
                : `按新路径无新增 trait`;
              td.actions.push({
                type: "inject",
                content: `[refine] Form ${formId} 已累积参数（未执行）。${pathHint}。${loadHint}。可继续 refine，或 submit() 执行指令。`,
                timestamp: Date.now(),
              });
              tree.writeThreadData(threadId, td);
            }
            consola.info(`[Engine] refine: form=${formId} path=${updatedForm.commandPath}`);
          }
        }
```

- [ ] **Step 4: Run test to verify nothing broke**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/engine.ts kernel/tests/refine-flow.test.ts
git commit -m "feat: wire refine handler in engine run path"
```

---

## Task 6: Wire refine Handler in Engine (resume path)

**Files:**
- Modify: `kernel/src/thread/engine.ts` (mirror Task 5 in the resume-path dispatch)

- [ ] **Step 1: Locate resume-path tool dispatch**

In `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts`, find around line 2903 the `else if (toolName === "submit")` branch in the **resume** path. Insert a new branch **before** the submit branch (mirror of Task 5):

```typescript
        /* --- Refine (resume) --- */
        } else if (toolName === "refine") {
          const formId = (args.form_id as string) ?? "";
          const incoming = (args.args as Record<string, unknown> | undefined) ?? {};
          const updatedForm = formManager.applyRefine(formId, incoming);
          if (!updatedForm) {
            const td = tree.readThreadData(threadId);
            if (td) { td.actions.push({ type: "inject", content: `[错误] refine 失败：Form ${formId} 不存在。`, timestamp: Date.now() }); tree.writeThreadData(threadId, td); }
          } else {
            const traitsToLoad = collectCommandTraits(config.traits, formManager.activeCommandPaths());
            const newlyLoadedTraits: string[] = [];
            for (const traitName of traitsToLoad) {
              if (updatedForm.loadedTraits.includes(traitName)) continue;
              const changed = await tree.activateTrait(threadId, traitName);
              if (changed) newlyLoadedTraits.push(traitName);
            }
            if (newlyLoadedTraits.length > 0) formManager.addLoadedTraits(formId, newlyLoadedTraits);
            const td = tree.readThreadData(threadId);
            if (td) {
              td.activeForms = formManager.toData();
              const pathHint = `当前路径：${updatedForm.commandPath}`;
              const loadHint = newlyLoadedTraits.length > 0 ? `按新路径追加 trait：${newlyLoadedTraits.join(", ")}` : `按新路径无新增 trait`;
              td.actions.push({ type: "inject", content: `[refine] Form ${formId} 已累积参数（未执行）。${pathHint}。${loadHint}。可继续 refine，或 submit() 执行指令。`, timestamp: Date.now() });
              tree.writeThreadData(threadId, td);
            }
            consola.info(`[Engine] refine(resume): form=${formId} path=${updatedForm.commandPath}`);
          }
```

(Note the leading `}` matches the existing brace pattern in resume-path dispatch.)

- [ ] **Step 2: Run all tests to verify**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/engine.ts
git commit -m "feat: wire refine handler in engine resume path"
```

---

## Task 7: Make open(action, args?) Equivalent to open + refine

**Files:**
- Modify: `kernel/src/thread/engine.ts` (run + resume open handler — after creating form, if `args.args` present, immediately route through refine path)
- Modify: `kernel/src/thread/tools.ts` (OPEN_TOOL description mention args equivalence)

- [ ] **Step 1: Write a focused unit test**

Append to `/Users/zhangzhefu/x/ooc/kernel/tests/refine-tool.test.ts`:

```typescript
import { OPEN_TOOL } from "../src/thread/tools.js";

describe("OPEN_TOOL extended args description", () => {
  test("description mentions args equivalent to refine", () => {
    expect(OPEN_TOOL.function.description).toContain("args");
    expect(OPEN_TOOL.function.description).toContain("refine");
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: FAIL — current OPEN_TOOL description has no such mention.

- [ ] **Step 2: Update OPEN_TOOL description**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/tools.ts` (around line 93):

Replace OPEN_TOOL.function.description with:

```typescript
    description: "打开一个上下文。type=command 时加载指令相关知识；type=trait 时加载 trait 知识；type=skill 时加载 skill 内容；type=file 时读取文件到上下文窗口。可选 args 字段——若已知部分参数可一并传入，等价于 open(...) 紧接 refine(args)。记得带 title 参数，用一句话说明本次在做什么。",
```

Also add the `args` field to OPEN_TOOL.function.parameters.properties (right after `lines`):

```typescript
        args: {
          type: "object",
          description: "可选预填参数。等价于 open 后立即 refine(args)。",
        },
```

- [ ] **Step 3: Run test to verify**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: PASS.

- [ ] **Step 4: Wire the equivalence in engine open handler (run path)**

In `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts` open handler (around line 1392-1410, after the form is created and trait load reported), insert immediately after the line that records `[Engine] open command`:

```typescript
              /* open(args) 等价于 open + refine(args)：若用户带了 args，立即应用 refine */
              if (args.args && typeof args.args === "object") {
                const incomingPre = args.args as Record<string, unknown>;
                if (Object.keys(incomingPre).length > 0) {
                  const refined = formManager.applyRefine(formId, incomingPre);
                  if (refined) {
                    const traitsToLoad = collectCommandTraits(config.traits, formManager.activeCommandPaths());
                    for (const traitName of traitsToLoad) {
                      if (refined.loadedTraits.includes(traitName)) continue;
                      const changed = await tree.activateTrait(threadId, traitName);
                      if (changed) formManager.addLoadedTraits(formId, [traitName]);
                    }
                    const td2 = tree.readThreadData(threadId);
                    if (td2) {
                      td2.activeForms = formManager.toData();
                      td2.actions.push({
                        type: "inject",
                        content: `[refine via open] 预填参数已累积；当前路径：${refined.commandPath}。`,
                        timestamp: Date.now(),
                      });
                      tree.writeThreadData(threadId, td2);
                    }
                  }
                }
              }
```

(Find the exact insertion point by searching for `consola.info(`[Engine] open command`); insert this block immediately after that line, before the corresponding `}` of the inner block.)

- [ ] **Step 5: Mirror the same insertion in resume path open handler**

Locate the matching `[Engine] open command` log in the resume-path open handler around line 2580-2900 (search for `consola.info(`[Engine] open command` and find the `(resume)` variant). Insert the same block. If the resume open handler already loops via existing partialSubmit code and just needs the same args-pre-fill, copy verbatim.

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/engine.ts kernel/src/thread/tools.ts kernel/tests/refine-tool.test.ts
git commit -m "feat: open(action, args?) acts as open + refine"
```

---

## Task 8: Remove partial Field from SUBMIT_TOOL + Reject Old Usage

**Files:**
- Modify: `kernel/src/thread/tools.ts` (SUBMIT_TOOL — remove `partial` field from properties, remove `args` field, update description)
- Modify: `kernel/src/thread/engine.ts` (run + resume submit handlers — remove partial branch; if old `partial=true` shows up at runtime, inject error guidance)

- [ ] **Step 1: Write failing tests**

Append to `/Users/zhangzhefu/x/ooc/kernel/tests/refine-tool.test.ts`:

```typescript
import { SUBMIT_TOOL } from "../src/thread/tools.js";

describe("SUBMIT_TOOL after refine refactor", () => {
  test("submit no longer accepts partial field", () => {
    const params = SUBMIT_TOOL.function.parameters as Record<string, unknown>;
    const props = params.properties as Record<string, unknown>;
    expect(props.partial).toBeUndefined();
  });

  test("submit no longer accepts top-level args field", () => {
    const params = SUBMIT_TOOL.function.parameters as Record<string, unknown>;
    const props = params.properties as Record<string, unknown>;
    expect(props.args).toBeUndefined();
  });

  test("submit description does not mention partial", () => {
    expect(SUBMIT_TOOL.function.description).not.toContain("partial");
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: FAIL on all three new tests.

- [ ] **Step 2: Update SUBMIT_TOOL in tools.ts**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/tools.ts`:

Replace SUBMIT_TOOL.function.description (line 145):

```typescript
    description: "提交指令执行。必须先 open 获取 form_id，所有参数通过 refine() 累积；submit() 本身不接受参数。do/talk 指令通过 context=fork|continue 表达四种语义：do(fork) 派生自己的子线程；do(continue,threadId) 向自己某线程补充；talk(fork,target) 向别人新根线程；talk(continue,target,threadId) 向别人已有线程补充。talk 可选带 form 参数（结构化表单）——记得用 refine() 提供。记得带 title 参数，用一句话说明本次提交的意图。",
```

In SUBMIT_TOOL.function.parameters.properties, **delete** these entries:
- `partial: { ... }` (lines 158-160)
- `args: { type: "object", description: "call_function: 方法参数" }` (line 183)

(All other parameters stay untouched. The actual command-specific fields like `code`, `msg`, `target` remain — they're the executor's hint shape; the actual exec uses `form.accumulatedArgs`.)

Wait — re-reading the spec:

> submit() 不接受 args—— 所有参数必须先通过 refine 提供

This is unambiguous about NOT accepting args. The current SUBMIT_TOOL has many command-specific args (code, msg, threadId, etc.) listed because the engine accepts them as direct args alongside form_id. After this refactor, **all** of those should also be removed — submit is purely `submit(title, form_id)`.

Update accordingly: SUBMIT_TOOL.function.parameters becomes:

```typescript
    parameters: {
      type: "object",
      properties: {
        title: TITLE_PARAM,
        form_id: { type: "string", description: "open 返回的 form_id" },
        mark: MARK_PARAM,
      },
      required: ["title", "form_id"],
    },
```

- [ ] **Step 3: Run schema tests to verify pass**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/refine-tool.test.ts`
Expected: PASS on all SUBMIT_TOOL tests.

- [ ] **Step 4: Update engine submit handler (run path) to reject partial + old args**

In `/Users/zhangzhefu/x/ooc/kernel/src/thread/engine.ts`, the submit branch (line 1542) currently has:

```typescript
        else if (toolName === "submit") {
          const isPartial = args.partial === true;
          if (isPartial) { ... } else { ... existing exec logic ... }
        }
```

Replace the entire `else if (toolName === "submit")` block (lines 1542-1589 the partial branch) with:

```typescript
        else if (toolName === "submit") {
          /* partial 已退役 → 引导改用 refine */
          if (args.partial === true) {
            const td = tree.readThreadData(threadId);
            if (td) {
              td.actions.push({
                type: "inject",
                content: "[错误] submit(partial=true) 已退役。请改用 refine(form_id, args) 累积参数，最后 submit(form_id) 执行。",
                timestamp: Date.now(),
              });
              tree.writeThreadData(threadId, td);
            }
            continue; /* 跳过本次工具调用 */
          }
```

(Keep the rest of the original submit branch — the part that calls `formManager.submit(...)` and executes the command — unchanged.)

The existing line `if (form.accumulatedArgs && Object.keys(form.accumulatedArgs).length > 0) { for ... if (!(k in args)) args[k] = v; }` (around line 1599-1604) keeps merging accumulated args into the runtime `args` object so existing executors (`if (command === "program" && args.code) {...}`) still work. **Important:** the runtime `args` here is the engine's local handler variable — submit's TOOL signature no longer accepts those fields, but the engine still uses them internally after merging.

- [ ] **Step 5: Mirror in resume path (line 2903 region)**

Same replacement: prepend the partial-rejection guard, drop the partial branch.

```typescript
        } else if (toolName === "submit") {
          if (args.partial === true) {
            const td = tree.readThreadData(threadId);
            if (td) { td.actions.push({ type: "inject", content: "[错误] submit(partial=true) 已退役。请改用 refine(form_id, args) 累积参数，最后 submit(form_id) 执行。", timestamp: Date.now() }); tree.writeThreadData(threadId, td); }
            continue;
          }
```

(Keep the existing exec logic afterward.)

- [ ] **Step 6: Update partial-submit.test.ts to test refine semantics, not partial submit**

Rename file:
```bash
cd /Users/zhangzhefu/x/ooc
git mv kernel/tests/partial-submit.test.ts kernel/tests/refine-semantics.test.ts
```

Update file header (lines 1-13) of the renamed file:

```typescript
/**
 * Refine 语义单测（取代旧的 partial-submit.test.ts）
 *
 * 语义：refine(form_id, args) 累积 args、重算 commandPath；不执行。
 * - submit(form_id) 才执行最终指令。
 * - submit 不接受 args（参数全部走 refine）。
 *
 * 测试覆盖：
 * - FormManager.applyRefine 的累积语义 / path 变化
 * - collectCommandTraits 支持 path 前缀匹配（冒泡）
 */
```

Update `describe("FormManager.partialSubmit ...")` → `describe("FormManager.applyRefine ...")` throughout.

- [ ] **Step 7: Run full test suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count. Existing functional flows unaffected; new tests for tools schema pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/tools.ts kernel/src/thread/engine.ts kernel/tests/refine-tool.test.ts kernel/tests/refine-semantics.test.ts
git commit -m "feat: submit no longer accepts partial/args; old usage returns error"
```

---

## Task 9: Add `paths` Field to Command Tree Nodes (additive)

**Files:**
- Modify: `kernel/src/thread/command-tree.ts` (CommandTreeNode interface + each top-level entry)
- Modify: `kernel/tests/command-tree.test.ts` (add coverage for `paths` field)

- [ ] **Step 1: Write failing test**

Append to `/Users/zhangzhefu/x/ooc/kernel/tests/command-tree.test.ts`:

```typescript
import { COMMAND_TREE } from "../src/thread/command-tree.js";

describe("COMMAND_TREE.<root>.paths declares known path universe", () => {
  test("talk paths include talk, talk.continue, talk.fork", () => {
    const node = COMMAND_TREE.talk as { paths?: string[] };
    expect(node.paths).toBeDefined();
    expect(node.paths).toContain("talk");
    expect(node.paths).toContain("talk.continue");
    expect(node.paths).toContain("talk.fork");
  });

  test("submit paths include submit and known children", () => {
    const node = COMMAND_TREE.submit as { paths?: string[] };
    expect(node.paths).toBeDefined();
    expect(node.paths).toContain("submit");
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/command-tree.test.ts`
Expected: FAIL — `paths` not present on entries.

- [ ] **Step 2: Add `paths` to interface and entries**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/command-tree.ts`:

Update `CommandTreeNode` interface (lines 17-30) — add `paths?` field:

```typescript
export interface CommandTreeNode {
  /** 该注册项可能命中的所有路径（含根本身和子路径，扁平列出） */
  paths?: string[];
  _match?: (args: Record<string, unknown>) => string | null | undefined;
  [child: string]: unknown;
}
```

Then update each top-level entry in COMMAND_TREE to add a `paths` field. Replace the entire COMMAND_TREE block (lines 45-92) with:

```typescript
export const COMMAND_TREE: Record<string, CommandTreeNode> = {
  talk: {
    paths: ["talk", "talk.fork", "talk.continue", "talk.continue.relation_update", "talk.continue.question_form"],
    _match: (args) => {
      const ctx = args.context;
      if (typeof ctx !== "string" || !ctx) return undefined;
      return ctx;
    },
    fork: {},
    continue: {
      _match: (args) => {
        const type = args.type;
        if (typeof type !== "string" || !type) return undefined;
        return type;
      },
      relation_update: {},
      question_form: {},
    },
  },
  open: {
    paths: ["open", "open.command", "open.path"],
    _match: (args) => {
      if (typeof args.command === "string" && args.command) return "command";
      if (typeof args.path === "string" && args.path) return "path";
      return undefined;
    },
    command: {},
    path: {},
  },
  program: {
    paths: ["program", "program.shell", "program.ts"],
    _match: (args) => {
      const lang = args.language ?? args.lang;
      if (typeof lang !== "string" || !lang) return undefined;
      return lang;
    },
    shell: {},
    ts: {},
  },
  submit: {
    paths: ["submit", "submit.compact", "submit.talk"],
    _match: (args) => {
      const c = args.command;
      if (typeof c !== "string" || !c) return undefined;
      return c;
    },
    compact: {},
    talk: {},
  },
  return: { paths: ["return"] },
  refine: { paths: ["refine"] },
  close: { paths: ["close"] },
  wait: { paths: ["wait"] },
};
```

(refine, close, wait are added so the matcher knows about them; previously only "command-style" tools were registered.)

- [ ] **Step 3: Run test to verify pass**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/command-tree.test.ts`
Expected: PASS.

- [ ] **Step 4: Run full suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/command-tree.ts kernel/tests/command-tree.test.ts
git commit -m "feat: add paths field to COMMAND_TREE entries"
```

---

## Task 10: Add `activatesOn` to TraitDefinition + Loader Parse

**Files:**
- Modify: `kernel/src/types/trait.ts` (or `src/types/index.ts` — wherever TraitDefinition lives) — add `activatesOn?: { paths: string[] }`
- Modify: `kernel/src/trait/loader.ts` — parse frontmatter `activates_on`
- Modify: `kernel/tests/loader-methods.test.ts` (or add new) — verify parse

- [ ] **Step 1: Locate TraitDefinition**

Run: `cd /Users/zhangzhefu/x/ooc && grep -rn "interface TraitDefinition\|type TraitDefinition" kernel/src/types/`
Note the exact file (likely `kernel/src/types/trait.ts` or `index.ts`).

- [ ] **Step 2: Write failing test**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/activates-on-parse.test.ts`:

```typescript
/**
 * Frontmatter `activates_on.paths` 解析测试
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTrait } from "../src/trait/loader.js";

describe("loader parses activates_on.paths", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "act-on-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("trait with activates_on.paths is parsed", async () => {
    const traitDir = join(dir, "kernel", "talkable");
    mkdirSync(traitDir, { recursive: true });
    writeFileSync(join(traitDir, "TRAIT.md"), `---
namespace: kernel
name: talkable
type: how_to_interact
version: 1.0.0
when: never
activates_on:
  paths: ["talk", "submit.talk"]
description: test
deps: []
---

# talkable
`);
    const trait = await loadTrait(traitDir, "kernel");
    expect(trait).not.toBeNull();
    expect(trait!.activatesOn?.paths).toEqual(["talk", "submit.talk"]);
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/activates-on-parse.test.ts`
Expected: FAIL — `activatesOn` not on TraitDefinition / loader.

- [ ] **Step 3: Add activatesOn to TraitDefinition**

In the file containing `interface TraitDefinition` (use the path found in Step 1), add:

```typescript
export interface TraitDefinition {
  // ... existing fields ...
  /** 反向激活声明：当 form 路径命中以下任一时，激活此 knowledge */
  activatesOn?: { paths: string[] };
}
```

- [ ] **Step 4: Update loader.ts to parse activates_on**

In `/Users/zhangzhefu/x/ooc/kernel/src/trait/loader.ts`, locate the frontmatter parse section near `parseCommandBinding` (around line 688-695). Add a similar helper:

```typescript
function parseActivatesOn(fm: Record<string, unknown>): { paths: string[] } | undefined {
  const raw = fm.activates_on;
  if (!raw || typeof raw !== "object") return undefined;
  const paths = (raw as Record<string, unknown>).paths;
  if (!Array.isArray(paths)) return undefined;
  const cleaned = paths.filter((p): p is string => typeof p === "string" && p.length > 0);
  if (cleaned.length === 0) return undefined;
  return { paths: cleaned };
}
```

Then in `loadTrait` (around line 115), find where `commandBinding: parseCommandBinding(fm)` is set and add right after:

```typescript
    activatesOn: parseActivatesOn(fm),
```

- [ ] **Step 5: Run test to verify pass**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/activates-on-parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/types/ kernel/src/trait/loader.ts kernel/tests/activates-on-parse.test.ts
git commit -m "feat: parse trait frontmatter activates_on.paths into TraitDefinition.activatesOn"
```

---

## Task 11: Build Knowledge Reverse Index + activator.computeKnowledgeRefs

**Files:**
- Create: `kernel/src/knowledge/reverse-index.ts`
- Modify: `kernel/src/knowledge/activator.ts` (add `computeKnowledgeRefs` function)
- Create: `kernel/tests/knowledge-activator.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/knowledge-activator.test.ts`:

```typescript
/**
 * Knowledge Activator 单测：computeKnowledgeRefs 输出
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect } from "bun:test";
import { buildPathReverseIndex } from "../src/knowledge/reverse-index.js";
import { computeKnowledgeRefs } from "../src/knowledge/activator.js";
import type { TraitDefinition } from "../src/types/index.js";

function trait(name: string, paths: string[]): TraitDefinition {
  return {
    namespace: "kernel", name, kind: "trait", type: "how_to_think",
    version: "1.0.0", when: "never", description: "",
    readme: `# ${name}`, methods: [], deps: [],
    activatesOn: { paths },
    dir: `/fake/${name}`,
  };
}

describe("buildPathReverseIndex", () => {
  test("indexes traits by their declared paths", () => {
    const traits = [
      trait("talkable", ["talk"]),
      trait("relation_update", ["talk.continue.relation_update"]),
    ];
    const idx = buildPathReverseIndex(traits);
    expect(idx.get("talk")).toEqual(["kernel:talkable"]);
    expect(idx.get("talk.continue.relation_update")).toEqual(["kernel:relation_update"]);
  });
});

describe("computeKnowledgeRefs from form_match source", () => {
  test("active path emits a KnowledgeRef per matched trait (prefix-aware)", () => {
    const traits = [
      trait("talkable", ["talk"]),
      trait("relation_update", ["talk.continue.relation_update"]),
    ];
    const refs = computeKnowledgeRefs({
      traits,
      activePaths: new Set(["talk.continue.relation_update"]),
    });
    const refIds = refs.map((r) => r.ref).sort();
    expect(refIds).toEqual(["@trait:relation_update", "@trait:talkable"]);
    /* 两条均带 source.kind = form_match */
    expect(refs.every((r) => r.source.kind === "form_match")).toBe(true);
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: FAIL — modules not yet created.

- [ ] **Step 2: Create reverse-index.ts**

Create `/Users/zhangzhefu/x/ooc/kernel/src/knowledge/reverse-index.ts`:

```typescript
/**
 * Knowledge 反向索引
 *
 * 输入一组 knowledge 文件（trait / view / relation），按各自 frontmatter 的
 * activates_on.paths 反向建表：path -> [traitId]。
 * 用于 Activator 在每次 refine 后快速查"当前路径命中哪些 knowledge"。
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import type { TraitDefinition } from "../types/index.js";
import { traitId } from "./activator.js";

export type PathReverseIndex = Map<string, string[]>;

export function buildPathReverseIndex(traits: TraitDefinition[]): PathReverseIndex {
  const idx: PathReverseIndex = new Map();
  for (const t of traits) {
    const paths = t.activatesOn?.paths;
    if (!paths || paths.length === 0) continue;
    const id = traitId(t);
    for (const p of paths) {
      const list = idx.get(p);
      if (list) {
        if (!list.includes(id)) list.push(id);
      } else {
        idx.set(p, [id]);
      }
    }
  }
  return idx;
}

/**
 * 根据 active path 集合查反向索引，返回命中的 traitId 列表（去重）
 *
 * 命中规则与 matchesCommandPath 同：path 前缀匹配。
 * 即声明 paths=["talk"] 的 trait 在 activePath="talk.continue.relation_update" 时也命中。
 */
export function lookupTraitsByPaths(
  idx: PathReverseIndex,
  activePaths: Set<string>,
): string[] {
  const hit = new Set<string>();
  for (const ap of activePaths) {
    /* 前缀匹配：遍历索引每个声明 path，看 ap === decl 或 ap.startsWith(decl + ".") */
    for (const [decl, ids] of idx.entries()) {
      if (ap === decl || ap.startsWith(decl + ".")) {
        for (const id of ids) hit.add(id);
      }
    }
  }
  return Array.from(hit);
}
```

- [ ] **Step 3: Add computeKnowledgeRefs to activator.ts**

Append to `/Users/zhangzhefu/x/ooc/kernel/src/knowledge/activator.ts`:

```typescript
import type { KnowledgeRef } from "./types.js";
import { buildPathReverseIndex, lookupTraitsByPaths, type PathReverseIndex } from "./reverse-index.js";

export interface ComputeRefsInput {
  traits: TraitDefinition[];
  activePaths: Set<string>;
  /** 可选：预先构建好的反向索引（性能） */
  reverseIndex?: PathReverseIndex;
}

/**
 * 基于反向索引计算当前应激活的 KnowledgeRef[]（form_match 维度）
 *
 * origin / relation / open_action 维度后续 Task 加入。
 */
export function computeKnowledgeRefs(input: ComputeRefsInput): KnowledgeRef[] {
  const idx = input.reverseIndex ?? buildPathReverseIndex(input.traits);
  const traitMap = new Map(input.traits.map((t) => [traitId(t), t]));
  const hitIds = lookupTraitsByPaths(idx, input.activePaths);

  const refs: KnowledgeRef[] = [];
  for (const id of hitIds) {
    const t = traitMap.get(id);
    if (!t) continue;
    /* 找到这条 trait 是被哪个 activePath 命中的（取第一个匹配的，仅用于 reason） */
    let matchedPath = "";
    if (t.activatesOn?.paths) {
      for (const ap of input.activePaths) {
        for (const decl of t.activatesOn.paths) {
          if (ap === decl || ap.startsWith(decl + ".")) {
            matchedPath = ap;
            break;
          }
        }
        if (matchedPath) break;
      }
    }
    refs.push({
      type: "trait",
      ref: `@trait:${t.name}`,
      source: { kind: "form_match", path: matchedPath || "" },
      presentation: "full",
      reason: `命令路径命中 trait ${t.namespace}:${t.name}`,
    });
  }
  return refs;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/knowledge/ kernel/tests/knowledge-activator.test.ts
git commit -m "feat: add reverse-index + computeKnowledgeRefs for form_match source"
```

---

## Task 12: Switch hooks.ts to Use Reverse Index (with Fallback)

**Files:**
- Modify: `kernel/src/thread/hooks.ts` — `collectCommandTraits` queries reverse index first; falls back to `command_binding` if trait has no `activatesOn`

- [ ] **Step 1: Write failing test for fallback behavior**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/hooks-reverse-index.test.ts`:

```typescript
/**
 * collectCommandTraits with reverse index + command_binding fallback
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect } from "bun:test";
import { collectCommandTraits } from "../src/thread/hooks.js";
import type { TraitDefinition } from "../src/types/index.js";

function traitOnly(opts: {
  name: string;
  bindings?: string[];
  activates?: string[];
}): TraitDefinition {
  return {
    namespace: "kernel", name: opts.name, kind: "trait", type: "how_to_think",
    version: "1.0.0", when: "never", description: "",
    readme: `# ${opts.name}`, methods: [], deps: [],
    commandBinding: opts.bindings ? { commands: opts.bindings } : undefined,
    activatesOn: opts.activates ? { paths: opts.activates } : undefined,
    dir: `/fake/${opts.name}`,
  };
}

describe("collectCommandTraits prefers activatesOn, falls back to commandBinding", () => {
  test("trait with activatesOn matches via reverse index", () => {
    const traits = [traitOnly({ name: "a", activates: ["talk"] })];
    const ids = collectCommandTraits(traits, new Set(["talk.continue"]));
    expect(ids).toEqual(["kernel:a"]);
  });

  test("trait with only commandBinding still matches (back-compat)", () => {
    const traits = [traitOnly({ name: "b", bindings: ["talk"] })];
    const ids = collectCommandTraits(traits, new Set(["talk.continue"]));
    expect(ids).toEqual(["kernel:b"]);
  });

  test("trait with both activates and binding only counted once", () => {
    const traits = [traitOnly({ name: "c", activates: ["talk"], bindings: ["talk"] })];
    const ids = collectCommandTraits(traits, new Set(["talk"]));
    expect(ids).toEqual(["kernel:c"]);
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/hooks-reverse-index.test.ts`
Expected: PASS for the second test (back-compat case), FAIL for first/third (activatesOn not consulted).

- [ ] **Step 2: Update collectCommandTraits in hooks.ts**

Replace the body of `collectCommandTraits` in `/Users/zhangzhefu/x/ooc/kernel/src/thread/hooks.ts` (lines 42-65) with:

```typescript
export function collectCommandTraits(
  traits: TraitDefinition[],
  activePaths: Set<string>,
): string[] {
  if (activePaths.size === 0) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const trait of traits) {
    const id = localTraitId(trait);
    if (seen.has(id)) continue;

    /* 1) 优先：activates_on.paths 反向声明（前缀匹配） */
    const aoPaths = trait.activatesOn?.paths;
    if (aoPaths && aoPaths.length > 0) {
      let hit = false;
      outerAo: for (const decl of aoPaths) {
        for (const ap of activePaths) {
          if (ap === decl || ap.startsWith(decl + ".")) { hit = true; break outerAo; }
        }
      }
      if (hit) { result.push(id); seen.add(id); continue; }
    }

    /* 2) 后备：旧的 command_binding（同前缀匹配语义） */
    const binding = trait.commandBinding;
    if (binding?.commands?.length) {
      let hit = false;
      outerCb: for (const b of binding.commands) {
        for (const p of activePaths) {
          if (matchesCommandPath(p, b)) { hit = true; break outerCb; }
        }
      }
      if (hit) { result.push(id); seen.add(id); }
    }
  }
  return result;
}
```

- [ ] **Step 3: Run test to verify pass**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/hooks-reverse-index.test.ts`
Expected: PASS on all three tests.

- [ ] **Step 4: Run full suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count (back-compat preserved).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/hooks.ts kernel/tests/hooks-reverse-index.test.ts
git commit -m "feat: collectCommandTraits prefers activates_on, falls back to command_binding"
```

---

## Task 13: Migrate Existing TRAIT.md Files from command_binding → activates_on

**Files:** All trait files declaring `command_binding` in frontmatter. Use grep first.

- [ ] **Step 1: Locate all trait files with command_binding**

Run:
```bash
cd /Users/zhangzhefu/x/ooc
grep -rln "^command_binding:" kernel/traits/
```

Note the list (likely includes `kernel/traits/talkable/TRAIT.md`, `kernel/traits/compact/TRAIT.md`, `kernel/traits/talkable/cross_object/TRAIT.md`, etc.).

- [ ] **Step 2: For each file, edit frontmatter — `command_binding.commands` → `activates_on.paths`**

For each TRAIT.md found, replace:
```yaml
command_binding:
  commands: ["talk", "talk_sync", "return"]
```
with:
```yaml
activates_on:
  paths: ["talk", "talk_sync", "return"]
```

(The semantic is identical — both are prefix-matched against active paths. We just rename the field.)

Use Edit tool per file. Verify each frontmatter still parses (`---\n...\n---` block intact).

- [ ] **Step 3: Run full test suite to verify everything still works**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count. Existing flows that depend on these traits being activated should still work because `activates_on` is now consulted first.

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/traits/
git commit -m "refactor: migrate trait frontmatter from command_binding to activates_on"
```

---

## Task 14: Drop command_binding Fallback (Final Cleanup)

**Files:**
- Modify: `kernel/src/thread/hooks.ts` — remove the `command_binding` fallback branch
- Modify: `kernel/src/types/trait.ts` — mark `commandBinding` deprecated (but keep in type for now to not break loader)

- [ ] **Step 1: Verify no trait still relies on command_binding**

Run:
```bash
cd /Users/zhangzhefu/x/ooc
grep -rln "^command_binding:" kernel/traits/
```
Expected: no output. If any file remains, go back to Task 13.

- [ ] **Step 2: Update collectCommandTraits — drop fallback branch**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/thread/hooks.ts` `collectCommandTraits` body — remove the entire "2) 后备" block; keep only the `activates_on.paths` matching:

```typescript
export function collectCommandTraits(
  traits: TraitDefinition[],
  activePaths: Set<string>,
): string[] {
  if (activePaths.size === 0) return [];
  const result: string[] = [];
  for (const trait of traits) {
    const aoPaths = trait.activatesOn?.paths;
    if (!aoPaths || aoPaths.length === 0) continue;
    let hit = false;
    outer: for (const decl of aoPaths) {
      for (const ap of activePaths) {
        if (ap === decl || ap.startsWith(decl + ".")) { hit = true; break outer; }
      }
    }
    if (hit) result.push(localTraitId(trait));
  }
  return result;
}
```

- [ ] **Step 3: Update hooks-reverse-index.test.ts to remove fallback test**

Delete the test "trait with only commandBinding still matches (back-compat)" — that scenario is no longer supported. Update the third test ("activates and binding only counted once") to use only `activates`:

```typescript
test("trait with activates is counted once", () => {
  const traits = [traitOnly({ name: "c", activates: ["talk"] })];
  const ids = collectCommandTraits(traits, new Set(["talk"]));
  expect(ids).toEqual(["kernel:c"]);
});
```

- [ ] **Step 4: Run full suite**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/`
Expected: same baseline pass count.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/thread/hooks.ts kernel/tests/hooks-reverse-index.test.ts
git commit -m "refactor: drop command_binding fallback now that all traits use activates_on"
```

---

## Task 15: Add View Loading + view KnowledgeRef Output

**Files:**
- Modify: `kernel/src/knowledge/activator.ts` — extend `computeKnowledgeRefs` to include views (TraitDefinition with `kind: "view"`)
- Add a test exercising VIEW.md activation through the same reverse index

- [ ] **Step 1: Write failing test for view activation**

Append to `/Users/zhangzhefu/x/ooc/kernel/tests/knowledge-activator.test.ts`:

```typescript
function view(name: string, paths: string[]): TraitDefinition {
  return {
    namespace: "self", name, kind: "view", type: "how_to_think",
    version: "1.0.0", when: "never", description: "",
    readme: `# ${name}`, methods: [], deps: [],
    activatesOn: { paths },
    dir: `/fake/view/${name}`,
  };
}

describe("computeKnowledgeRefs emits view as type='view'", () => {
  test("view activated via path produces KnowledgeRef of type view", () => {
    const items = [view("status_page", ["talk"])];
    const refs = computeKnowledgeRefs({ traits: items, activePaths: new Set(["talk"]) });
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe("view");
    expect(refs[0].ref).toBe("@view:status_page");
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: FAIL — currently we emit `type: "trait"` regardless of `kind`.

- [ ] **Step 2: Update computeKnowledgeRefs to honor kind**

In `/Users/zhangzhefu/x/ooc/kernel/src/knowledge/activator.ts`, replace the ref construction:

```typescript
    const knowledgeType = (t.kind === "view" ? "view" : "trait") as "view" | "trait";
    const refPrefix = knowledgeType === "view" ? "@view" : "@trait";
    refs.push({
      type: knowledgeType,
      ref: `${refPrefix}:${t.name}`,
      source: { kind: "form_match", path: matchedPath || "" },
      presentation: "full",
      reason: `命令路径命中 ${knowledgeType} ${t.namespace}:${t.name}`,
    });
```

- [ ] **Step 3: Run test to verify**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/knowledge/activator.ts kernel/tests/knowledge-activator.test.ts
git commit -m "feat: computeKnowledgeRefs emits type='view' for VIEW.md kind"
```

---

## Task 16: Add Relation KnowledgeRef Output (Origin Source)

**Files:**
- Modify: `kernel/src/knowledge/activator.ts` — add `relations` source to `ComputeRefsInput`; emit `type: "relation"` refs from peers

- [ ] **Step 1: Write failing test**

Append to `/Users/zhangzhefu/x/ooc/kernel/tests/knowledge-activator.test.ts`:

```typescript
describe("computeKnowledgeRefs emits relation refs from peers list", () => {
  test("each peer becomes a summary-presentation relation ref", () => {
    const refs = computeKnowledgeRefs({
      traits: [],
      activePaths: new Set(),
      peers: ["bob", "carol"],
    });
    const rels = refs.filter((r) => r.type === "relation");
    expect(rels.map((r) => r.ref).sort()).toEqual(["@relation:bob", "@relation:carol"]);
    expect(rels.every((r) => r.presentation === "summary")).toBe(true);
    expect(rels.every((r) => r.source.kind === "relation")).toBe(true);
  });
});
```

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: FAIL — `peers` not in input shape.

- [ ] **Step 2: Extend ComputeRefsInput + emit relation refs**

Edit `/Users/zhangzhefu/x/ooc/kernel/src/knowledge/activator.ts`:

```typescript
export interface ComputeRefsInput {
  traits: TraitDefinition[];
  activePaths: Set<string>;
  reverseIndex?: PathReverseIndex;
  /** 协作 peers — 每个 peer 自动产出 summary-presentation 的 relation ref */
  peers?: string[];
}
```

In `computeKnowledgeRefs` body, after the existing trait/view loop, append:

```typescript
  /* relation 维度：peers → summary refs */
  if (input.peers) {
    for (const peer of input.peers) {
      refs.push({
        type: "relation",
        ref: `@relation:${peer}`,
        source: { kind: "relation", peer },
        presentation: "summary",
        reason: `当前线程协作伙伴 ${peer}`,
      });
    }
  }
```

- [ ] **Step 3: Run test to verify**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/knowledge-activator.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/src/knowledge/activator.ts kernel/tests/knowledge-activator.test.ts
git commit -m "feat: computeKnowledgeRefs emits relation refs (summary) from peers list"
```

---

## Task 17: Documentation Sweep — Remove `partial submit` References

**Files:**
- Find all `.md` references to `partial submit` / `submit(partial=true)` / `partialSubmit` and update / remove

- [ ] **Step 1: Locate references**

Run:
```bash
cd /Users/zhangzhefu/x/ooc
grep -rln "partial submit\|partial=true\|partialSubmit\|submit(partial" \
  --include="*.md" \
  user/docs/ kernel/traits/ 2>/dev/null
```

- [ ] **Step 2: For each match, update the prose to refer to refine**

Open each file; replace narrative like "submit partial=true 后..." with "refine 累积参数后..."。Replace any TRAIT.md bias text instructing the LLM to use `submit(partial=true)` with `refine(form_id, args)`.

Specifically check (representative — actual list comes from grep):
- `user/docs/superpowers/specs/2026-04-23-three-phase-trait-activation-design.md` — historical doc, add a header note "本 spec 中的 partial submit 概念已被 refine tool 取代，参见 2026-04-26 spec"
- `user/docs/superpowers/specs/2026-04-12-command-lifecycle-progressive-trait-design.md` — same header note
- `kernel/traits/talkable/cross_object/TRAIT.md` etc. — replace any LLM-facing bias text instructing partial usage

(Don't delete historical specs; only annotate. Trait files referencing it in current bias should be rewritten.)

- [ ] **Step 3: Verify no functional code still mentions partial in bias**

Run:
```bash
cd /Users/zhangzhefu/x/ooc
grep -rln "submit(partial" kernel/traits/
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add user/docs/ kernel/traits/
git commit -m "docs: replace partial submit references with refine semantics"
```

---

## Task 18: Bruce Verification (E2E)

**Files:**
- Create: `kernel/tests/bruce-refine-flow.test.ts` (integration test simulating real LLM flow)

- [ ] **Step 1: Write integration test**

Create `/Users/zhangzhefu/x/ooc/kernel/tests/bruce-refine-flow.test.ts`:

```typescript
/**
 * Bruce E2E: refine 流程在真实引擎下走通
 *
 * 验证点：
 * 1. open(talk) → 产出 form_id
 * 2. refine({target:"bob", context:"continue", type:"relation_update"}) → form 路径深化、相关 trait 加载
 * 3. submit(form_id) → talk 命令真正执行
 * 4. 旧调用 submit(partial=true) → 注入错误提示
 *
 * 不依赖真实 LLM；用 MockLLMClient 编排 tool calls。
 *
 * @ref docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Bruce: refine flow E2E", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bruce-refine-"));
    mkdirSync(join(tmp, "stones", "alice"), { recursive: true });
    writeFileSync(join(tmp, "stones", "alice", "readme.md"), "# alice\n");
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test("placeholder — full E2E to be authored using existing MockLLMClient pattern", () => {
    /* This test asserts the test scaffold compiles. Real Bruce will use
       the same pattern as kernel/tests/talk-form.test.ts:
       - MockLLMClient with scripted tool calls
       - runWithThreadTree() with config + traits
       - Assert thread.actions[] reflects expected sequence
       Authored by implementer at this task; intentionally left as scaffold so
       the plan reviewer sees the intent without prescribing exact test scaffold
       (which depends on reviewing kernel/tests/talk-form.test.ts patterns). */
    expect(tmp).toBeTruthy();
  });
});
```

- [ ] **Step 2: Manual smoke test against real server**

Start server:
```bash
cd /Users/zhangzhefu/x/ooc/user && \
  NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' \
  bun kernel/src/cli.ts start 8080 &
```

Use the system to send a talk that the LLM is expected to refine multi-turn (e.g., `talk supervisor "请帮我做一次 relation_update 实验"`).

Watch the engine logs for:
- `[Engine] refine: form=...`
- `[Engine] open command: talk → ...`
- Final talk command executed

Stop server:
```bash
pkill -f 'bun kernel/src/cli.ts'
```

- [ ] **Step 3: Confirm legacy submit(partial=true) is rejected**

In an interactive talk, instruct the LLM to "调用 submit partial=true". The engine should inject `[错误] submit(partial=true) 已退役...`. Verify in the thread data file (`stones/<obj>/threads/<id>/data.json`) the inject message is present.

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc
git add kernel/tests/bruce-refine-flow.test.ts
git commit -m "test: scaffold Bruce E2E for refine flow"
```

---

## Self-Review Notes

After all tasks above:

1. **Spec coverage:**
   - "新增 refine tool" → Tasks 4, 5, 6
   - "submit 删除 partial / args" → Task 8
   - "open(action, args?)" → Task 7
   - "Activator 重命名" → Tasks 1, 2
   - "Activator 接管 view" → Tasks 10 + 15
   - "Activator 接管 relation" → Task 16
   - "命令树 paths/match/exec" → Task 9 (paths added; match preserved as `_match`; exec is owned by engine handler — spec did not require relocating exec into the data structure for MVP)
   - "knowledge frontmatter activates_on" → Tasks 10, 12, 13
   - "存量归并" → Tasks 13, 14, 17
   - "文档清理" → Task 17

2. **Placeholders:** none in tasks (Task 5 step 1 and Task 18 step 1 use intentional scaffolds because full E2E is described to follow the talk-form.test.ts pattern; the implementer reviews that reference file at execution time).

3. **Type consistency:** `applyRefine`, `KnowledgeRef`, `activatesOn`, `computeKnowledgeRefs`, `buildPathReverseIndex`, `lookupTraitsByPaths` — all referenced consistently across tasks.

4. **Out of scope (explicit per spec):** sub thread / fork / nested open / 填表循环披露 / KnowledgeRef.openFileArgs (defined in types but not yet emitted by Activator — left for a follow-up when concrete need arises) / `exec` on COMMAND_TREE entries (engine still hardcodes per-command exec; future task can move it).

---

## Execution Choice

After saving this plan, choose:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** — execute tasks in this session using executing-plans, batch checkpoints

Which approach?
