# Trait 树形结构与 Progressive Disclosure 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OOC 的 trait 系统从扁平二级结构升级为树形结构，实现 Progressive Disclosure，将 always-on kernel trait 的 Context 注入量从 ~68KB 降至 ~5KB。

**Architecture:** trait ID 从 `namespace/name` 扩展为路径（如 `kernel/computable/output_format`），通过目录嵌套表达父子关系。loader 递归扫描构建 TraitTree，activator 实现三层加载（精简注入 → 子 trait 描述可见 → 按需激活注入），builder 按树形结构渲染 trait_catalog。

**Tech Stack:** TypeScript, Bun runtime, gray-matter (frontmatter 解析), bun:test

**Spec:** `user/docs/superpowers/specs/2026-04-04-trait-tree-design.md`

---

## Chunk 1: 类型系统 + 递归加载器

### Task 1: 扩展 TraitDefinition 类型，支持树形关系

**Files:**
- Modify: `kernel/src/types/trait.ts:75-100`

- [ ] **Step 1: 在 TraitDefinition 中添加 children 字段**

在 `kernel/src/types/trait.ts` 的 `TraitDefinition` 接口中添加两个可选字段：

```typescript
// 在 TraitDefinition 接口的 deps 字段后面添加：
  /** 子 trait 的 ID 列表（树形结构时自动填充） */
  children?: string[];
  /** 父 trait 的 ID（树形结构时自动填充） */
  parent?: string;
```

- [ ] **Step 2: 新增 TraitTree 接口**

在 `kernel/src/types/trait.ts` 末尾添加：

```typescript
/** Trait 树节点 */
export interface TraitTree {
  /** 完整 trait ID（如 "kernel/computable/output_format"） */
  id: string;
  /** TRAIT.md 的文件系统绝对路径 */
  path: string;
  /** 解析后的 trait 定义 */
  trait: TraitDefinition;
  /** 子 trait 树节点 */
  children: TraitTree[];
  /** 在树中的深度（根 = 0） */
  depth: number;
}
```

- [ ] **Step 3: 将 TraitTree 添加到 types/index.ts 导出**

在 `kernel/src/types/index.ts` 中，找到现有的 trait 类型导出区域（约 line 31-37），添加 `TraitTree`：

```typescript
// 在现有的 TraitDefinition 导出行之后添加：
export type {
  // ... existing exports ...
  TraitDefinition,
  TraitTree,       // ← 新增
} from "./trait.js";
```

- [ ] **Step 4: 运行类型检查**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun run --bun tsc --noEmit 2>&1 | head -30`
Expected: 无类型错误（新字段都是可选的）

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add src/types/trait.ts src/types/index.ts
git commit -m "feat(trait): add children/parent fields and TraitTree type for tree structure"
```

---

### Task 2: 改造 loader.ts，支持递归扫描和树形索引

**Files:**
- Modify: `kernel/src/trait/loader.ts:477-537`（`loadTraitsFromDir` + `checkIsNamespaceDir`）
- Modify: `kernel/src/trait/loader.ts:146-175`（`resolveLegacyTraitIdentity`）

- [ ] **Step 1: 在 TraitDefinition 类型中添加 dir 字段并更新 loadTrait 返回值**

先在 `kernel/src/types/trait.ts` 的 `TraitDefinition` 接口中添加（与 Task 1 的 children/parent 在同一次 commit 中完成）：

```typescript
  /** trait 目录的绝对路径 */
  dir?: string;
```

然后在 `loadTrait` 函数（约 line 40-144）的返回对象中添加 `dir: traitDir`。
当前返回值约在 line 132-143，只需在返回的对象中增加 `dir` 字段即可。

> 注意：`dir` 字段需要先定义类型再使用，所以必须在 Task 1 中一起添加，此处只是给 `loadTrait` 的返回值赋值。

- [ ] **Step 2: 改造 loadTraitsFromDir 为递归扫描**

将 `loadTraitsFromDir` 改为递归扫描。**注意：新函数需要添加 `export` 关键字**（当前函数是私有的，但测试需要直接调用它）。

核心变更：

```typescript
export async function loadTraitsFromDir(
 * 从目录递归加载所有 traits（支持树形嵌套结构）
 *
 * 目录结构：
 * traits/
 * ├── computable/              ← trait（含 TRAIT.md）
 * │   ├── TRAIT.md             ← 父 trait（精简版）
 * │   ├── output_format/       ← 子 trait
 * │   │   └── TRAIT.md
 * │   └── program_api/
 * │       └── TRAIT.md
 * └── verifiable/
 *     └── TRAIT.md
 */
async function loadTraitsFromDir(
  traitsDir: string,
  defaultNamespace: string,
  parentPath: string = "",  // 新增：父路径（用于构建多级 name）
): Promise<TraitDefinition[]> {
  if (!existsSync(traitsDir)) return [];

  const results: TraitDefinition[] = [];
  const entries = readdirSync(traitsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const entryPath = join(traitsDir, entry.name);
    const traitName = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    // 检查此目录本身是否是 trait（含 TRAIT.md/SKILL.md）
    const hasTraitFile =
      existsSync(join(entryPath, "TRAIT.md")) ||
      existsSync(join(entryPath, "SKILL.md"));

    if (hasTraitFile) {
      // 此目录是 trait，加载它
      const trait = await loadTrait(entryPath, traitName, defaultNamespace);
      if (trait) results.push(trait);
    }

    // 无论是否自身是 trait，都检查子目录是否含 trait（递归）
    const subEntries = readdirSync(entryPath, { withFileTypes: true });
    const hasSubTraits = subEntries.some(
      (sub) =>
        sub.isDirectory() &&
        !sub.name.startsWith(".") &&
        (existsSync(join(entryPath, sub.name, "TRAIT.md")) ||
          existsSync(join(entryPath, sub.name, "SKILL.md")))
    );

    if (hasSubTraits) {
      // 递归加载子 trait
      const childTraits = await loadTraitsFromDir(
        entryPath,
        defaultNamespace,
        traitName,
      );
      results.push(...childTraits);
    }
  }

  return results;
}
```

