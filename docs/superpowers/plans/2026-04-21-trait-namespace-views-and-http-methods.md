# 实施计划：Trait Namespace、Views 与 HTTP Methods

> 日期：2026-04-21
> Spec: `docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md`
> 状态：Draft（待 user 确认执行方式：Subagent-Driven vs Inline）
> 执行方式：TDD（红→绿→重构），每个任务先写测试再写实现
> 分支策略：建议 `feat/trait-namespace-views`，每 phase 独立 commit

---

## 执行前约定

**通用工作目录**：所有命令默认在 `/Users/zhangzhefu/x/ooc/user` 下执行，测试命令在 `kernel/` 子目录下。

**测试命令**：
- 后端：`cd kernel && bun test`
- 前端类型：`cd kernel/web && bun run tsc --noEmit`
- 服务端重启：`pkill -f "bun kernel/src/cli.ts"` 然后 `NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' bun kernel/src/cli.ts start 8080`

**TDD 循环**：每个任务遵循严格流程：
1. 写失败测试 → `bun test <测试文件>` 确认 RED
2. 最小实现 → `bun test <测试文件>` 确认 GREEN
3. 重构（保持 GREEN）
4. `bun test` 跑全量确认 0 fail
5. 提交 commit（单任务一 commit；除非任务极小）

**每阶段结束的 Gate**（必须停下来，不要跨阶段）：
- [ ] 全量 `bun test` 0 fail
- [ ] 前端 tsc 0 error（Phase 3+ 开始要求）
- [ ] 服务端可启动（Phase 3+ 开始要求）
- [ ] 手工 smoke test：Bruce 式体验（Phase 3+ 开始要求）
- [ ] 更新 `docs/meta.md` 中对应子树（如涉及结构变化）
- [ ] commit 并标记当前 phase 完成

---

## Phase 1 — Namespace 与 traitId 协议

**目标**：把 trait 的唯一键从"路径推断的 name"改为"frontmatter 显式声明的 `namespace:name`"，建立 self→kernel→library 的省略解析顺序。

**不涉及**：方法注册改造（Phase 2）、Views（Phase 3）、HTTP endpoint（Phase 4）。

### Task 1.1 扩展 TraitDefinition 类型

**修改文件**：`kernel/src/types/trait.ts`

**变更**：
- 删除旧 `namespace?: string`（可选字段）
- 新增：
  ```typescript
  export type TraitNamespace = "kernel" | "library" | "self";
  export type TraitKind = "trait" | "view";

  export interface TraitDefinition {
    namespace: TraitNamespace;   // 必填
    name: string;                // 不含 namespace 前缀
    kind: TraitKind;             // 默认 "trait"，VIEW.md 为 "view"
    // ... 其余字段保留
    llmMethods?: Record<string, TraitMethod>;   // Phase 2 填充
    uiMethods?: Record<string, TraitMethod>;    // Phase 2 填充
    // methods 字段暂保留（兼容现有加载），Phase 2 删除
  }
  ```

**测试**：暂无（纯类型变更，由下游任务间接覆盖）。

**Commit**：`refactor: 扩展 TraitDefinition 支持 namespace 和 kind`

---

### Task 1.2 改造 activator.traitId

**修改文件**：`kernel/src/trait/activator.ts`

**新写测试**：`kernel/tests/trait/traitId.test.ts`

```typescript
import { describe, it, expect } from "bun:test";
import { traitId } from "@kernel/trait/activator";

describe("traitId", () => {
  it("组装 namespace:name 格式", () => {
    expect(traitId({ namespace: "kernel", name: "computable" } as any)).toBe("kernel:computable");
    expect(traitId({ namespace: "library", name: "lark/doc" } as any)).toBe("library:lark/doc");
    expect(traitId({ namespace: "self", name: "reporter" } as any)).toBe("self:reporter");
  });
});
```

`bun test kernel/tests/trait/traitId.test.ts` → RED

**实现**：
```typescript
export function traitId(trait: TraitDefinition): string {
  return `${trait.namespace}:${trait.name}`;
}
```

→ GREEN。提交：`refactor: traitId 输出 namespace:name 格式`

---

### Task 1.3 loader 强制 frontmatter namespace + name

**修改文件**：`kernel/src/trait/loader.ts`

**新写测试**：`kernel/tests/trait/loader-namespace.test.ts`

场景：
- 三个夹具目录（`tests/fixtures/traits-namespace/{kernel,library,self}/*/TRAIT.md`），各含合法 namespace
- 非法 namespace 值（如 `user`）→ 加载时抛错并含文件路径
- 缺失 namespace → 抛错

例：
```typescript
it("reject missing namespace", async () => {
  // fixture 目录包含一份 frontmatter 仅写 `name: foo`
  await expect(loadTraitsFromDir(fixtureDir, "kernel")).rejects.toThrow(/namespace/);
});

it("reject invalid namespace", async () => {
  await expect(loadTraitsFromDir(fixtureDir, "library")).rejects.toThrow(/namespace must be one of/);
});
```

`bun test kernel/tests/trait/loader-namespace.test.ts` → RED

**实现**：
- 解析 frontmatter 后，校验 `namespace ∈ {kernel, library, self}`
- `name` 不得含 `/` 以外的非法字符，不得以 `namespace:` 前缀开头
- 三源加载函数（`loadKernelTraits` / `loadLibraryTraits` / `loadObjectTraits`）**额外校验 frontmatter 的 namespace 字段必须等于预期来源**（kernel 目录下的必须写 `namespace: kernel`，不一致就报错）
- 删除所有"从路径推断 namespace"的旧逻辑

