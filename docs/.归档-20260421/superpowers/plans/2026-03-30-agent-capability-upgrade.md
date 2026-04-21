# OOC Agent 能力升级 — Phase 0 + Phase 1 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OOC 对象通过工具 Trait 获得文件操作、搜索、Shell、Git、HTTP 能力，达到与 Claude Code 同等的通用任务执行能力。

**Architecture:** Phase 0 扩展基础设施（MethodContext、loader、registry），Phase 1 在此基础上实现 5 个工具 Trait（file_ops, file_search, shell_exec, git_ops, http_client）并优化 Stones 配置。所有工具 Trait 通过 `[program]` 中的函数调用使用，遵循现有 Trait 开发模式（readme.md + index.ts）。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-03-30-agent-capability-upgrade-design.md`

---

## Chunk 1: Phase 0 — 基础设施准备

### Task 1: 扩展 MethodContext 接口

**Files:**
- Modify: `kernel/src/trait/registry.ts:15-28` (MethodContext interface)
- Modify: `kernel/src/flow/thinkloop.ts:862-881` (MethodContext 构建)
- Modify: `kernel/tests/trait.test.ts` (新增测试)

- [ ] **Step 1: 在 registry.ts 中扩展 MethodContext 接口**

在 `kernel/src/trait/registry.ts` 的 MethodContext 接口中新增三个字段：

```typescript
interface MethodContext {
  readonly data: Record<string, unknown>;
  getData(key: string): unknown;
  setData(key: string, value: unknown): void;
  print(...args: unknown[]): void;
  readonly sessionId: string;
  readonly filesDir: string;
  // 新增
  readonly rootDir: string;      // world_dir（用户仓库根目录）
  readonly selfDir: string;      // stones/{name}/（对象自身目录）
  readonly stoneName: string;    // 对象名称
}
```

- [ ] **Step 2: 在 thinkloop.ts 中填充新字段**

在 `kernel/src/flow/thinkloop.ts` 构建 methodCtx 的位置（约 line 864）。`runThinkLoop` 没有 `world` 参数，但有 `stoneDir: string`。`rootDir` 可以从 `stoneDir` 推导（stone 目录是 `{rootDir}/stones/{name}/`，所以 `rootDir = resolve(stoneDir, "../..")`）。`stoneName` 从 `stoneDir` 的最后一段目录名提取。

```typescript
import { resolve, basename } from "node:path";

// 在 methodCtx 构建处：
const rootDir = resolve(stoneDir, "../..");
const stoneName = basename(stoneDir);

const methodCtx: MethodContext = Object.defineProperty(
  {
    setData: (key: string, value: unknown) => { flow.setFlowData(key, value); },
    getData: (key: string) => {
      const flowData = flow.toJSON().data;
      if (key in flowData) return flowData[key];
      return stone.data[key];
    },
    print: printFn,
    sessionId: flow.sessionId,
    filesDir: flow.filesDir,
    // 新增
    rootDir,
    selfDir: stoneDir,
    stoneName,
  } as MethodContext,
  "data",
  { get: () => getMergedData(), enumerable: true },
);
```

- [ ] **Step 3: 写测试验证新字段**

在 `kernel/tests/trait.test.ts` 中新增测试：

```typescript
import { describe, test, expect } from "bun:test";

describe("MethodContext 扩展字段", () => {
  test("buildSandboxMethods 传递 rootDir/selfDir/stoneName", () => {
    const registry = new MethodRegistry();
    // 注册一个测试方法，验证 ctx 中包含新字段
    registry.registerAll([{
      name: "test_trait",
      when: "always",
      description: "test",
      readme: "",
      methods: [{
        name: "checkCtx",
        description: "检查 ctx 字段",
        params: [],
        fn: async (ctx: MethodContext) => ({
          rootDir: ctx.rootDir,
          selfDir: ctx.selfDir,
          stoneName: ctx.stoneName,
        }),
        needsCtx: true,
      }],
      deps: [],
    }]);

    const ctx: MethodContext = {
      data: {},
      getData: () => undefined,
      setData: () => {},
      print: () => {},
      sessionId: "test-task",
      filesDir: "/tmp/files",
      rootDir: "/Users/test/ooc",
      selfDir: "/Users/test/ooc/stones/supervisor",
      stoneName: "supervisor",
    };

    const sandbox = registry.buildSandboxMethods(ctx);
    const result = await sandbox.checkCtx();
    expect(result).toEqual({
      rootDir: "/Users/test/ooc",
      selfDir: "/Users/test/ooc/stones/supervisor",
      stoneName: "supervisor",
    });
  });
});
```

- [ ] **Step 4: 运行测试验证**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add kernel/src/trait/registry.ts kernel/src/flow/thinkloop.ts kernel/tests/trait.test.ts
git commit -m "feat: 扩展 MethodContext 接口，新增 rootDir/selfDir/stoneName 字段"
```

---

### Task 2: _traits_ref 加载机制

**Files:**
- Modify: `kernel/src/world/world.ts:1014-1021` (_loadTraits 方法)
- Modify: `kernel/src/trait/loader.ts` (新增 loadTraitsByRef 辅助函数)
- Modify: `kernel/tests/trait.test.ts` (新增测试)

注意：`user/library/traits/` 目录已存在（空目录），不需要创建。

**架构决策**：`_traits_ref` 过滤在 `world.ts:_loadTraits` 中实现，而非修改 `loadAllTraits`。原因：
- `_loadTraits` 接收 `Stone` 对象，可以读取 `stone.data._traits_ref`
- `loadAllTraits` 只接收目录路径，无法访问 stone 数据
- 保持 `loadAllTraits` 的职责单一（只负责从目录加载）