- [ ] **Step 3: 删除 checkIsNamespaceDir 函数**

`checkIsNamespaceDir` 不再需要——递归扫描逻辑内联在新的 `loadTraitsFromDir` 中。

- [ ] **Step 4: 新增 buildTraitTree 函数**

在 loader.ts 末尾添加（**注意 `export` 关键字，测试需要直接调用**）：

```typescript
/**
 * 从扁平的 TraitDefinition 列表构建树形索引
 *
 * @param traits - 所有已加载的 trait
 * @returns 根节点列表（namespace 级别）
 */
export function buildTraitTree(traits: TraitDefinition[]): TraitTree[] {
  const nodes = new Map<string, TraitTree>();

  // 创建所有节点
  for (const trait of traits) {
    const id = traitId(trait);
    const path = trait.dir || "";
    const parts = trait.name.split("/");
    nodes.set(id, {
      id,
      path,
      trait,
      children: [],
      depth: parts.length - 1,
    });
  }

  // 建立父子关系
  const roots: TraitTree[] = [];
  for (const [id, node] of nodes) {
    const parentName = node.trait.name.includes("/")
      ? node.trait.name.substring(0, node.trait.name.lastIndexOf("/"))
      : null;

    if (parentName) {
      const parentId = `${node.trait.namespace}/${parentName}`;
      const parent = nodes.get(parentId);
      if (parent) {
        parent.children.push(node);
        node.trait.parent = parentId;
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // 填充 children 字段到 TraitDefinition
  for (const [, node] of nodes) {
    if (node.children.length > 0) {
      node.trait.children = node.children.map((c) => c.id);
    }
  }

  return roots;
}
```

- [ ] **Step 5: 更新 loadTraitsByRef 支持多级路径**

当前 `loadTraitsByRef`（loader.ts lines 383-411）使用硬编码的两级路径解析：

```typescript
// 当前逻辑（line 394-398）：
if (ref.includes("/")) {
  const parts = ref.split("/");
  ns = parts[0]!;          // "library"
  traitName = parts[1]!;   // 只取了第二级 "lark"，丢失了 "doc"
  traitDir = join(traitsDir, ns, traitName);
}
```

对于 `library/lark/doc` 这样的多级路径，这会解析为 `ns="library"`, `traitName="lark"`, 丢失了 `doc`。

需要改为：第一个 `/` 分隔 namespace 和剩余路径：

```typescript
if (ref.includes("/")) {
  const slashIdx = ref.indexOf("/");
  ns = ref.substring(0, slashIdx);                     // "library"
  traitName = ref.substring(slashIdx + 1);              // "lark/doc"
  traitDir = join(traitsDir, ...traitName.split("/"));
  // 即 join(traitsDir, "lark", "doc") → library/traits/lark/doc/
}
```

注意：`traitDir` 用展开后的路径段拼接（用 `...traitName.split("/")`）。**不要**重复 `ns`——`traitsDir` 已经由调用方根据 namespace 定位到正确目录（如 `library/traits/`），`traitName` 是去掉 namespace 后的相对路径。

> 注意：`loadTraitsByRef` 当前在生产代码中未被调用（仅被测试使用），但修复应保持正确以备将来使用。

- [ ] **Step 6: 更新 loadAllTraits 以构建并缓存 TraitTree**

在 `loadAllTraits` 函数末尾（约 line 460），构建树索引并返回：

```typescript
export async function loadAllTraits(
  objectTraitsDir: string,
  kernelTraitsDir: string,
  libraryTraitsDir?: string,
): Promise<{ traits: TraitDefinition[]; tree: TraitTree[] }> {
  // ... existing loading logic ...

  const traits = Array.from(traitMap.values());
  const tree = buildTraitTree(traits);

  return { traits, tree };
}
```

- [ ] **Step 7: 更新所有 loadAllTraits 调用方**

主要调用方在 `kernel/src/world/world.ts:1040`。需要：

1. 将解构改为 `const { traits, tree } = await loadAllTraits(...)`
2. 存储 tree 到 World 实例上：`this._traitTree = tree`
3. 清理：移除 `loadTraitsByRef` 的 import（该函数在生产代码中未被调用）