→ GREEN。提交：`refactor: loader 强制 frontmatter 显式 namespace`

---

### Task 1.4 全量迁移 kernel/traits 的 TRAIT.md

**目标文件列表**（全量，不漏）：
```
kernel/traits/base/TRAIT.md
kernel/traits/computable/TRAIT.md
kernel/traits/computable/file_ops/TRAIT.md
kernel/traits/computable/file_search/TRAIT.md
kernel/traits/computable/program_api/TRAIT.md
kernel/traits/computable/shell_exec/TRAIT.md
kernel/traits/computable/testable/TRAIT.md
kernel/traits/computable/web_search/TRAIT.md
kernel/traits/debuggable/TRAIT.md
kernel/traits/library_index/TRAIT.md
kernel/traits/object_creation/TRAIT.md
kernel/traits/plannable/TRAIT.md
kernel/traits/plannable/kanban/TRAIT.md
kernel/traits/reflective/TRAIT.md
kernel/traits/reflective/memory_api/TRAIT.md
kernel/traits/reflective/reflect_flow/TRAIT.md
kernel/traits/reviewable/TRAIT.md
kernel/traits/talkable/TRAIT.md
kernel/traits/talkable/cross_object/TRAIT.md
kernel/traits/talkable/delivery/TRAIT.md
kernel/traits/talkable/issue-discussion/TRAIT.md
kernel/traits/talkable/ooc_links/TRAIT.md
kernel/traits/verifiable/TRAIT.md
```

**每个文件的变更**：
- `name: kernel/xxx` → `namespace: kernel` + `name: xxx`
- `deps: ["kernel/yyy"]` → `deps: ["kernel:yyy"]`（保留完整 traitId 形式，便于唯一定位）
- 保留其他字段

**示例**（before → after）：
```yaml
# before
name: kernel/computable/file_ops
deps: []
# after
namespace: kernel
name: computable/file_ops
deps: []
```

**检查命令**：
```bash
grep -rn "^name: kernel/" kernel/traits/ && echo "FAIL: 旧格式残留" || echo "OK"
grep -rn '"kernel/' kernel/traits/**/TRAIT.md && echo "FAIL: deps 旧格式残留" || echo "OK"
```

两条都必须输出 OK。

**测试**：`bun test` 全量确认加载成功。

**Commit**：`refactor(traits): kernel traits TRAIT.md 迁移到 namespace:name 格式`

---

### Task 1.5 全量迁移 library/traits 的 TRAIT.md

**目标**（library namespace 下全部 TRAIT.md）：
- `library/traits/git/` 下所有
- `library/traits/http/` 下所有
- `library/traits/lark/` 下所有
- `library/traits/news/` 下所有
- `library/traits/prd/` 下所有
- `library/traits/sessions/` 下所有
- `library/traits/superpowers/` 下所有（注意：这里的 name 是单段，如 `using-superpowers`，需补齐路径前缀）

**变更规则**：
- 既有 `name: library/xxx` → `namespace: library` + `name: xxx`
- 既有 `name: subagent-driven-development` 之类单段名（superpowers 下） → `namespace: library` + `name: superpowers/subagent-driven-development`
- `deps: ["library/xxx"]` → `deps: ["library:xxx"]`
- `deps: ["kernel/xxx"]` → `deps: ["kernel:xxx"]`

**检查**：
```bash
grep -rn "^name: library/" library/traits/ && echo "FAIL" || echo "OK"
grep -rn '"library/' library/traits/**/TRAIT.md && echo "FAIL" || echo "OK"
```

**测试**：`bun test` 全量跑通。

**Commit**：`refactor(traits): library traits TRAIT.md 迁移到 namespace:name 格式`

---

### Task 1.6 全量迁移 stones/*/traits 的 TRAIT.md

**目标**：
- `stones/supervisor/traits/reporter/TRAIT.md`（只加 frontmatter namespace+name，内容重写留 Phase 5）
- `stones/supervisor/traits/session-kanban/TRAIT.md`

**变更规则**：
- 加 `namespace: self`
- `name` 为相对名（如 `reporter`、`session-kanban`）
- deps 格式同上

**Commit**：`refactor(traits): self traits TRAIT.md 迁移到 namespace:name 格式`

---

### Task 1.7 deps 解析支持 namespace 省略（self→kernel→library）

**测试文件**：`kernel/tests/trait/resolve-trait.test.ts`

```typescript
describe("resolveTraitName (deps 省略 namespace)", () => {
  // fixture: self:foo, kernel:foo, library:foo 三者同时存在
  it("prefer self first", () => {
    expect(resolveTraitName("foo", registry, "supervisor")).toBe("self:foo");
  });
  it("fallback to kernel when self absent", () => {
    expect(resolveTraitName("bar", registry, "supervisor")).toBe("kernel:bar");
  });
  it("fallback to library when self+kernel absent", () => {
    expect(resolveTraitName("baz", registry, "supervisor")).toBe("library:baz");
  });
  it("exact namespace override", () => {
    expect(resolveTraitName("library:foo", registry, "supervisor")).toBe("library:foo");
  });
  it("return null when absent in all namespaces", () => {
    expect(resolveTraitName("doesnotexist", registry, "supervisor")).toBeNull();
  });
});
```