**实现方案**：在 `loader.ts` 中新增 `loadTraitsByRef` 函数，只加载指定名称的 trait。在 `world.ts:_loadTraits` 中，根据 `stone.data._traits_ref` 决定 library trait 的加载方式：
- 如果 `_traits_ref` 存在且为数组：只加载引用的 library trait
- 如果 `_traits_ref` 不存在：不加载任何 library trait（默认行为变更：从"加载全部"改为"不加载"）

- [ ] **Step 1: 写测试 — loadTraitsByRef 只加载指定 trait**

在 `kernel/tests/trait.test.ts` 中新增测试：

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadTraitsByRef } from "../src/trait/loader";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/traits_ref_test");

beforeAll(() => {
  // 创建模拟 library/traits/ 目录，包含两个 trait
  mkdirSync(join(FIXTURE_DIR, "lib_traits/trait_a"), { recursive: true });
  writeFileSync(join(FIXTURE_DIR, "lib_traits/trait_a/readme.md"),
    "---\nwhen: always\ndescription: 'Trait A'\n---\n# Trait A");

  mkdirSync(join(FIXTURE_DIR, "lib_traits/trait_b"), { recursive: true });
  writeFileSync(join(FIXTURE_DIR, "lib_traits/trait_b/readme.md"),
    "---\nwhen: always\ndescription: 'Trait B'\n---\n# Trait B");
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe("_traits_ref 加载机制", () => {
  test("loadTraitsByRef 只加载指定名称的 trait", async () => {
    const libDir = join(FIXTURE_DIR, "lib_traits");
    const traits = await loadTraitsByRef(libDir, ["trait_a"]);
    expect(traits.length).toBe(1);
    expect(traits[0].name).toBe("trait_a");
  });

  test("loadTraitsByRef 引用不存在的 trait 时跳过", async () => {
    const libDir = join(FIXTURE_DIR, "lib_traits");
    const traits = await loadTraitsByRef(libDir, ["trait_a", "nonexistent"]);
    expect(traits.length).toBe(1);
    expect(traits[0].name).toBe("trait_a");
  });

  test("loadTraitsByRef 空数组返回空", async () => {
    const libDir = join(FIXTURE_DIR, "lib_traits");
    const traits = await loadTraitsByRef(libDir, []);
    expect(traits.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait.test.ts`
Expected: 新测试 FAIL（loadTraitsByRef 尚未实现）

- [ ] **Step 3: 在 loader.ts 中实现 loadTraitsByRef**

在 `kernel/src/trait/loader.ts` 中新增函数：

```typescript
/**
 * 按名称列表加载指定的 trait（用于 _traits_ref 机制）
 * @param traitsDir - trait 所在的父目录（如 library/traits/）
 * @param refs - 要加载的 trait 名称列表
 */
export async function loadTraitsByRef(
  traitsDir: string,
  refs: string[],
): Promise<TraitDefinition[]> {
  const results: TraitDefinition[] = [];
  for (const name of refs) {
    const traitDir = join(traitsDir, name);
    if (!existsSync(traitDir)) continue;
    const trait = await loadTrait(traitDir, name);
    if (trait) results.push(trait);
  }
  return results;
}
```

- [ ] **Step 4: 修改 world.ts 的 _loadTraits 方法**

在 `kernel/src/world/world.ts` 的 `_loadTraits` 方法中，用 `_traits_ref` 控制 library trait 加载：

```typescript
private async _loadTraits(stone: Stone) {
  const kernelTraitsDir = join(this._rootDir, "kernel", "traits");
  const libraryTraitsDir = join(this._rootDir, "library", "traits");
  const objectTraitsDir = join(stone.dir, "traits");

  // 读取 _traits_ref：只加载引用的 library trait
  const traitsRef: string[] = Array.isArray(stone.data._traits_ref)
    ? stone.data._traits_ref
    : [];

  // 三层加载：kernel（全部）→ library（按 _traits_ref）→ object（全部）
  const traits = await loadAllTraits(objectTraitsDir, kernelTraitsDir);
  // 单独加载引用的 library traits 并合并
  const libTraits = await loadTraitsByRef(libraryTraitsDir, traitsRef);

  // 合并：library trait 覆盖同名 kernel trait，object trait 覆盖同名 library trait
  const traitMap = new Map<string, TraitDefinition>();
  for (const t of traits) traitMap.set(t.name, t);  // kernel + object
  // 插入 library traits（在 kernel 之后、object 之前的优先级）
  // 需要重新组织：先 kernel，再 library，再 object
  // 简化方案：loadAllTraits 只加载 kernel + object，library 单独处理
  // 实际实现时需要调整 loadAllTraits 或在此处手动合并

  consola.info(`[World] 加载 ${traitMap.size} 个 traits (含 ${libTraits.length} 个 library ref)`);
  return Array.from(traitMap.values());
}
```

注意：实现时需要仔细处理三层优先级。最简单的方案是修改 `loadAllTraits` 调用，不传 `libraryTraitsDir`（让它只加载 kernel + object），然后手动将 `loadTraitsByRef` 的结果按正确优先级合并。

- [ ] **Step 5: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait.test.ts`
Expected: 所有测试通过

- [ ] **Step 6: 运行全部测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 所有测试通过

- [ ] **Step 7: Commit**

```bash
git add kernel/src/trait/loader.ts kernel/src/world/world.ts kernel/tests/trait.test.ts
git commit -m "feat: 支持 data.json._traits_ref 按需引用 library trait"
```

---

### Task 3: 统一错误返回类型 ToolResult<T>

**Files:**
- Create: `kernel/src/types/tool-result.ts`
- Modify: `kernel/src/types/index.ts` (如果存在，导出新类型)

- [ ] **Step 1: 创建 ToolResult 类型定义**

创建 `kernel/src/types/tool-result.ts`：

```typescript
/**
 * 工具 Trait 方法的统一返回类型
 * - ok: true 时包含 data
 * - ok: false 时包含 error 和可选的 context（帮助 LLM 修正）
 */
export type ToolResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
  context?: string;
};

/** 创建成功结果的辅助函数 */
export function toolOk<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

/** 创建失败结果的辅助函数 */
export function toolErr<T>(error: string, context?: string): ToolResult<T> {
  return { ok: false, error, context };
}
```

- [ ] **Step 2: 写测试验证 toolOk 和 toolErr**

创建 `kernel/tests/tool-result.test.ts`：

```typescript
import { describe, test, expect } from "bun:test";
import { toolOk, toolErr } from "../src/types/tool-result";
import type { ToolResult } from "../src/types/tool-result";

describe("ToolResult", () => {
  test("toolOk 创建成功结果", () => {
    const result = toolOk({ count: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.count).toBe(42);
    }
  });

  test("toolErr 创建失败结果", () => {
    const result = toolErr("文件不存在");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("文件不存在");
      expect(result.context).toBeUndefined();
    }
  });

  test("toolErr 带 context", () => {
    const result = toolErr("未找到匹配", "文件内容: ...");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.context).toBe("文件内容: ...");
    }
  });
});
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/tool-result.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: 确认导出路径**

检查 `kernel/src/types/` 下是否有 `index.ts` 统一导出，如果有则添加 `export * from "./tool-result";`。

- [ ] **Step 5: Commit**

```bash
git add kernel/src/types/tool-result.ts kernel/tests/tool-result.test.ts
git commit -m "feat: 新增 ToolResult<T> 统一错误返回类型"
```

---

### Task 4: MethodRegistry 方法可见性过滤

**Files:**
- Modify: `kernel/src/trait/registry.ts:102-112` (buildSandboxMethods)
- Modify: `kernel/src/flow/thinkloop.ts` (传递 activatedTraits)
- Modify: `kernel/tests/trait.test.ts` (新增测试)

- [ ] **Step 1: 写测试 — buildSandboxMethods 只注入已激活 Trait 的方法**

```typescript
describe("方法可见性过滤", () => {
  test("buildSandboxMethods 只注入 activatedTraits 中的方法", () => {
    const registry = new MethodRegistry();
    registry.registerAll([
      {
        name: "trait_a", when: "always", description: "", readme: "",
        methods: [{ name: "methodA", description: "", params: [], fn: async () => "a", needsCtx: false }],
        deps: [],
      },
      {
        name: "trait_b", when: "always", description: "", readme: "",
        methods: [{ name: "methodB", description: "", params: [], fn: async () => "b", needsCtx: false }],
        deps: [],
      },
    ]);

    const ctx = { /* ... minimal ctx ... */ } as MethodContext;

    // 只激活 trait_a
    const sandbox = registry.buildSandboxMethods(ctx, ["trait_a"]);
    expect(sandbox.methodA).toBeDefined();
    expect(sandbox.methodB).toBeUndefined();

    // 不传 activatedTraits 时注入全部（向后兼容）
    const sandboxAll = registry.buildSandboxMethods(ctx);
    expect(sandboxAll.methodA).toBeDefined();
    expect(sandboxAll.methodB).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait.test.ts`
Expected: FAIL（buildSandboxMethods 尚不支持过滤参数）

- [ ] **Step 3: 修改 buildSandboxMethods 增加过滤参数**

在 `kernel/src/trait/registry.ts` 中修改 `buildSandboxMethods`：

```typescript
buildSandboxMethods(
  ctx: MethodContext,
  activatedTraits?: string[],  // 可选，不传时注入全部（向后兼容）
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const result: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const filterSet = activatedTraits ? new Set(activatedTraits) : null;

  for (const [name, method] of this._methods) {
    // 如果指定了过滤列表，只注入列表中 trait 的方法
    if (filterSet && !filterSet.has(method.traitName)) continue;

    result[name] = method.needsCtx
      ? async (...args: unknown[]) => method.fn(ctx, ...args)
      : async (...args: unknown[]) => method.fn(...args);
  }

  return result;
}
```

同时更新 `registry.ts` 文件头部的注释，将原来的"关键规则：方法注册是全量的，不受 Trait 激活状态影响"改为：

```
// 关键规则：方法注册是全量的（registerAll 注册所有 trait 的方法）。
// 但 buildSandboxMethods 支持按 activatedTraits 过滤，只注入已激活 trait 的方法到沙箱。
// 这确保对象只能调用自己有权限的工具，同时保留全量注册以支持跨 trait 方法依赖。
```

- [ ] **Step 4: 修改 thinkloop.ts 传递 activatedTraits**

在 thinkloop.ts 构建 sandbox 时，将当前激活的 trait 名称列表传给 buildSandboxMethods：

```typescript
// 获取当前激活的 trait 名称
const activeTraitNames = activeTraits.map(t => t.name);
const sandboxMethods = methodRegistry.buildSandboxMethods(methodCtx, activeTraitNames);
```

需要确认 thinkloop.ts 中 `activeTraits` 变量的位置和名称。

- [ ] **Step 5: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait.test.ts`
Expected: 所有测试通过

- [ ] **Step 6: 运行全部测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 所有测试通过

- [ ] **Step 7: Commit**

```bash
git add kernel/src/trait/registry.ts kernel/src/flow/thinkloop.ts kernel/tests/trait.test.ts
git commit -m "feat: buildSandboxMethods 支持按 activatedTraits 过滤方法注入"
```

---

## Chunk 2: Phase 1 — 工具 Trait 实现（Kernel 层）

### Task 5: file_ops Trait — 文件操作

**Files:**
- Create: `kernel/traits/file_ops/readme.md`
- Create: `kernel/traits/file_ops/index.ts`
- Create: `kernel/tests/trait-file-ops.test.ts`

- [ ] **Step 1: 创建 readme.md**

创建 `kernel/traits/file_ops/readme.md`：

```yaml
---
when: always
description: "文件读写、编辑、目录操作能力"
---
```

后接 API 文档，包含每个方法的说明和使用示例。参考 `kernel/traits/web_search/readme.md` 的格式。

关键内容：
- `readFile(path, options?)` — 读取文件，默认 200 行，带行号
- `editFile(path, oldStr, newStr, options?)` — 精确字符串替换，两级容错
- `writeFile(path, content)` — 创建/覆写文件
- `listDir(path, options?)` — 列出目录
- `fileExists(path)` — 检查存在
- `deleteFile(path, options?)` — 删除

每个方法至少一个使用示例（在 `[program]` 中调用）。

- [ ] **Step 2: 写 readFile 的测试**

创建 `kernel/tests/trait-file-ops.test.ts`：

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readFile, editFile, writeFile, listDir, fileExists, deleteFile } from "../../traits/file_ops/index";

const TEST_DIR = join(import.meta.dir, "__fixtures__/file_ops_test");
const TEST_FILE = join(TEST_DIR, "sample.txt");

// 模拟 MethodContext（只需要 rootDir）
const mockCtx = { rootDir: "" } as any;  // rootDir 为空，测试中使用绝对路径

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}: content`);
  writeFileSync(TEST_FILE, lines.join("\n"));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("file_ops: readFile", () => {
  test("读取完整文件，返回带行号的内容", async () => {
    const result = await readFile(mockCtx, TEST_FILE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalLines).toBe(10);
      expect(result.data.truncated).toBe(false);
      expect(result.data.content).toContain("1: line 1: content");
    }
  });

  test("offset + limit 读取部分内容", async () => {
    const result = await readFile(mockCtx, TEST_FILE, { offset: 3, limit: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toContain("line 3");
      expect(result.data.content).toContain("line 4");
      expect(result.data.content).not.toContain("line 5");
    }
  });

  test("读取不存在的文件返回错误", async () => {
    const result = await readFile(mockCtx, "/nonexistent/file.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("不存在");
    }
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-ops.test.ts`
Expected: FAIL（readFile 尚未实现）

- [ ] **Step 4: 实现 readFile**

在 `kernel/traits/file_ops/index.ts` 中实现：

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolResult } from "../../src/types/tool-result";
import { toolOk, toolErr } from "../../src/types/tool-result";

/**
 * 读取文件内容，返回带行号的文本
 * @param path - 文件路径（相对于 rootDir 或绝对路径）
 * @param options - 可选参数：offset（起始行号，从1开始）、limit（读取行数，默认200）
 */
export async function readFile(
  ctx: any,
  path: string,
  options?: { offset?: number; limit?: number },
): Promise<ToolResult<{ content: string; totalLines: number; truncated: boolean }>> {
  const resolvedPath = resolve(ctx.rootDir, path);

  if (!existsSync(resolvedPath)) {
    return toolErr(`文件不存在: ${path}`);
  }

  try {
    const raw = await Bun.file(resolvedPath).text();
    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    const offset = (options?.offset ?? 1) - 1; // 转为 0-based
    const limit = options?.limit ?? 200;
    const sliced = allLines.slice(offset, offset + limit);
    const truncated = offset + limit < totalLines;

    // 带行号格式
    const content = sliced
      .map((line, i) => `${offset + i + 1}: ${line}`)
      .join("\n");

    return toolOk({ content, totalLines, truncated });
  } catch (e: any) {
    return toolErr(`读取失败: ${e.message}`);
  }
}
```

- [ ] **Step 5: 运行 readFile 测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-ops.test.ts`
Expected: readFile 相关测试通过

- [ ] **Step 6: 写 editFile 的测试**

在 `kernel/tests/trait-file-ops.test.ts` 中追加：

```typescript
describe("file_ops: editFile", () => {
  test("精确匹配替换", async () => {
    const tmpFile = join(TEST_DIR, "edit_test.txt");
    writeFileSync(tmpFile, "const port = 3000;\nconst host = 'localhost';");

    const result = await editFile(mockCtx, tmpFile, "const port = 3000;", "const port = 8080;");
    expect(result.ok).toBe(true);

    const content = await Bun.file(tmpFile).text();
    expect(content).toContain("const port = 8080;");
    expect(content).toContain("const host = 'localhost';");
  });

  test("trim 空白容错匹配", async () => {
    const tmpFile = join(TEST_DIR, "edit_fuzzy.txt");
    writeFileSync(tmpFile, "  hello world  \nfoo");

    const result = await editFile(mockCtx, tmpFile, "hello world", "hello ooc");
    expect(result.ok).toBe(true);

    const content = await Bun.file(tmpFile).text();
    expect(content).toContain("hello ooc");
  });

  test("未找到匹配返回错误和上下文", async () => {
    const tmpFile = join(TEST_DIR, "edit_nomatch.txt");
    writeFileSync(tmpFile, "const x = 1;\nconst y = 2;");

    const result = await editFile(mockCtx, tmpFile, "const z = 3;", "const z = 4;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("未找到匹配");
      expect(result.context).toBeDefined();
    }
  });

  test("多个匹配且 replaceAll=false 时报错", async () => {
    const tmpFile = join(TEST_DIR, "edit_multi.txt");
    writeFileSync(tmpFile, "foo\nbar\nfoo\nbaz");

    const result = await editFile(mockCtx, tmpFile, "foo", "qux");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("多个匹配");
    }
  });

  test("replaceAll=true 替换所有匹配", async () => {
    const tmpFile = join(TEST_DIR, "edit_all.txt");
    writeFileSync(tmpFile, "foo\nbar\nfoo\nbaz");

    const result = await editFile(mockCtx, tmpFile, "foo", "qux", { replaceAll: true });
    expect(result.ok).toBe(true);

    const content = await Bun.file(tmpFile).text();
    expect(content).toBe("qux\nbar\nqux\nbaz");
  });
});
```

- [ ] **Step 7: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-ops.test.ts`
Expected: editFile 测试 FAIL

- [ ] **Step 8: 实现 editFile**

在 `kernel/traits/file_ops/index.ts` 中追加 editFile 实现：

```typescript
/**
 * 精确编辑文件，替换指定字符串
 * @param path - 文件路径
 * @param oldStr - 要替换的字符串
 * @param newStr - 替换后的字符串
 * @param options - 可选：replaceAll（替换所有匹配，默认false）、fuzzyWhitespace（容忍空白差异，默认true）
 */
export async function editFile(
  ctx: any,
  path: string,
  oldStr: string,
  newStr: string,
  options?: { replaceAll?: boolean; fuzzyWhitespace?: boolean },
): Promise<ToolResult<{ matchCount: number }>> {
  const resolvedPath = resolve(ctx.rootDir, path);

  if (!existsSync(resolvedPath)) {
    return toolErr(`文件不存在: ${path}`);
  }

  try {
    let content = await Bun.file(resolvedPath).text();
    const replaceAll = options?.replaceAll ?? false;
    const fuzzy = options?.fuzzyWhitespace !== false; // 默认 true

    // 第一级：精确匹配
    let matchCount = content.split(oldStr).length - 1;

    if (matchCount === 0 && fuzzy) {
      // 第二级：trim 空白后匹配
      const trimmedOld = oldStr.trim();
      // 在文件中查找 trim 后能匹配的片段
      const lines = content.split("\n");
      // 简化实现：逐行 trim 后拼接查找
      // 实际实现需要更精细的多行匹配逻辑
      matchCount = content.split(trimmedOld).length - 1;
      if (matchCount > 0) {
        oldStr = trimmedOld; // 使用 trimmed 版本进行替换
      }
    }

    if (matchCount === 0) {
      // 返回文件中最相似的片段作为 context
      const preview = content.slice(0, 500);
      return toolErr(
        `未找到匹配: "${oldStr.slice(0, 80)}..."`,
        `文件前 500 字符:\n${preview}`,
      );
    }

    if (matchCount > 1 && !replaceAll) {
      return toolErr(
        `找到 ${matchCount} 个匹配，请使用 replaceAll: true 或提供更精确的 oldStr`,
      );
    }

    if (replaceAll) {
      content = content.replaceAll(oldStr, newStr);
    } else {
      content = content.replace(oldStr, newStr);
    }

    await Bun.write(resolvedPath, content);
    return toolOk({ matchCount: replaceAll ? matchCount : 1 });
  } catch (e: any) {
    return toolErr(`编辑失败: ${e.message}`);
  }
}
```

- [ ] **Step 9: 运行 editFile 测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-ops.test.ts`
Expected: 所有 editFile 测试通过

- [ ] **Step 10: 实现 writeFile、listDir、fileExists、deleteFile**

在 `kernel/traits/file_ops/index.ts` 中追加剩余方法。这些方法相对简单：

```typescript
/**
 * 创建或覆写文件，自动创建父目录
 * @param path - 文件路径
 * @param content - 文件内容
 */
export async function writeFile(ctx: any, path: string, content: string) { /* ... */ }

/**
 * 列出目录内容
 * @param path - 目录路径
 * @param options - 可选：recursive、includeHidden、limit
 */
export async function listDir(ctx: any, path: string, options?: any) { /* ... */ }

/**
 * 检查路径是否存在
 * @param path - 文件或目录路径
 */
export async function fileExists(ctx: any, path: string): Promise<boolean> { /* ... */ }

/**
 * 删除文件或目录
 * @param path - 文件或目录路径
 * @param options - 可选：recursive（递归删除目录，默认false）
 */
export async function deleteFile(ctx: any, path: string, options?: any) { /* ... */ }
```

- [ ] **Step 11: 写剩余方法的测试并验证通过**

在 `kernel/tests/trait-file-ops.test.ts` 中追加 writeFile、listDir、fileExists、deleteFile 的测试。

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-ops.test.ts`
Expected: 所有测试通过

- [ ] **Step 12: Commit**

```bash
git add kernel/traits/file_ops/ kernel/tests/trait-file-ops.test.ts
git commit -m "feat: 新增 file_ops Kernel Trait（readFile/editFile/writeFile/listDir/fileExists/deleteFile）"
```

---

### Task 6: file_search Trait — 文件搜索

**Files:**
- Create: `kernel/traits/file_search/readme.md`
- Create: `kernel/traits/file_search/index.ts`
- Create: `kernel/tests/trait-file-search.test.ts`

- [ ] **Step 1: 创建 readme.md**

创建 `kernel/traits/file_search/readme.md`，包含 glob 和 grep 的 API 文档和使用示例。

```yaml
---
when: always
description: "文件名模式匹配和内容搜索能力"
---
```

- [ ] **Step 2: 写 glob 的测试**

创建 `kernel/tests/trait-file-search.test.ts`：

```typescript
describe("file_search: glob", () => {
  test("匹配 **/*.ts 模式", async () => {
    // 在 TEST_DIR 下创建几个 .ts 和 .js 文件
    // 验证 glob("**/*.ts") 只返回 .ts 文件
  });

  test("忽略 node_modules 和 .git", async () => {
    // 创建 node_modules/foo.ts
    // 验证 glob 不返回它
  });

  test("limit 限制返回数量", async () => {
    // 创建 10 个文件，limit=3
    // 验证只返回 3 个
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-search.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 glob**

在 `kernel/traits/file_search/index.ts` 中实现。使用 Bun 的 `Bun.Glob` API 或 `node:fs` 递归遍历 + minimatch 匹配。

```typescript
import { Glob } from "bun";

/**
 * 按模式匹配文件名
 * @param pattern - glob 模式（如 "**\/*.ts"）
 * @param options - 可选：basePath（搜索根目录）、limit（最大返回数，默认50）、ignore（忽略模式）
 */
export async function glob(
  ctx: any,
  pattern: string,
  options?: { basePath?: string; limit?: number; ignore?: string[] },
): Promise<ToolResult<string[]>> {
  const basePath = resolve(ctx.rootDir, options?.basePath ?? ".");
  const limit = options?.limit ?? 50;
  const defaultIgnore = ["node_modules", ".git", ".存档"];
  const ignore = options?.ignore ?? defaultIgnore;

  try {
    const g = new Glob(pattern);
    const results: string[] = [];

    for await (const file of g.scan({ cwd: basePath, dot: false })) {
      // 检查是否在忽略列表中
      if (ignore.some(ig => file.includes(ig))) continue;
      results.push(file);
      if (results.length >= limit) break;
    }

    return toolOk(results);
  } catch (e: any) {
    return toolErr(`glob 搜索失败: ${e.message}`);
  }
}
```

- [ ] **Step 5: 运行 glob 测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-search.test.ts`
Expected: glob 测试通过

- [ ] **Step 6: 写 grep 的测试**

```typescript
describe("file_search: grep", () => {
  test("正则搜索文件内容", async () => {
    // 创建包含特定内容的文件
    // 验证 grep 返回正确的 file:line:content
  });

  test("glob 过滤文件类型", async () => {
    // 验证 grep 的 glob 参数只搜索匹配的文件
  });

  test("maxResults 限制", async () => {
    // 验证结果数量不超过 maxResults
  });
});
```

- [ ] **Step 7: 实现 grep**

使用 Bun 的 shell 调用 `grep -rn` 或纯 TypeScript 实现（逐文件读取 + 正则匹配）。

```typescript
/**
 * 按内容搜索文件
 * @param pattern - 正则表达式模式
 * @param options - 可选：path、glob、context、maxResults、ignoreCase
 */
export async function grep(
  ctx: any,
  pattern: string,
  options?: { path?: string; glob?: string; context?: number; maxResults?: number; ignoreCase?: boolean },
): Promise<ToolResult<Array<{ file: string; line: number; content: string }>>> {
  // 实现：使用 Bun shell 调用 rg（ripgrep）或 grep
  // 解析输出为结构化结果
  // 返回精简格式
}
```

- [ ] **Step 8: 运行 grep 测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-file-search.test.ts`
Expected: 所有测试通过

- [ ] **Step 9: Commit**

```bash
git add kernel/traits/file_search/ kernel/tests/trait-file-search.test.ts
git commit -m "feat: 新增 file_search Kernel Trait（glob/grep）"
```

---

### Task 7: shell_exec Trait — Shell 增强

**Files:**
- Create: `kernel/traits/shell_exec/readme.md`
- Create: `kernel/traits/shell_exec/index.ts`
- Create: `kernel/tests/trait-shell-exec.test.ts`

- [ ] **Step 1: 创建 readme.md**

```yaml
---
when: always
description: "执行 Shell 命令，支持自定义超时和工作目录"
---
```

包含 exec 方法的文档、使用示例和安全警告。

- [ ] **Step 2: 写测试**

```typescript
describe("shell_exec: exec", () => {
  test("执行简单命令", async () => {
    const result = await exec("echo hello");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stdout.trim()).toBe("hello");
      expect(result.data.exitCode).toBe(0);
    }
  });

  test("自定义工作目录", async () => {
    const result = await exec("pwd", { cwd: "/tmp" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stdout.trim()).toBe("/tmp");
    }
  });

  test("命令超时", async () => {
    const result = await exec("sleep 10", { timeout: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.timedOut).toBe(true);
    }
  });

  test("命令失败返回非零 exitCode", async () => {
    const result = await exec("exit 1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.exitCode).toBe(1);
    }
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-shell-exec.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 exec**

```typescript
import { $ } from "bun";

/**
 * 执行 Shell 命令
 * @param command - Shell 命令字符串
 * @param options - 可选：cwd（工作目录）、timeout（超时毫秒，默认120000）、env（环境变量）
 */
export async function exec(
  ctx: any,
  command: string,
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<ToolResult<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>> {
  const cwd = options?.cwd ?? ctx.rootDir;
  const timeout = Math.min(options?.timeout ?? 120000, 600000);

  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      env: { ...process.env, ...options?.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => proc.kill(), timeout);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const timedOut = proc.killed;

    return toolOk({ stdout, stderr, exitCode, timedOut });
  } catch (e: any) {
    return toolErr(`执行失败: ${e.message}`);
  }
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-shell-exec.test.ts`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add kernel/traits/shell_exec/ kernel/tests/trait-shell-exec.test.ts
git commit -m "feat: 新增 shell_exec Kernel Trait（exec）"
```

---

## Chunk 3: Phase 1 — Library Traits + Stones 配置 + 验证

### Task 8: git_ops Library Trait — Git 操作

**Files:**
- Create: `user/library/traits/git_ops/readme.md`
- Create: `user/library/traits/git_ops/index.ts`
- Create: `kernel/tests/trait-git-ops.test.ts`

- [ ] **Step 1: 创建 readme.md**

创建 `user/library/traits/git_ops/readme.md`：

```yaml
---
when: always
description: "Git 版本控制操作：status/diff/log/add/commit/branch/push/pull"
---
```

包含所有 git 方法的文档和使用示例。

- [ ] **Step 2: 写 gitStatus 和 gitLog 的测试**

创建 `kernel/tests/trait-git-ops.test.ts`：

```typescript
import { describe, test, expect } from "bun:test";
import { gitStatus, gitLog } from "../../library/traits/git_ops/index";

// mockCtx 指向项目根目录（需要是一个 git 仓库）
const mockCtx = { rootDir: process.cwd() } as any;

describe("git_ops: gitStatus", () => {
  test("返回当前工作区状态", async () => {
    const result = await gitStatus(mockCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveProperty("branch");
      expect(result.data).toHaveProperty("staged");
      expect(result.data).toHaveProperty("unstaged");
      expect(result.data).toHaveProperty("untracked");
    }
  });
});

describe("git_ops: gitLog", () => {
  test("返回最近提交历史", async () => {
    const result = await gitLog(mockCtx, { limit: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBeLessThanOrEqual(3);
      if (result.data.length > 0) {
        expect(result.data[0]).toHaveProperty("hash");
        expect(result.data[0]).toHaveProperty("message");
      }
    }
  });
});
```

注意：这些测试依赖当前目录是一个 git 仓库。OOC 的 user repo 是 git 仓库，所以从项目根目录运行测试时可以工作。

- [ ] **Step 3: 运行测试验证失败**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-git-ops.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现所有 git_ops 方法**

在 `user/library/traits/git_ops/index.ts` 中实现。所有方法通过 `Bun.spawn` 调用 git CLI 并解析输出：

```typescript
/**
 * 获取 Git 工作区状态
 */
export async function gitStatus(ctx: any): Promise<ToolResult<{
  staged: string[]; unstaged: string[]; untracked: string[];
  branch: string; ahead: number; behind: number;
}>> {
  // git status --porcelain=v2 --branch
  // 解析输出
}

/**
 * 查看差异
 * @param options - 可选：staged、file、base
 */
export async function gitDiff(ctx: any, options?: any): Promise<ToolResult<string>> {
  // git diff [--staged] [file] [base...]
}

/**
 * 查看提交历史
 * @param options - 可选：limit（默认10）、oneline（默认true）、file
 */
export async function gitLog(ctx: any, options?: any): Promise<ToolResult<Array<{
  hash: string; message: string; author: string; date: string;
}>>> {
  // git log --format="%H|%s|%an|%aI" -n limit [-- file]
  // 解析 | 分隔的输出
}

/**
 * 暂存文件
 * @param files - 文件路径或路径数组
 */
export async function gitAdd(ctx: any, files: string | string[]): Promise<ToolResult<null>> {
  // git add file1 file2 ...
}

/**
 * 创建提交
 * @param message - 提交消息
 */
export async function gitCommit(ctx: any, message: string): Promise<ToolResult<{ hash: string }>> {
  // git commit -m "message"
  // 解析输出获取 commit hash
}

/**
 * 创建分支
 * @param name - 分支名
 * @param options - 可选：checkout（创建后切换，默认false）
 */
export async function gitBranch(ctx: any, name: string, options?: any): Promise<ToolResult<null>> {
  // git branch name && git checkout name (if checkout)
}

/**
 * 切换分支
 * @param branch - 分支名
 */
export async function gitCheckout(ctx: any, branch: string): Promise<ToolResult<null>> {
  // git checkout branch
}

/**
 * 推送到远程
 * @param options - 可选：force、upstream
 */
export async function gitPush(ctx: any, options?: any): Promise<ToolResult<null>> {
  // git push [-f] [-u upstream]
}

/**
 * 拉取远程更新
 * @param options - 可选：rebase
 */
export async function gitPull(ctx: any, options?: any): Promise<ToolResult<null>> {
  // git pull [--rebase]
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-git-ops.test.ts`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add user/library/traits/git_ops/ kernel/tests/trait-git-ops.test.ts
git commit -m "feat: 新增 git_ops Library Trait（gitStatus/gitDiff/gitLog/gitAdd/gitCommit/gitBranch/gitCheckout/gitPush/gitPull）"
```

---

### Task 9: http_client Library Trait — HTTP 客户端

**Files:**
- Create: `user/library/traits/http_client/readme.md`
- Create: `user/library/traits/http_client/index.ts`
- Create: `kernel/tests/trait-http-client.test.ts`

- [ ] **Step 1: 创建 readme.md**

```yaml
---
when: always
description: "HTTP 请求能力：GET/POST/通用请求"
---
```

- [ ] **Step 2: 写测试**

```typescript
describe("http_client: httpGet", () => {
  test("GET 请求返回状态码和 body", async () => {
    // 使用一个可靠的公开 API（如 httpbin.org）或 mock
    const result = await httpGet(ctx, "https://httpbin.org/get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe(200);
      expect(result.data.body).toBeDefined();
    }
  });

  test("超时返回错误", async () => {
    const result = await httpGet(ctx, "https://httpbin.org/delay/10", { timeout: 1000 });
    expect(result.ok).toBe(false);
  });
});

describe("http_client: httpPost", () => {
  test("POST JSON body", async () => {
    const result = await httpPost(ctx, "https://httpbin.org/post", { key: "value" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe(200);
    }
  });
});
```

- [ ] **Step 3: 实现 httpGet、httpPost、httpRequest**

在 `user/library/traits/http_client/index.ts` 中实现。使用 Bun 原生 `fetch`：

```typescript
/**
 * 发送 GET 请求
 * @param url - 请求 URL
 * @param options - 可选：headers、timeout（默认30000）
 */
export async function httpGet(ctx: any, url: string, options?: any) {
  return httpRequest(ctx, "GET", url, options);
}

/**
 * 发送 POST 请求
 * @param url - 请求 URL
 * @param body - 请求体（字符串或对象，对象自动 JSON 序列化）
 * @param options - 可选：headers、timeout、contentType
 */
export async function httpPost(ctx: any, url: string, body: any, options?: any) {
  return httpRequest(ctx, "POST", url, { ...options, body });
}

/**
 * 发送通用 HTTP 请求
 * @param method - HTTP 方法
 * @param url - 请求 URL
 * @param options - 可选：headers、body、timeout
 */
export async function httpRequest(ctx: any, method: string, url: string, options?: any) {
  const timeout = options?.timeout ?? 30000;
  const headers: Record<string, string> = { ...options?.headers };
  let body = options?.body;

  if (body && typeof body === "object") {
    body = JSON.stringify(body);
    headers["Content-Type"] = options?.contentType ?? "application/json";
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const respBody = await resp.text();
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });

    return toolOk({ status: resp.status, headers: respHeaders, body: respBody });
  } catch (e: any) {
    return toolErr(`HTTP 请求失败: ${e.message}`);
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd /Users/zhangzhefu/x/ooc && bun test kernel/tests/trait-http-client.test.ts`
Expected: 所有测试通过（注意：需要网络连接）

- [ ] **Step 5: Commit**

```bash
git add user/library/traits/http_client/ kernel/tests/trait-http-client.test.ts
git commit -m "feat: 新增 http_client Library Trait（httpGet/httpPost/httpRequest）"
```

---

### Task 10: Stones 配置优化

**Files:**
- Modify: `user/stones/supervisor/data.json` (添加 _traits_ref)
- Modify: `user/stones/supervisor/readme.md` (增加工具使用指导)
- Modify: `user/stones/kernel/data.json`
- Modify: `user/stones/nexus/data.json`

- [ ] **Step 1: 更新 supervisor data.json**

```json
{
  "_traits_ref": ["git_ops", "http_client"],
  "_relations": []
}
```

- [ ] **Step 2: 更新 kernel data.json**

```json
{
  "_traits_ref": ["git_ops"],
  "_relations": []
}
```

- [ ] **Step 3: 更新 nexus data.json**

```json
{
  "_traits_ref": ["http_client"],
  "_relations": []
}
```

- [ ] **Step 4: 更新 supervisor readme.md**

在 supervisor 的 readme.md 中增加以下内容：

1. 在"工作方式"部分增加：
```
- 简单的文件操作、代码搜索、Shell 命令等任务，自己直接用工具完成
- 只有涉及专业判断（哲学/架构/UI 设计）的任务才委派给专业对象
```

2. 新增"工具使用示例"部分：
```
## 工具使用示例

### 读取并编辑文件
[program]
// 读取文件
const file = await readFile("kernel/src/server/config.ts");
print(file);

// 编辑文件
const result = await editFile(
  "kernel/src/server/config.ts",
  "const port = 3000;",
  "const port = 8080;",
);
print(result);

### 搜索代码
[program]
// 搜索所有使用 ThinkLoop 的文件
const results = await grep("ThinkLoop", { glob: "*.ts" });
print(results);

### 执行命令
[program]
const result = await exec("bun test kernel/tests/trait.test.ts");
print(result);

### Git 操作
[program]
const status = await gitStatus();
print(status);
await gitAdd(["kernel/src/server/config.ts"]);
await gitCommit("fix: 修改端口号为 8080");
```

- [ ] **Step 5: Commit**

```bash
git add user/stones/supervisor/ user/stones/kernel/data.json user/stones/nexus/data.json
git commit -m "feat: 优化 Stones 配置，supervisor/kernel/nexus 引用 Library Traits"
```

---

### Task 11: 全量测试 + 集成验证

**Files:**
- No new files

- [ ] **Step 1: 运行全部单元测试**

Run: `cd /Users/zhangzhefu/x/ooc && bun test`
Expected: 所有测试通过，0 failures

- [ ] **Step 2: 启动 OOC 服务器验证 Trait 加载**

Run: `cd /Users/zhangzhefu/x/ooc && bun kernel/src/cli.ts start 8080`

验证日志中显示新 Trait 被加载：
- file_ops (kernel)
- file_search (kernel)
- shell_exec (kernel)
- git_ops (library, via _traits_ref)
- http_client (library, via _traits_ref)

- [ ] **Step 3: 通过 API 向 supervisor 发送测试任务**

向 supervisor 发送消息："请读取 kernel/src/trait/registry.ts 的前 30 行"

验证：
- supervisor 使用 `readFile` 方法读取文件
- 返回带行号的内容
- 不需要自己写 `Bun.file().text()` 代码

- [ ] **Step 4: 验证 editFile 工作**

向 supervisor 发送消息："请在 kernel/traits/file_ops/readme.md 末尾添加一行注释"

验证：
- supervisor 使用 `readFile` 读取 → `editFile` 修改
- 文件被正确修改

- [ ] **Step 5: 验证方法可见性过滤**

向 sophia 发送消息："请列出你可以使用的工具方法"

验证：
- sophia 的 context 中包含 file_ops/file_search/shell_exec 的方法（因为 when: always）
- 但 sophia 的 readme bias 会让她不使用这些工具
- sophia 不应该有 git_ops/http_client 方法（因为她的 _traits_ref 为空）

- [ ] **Step 6: 记录验证结果**

将验证结果记录到 `docs/superpowers/plans/2026-03-30-agent-capability-upgrade.md` 末尾的验证记录部分。

- [ ] **Step 7: 最终 Commit**

```bash
git add kernel/traits/file_ops/ kernel/traits/file_search/ kernel/traits/shell_exec/ \
  user/library/traits/git_ops/ user/library/traits/http_client/ \
  kernel/tests/trait-file-ops.test.ts kernel/tests/trait-file-search.test.ts \
  kernel/tests/trait-shell-exec.test.ts kernel/tests/trait-git-ops.test.ts \
  kernel/tests/trait-http-client.test.ts \
  user/stones/supervisor/ user/stones/kernel/data.json user/stones/nexus/data.json
git commit -m "feat: Phase 0 + Phase 1 完成 — OOC 对象获得文件/搜索/Shell/Git/HTTP 工具能力"
```

---

## 验证记录

> 在 Task 11 完成后填写

| 验证场景 | 结果 | 备注 |
|---------|------|------|
| supervisor readFile | | |
| supervisor editFile | | |
| supervisor grep | | |
| supervisor exec | | |
| kernel gitStatus/gitCommit | | |
| nexus httpGet | | |
| sophia 不使用工具 | | |
| _traits_ref 加载 | | |