```typescript
// world.ts line 1040 附近
const { traits, tree } = await loadAllTraits(objectTraitsDir, kernelTraitsDir, libraryTraitsDir);
consola.info(`[World] 加载 ${traits.length} 个 traits: ${traits.map(t => t.name).join(", ")}`);
// 存储 tree 供 context builder 使用
this._traitTree = tree;
```

- [ ] **Step 8: 传递 TraitTree 从 World → ThinkLoop → buildContext**

完整的参数链：

**a) World 类添加 `_traitTree` 属性和 import：**

在 `kernel/src/world/world.ts` 文件顶部，更新 import 语句，确保导入 `TraitTree`：

```typescript
// 在 import 区域添加（在 import { loadAllTraits, ... } from "../trait/index.js" 附近）
import type { TraitTree } from "../types/index.js";
```

在 `World` 类中添加属性声明（在其他 `_` 前缀属性附近，如 `_pauseRequests` 后面）：

```typescript
  /** trait 树形索引（loadAllTraits 后填充） */
  private _traitTree: TraitTree[] = [];
```

在 `_loadTraits` 方法中（line 1040），赋值 `this._traitTree = tree`。

**b) 更新 ThinkLoop 函数签名：**

`thinkloop` 函数（`kernel/src/flow/thinkloop.ts`）当前接收 `traits: TraitDefinition[]` 参数。
需要添加 `traitTree?: TraitTree[]` 参数。找到 `thinkloop` 函数的参数列表（约 line 107-117），添加 `traitTree` 参数。

**c) 更新 thinkloop 中的 buildContext 调用：**

在 `thinkloop.ts:253`：

```typescript
// 之前
const ctx = buildContext(stone, flow.toJSON(), directory, traits, [], stoneDir, recentHistory ?? undefined, flow.sessionDir, flow.dir);
// 之后
const ctx = buildContext(stone, flow.toJSON(), directory, traits, [], stoneDir, recentHistory ?? undefined, flow.sessionDir, flow.dir, traitTree);
```

**d) 更新 Scheduler 层传递 traitTree（关键！）**

World 不直接调用 thinkloop，而是通过 Scheduler 中转。参数链实际为：

```
World → Scheduler.register() → SchedulerEntry → runThinkLoop()
```

需要修改 `kernel/src/world/scheduler.ts`：

1. **SchedulerEntry 接口**（line 27-38）添加 `traitTree` 字段：

```typescript
interface SchedulerEntry {
  flow: Flow;
  stone: StoneData;
  stoneDir: string;
  traits: TraitDefinition[];
  traitTree: TraitTree[];        // ← 新增
  collaboration: CollaborationAPI;
  iterations: number;
  errorPropagated: boolean;
}
```

2. **register() 方法签名**（line 82-93）添加 `traitTree` 参数：

```typescript
register(
  stoneName: string,
  flow: Flow,
  stone: StoneData,
  stoneDir: string,
  traits: TraitDefinition[],
  collaboration: CollaborationAPI,
  traitTree: TraitTree[],        // ← 新增（放在最后）
): void {
  this._entries.set(stoneName, {
    flow, stone, stoneDir, traits, collaboration, traitTree, iterations: 0, errorPropagated: false,
  });
}
```

3. **runThinkLoop() 调用处**（line 138 和 line 167）传入 `entry.traitTree`：

```typescript
// line 137-149（concurrent 模式）
const promises = activeThreads.map((thread) =>
  runThinkLoop(
    entry.flow,
    entry.stone,
    entry.stoneDir,
    this._llm,
    this._directory,
    entry.traits,
    { maxIterations: 1000, ... },
    entry.collaboration,
    this._cron,
    this._flowsDir,
    entry.traitTree,    // ← 新增
  ),
);

// line 167-177（单线程模式）
const updatedData = await runThinkLoop(
  entry.flow,
  entry.stone,
  entry.stoneDir,
  this._llm,
  this._directory,
  entry.traits,
  { maxIterations: 1000, ... },
  entry.collaboration,
  this._cron,
  this._flowsDir,
  entry.traitTree,    // ← 新增
);
```

4. **World 类中所有 `scheduler.register()` 调用处**，添加 `this._traitTree` 作为最后一个参数：

搜索 `world.ts` 中所有 `scheduler.register(` 或 `this._scheduler.register(` 调用（约 line 694、839、977、1171），每个都添加 `this._traitTree` 参数。

5. 在 scheduler.ts 文件顶部添加 import：

```typescript
import type { TraitTree } from "../types/index.js";
```

> 注意：不修改 runThinkLoop 的函数签名（已经在 Step 8b 中添加了 traitTree 参数）。

- [ ] **Step 9: 更新现有测试 fixtures**

当前测试文件需要更新以适配新的 API：

**a) `kernel/tests/trait.test.ts`**：

1. 找到所有调用 `loadTraitsFromDir` 的测试用例，确认新签名（新增 `parentPath` 参数有默认值 `""`，无需修改调用方）
2. 找到所有调用 `checkIsNamespaceDir` 的测试用例，删除这些测试（函数已删除）
3. 如果测试中有硬编码的两级 namespace 遍历逻辑（如 `for each dir in kernel/traits/`），改为使用新的递归扫描结果验证

Run: `cd /Users/zhangzhefu/x/ooc/kernel && grep -n "checkIsNamespaceDir\|loadTraitsFromDir" tests/trait.test.ts`