RED → 实现在 `kernel/src/trait/activator.ts` 或 `loader.ts`（取决于现有组织）新增 `resolveTraitName(raw, registry, stoneName)`：
- 若 raw 含 `:` → 直接作为 traitId 查表
- 否则按 `self:{raw}` → `kernel:{raw}` → `library:{raw}` 顺序查表
- 同名按顺序取第一个，不报错

→ GREEN。提交：`feat: deps 省略 namespace 按 self→kernel→library 解析`

---

### Task 1.8 调整 TraitDefinition 的消费者对齐 namespace 字段

**需修改的文件**（搜索 `trait.name` 的用法）：
- `kernel/src/thread/hooks.ts` — `collectCommandTraits` 用 traitId 而非 name
- `kernel/src/thread/form.ts` — 激活传参统一用 traitId
- `kernel/src/thread/context-builder.ts` — trait 列表渲染显示 traitId

**测试**：现有 `kernel/tests/thread/*.test.ts` 跑通；不新增。

**检查**：`bun test` 0 fail。

**Commit**：`refactor: thread 各模块改用 traitId 而非 name`

---

### Phase 1 Gate

- [ ] `cd kernel && bun test` 全绿
- [ ] `grep -rn "^name: kernel/" kernel/traits/` 空
- [ ] `grep -rn "^name: library/" library/traits/` 空
- [ ] `docs/meta.md` 的 Trait 子树提到 namespace 字段（快速补一行，详细 doc Phase 5）
- [ ] **STOP，向 user 报告：Phase 1 完成，是否进入 Phase 2**

---

## Phase 2 — callMethod 沙箱协议

**目标**：沙箱内只有 `callMethod(traitId, method, args)` 一种调用方式；方法注册从 `export methods = []` 切到 `export const llm_methods = {}` / `export const ui_methods = {}`。

**不涉及**：Views 目录（Phase 3）、HTTP endpoint（Phase 4）。

### Task 2.1 MethodRegistry 改造

**修改文件**：`kernel/src/trait/registry.ts`

**新写测试**：`kernel/tests/trait/method-registry.test.ts`

```typescript
describe("MethodRegistry", () => {
  it("key 是 (traitId, methodName) 二元组", () => {
    const r = new MethodRegistry();
    r.register("kernel:computable", "readFile", { fn: async () => "hi" } as any, "llm");
    expect(r.get("kernel:computable", "readFile", "llm")).toBeDefined();
    expect(r.get("kernel:computable", "readFile", "ui")).toBeUndefined();
  });

  it("llm 和 ui 方法严格隔离", () => {
    const r = new MethodRegistry();
    r.register("self:report", "submit", { fn: async () => {} } as any, "ui");
    expect(r.get("self:report", "submit", "ui")).toBeDefined();
    expect(r.get("self:report", "submit", "llm")).toBeUndefined();
  });

  it("buildSandboxMethods 只暴露 callMethod 单函数", () => {
    const r = new MethodRegistry();
    r.register("kernel:computable", "readFile", { fn: async (_, { path }: any) => `read ${path}` } as any, "llm");
    const api = r.buildSandboxMethods({} as any, "supervisor");
    expect(Object.keys(api)).toEqual(["callMethod"]);
    expect(typeof api.callMethod).toBe("function");
  });

  it("callMethod 省略 namespace 按 self→kernel→library 解析", async () => {
    const r = new MethodRegistry();
    r.register("self:foo", "do", { fn: async () => "self" } as any, "llm");
    r.register("kernel:foo", "do", { fn: async () => "kernel" } as any, "llm");
    const api = r.buildSandboxMethods({} as any, "supervisor");
    expect(await api.callMethod("foo", "do", {})).toBe("self");
    expect(await api.callMethod("kernel:foo", "do", {})).toBe("kernel");
  });

  it("callMethod 找不到方法时抛描述清楚的错误", async () => {
    const r = new MethodRegistry();
    const api = r.buildSandboxMethods({} as any, "supervisor");
    await expect(api.callMethod("kernel:x", "y", {})).rejects.toThrow(/callMethod.*kernel:x.*y.*not found/);
  });

  it("callMethod 不能调用 ui_methods", async () => {
    const r = new MethodRegistry();
    r.register("self:report", "submit", { fn: async () => "ok" } as any, "ui");
    const api = r.buildSandboxMethods({} as any, "supervisor");
    await expect(api.callMethod("self:report", "submit", {})).rejects.toThrow(/not found/);
  });
});
```

`bun test kernel/tests/trait/method-registry.test.ts` → RED

**实现**：
```typescript
type Channel = "llm" | "ui";
type Key = `${string}::${string}::${Channel}`;

export class MethodRegistry {
  private _methods = new Map<Key, RegisteredMethod>();

  register(traitId: string, methodName: string, def: TraitMethod, channel: Channel) {
    this._methods.set(`${traitId}::${methodName}::${channel}`, { ... });
  }

  get(traitId: string, methodName: string, channel: Channel): RegisteredMethod | undefined {
    return this._methods.get(`${traitId}::${methodName}::${channel}`);
  }

  // 给 HTTP call_method 端用
  getUiMethod(traitId: string, methodName: string) {
    return this.get(traitId, methodName, "ui");
  }

  buildSandboxMethods(ctx: MethodContext, stoneName: string): { callMethod: Function } {
    return {
      callMethod: async (traitIdRaw: string, methodName: string, args: object = {}) => {
        const traitId = this.resolveTraitId(traitIdRaw);
        const m = this.get(traitId, methodName, "llm");
        if (!m) throw new Error(`callMethod: ${traitIdRaw}:${methodName} not found (llm channel)`);
        return m.fn(ctx, args);
      },
    };
  }

  private resolveTraitId(raw: string): string {
    if (raw.includes(":")) return raw;
    for (const ns of ["self", "kernel", "library"] as const) {
      // 只要有任一方法已注册就命中
      for (const k of this._methods.keys()) {
        if (k.startsWith(`${ns}:${raw}::`)) return `${ns}:${raw}`;
      }
    }
    return raw; // 让后续 get 抛错
  }
}
```