**b) `kernel/tests/library.test.ts`（重要！）**：

该文件有 6 处 `loadAllTraits` 调用（lines 63, 83, 102, 118, 131, 144），当返回类型从 `TraitDefinition[]` 变为 `{ traits, tree }` 时全部会断。

需要将每个调用改为解构形式：

```typescript
// 之前
const traits = await loadAllTraits(objectDir, kernelDir, libraryDir);
// 之后
const { traits } = await loadAllTraits(objectDir, kernelDir, libraryDir);
```

Run: `cd /Users/zhangzhefu/x/ooc/kernel && grep -n "loadAllTraits" tests/library.test.ts`

根据搜索结果逐个更新。

- [ ] **Step 10: 运行现有测试确认不破坏**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/trait.test.ts 2>&1 | tail -20`
Expected: 所有现有测试通过

- [ ] **Step 11: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add src/trait/loader.ts src/types/trait.ts src/context/builder.ts src/world/world.ts src/flow/thinkloop.ts
git commit -m "feat(trait): recursive scanning, tree index, and multi-level path resolution"
```

---

## Chunk 2: activator + context builder 改造

### Task 3: 更新 activator.ts 支持树形 trait 激活

**Files:**
- Modify: `kernel/src/trait/activator.ts`

- [ ] **Step 1: 确保 traitId 函数支持多级 name**

当前 `traitId` 函数：
```typescript
export function traitId(trait: TraitDefinition): string {
  return `${trait.namespace}/${trait.name}`;
}
```

这已经支持多级 name（如 `kernel/computable/output_format`），因为 `name` 字段现在是完整相对路径（如 `computable/output_format`）。无需修改。

- [ ] **Step 2: 新增 getChildTraits 辅助函数**

在 activator.ts 中添加：

```typescript
/**
 * 获取指定父 trait 的子 trait 列表
 *
 * @param allTraits - 所有已加载的 trait
 * @param parentId - 父 trait ID
 * @returns 子 trait 列表
 */
export function getChildTraits(
  allTraits: TraitDefinition[],
  parentId: string,
): TraitDefinition[] {
  return allTraits.filter(
    (t) => t.parent === parentId,
  );
}
```

- [ ] **Step 3: 运行测试**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/trait.test.ts 2>&1 | tail -10`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add src/trait/activator.ts
git commit -m "feat(trait): add getChildTraits helper for tree-aware activation"
```

---

### Task 4: 更新 context/builder.ts 实现树形 trait_catalog 和精简注入

**Files:**
- Modify: `kernel/src/context/builder.ts`

- [ ] **Step 0: 更新 buildContext 函数签名接收 TraitTree**

在 `kernel/src/context/builder.ts` 中，找到 `buildContext` 函数签名（约 line 40）。添加 `traitTree?: TraitTree[]` 作为最后一个参数：

```typescript
// 之前（约 line 40）
export function buildContext(
  stone: Stone,
  flowJSON: Record<string, unknown>,
  directory: DirectoryEntry[],
  traits: TraitDefinition[],
  // ...
  sessionDir?: string,
  flowDir?: string,
): string {

// 之后
export function buildContext(
  stone: Stone,
  flowJSON: Record<string, unknown>,
  directory: DirectoryEntry[],
  traits: TraitDefinition[],
  // ...
  sessionDir?: string,
  flowDir?: string,
  traitTree?: TraitTree[],
): string {
```

同时在文件头部添加 import：`import { TraitTree } from "../types/index.js";`

> 注意：此步骤是 Task 2 Step 9c 的补充。Task 2 负责传递参数链（World → thinkloop → buildContext 调用处），此处负责 buildContext 函数本身接收并使用该参数。

- [ ] **Step 1: 修改 trait_catalog 渲染逻辑**

找到 builder.ts 中生成 `trait_catalog` 的部分。当前逻辑是平铺列出所有 trait。

改为树形展示：

```typescript
/**
 * 渲染树形 trait_catalog
 *
 * 核心规则（来自 spec）：
 * - Level 2 对 always-on 父 trait 自动生效：active parent 的所有子 trait 描述可见（无论子 trait 是否 active）
 * - inactive parent 折叠展示
 */
function renderTraitCatalog(
  allTraits: TraitDefinition[],
  activeTraitIds: Set<string>,
): string {
  const lines: string[] = [
    "## Available Traits",
    "",
    "Use this catalog to discover capabilities.",
    "Traits listed under Inactive are still available; readTrait(name) to view, activateTrait(name) to inject.",
    "",
  ];

  // 找出根 trait（没有 parent 的）
  const rootTraits = allTraits.filter((t) => !t.parent);

  // 分离 active 和 inactive 根 trait
  const rootActive = rootTraits.filter((t) => activeTraitIds.has(traitId(t)));
  const rootInactive = rootTraits.filter((t) => !activeTraitIds.has(traitId(t)));

  if (rootActive.length > 0) {
    lines.push("### Active");
    for (const t of rootActive) {
      lines.push(`- ${traitId(t)}: ${t.description}`);
      // **关键：展开所有子 trait（active + inactive），因为父 trait 是 always-on，Level 2 自动生效**
      const allChildren = allTraits.filter((t2) => t2.parent === traitId(t));
      for (const child of allChildren) {
        lines.push(`  → ${traitId(child)}: ${child.description}`);
      }
    }
    lines.push("");
  }

  if (rootInactive.length > 0) {
    lines.push("### Inactive (activateTrait to enable)");
    for (const t of rootInactive) {
      // 如果有子 trait，折叠展示
      const hasChildren = allTraits.some((t2) => t2.parent === traitId(t));
      if (hasChildren) {
        lines.push(`- ${traitId(t)}: ${t.description} → activateTrait to see sub-traits`);
      } else {
        lines.push(`- ${traitId(t)}: ${t.description}`);
      }
    }
  }

  return lines.join("\n");
}
```

**注意**：关键修改点是 active root 的子 trait 展示逻辑。之前的代码有 bug——`if (children.length === 0)` 的 else 分支只展示了 active 子 trait，遗漏了 inactive 子 trait。

正确逻辑是：**只要父 trait 是 active（always-on），其所有子 trait（无论 active/inactive）的描述都自动可见**（Level 2 自动生效）。

- [ ] **Step 2: 修改 kernel trait 注入逻辑**

在 builder.ts 中，找到注入 `[instructions.kernel/...]` 的逻辑。当前是全量注入 always-on kernel trait 的 readme。

改为只注入精简内容（readme 字段现在是精简版的 TRAIT.md 内容，不需要改代码逻辑——只需要后续精简 TRAIT.md 文件本身）。

关键是确保 builder.ts 中的 KERNEL_TRAIT_IDS 列表被更新。当前硬编码的列表包含 `cognitive-style` 和 `output_format`，需要移除这两个（它们将被删除），并确保 `computable` 在列表中。

- [ ] **Step 3: 更新 KERNEL_TRAIT_IDS 列表**

找到 builder.ts 中的 `KERNEL_TRAIT_IDS` 或类似常量。移除 `cognitive-style` 和 `output_format`，因为它们将被删除。

- [ ] **Step 4: 运行类型检查**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun run --bun tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add src/context/builder.ts src/trait/activator.ts
git commit -m "feat(context): tree-shaped trait catalog and progressive disclosure in builder"
```

---

## Chunk 3: Kernel Trait 文件拆分

### Task 5: 精简 kernel/computable TRAIT.md 并创建子 trait

**Files:**
- Create: `kernel/traits/kernel/computable/output_format/TRAIT.md`
- Create: `kernel/traits/kernel/computable/program_api/TRAIT.md`
- Create: `kernel/traits/kernel/computable/stack_api/TRAIT.md`
- Create: `kernel/traits/kernel/computable/multi_thread/TRAIT.md`
- Modify: `kernel/traits/kernel/computable/TRAIT.md`（精简到 ~2KB）

> 注意：根据探索结果，kernel traits 实际路径是 `kernel/traits/kernel/{name}/TRAIT.md`（有 `kernel/` 子目录）。

- [ ] **Step 1: 读取当前的 computable + cognitive-style + output_format TRAIT.md**

读取以下三个文件的完整内容，理解需要拆分的内容：
- `kernel/traits/kernel/computable/TRAIT.md`
- `kernel/traits/kernel/cognitive-style/TRAIT.md`
- `kernel/traits/kernel/output_format/TRAIT.md`

- [ ] **Step 2: 创建 kernel/computable/output_format 子 trait**

从 `cognitive-style` 和 `output_format` 中提取 TOML 格式规范内容，合并写入 `kernel/traits/kernel/computable/output_format/TRAIT.md`。

Frontmatter：
```yaml
---
namespace: kernel
name: computable/output_format
type: how_to_think
when: never
description: 完整 TOML 输出格式规范 — 格式说明、示例、错误模式、流式输出
deps: ["kernel/computable"]
---
```

内容：完整的 TOML 格式说明（包括各段说明、示例、常见错误、流式输出等）。

- [ ] **Step 3: 创建 kernel/computable/program_api 子 trait**

提取完整 API 参考文档（所有工具方法签名、沙箱环境变量、Trait 元编程等），写入 `kernel/traits/kernel/computable/program_api/TRAIT.md`。

Frontmatter：
```yaml
---
namespace: kernel
name: computable/program_api
type: how_to_use_tool
when: never
description: 完整 API 参考文档 — 所有工具方法、沙箱环境变量、Trait 元编程
deps: ["kernel/computable"]
---
```

- [ ] **Step 4: 创建 kernel/computable/stack_api 子 trait**

提取栈帧 API 详细说明（push/pop/reflect、契约编程、栈帧语义、Hook 等），写入 `kernel/traits/kernel/computable/stack_api/TRAIT.md`。

Frontmatter：
```yaml
---
namespace: kernel
name: computable/stack_api
type: how_to_think
when: never
description: 栈帧 API 详细说明 — push/pop/reflect、契约编程、Hook 时机
deps: ["kernel/computable"]
---
```

- [ ] **Step 5: 创建 kernel/computable/multi_thread 子 trait**

提取多线程 API（create_thread, go_thread, send_signal 等），写入 `kernel/traits/kernel/computable/multi_thread/TRAIT.md`。

Frontmatter：
```yaml
---
namespace: kernel
name: computable/multi_thread
type: how_to_use_tool
when: never
description: 多线程 API — 创建/切换线程、信号通信、fork/join
deps: ["kernel/computable"]
---
```

- [ ] **Step 6: 精简 kernel/computable/TRAIT.md**

将 `kernel/traits/kernel/computable/TRAIT.md` 精简为 ~2KB。只保留：
1. 输出格式速查表
2. 核心输出规则（5 条）
3. 核心 API 签名列表
4. 工具方法优先级
5. 子 trait 列表指向

删除所有详细示例、反模式、完整参数说明、TOML 演变历史等。

- [ ] **Step 7: 验证文件结构**

Run: `find /Users/zhangzhefu/x/ooc/kernel/traits/kernel/computable -name 'TRAIT.md' | sort`
Expected:
```
kernel/traits/kernel/computable/TRAIT.md
kernel/traits/kernel/computable/multi_thread/TRAIT.md
kernel/traits/kernel/computable/output_format/TRAIT.md
kernel/traits/kernel/computable/program_api/TRAIT.md
kernel/traits/kernel/computable/stack_api/TRAIT.md
```

- [ ] **Step 8: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add traits/kernel/computable/
git commit -m "feat(trait): split kernel/computable into parent + 4 sub-traits"
```