**注意**：删除旧 `buildSandboxMethods` 返回的扁平 / 两段式命名；删除 `methods: TraitMethod[]` 类型。

→ GREEN。提交：`refactor: MethodRegistry 改为 (traitId, method, channel) 三元键`

---

### Task 2.2 loader 加载 llm_methods / ui_methods 双导出

**修改文件**：`kernel/src/trait/loader.ts`

**测试**：`kernel/tests/trait/loader-methods.test.ts`

场景：
- fixture `index.ts` 导出 `export const llm_methods = {...}` → 装入 `llmMethods` 表
- fixture `index.ts` 导出 `export const ui_methods = {...}` → 装入 `uiMethods` 表
- fixture 同时导出两者 → 都装入
- fixture 只导出旧 `export const methods = [...]` → 报错（硬迁移，无兼容）

```typescript
it("loads llm_methods as llm channel", async () => {
  const trait = await loadTraitFromDir(fixture("llm-only"));
  expect(Object.keys(trait.llmMethods!)).toContain("foo");
  expect(trait.uiMethods).toEqual({});
});

it("loads ui_methods as ui channel", async () => {
  const trait = await loadTraitFromDir(fixture("ui-only"));
  expect(Object.keys(trait.uiMethods!)).toContain("submit");
});

it("rejects legacy `methods` array export", async () => {
  await expect(loadTraitFromDir(fixture("legacy-methods"))).rejects.toThrow(/legacy `methods` export/);
});
```

RED → 实现改写 loader 的 `loadTraitMethods`：
- 动态 import `index.ts` / `backend.ts`
- 读 `mod.llm_methods` / `mod.ui_methods`
- 发现 `mod.methods` 旧导出 → 抛错提示迁移
- 注入 registry 时指定 channel

→ GREEN。提交：`refactor(loader): 加载 llm_methods 与 ui_methods 双导出`

---

### Task 2.3 全量迁移 kernel/traits 下的 index.ts

**清单**（现有 index.ts，逐个改写）：
```
kernel/traits/computable/file_ops/index.ts
kernel/traits/computable/file_search/index.ts
kernel/traits/computable/shell_exec/index.ts
kernel/traits/computable/web_search/index.ts
kernel/traits/library_index/index.ts
kernel/traits/plannable/kanban/index.ts
kernel/traits/talkable/issue-discussion/index.ts
```

**变更规则**：
```typescript
// before
export const methods: TraitMethod[] = [
  { name: "readFile", fn: async (ctx, path) => {...} },
];

// after
export const llm_methods: Record<string, TraitMethod> = {
  readFile: {
    description: "...",
    params: [{ name: "path", type: "string" }],
    fn: async (ctx, { path }) => {...},   // ← args 改为对象解构
  },
};
export const ui_methods = {};
```

**关键**：每个方法的参数要从"位置参数"改为"对象参数解构"（因为新 `callMethod(traitId, method, args)` 的 args 永远是对象）。调用方（沙箱内）也要对齐。

**Commit**：`refactor(kernel-traits): index.ts 迁移到 llm_methods 对象参数形式`

---

### Task 2.4 全量迁移 library/traits 下的 index.ts

**清单**（现有）：
```
library/traits/http/client/index.ts
library/traits/git/ops/index.ts
```

变更同 Task 2.3。

**Commit**：`refactor(library-traits): index.ts 迁移到 llm_methods 对象参数形式`

---

### Task 2.5 迁移 stones/supervisor/traits 下的 index.ts

**清单**：
- `stones/supervisor/traits/session-kanban/index.ts`（如存在）
- `stones/supervisor/traits/reporter/` 暂不动（Phase 5 整体重写）

**Commit**（如有改动）：`refactor(self-traits): supervisor traits index.ts 迁移`

---

### Task 2.6 program 沙箱注入对齐

**修改文件**（搜索 `buildSandboxMethods` / `CodeExecutor` 的使用点）：
- `kernel/src/thread/engine.ts`
- `kernel/src/program/executor.ts`（如存在）

**变更**：
- 沙箱注入的 API 从 `{ readFile, writeFile, computable: {readFile,...}, ... }` 改为仅 `{ callMethod, print, setData, getData, ... }`
- `print` / `setData` / `getData` 是 context 原生 API，非 method 注册表路径
- `callMethod` 是唯一入口

**测试**：`kernel/tests/thread/engine-sandbox.test.ts` 新增（或修改现有）：

```typescript
it("sandbox exposes only callMethod + context APIs", async () => {
  // 构造 engine 跑一轮 program，检查沙箱环境只含 {callMethod, print, ...}
  // 验证 callMethod 能跑通 kernel:computable readFile
});
```

→ GREEN 后提交：`refactor(thread): program 沙箱只暴露 callMethod`

---