---

### Task 6: 精简 kernel/talkable TRAIT.md 并创建子 trait

**Files:**
- Create: `kernel/traits/kernel/talkable/cross_object/TRAIT.md`
- Create: `kernel/traits/kernel/talkable/ooc_links/TRAIT.md`
- Create: `kernel/traits/kernel/talkable/delivery/TRAIT.md`
- Modify: `kernel/traits/kernel/talkable/TRAIT.md`（精简到 ~1KB）

- [ ] **Step 1: 读取当前 talkable TRAIT.md**

读取 `kernel/traits/kernel/talkable/TRAIT.md` 的完整内容。

- [ ] **Step 2: 创建 kernel/talkable/cross_object 子 trait**

提取跨对象函数调用协议、多轮对话流程等。

Frontmatter：
```yaml
---
namespace: kernel
name: talkable/cross_object
type: how_to_interact
when: never
description: 跨对象函数调用协议 — 多轮对话流程、调用方/被调用方规范
deps: ["kernel/talkable"]
---
```

- [ ] **Step 3: 创建 kernel/talkable/ooc_links 子 trait**

提取 ooc:// 协议、导航卡片格式等。

- [ ] **Step 4: 创建 kernel/talkable/delivery 子 trait**

提取交付规范、协作交付、消息中断与恢复等。

- [ ] **Step 5: 精简 kernel/talkable/TRAIT.md**

精简为 ~1KB，只保留：talk() 签名、社交原则、回复规则。

更新 deps 从 `["kernel/output_format"]` 改为 `["kernel/computable"]`。

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add traits/kernel/talkable/
git commit -m "feat(trait): split kernel/talkable into parent + 3 sub-traits"
```

---

### Task 7: 精简 kernel/reflective TRAIT.md 并创建子 trait

**Files:**
- Create: `kernel/traits/kernel/reflective/memory_api/TRAIT.md`
- Create: `kernel/traits/kernel/reflective/reflect_flow/TRAIT.md`
- Modify: `kernel/traits/kernel/reflective/TRAIT.md`（精简到 ~800B）

- [ ] **Step 1: 读取当前 reflective TRAIT.md**

- [ ] **Step 2: 创建 kernel/reflective/memory_api 子 trait**

提取记忆 API 详细文档（getMemory, updateMemory, Flow Summary 等）。

- [ ] **Step 3: 创建 kernel/reflective/reflect_flow 子 trait**

提取 ReflectFlow 角色定义和工作方式。

- [ ] **Step 4: 精简 kernel/reflective/TRAIT.md**

精简为 ~800B，只保留：记忆三层模型概述、reflect() 签名、记忆维护原则。

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add traits/kernel/reflective/
git commit -m "feat(trait): split kernel/reflective into parent + 2 sub-traits"
```

---

### Task 8: 删除旧 trait + 更新所有引用

**Files:**
- Delete: `kernel/traits/kernel/cognitive-style/`（整个目录）
- Delete: `kernel/traits/kernel/output_format/`（整个目录）
- Modify: 所有引用 `kernel/cognitive-style` 和 `kernel/output_format` 的 TRAIT.md

- [ ] **Step 1: 搜索所有对旧 trait ID 的引用**

Run: `cd /Users/zhangzhefu/x/ooc && grep -r "kernel/cognitive-style\|kernel/output_format" --include="*.md" --include="*.ts" user/ kernel/ | grep -v node_modules | grep -v ".git"`

- [ ] **Step 2: 更新 deps 引用**

找到所有 TRAIT.md 中 `deps: ["kernel/output_format"]` 的引用，改为 `deps: ["kernel/computable"]`。

主要是：
- `kernel/traits/kernel/talkable/TRAIT.md`（deps 中的 `kernel/output_format` → `kernel/computable`）
- `kernel/traits/kernel/plannable/TRAIT.md`（如有）
- 其他引用 `kernel/output_format` 的 trait

- [ ] **Step 3: 更新 builder.ts 中的硬编码列表**