### Task 2.7 更新 kernel 内的 program API 文档片段

**修改文件**：`kernel/traits/computable/program_api/TRAIT.md` 和 `kernel/traits/computable/TRAIT.md`

- 所有举例从 `readFile(path)` / `computable.readFile(path)` 改为 `callMethod("computable", "readFile", { path })`
- 列出所有可用 traitId 和方法：`kernel:computable/file_ops` 的 `readFile/writeFile/editFile/listFiles` 等

**Commit**：`docs(kernel-traits): program_api 文档对齐 callMethod 协议`

---

### Phase 2 Gate

- [ ] `cd kernel && bun test` 全绿
- [ ] `grep -rn "export const methods" kernel/traits/ library/traits/ stones/` 空
- [ ] `grep -rn "\\.readFile(" kernel/traits/ | grep -v "// " | grep -v "callMethod"` 只保留在 Node fs 或文档语境内
- [ ] 手工 smoke：启服务端，用一个已有 session 发条消息让 supervisor 跑 program 调 `callMethod("computable","readFile",{path:"docs/meta.md"})`，期望成功
- [ ] **STOP，向 user 报告：Phase 2 完成，是否进入 Phase 3**

---

## Phase 3 — Views 加载与 DynamicUI

**目标**：引入 `views/{viewName}/{VIEW.md, frontend.tsx, backend.ts}` 三件套；`ooc://ui/` 全面改为 `ooc://view/`；DynamicUI 组件接收 `callMethod` 闭包。

**不涉及**：HTTP endpoint 实体（Phase 4）、Reporter 重写（Phase 5）。

### Task 3.1 VIEW.md 加载（kind=view）

**修改文件**：`kernel/src/trait/loader.ts`

**新写测试**：`kernel/tests/trait/view-loader.test.ts`

```typescript
describe("View loader", () => {
  it("loads VIEW.md into TraitDefinition with kind=view", async () => {
    // fixture: stones/fake/views/demo/{VIEW.md, frontend.tsx, backend.ts}
    const views = await loadObjectViews(fixtureStoneDir, "fake");
    expect(views).toHaveLength(1);
    expect(views[0].kind).toBe("view");
    expect(views[0].namespace).toBe("self");
    expect(views[0].name).toBe("demo");
  });

  it("rejects view without frontend.tsx", async () => {
    // fixture: views/broken/VIEW.md 但缺 frontend.tsx
    await expect(loadObjectViews(fixtureStoneDir, "broken")).rejects.toThrow(/frontend\.tsx/);
  });

  it("backend.ts ui_methods 装入 uiMethods，llm_methods 装入 llmMethods", async () => {
    const views = await loadObjectViews(fixtureStoneDir, "fake");
    expect(Object.keys(views[0].uiMethods!)).toContain("submit");
  });
});
```

RED → 实现 `loadObjectViews(stoneDir, stoneName)`：
- 扫 `stoneDir/views/*/VIEW.md`
- 每个 VIEW.md 解析同 TRAIT.md，强制 `namespace: self`（目录决定）
- 验证同目录存在 `frontend.tsx`（缺则报错）
- 如存在 `backend.ts`，加载 `llm_methods` / `ui_methods`
- traitId = `self:{viewName}`（与同名普通 trait 冲突时由 register 层处理：同 traitId 允许只要 llm/ui channel 不重叠即可）
- 扩展 `loadObjectTraits` 在加载 traits 之后合并加载 views，返回同一张表

**集成**：`loadAllTraits` 要调用 `loadObjectViews`。同时 Flow 级也要扫 `flows/{sid}/objects/{name}/views/`（接入 Phase 4 sessionId 传参后，loader 需要 sessionId 参数 —— 本任务先做 stone 级，flow 级留 Task 3.5）。

→ GREEN。提交：`feat(views): VIEW.md 加载为 kind=view 的 trait`

---

### Task 3.2 ooc://view/ 协议改名（后端）

**修改文件**：`kernel/src/server/server.ts`

**搜 `ooc://ui/` 所有引用并改为 `ooc://view/`**：
- `/api/resolve?url=ooc://view/...` 处理器
- 路径解析：`ooc://view/stones/{name}/views/{viewName}/frontend.tsx` 或 `ooc://view/flows/{sid}/objects/{name}/views/{viewName}/`
- 删除旧 `ui/` 的 fallback 逻辑

**测试**：`kernel/tests/server/resolve-view.test.ts`（新）

```typescript
it("resolves ooc://view/stones/.../views/main/ to absolute path", async () => {
  const r = await resolveOocUrl("ooc://view/stones/supervisor/views/main/");
  expect(r.resolved).toMatch(/views\/main\/frontend\.tsx$/);
});
it("rejects ooc://ui/ (legacy)", async () => {
  const r = await resolveOocUrl("ooc://ui/...");
  expect(r.success).toBe(false);
});
```

**Commit**：`refactor(server): ooc://ui/ 改名为 ooc://view/`

---

### Task 3.3 ooc://view/ 协议改名（前端）

**修改文件**：
- `kernel/web/src/lib/ooc-url.ts`：`OocUrl` 类型 `ui` → `view`；正则改 `^ooc:\/\/view\/`
- `kernel/web/src/components/OocLinkPreview.tsx`：分支 `case "ui"` → `case "view"`
- `kernel/web/src/features/DynamicUI.tsx`：路径前缀识别 `ooc://view/`
- 任何硬编码 `"ui"` 类型的地方全搜全改

**测试**：`kernel/web/src/lib/ooc-url.test.ts`（新）

```typescript
it("parses ooc://view/stones/x/views/main/", () => {
  expect(parseOocUrl("ooc://view/stones/x/views/main/")).toEqual({ type: "view", path: "stones/x/views/main/" });
});
```

**Commit**：`refactor(web): ooc-url 类型改为 view`

---

### Task 3.4 DynamicUI 加载 views/{viewName}/frontend.tsx

**修改文件**：`kernel/web/src/features/DynamicUI.tsx`

**变更**：
- 解析 `ooc://view/...` → 解析出 `{stoneName, viewName}` 或 `{sid, stoneName, viewName}`
- Vite `/@fs/${__OOC_ROOT__}/.../views/${viewName}/frontend.tsx` 动态 import
- 删除旧 `ui/index.tsx` / `ui/pages/*.tsx` 加载逻辑
- **预留 callMethod prop**（Phase 4 实现注入，本任务只声明 prop 接口）：
  ```tsx
  <Component sessionId={sid} objectName={stoneName} callMethod={callMethodStub} />
  ```
  其中 `callMethodStub = () => { throw new Error("callMethod not wired yet") }`（Phase 4 Task 4.3 替换成真实实现）。

**Commit**：`refactor(web): DynamicUI 加载 views/*/frontend.tsx`

---

### Task 3.5 Flow 级 views/ 加载

**修改文件**：`kernel/src/trait/loader.ts`（扩展 `loadObjectTraits` 接收 sessionId 参数）

**流程**：
- 加载 stone 级 traits/views 时 sessionId 为空，只扫 `stones/{name}`
- 加载 flow 级 traits/views 时同时扫 `flows/{sid}/objects/{name}/views/`
- 冲突时 flow 覆盖 stone

**测试**：`kernel/tests/trait/flow-view-loader.test.ts`

**Commit**：`feat(views): 支持 flow 级 views/ 加载`

---

### Task 3.6 删除所有旧 ui/ 引用

**搜索命令**：
```bash
grep -rn "ooc://ui/" kernel/ library/ stones/ docs/
grep -rn "'ui/index.tsx'" kernel/
grep -rn "ui/pages" kernel/web/
grep -rn '"ui"' kernel/web/src/  # 过滤 node_modules, ui components
```

逐个清理或改名。

**Commit**：`chore: 清除所有 ooc://ui/ 旧引用`

---

### Phase 3 Gate

- [ ] `cd kernel && bun test` 全绿
- [ ] `cd kernel/web && bun run tsc --noEmit` 0 error
- [ ] 服务端启动成功
- [ ] 手工 smoke：创一个 `stones/supervisor/views/demo/{VIEW.md, frontend.tsx, backend.ts}`，frontend 输出静态 "hello"；浏览器访问 `ooc://view/stones/supervisor/views/demo/` 能看到 "hello"
- [ ] **STOP，向 user 报告：Phase 3 完成，是否进入 Phase 4**

---

## Phase 4 — HTTP call_method 端点 + notifyThread

**目标**：开通 `POST /api/flows/:sessionId/objects/:name/call_method`，打通前端 → 对象 data 变更 → 线程通知的闭环。

### Task 4.1 MethodContext.notifyThread 实现

**修改文件**：`kernel/src/trait/context.ts`（或 MethodContext 定义处）+ `kernel/src/world/world.ts`

**新写测试**：`kernel/tests/world/notify-thread.test.ts`

```typescript
it("notifyThread 向对象根线程 inbox 写 system 消息", async () => {
  const sid = "s_test";
  const w = await createTestWorld(sid);
  const ctx = buildUiMethodContext(w, sid, "supervisor");
  await ctx.notifyThread("hello from ui");

  const inbox = await readInbox(sid, "supervisor", /*rootThreadId*/);
  expect(inbox.pending).toContainEqual(
    expect.objectContaining({ role: "system", content: expect.stringContaining("hello from ui") })
  );
});

it("notifyThread 复活 done 状态的根线程", async () => {
  // 先让 root 线程跑完 → status = done
  // 调 notifyThread → status 应回 pending
});
```

RED → 实现 `notifyThread(message, opts?)`：
- 定位该对象当前 flow 的"根线程"（通常是第一个 thread 或约定的 root）
- 向 inbox 追加一条 system message
- 若线程 status = done → 复用现有 inbox-based 复活机制

→ GREEN。提交：`feat(world): MethodContext.notifyThread`

---

### Task 4.2 后端 POST /api/flows/:sid/objects/:name/call_method

**修改文件**：`kernel/src/server/server.ts`

**新写测试**：`kernel/tests/server/call-method.test.ts`

场景（白名单）：
1. ✅ 成功：self:view 的 ui_method 调用返回 200 + result
2. ❌ 403：traitId 非 self namespace（如 `kernel:computable`）
3. ❌ 403：traitId 是 kind=trait（非 view）
4. ❌ 403：方法只注册在 llm_methods 而非 ui_methods
5. ❌ 404：view 不属于目标对象（self:x 但 :name 是 y）
6. ✅ notifyThread 效果：调用带 notifyThread 的方法后，inbox 有新 message