确保 builder.ts 中的 KERNEL_TRAIT_IDS 不再包含 `cognitive-style` 和 `output_format`。

- [ ] **Step 4: 删除旧目录**

```bash
rm -rf /Users/zhangzhefu/x/ooc/kernel/traits/kernel/cognitive-style
rm -rf /Users/zhangzhefu/x/ooc/kernel/traits/kernel/output_format
```

- [ ] **Step 5: 运行完整测试**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add -A
git commit -m "feat(trait): remove kernel/cognitive-style and kernel/output_format, update all refs"
```

---

## Chunk 4: Library Trait 树形化

### Task 9: 创建 library/lark 路由层 trait

**Files:**
- Create: `user/library/traits/lark/TRAIT.md`

- [ ] **Step 1: 创建 library/lark/TRAIT.md 路由层**

```yaml
---
namespace: library
name: lark
type: how_to_use_tool
when: never
description: 飞书全域能力（文档/知识库/IM/日历/邮件/表格/任务/云空间/会议/妙记/通讯录/画板/事件订阅）
deps: ["library/lark/shared"]
---
```

内容：飞书能力概览，引导对象到正确的子 trait。

- [ ] **Step 2: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/user
git add library/traits/lark/TRAIT.md
git commit -m "feat(trait): add library/lark routing trait"
```

---

### Task 10: 更新所有 library trait ID

**Files:**
- Modify: 所有 `user/library/traits/lark/*/TRAIT.md` 的 frontmatter
- Modify: 所有 `user/library/traits/http/*/TRAIT.md`、`git/*/TRAIT.md` 的 frontmatter

- [ ] **Step 1: 批量更新 lark 子 trait 的 namespace**

对每个 `user/library/traits/lark/*/TRAIT.md`，将 frontmatter 中的：
- `namespace: lark` 改为 `namespace: library`
- `name: doc` 改为 `name: lark/doc`（或对应的子目录名）

示例变更（`lark/doc/TRAIT.md`）：
```yaml
# 之前
namespace: lark
name: doc

# 之后
namespace: library
name: lark/doc
```

- [ ] **Step 2: 更新 http/client trait**

`namespace: http` → `namespace: library`，`name: client` 保持不变。

- [ ] **Step 3: 更新 git/ops trait**

`namespace: git` → `namespace: library`，`name: ops` 保持不变。

- [ ] **Step 4: 检查其他 library trait 的 namespace**

确保 `agent/browser`、`sessions/index`、`news/aggregator`、`ai/text-deodorizer`、`prd/assistant`、`session/kanban` 等都使用 `namespace: library`。

- [ ] **Step 5: 更新 lark 子 trait 的 deps 字段**

每个 lark 子 trait 的 frontmatter `deps` 字段可能引用旧的 trait ID（如 `deps: ["lark/shared"]`），需要更新为新的 ID：

- `deps: ["lark/shared"]` → `deps: ["library/lark/shared"]`
- `deps: ["lark/doc"]` → `deps: ["library/lark/doc"]`
- 所有 `lark/*` → `library/lark/*`

- [ ] **Step 6: 处理 library/traits/superpowers/ 目录**

检查 `user/library/traits/superpowers/` 目录。该目录包含 ~14 个使用 `readme.md`（而非 TRAIT.md）的 superpowers trait。

这些是 Claude Code superpowers 插件系统的配置，**不参与 OOC trait 加载机制**（它们不是 OOC 的 trait 系统，而是 Claude Code 的 skill 系统）。因此：
- 不要修改这些文件
- 确认 `loadTraitsFromDir` 递归扫描会跳过不含 TRAIT.md/SKILL.md 的目录（当前逻辑已正确跳过）

Run: `ls /Users/zhangzhefu/x/ooc/user/library/traits/superpowers/ 2>/dev/null | head -5`
Expected: 列出 superpowers 子目录，但这些目录使用 `readme.md` 而非 `TRAIT.md`

- [ ] **Step 7: 搜索并更新所有代码中的旧 trait ID 引用**

Run: `cd /Users/zhangzhefu/x/ooc && grep -r "\"lark/" --include="*.ts" --include="*.md" user/ | grep -v node_modules | grep -v ".git"`

确保没有代码引用旧的 `lark/doc` 等 ID。