```typescript
it("403 when traitId namespace is not self", async () => {
  const r = await fetch(`/api/flows/${sid}/objects/supervisor/call_method`, {
    method: "POST",
    body: JSON.stringify({ traitId: "kernel:computable", method: "readFile", args: { path: "x" } }),
  });
  expect(r.status).toBe(403);
});

it("200 when valid self view ui_method", async () => {
  const r = await fetch(`/api/flows/${sid}/objects/supervisor/call_method`, {
    method: "POST",
    body: JSON.stringify({ traitId: "self:demo-view", method: "submit", args: { x: 1 } }),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ success: true, data: { result: expect.anything() } });
});
```

RED → 实现：
```typescript
app.post("/api/flows/:sid/objects/:name/call_method", async (req, res) => {
  const { sid, name } = req.params;
  const { traitId, method, args } = await req.json();

  // 1. namespace = self
  if (!traitId.startsWith("self:")) return res.status(403).json({ error: "only self namespace allowed" });

  // 2. 加载该 flow 的对象 registry
  const registry = await loadMethodRegistryForObject(sid, name);

  // 3. 查 view
  const trait = registry.getTrait(traitId);
  if (!trait || trait.kind !== "view") return res.status(403).json({ error: "target must be a view" });

  // 4. view 属于 :name（loader 根据路径加载，隐含校验，再 explicit 双保险）
  if (!isViewOwnedByObject(trait, name, sid)) return res.status(404).json({ error: "view not found for this object" });

  // 5. ui_method
  const m = registry.getUiMethod(traitId, method);
  if (!m) return res.status(403).json({ error: "method not exposed via ui_methods" });

  // 6. 执行
  try {
    const ctx = buildUiMethodContext({ sid, name });
    const result = await m.fn(ctx, args ?? {});
    return res.json({ success: true, data: { result } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});
```

→ GREEN。提交：`feat(server): POST /api/flows/:sid/objects/:name/call_method`

---

### Task 4.3 前端 callMethod client

**修改文件**：`kernel/web/src/api/client.ts`

```typescript
export async function callMethod(
  sessionId: string,
  objectName: string,
  traitId: string,
  method: string,
  args: object = {},
): Promise<any> {
  const r = await fetch(`/api/flows/${sessionId}/objects/${objectName}/call_method`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traitId, method, args }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body.data?.result;
}
```

**测试**：`kernel/web/src/api/client.test.ts`（mock fetch）。

**Commit**：`feat(web): api client 新增 callMethod`

---

### Task 4.4 DynamicUI 注入真实 callMethod

**修改文件**：`kernel/web/src/features/DynamicUI.tsx`

**变更**：Task 3.4 的 `callMethodStub` 替换为：
```tsx
const callMethod = (traitId: string, method: string, args: object) =>
  apiCallMethod(sessionId, objectName, traitId, method, args);

<Component sessionId={sessionId} objectName={objectName} callMethod={callMethod} />
```

**Commit**：`feat(web): DynamicUI 注入 callMethod 闭包`

---

### Task 4.5 端到端集成测试

**新写测试**：`kernel/tests/integration/view-submit-flow.test.ts`

场景：
1. 准备 fixture view：`stones/test-obj/views/feedback/{VIEW.md, frontend.tsx, backend.ts}` 含 `ui_methods.submit`
2. 调用 `POST /api/flows/{sid}/objects/test-obj/call_method` 提交
3. 验证：
   - 响应 200
   - `data.feedback.*` 已写入
   - 根线程 inbox 含 system message
4. 清理

**Commit**：`test: view call_method + notifyThread 端到端`

---

### Phase 4 Gate

- [ ] `cd kernel && bun test` 全绿
- [ ] 手工 smoke：创 demo view 带表单提交按钮，浏览器点击提交 → 200 + 页面看到 sidebar 有新消息
- [ ] **STOP，向 user 报告：Phase 4 完成，是否进入 Phase 5**

---

## Phase 5 — Reporter trait 升级 + 文档同步

**目标**：Reporter 按推荐规范产出"报告文档 + 交互报告 View + 两张 navigate 卡片"；文档体系（meta.md、对象/、哲学文档相关）对齐新架构。

### Task 5.1 新 Reporter TRAIT.md

**修改文件**：`stones/supervisor/traits/reporter/TRAIT.md`

**新内容要点**（frontmatter + body）：
```yaml
---
namespace: self
name: reporter
when: never
command_binding:
  commands: ["return", "talk"]
description: 任务结束或阶段性汇报时，产出可读报告并可选构造交互 View
deps: []
---

# 报告能力

在 return 或 talk 时，你可以（非强制）产出两份资产：

1. **报告文档**（markdown） — 放在 `{filesDir}/reports/{reportName}.md`
2. **交互报告 View** — 放在 `{viewsDir}/{reportName}/{VIEW.md, frontend.tsx, backend.ts}`

并通过 [navigate] 卡片引导用户访问：

```
[navigate title="报告" description="..."]ooc://file/flows/{sid}/objects/{name}/files/reports/{reportName}.md[/navigate]
[navigate title="交互报告" description="..."]ooc://view/flows/{sid}/objects/{name}/views/{reportName}/[/navigate]
```

## 何时输出双卡片

（推荐，非必选）：
- 涉及表单交互、用户决策、打分反馈 → 建议输出 View
- 纯信息汇报 → 只输出文档即可

## 示例 frontend.tsx

```tsx
import React, { useState } from "react";