- [ ] **Step 8: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/user
git add library/traits/
git commit -m "feat(trait): update all library trait IDs to library/ namespace with tree paths"
```

---

## Chunk 5: thinkloop.ts 中的 findTraitDir 更新

### Task 11: 更新 findTraitDir 支持多级路径

**Files:**
- Modify: `kernel/src/flow/thinkloop.ts`（findTraitDir 函数）

- [ ] **Step 1: 定位并读取 findTraitDir 函数**

读取 thinkloop.ts 中 `findTraitDir`、`normalizeTraitLookup`、`findLoadedTrait` 函数的实现。

- [ ] **Step 2: 更新 findTraitDir 支持多级路径**

当前逻辑是搜索 `traits/{name}/` 目录。需要改为支持多级路径解析：

对于 `kernel/computable/output_format`：
1. 去掉 `kernel/` 前缀 → `computable/output_format`
2. 在 kernel traits dir 中查找 `kernel/traits/kernel/computable/output_format/`

对于 `library/lark/doc`：
1. 去掉 `library/` 前缀 → `lark/doc`
2. 在 library traits dir 中查找 `library/traits/lark/doc/`

- [ ] **Step 3: 更新 normalizeTraitLookup**

确保多级路径 ID 能正确规范化。当前支持 `namespace/name`、`namespace-name`、`name` 三种格式。

添加对多级路径的支持：`kernel/computable/output_format` 应该直接解析为 `namespace=kernel, name=computable/output_format`。

- [ ] **Step 4: 运行测试**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test 2>&1 | tail -20`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add src/flow/thinkloop.ts
git commit -m "feat(trait): update findTraitDir and normalizeTraitLookup for multi-level trait paths"
```

---

## Chunk 6: 集成测试 + Context 大小验证

### Task 12: 编写树形 trait 系统的集成测试

**Files:**
- Create: `kernel/tests/trait-tree.test.ts`

- [ ] **Step 1: 创建测试文件并编写基础加载测试**

```typescript
import { describe, test, expect } from "bun:test";
import { loadTrait, loadTraitsFromDir, buildTraitTree } from "../src/trait/loader.js";
import { traitId, getChildTraits, getActiveTraits } from "../src/trait/activator.js";

describe("Trait Tree", () => {
  test("recursive loading finds nested traits", async () => {
    // 测试 kernel/traits/kernel/ 目录下的递归加载
    const traits = await loadTraitsFromDir(
      "traits/kernel",
      "kernel"
    );
    // 应该找到 kernel/computable 和 kernel/computable/output_format 等
    const ids = traits.map(traitId);
    expect(ids).toContain("kernel/computable");
    expect(ids).toContain("kernel/computable/output_format");
    expect(ids).toContain("kernel/computable/stack_api");
  });

  test("buildTraitTree creates correct parent-child relationships", () => {
    const traits = [
      { namespace: "kernel", name: "computable", description: "core", ... },
      { namespace: "kernel", name: "computable/output_format", description: "format", parent: "kernel/computable", ... },
    ];
    const tree = buildTraitTree(traits);
    expect(tree.length).toBeGreaterThan(0);
    const computable = tree.find(n => n.id === "kernel/computable");
    expect(computable).toBeDefined();
    expect(computable!.children.length).toBeGreaterThan(0);
  });

  test("getChildTraits returns correct children", () => {
    const parentId = "kernel/computable";
    const children = getChildTraits(allTraits, parentId);
    const childIds = children.map(traitId);
    expect(childIds).toContain("kernel/computable/output_format");
  });

  test("always-on parent automatically shows children descriptions", () => {
    const active = getActiveTraits(allTraits, []);
    const computable = active.find(t => traitId(t) === "kernel/computable");
    expect(computable).toBeDefined();
    // computable 是 always-on，其子 trait 描述应可见
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/trait-tree.test.ts 2>&1`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel
git add tests/trait-tree.test.ts
git commit -m "test(trait): integration tests for tree-structured trait system"
```

---

### Task 13: 端到端验证 — 启动服务器并检查 Context 大小

**Files:**
- N/A（手动验证）

- [ ] **Step 1: 重启 OOC 服务器**

```bash
# 终止旧进程
pkill -f "cli.ts start"
# 启动新进程
cd /Users/zhangzhefu/x/ooc/user && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' bun kernel/src/cli.ts start 8080 &
```

- [ ] **Step 2: 发送测试消息触发 ThinkLoop**

通过前端或 API 发送一条 "hi" 消息给 supervisor。

- [ ] **Step 3: 检查 Pause 状态下的 llm.input.txt 大小**

找到最新的 llm.input.txt 文件并检查大小：

Run: `find /Users/zhangzhefu/x/ooc/user/flows -name "llm.input.txt" -newer /tmp -exec wc -c {} \;`

Expected: 从 ~84KB 降至 ~35KB 左右（5 大 trait 精简后 ~5KB + 其他 always-on ~14KB + 非注入 ~20KB）

- [ ] **Step 4: 验证 trait_catalog 呈树形展示**

检查 llm.input.txt 中的 `[trait_catalog]` 区域，确认：
1. lark 子 trait 被折叠为 1 行
2. kernel/computable 的子 trait 描述可见
3. 没有旧的 `kernel/cognitive-style` 或 `kernel/output_format` 出现

- [ ] **Step 5: 记录结果到文档**

将验证结果记录到 spec 文件的"验证"部分。

---

## Chunk 7: 文档更新

### Task 14: 更新相关文档

**Files:**
- Modify: `user/docs/meta.md`（更新 trait 相关描述）
- Modify: `user/docs/哲学文档/emergence.md`（记录此次涌现）

- [ ] **Step 1: 更新 meta.md 中的 trait 子树描述**

在 meta.md 的「子树 5: Trait」部分，更新为树形结构说明，包括三层 Progressive Disclosure。

- [ ] **Step 2: 更新 emergence.md**

记录此次设计决策和预期涌现：
- Progressive Disclosure 是 G5（注意力与遗忘）在系统架构层的实现
- 树形 trait 结构让对象的认知上下文可以按需展开

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/user
git add docs/meta.md docs/哲学文档/emergence.md
git commit -m "docs: update meta.md and emergence.md for trait tree architecture"
```