export default function ReportView({ sessionId, objectName, callMethod }) {
  const [rating, setRating] = useState(5);
  const [done, setDone] = useState(false);
  const submit = async () => {
    await callMethod("self:report", "submitFeedback", { rating });
    setDone(true);
  };
  if (done) return <div>已收到反馈</div>;
  return <button onClick={submit}>提交 {rating} 星</button>;
}
```

## 示例 backend.ts

```typescript
export const ui_methods = {
  submitFeedback: {
    description: "用户对报告给出反馈",
    params: [{ name: "rating", type: "number" }],
    fn: async (ctx, { rating }) => {
      ctx.setData(`feedback.${Date.now()}`, { rating });
      ctx.notifyThread(`[UI] 用户提交反馈：${rating} 星`);
      return { ok: true };
    },
  },
};
export const llm_methods = {};
```
```

**Commit**：`docs(reporter): 升级到 views + 双卡片推荐规范`

---

### Task 5.2 验证：手工跑一轮 return + View

- 启动服务端
- 新 session：让 supervisor 做一个简单任务（如 "帮我总结一下 meta.md"）
- 观察 supervisor 在 return 时是否：
  - 写了 markdown 报告
  - 构造了 view（若决定交互）
  - 输出了 navigate 卡片
- 浏览器点击卡片 → 能加载 View；若有表单 → 提交后线程被复活且 data 已写入

记录问题到 `docs/实验/0xx-reporter-view-验证.md`。

**Commit**（如无代码改动可跳过）：`exp: Reporter view + call_method 端到端验证`

---

### Task 5.3 同步文档：docs/meta.md

**修改文件**：`docs/meta.md`

**变更点**：
- Trait 子树加入 `namespace`（kernel/library/self）、`kind`（trait/view）、`traitId = namespace:name` 的描述
- Persistence / Web UI 子树：`ui/` → `views/`；`ooc://ui/` → `ooc://view/`
- Engine / Trait 子树：方法调用统一为 `callMethod(traitId, method, args)`
- 新增 HTTP call_method 端点描述

**Commit**：`docs(meta): 对齐 namespace + views + callMethod`

---

### Task 5.4 同步文档：对象/人机交互/*

**修改文件**：
- `docs/对象/人机交互/自渲染.md` → 重写为 "Views：UI 与方法的统一表达"（或迁移为新文件 `docs/对象/人机交互/views.md`）
- `docs/对象/人机交互/ooc-protocol.md` → 协议列表 `ui` → `view`
- 新增（若无）：`docs/对象/人机交互/call-method.md` 描述 HTTP 端点、白名单、notifyThread

**Commit**：`docs(对象/人机交互): 重写 views 与 call_method`

---

### Task 5.5 同步文档：对象/结构/trait/*

**修改文件**：
- `docs/对象/结构/trait/README.md` 或总览：加 namespace、kind、llm_methods/ui_methods 概念
- `docs/对象/结构/trait/kernel-traits/*.md`：所有 trait 引用改新 traitId 格式
- 新增：`docs/对象/结构/trait/views.md`（VIEW 是 kind=view 的 trait 的专章）

**Commit**：`docs(对象/结构/trait): namespace + kind + 双方法表`

---

### Task 5.6 Bruce 体验验证

Spawn Bruce agent（Explore 子 agent）以"普通用户"身份体验：
1. 新建 session
2. 让 supervisor 完成一个需要表单反馈的任务
3. 检查：
   - 报告卡片是否可点开
   - View 是否渲染
   - 表单提交后是否看到线程新消息
   - supervisor 是否基于新反馈继续工作
4. 记录摩擦点到 `docs/实验/0xx-bruce-reporter-v2.md`

**Commit**：`exp: Bruce 体验 reporter v2 验证`

---

### Phase 5 Gate

- [ ] `cd kernel && bun test` 全绿
- [ ] `docs/meta.md` 已更新
- [ ] `docs/对象/` 已更新
- [ ] Bruce 验证通过
- [ ] `git log --oneline` 看所有 phase commit 清楚
- [ ] **STOP，向 user 报告：全部 5 phase 完成，是否合并到主线**

---

## 全局回滚策略

- 每个 phase 独立 commit，可按 `git revert <phase-commit-range>` 精细回滚
- Phase 1-2 纯重构，无新功能，风险集中在遗漏的 name 格式
- Phase 3-4 新增 Views / HTTP，风险集中在路径解析和白名单
- Phase 5 纯文档 + trait 内容重写，风险最低

---

## 验收清单（向 user 展示时用）

- [ ] 所有 TRAIT.md 的 frontmatter 格式统一（namespace + name）
- [ ] 所有方法调用走 `callMethod(traitId, method, args)`
- [ ] `views/` 目录取代 `ui/`
- [ ] `ooc://view/` 取代 `ooc://ui/`
- [ ] `POST /api/flows/:sid/objects/:name/call_method` 开放 + 白名单校验
- [ ] `notifyThread` 可用
- [ ] Reporter 示例齐全
- [ ] 文档同步完成
- [ ] Bruce 体验通过

---

## 执行方式选项（待 user 决策）

### 选项 A — Subagent-Driven Execution（推荐）

每个 Phase 分派独立 subagent 执行（general-purpose），我作为 supervisor 审阅每个 phase 产出。

- 优点：各 phase 隔离，失败不污染主上下文
- 缺点：subagent 上下文独立，需 briefing 完备

### 选项 B — Inline Execution

我（主 agent）在当前上下文中按 phase 顺序执行。

- 优点：连续性强，可即时调整
- 缺点：5 个 phase 跨度大，上下文压力高

**请 user 选择 A 或 B。**
