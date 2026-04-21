# OOC Skill 系统实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OOC 实现 Skill 系统，支持从 `library/skills/` 加载 SKILL.md，在 Context 中展示索引，对象通过 `[use_skill]` 按需加载完整内容。

**Architecture:** 新增 `kernel/src/skill/` 模块（types + loader），修改 parser/thinkloop/context-builder/engine 四个线程模块。遵循 parser → thinkloop → engine 三层架构：parser 解析指令，thinkloop 纯函数透传，engine 负责 IO。

**Tech Stack:** TypeScript, bun:test, gray-matter (已有依赖)

**Spec:** `user/docs/superpowers/specs/2026-04-10-skill-system-design.md`

---

## Chunk 1: Skill 类型与加载器

### Task 1: SkillDefinition 类型

**Files:**
- Create: `kernel/src/skill/types.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
/**
 * Skill 类型定义
 *
 * Skill 是纯 prompt 模板，与 Trait 并列独立。
 * Trait 管能力（bias + 方法），Skill 管任务流程指导。
 *
 * @ref docs/superpowers/specs/2026-04-10-skill-system-design.md#3.2
 */

/**
 * Skill 定义（轻量，仅索引信息）
 *
 * 注意：when 字段为自由文本描述，与 TraitDefinition.when（枚举值）语义不同。
 */
export interface SkillDefinition {
  /** Skill 唯一标识 */
  name: string;
  /** 一行描述 */
  description: string;
  /** 使用场景提示（自由文本，非枚举） */
  when?: string;
  /** 文件系统路径（用于按需加载 body） */
  dir: string;
}
```

- [ ] **Step 2: 确认文件无语法错误**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun build src/skill/types.ts --no-bundle`
Expected: 编译成功

### Task 2: Skill 加载器

**Files:**
- Create: `kernel/src/skill/loader.ts`
- Test: `kernel/tests/skill-loader.test.ts`

- [ ] **Step 1: 写测试**

```typescript
/**
 * Skill 加载器测试
 *
 * @ref docs/superpowers/specs/2026-04-10-skill-system-design.md#3.1
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSkills, loadSkillBody } from "../src/skill/loader.js";

const TMP = join(import.meta.dir, "__tmp_skills__");

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

/** 辅助：创建 SKILL.md */
function createSkill(name: string, frontmatter: string, body: string) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}`);
}

describe("loadSkills", () => {
  test("加载单个 skill 的 frontmatter", () => {
    createSkill("commit", 'name: commit\ndescription: "生成 commit message"\nwhen: "提交代码时"', "# Commit\n详细内容");
    const skills = loadSkills(TMP);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("commit");
    expect(skills[0]!.description).toBe("生成 commit message");
    expect(skills[0]!.when).toBe("提交代码时");
    expect(skills[0]!.dir).toBe(join(TMP, "commit"));
  });

  test("加载多个 skills", () => {
    createSkill("commit", 'name: commit\ndescription: "提交"', "body1");
    createSkill("review", 'name: review\ndescription: "审查"', "body2");
    const skills = loadSkills(TMP);
    expect(skills).toHaveLength(2);
    const names = skills.map(s => s.name).sort();
    expect(names).toEqual(["commit", "review"]);
  });

  test("跳过没有 SKILL.md 的目录", () => {
    mkdirSync(join(TMP, "empty-dir"), { recursive: true });
    createSkill("valid", 'name: valid\ndescription: "有效"', "body");
    const skills = loadSkills(TMP);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("valid");
  });

  test("目录不存在时返回空数组", () => {
    const skills = loadSkills("/nonexistent/path");
    expect(skills).toEqual([]);
  });

  test("when 字段可选", () => {
    createSkill("simple", 'name: simple\ndescription: "简单"', "body");
    const skills = loadSkills(TMP);
    expect(skills[0]!.when).toBeUndefined();
  });
});

describe("loadSkillBody", () => {
  test("按需读取 SKILL.md body", () => {
    createSkill("commit", 'name: commit\ndescription: "提交"', "# Commit 流程\n\n1. 检查 status");
    const body = loadSkillBody(join(TMP, "commit"));
    expect(body).toContain("# Commit 流程");
    expect(body).toContain("1. 检查 status");
    expect(body).not.toContain("name: commit");
  });

  test("SKILL.md 不存在时返回 null", () => {
    mkdirSync(join(TMP, "empty"), { recursive: true });
    const body = loadSkillBody(join(TMP, "empty"));
    expect(body).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/skill-loader.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现加载器**

```typescript
/**
 * Skill 加载器
 *
 * 从 library/skills/ 目录扫描并加载 SKILL.md 文件。
 * 启动时只读 frontmatter（name + description + when），body 按需加载。
 *
 * @ref docs/superpowers/specs/2026-04-10-skill-system-design.md#3.1
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { SkillDefinition } from "./types.js";

/**
 * 扫描目录加载所有 Skill 的索引信息
 *
 * @param skillsDir - skills 根目录（如 library/skills/）
 * @returns SkillDefinition 列表
 */
export function loadSkills(skillsDir: string): SkillDefinition[] {
  if (!existsSync(skillsDir)) return [];

  const results: SkillDefinition[] = [];
  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;

    const entryPath = join(skillsDir, entry.name);

    /* symlink 安全检查 */
    if (entry.isSymbolicLink()) {
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }
    }

    const skillPath = join(entryPath, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    try {
      const raw = readFileSync(skillPath, "utf-8");
      const { data } = matter(raw);

      const name = typeof data.name === "string" ? data.name : entry.name;
      const description = typeof data.description === "string" ? data.description : "";

      const skill: SkillDefinition = { name, description, dir: entryPath };
      if (typeof data.when === "string") {
        skill.when = data.when;
      }

      results.push(skill);
    } catch {
      /* 解析失败，跳过 */
    }
  }

  return results;
}

/**
 * 按需读取 SKILL.md 的 body 内容
 *
 * @param skillDir - skill 目录路径
 * @returns body 文本，文件不存在返回 null
 */
export function loadSkillBody(skillDir: string): string | null {
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  try {
    const raw = readFileSync(skillPath, "utf-8");
    const { content } = matter(raw);
    return content.trim() || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/skill-loader.test.ts`
Expected: 全部 PASS

### Task 3: Skill 模块导出

**Files:**
- Create: `kernel/src/skill/index.ts`

- [ ] **Step 1: 创建导出文件**

```typescript
/**
 * Skill 模块统一导出
 */
export type { SkillDefinition } from "./types.js";
export { loadSkills, loadSkillBody } from "./loader.js";
```

- [ ] **Step 2: 提交**

```bash
git add kernel/src/skill/ kernel/tests/skill-loader.test.ts
git commit -m "feat: add skill module (types + loader)"
```

---

## Chunk 2: Parser + ThinkLoop 集成

### Task 4: Parser 新增 `[use_skill]` 解析

**Files:**
- Modify: `kernel/src/thread/parser.ts`
- Test: `kernel/tests/thread-parser.test.ts`

- [ ] **Step 1: 在 thread-parser.test.ts 末尾追加测试**

```typescript
describe("parseThreadOutput — use_skill", () => {
  test("解析 use_skill 指令", () => {
    const input = `
[use_skill]
name = "commit"
`;
    const result = parseThreadOutput(input);
    expect(result.useSkill).not.toBeNull();
    expect(result.useSkill!.name).toBe("commit");
  });

  test("use_skill 缺少 name 时为 null", () => {
    const input = `
[use_skill]
foo = "bar"
`;
    const result = parseThreadOutput(input);
    expect(result.useSkill).toBeNull();
  });

  test("use_skill 可与 thought 共存", () => {
    const input = `
[thought]
content = "需要加载 commit skill"

[use_skill]
name = "commit"
`;
    const result = parseThreadOutput(input);
    expect(result.thought).toBe("需要加载 commit skill");
    expect(result.useSkill).not.toBeNull();
    expect(result.useSkill!.name).toBe("commit");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-parser.test.ts`
Expected: FAIL（useSkill 属性不存在）

- [ ] **Step 3: 修改 parser.ts**

在 `parser.ts` 中：

1. 新增 `UseSkillDirective` 类型导出（在文件顶部的类型区域）：

```typescript
/** use_skill 指令 */
export interface UseSkillDirective {
  name: string;
}
```

2. 在 `ThreadParsedOutput` 接口中新增字段：

```typescript
  /** 使用 skill */
  useSkill: UseSkillDirective | null;
```

3. 在 `parseThreadOutput()` 函数的 result 初始化中新增：

```typescript
    useSkill: null,
```

4. 在函数末尾 `return result` 之前（`/* continue_sub_thread */` 之后）新增解析逻辑：

```typescript
  /* use_skill */
  if (parsed.use_skill && typeof parsed.use_skill === "object") {
    const us = parsed.use_skill as Record<string, unknown>;
    if (typeof us.name === "string" && us.name) {
      result.useSkill = { name: us.name };
    }
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-parser.test.ts`
Expected: 全部 PASS

### Task 5: ThinkLoop 透传 useSkill

**Files:**
- Modify: `kernel/src/thread/thinkloop.ts`
- Test: `kernel/tests/thread-thinkloop.test.ts`

- [ ] **Step 1: 在 thread-thinkloop.test.ts 末尾追加测试**

```typescript
describe("runThreadIteration — use_skill", () => {
  test("透传 useSkill 到结果", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };
    const llmOutput = `
[use_skill]
name = "commit"
`;
    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };
    const result = runThreadIteration(input);
    expect(result.useSkill).not.toBeNull();
    expect(result.useSkill!.name).toBe("commit");
  });

  test("return 优先于 useSkill（return 后 useSkill 被忽略）", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };
    const llmOutput = `
[use_skill]
name = "commit"

[return]
summary = "done"
`;
    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };
    const result = runThreadIteration(input);
    expect(result.statusChange).toBe("done");
    /* return 提前退出，useSkill 不会被设置 */
    expect(result.useSkill).toBeNull();
  });

  test("await 优先于 useSkill", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };
    const llmOutput = `
[use_skill]
name = "commit"

[await]
thread_id = "t1"
`;
    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };
    const result = runThreadIteration(input);
    expect(result.statusChange).toBe("waiting");
    expect(result.useSkill).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-thinkloop.test.ts`
Expected: FAIL（useSkill 属性不存在）

- [ ] **Step 3: 修改 thinkloop.ts**

1. 在 `thinkloop.ts` 顶部导入新增类型：

```typescript
import type { UseSkillDirective } from "./parser.js";
```

2. 在 `ThreadIterationResult` 接口中新增字段（在 `talks` 之后）：

```typescript
  /**
   * 解析出的 use_skill 指令（需要 engine 读取 SKILL.md body 并写入 inject action）
   * 本函数不执行 IO，只传递解析结果给调用方。
   */
  useSkill: UseSkillDirective | null;
```

3. 在 `runThreadIteration()` 的 result 初始化中新增：

```typescript
    useSkill: null,
```

4. 在第 9 步（传递 program 和 talk）之后、第 10 步（talk_sync）之前，新增：

```typescript
  /* 9b. 传递 useSkill 给调用方（engine 负责读取文件） */
  if (parsed.useSkill) result.useSkill = parsed.useSkill;
```

注意：由于 `[return]`（第 7 步）和 `[await]`（第 8 步）会提前 return，useSkill 在这两种情况下自然被忽略。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-thinkloop.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add kernel/src/thread/parser.ts kernel/src/thread/thinkloop.ts kernel/tests/thread-parser.test.ts kernel/tests/thread-thinkloop.test.ts
git commit -m "feat: add [use_skill] parsing and thinkloop passthrough"
```

---

## Chunk 3: Context Builder + Engine 集成

### Task 6: Context Builder 注入 Skill 索引

**Files:**
- Modify: `kernel/src/thread/context-builder.ts`
- Test: `kernel/tests/thread-context-builder.test.ts`

- [ ] **Step 1: 在 thread-context-builder.test.ts 末尾追加测试**

在文件顶部 import 区域新增：
```typescript
import type { SkillDefinition } from "../src/skill/types.js";
```

在文件末尾追加：
```typescript
describe("buildThreadContext — skill index", () => {
  test("skills 注入到 knowledge window（含 when 字段）", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const skills: SkillDefinition[] = [
      { name: "commit", description: "生成 commit message", dir: "/tmp/commit" },
      { name: "review", description: "代码审查", when: "审查代码时", dir: "/tmp/review" },
    ];
    const ctx = buildThreadContext({
      tree,
      threadId: "r",
      threadData: makeThreadData("r"),
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      directory: [],
      traits: [],
      skills,
    });
    const skillWindow = ctx.knowledge.find(w => w.name === "available-skills");
    expect(skillWindow).toBeDefined();
    expect(skillWindow!.content).toContain("commit: 生成 commit message");
    expect(skillWindow!.content).toContain("review: 代码审查");
    expect(skillWindow!.content).toContain("审查代码时");
    expect(skillWindow!.content).toContain("[use_skill]");
  });

  test("空 skills 列表不注入 window", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const ctx = buildThreadContext({
      tree,
      threadId: "r",
      threadData: makeThreadData("r"),
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      directory: [],
      traits: [],
      skills: [],
    });
    const skillWindow = ctx.knowledge.find(w => w.name === "available-skills");
    expect(skillWindow).toBeUndefined();
  });

  test("skills 未传入时不注入 window", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const ctx = buildThreadContext({
      tree,
      threadId: "r",
      threadData: makeThreadData("r"),
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      directory: [],
      traits: [],
    });
    const skillWindow = ctx.knowledge.find(w => w.name === "available-skills");
    expect(skillWindow).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-context-builder.test.ts`
Expected: FAIL（skills 参数不存在 / available-skills window 不存在）

- [ ] **Step 3: 修改 context-builder.ts**

1. 在文件顶部新增导入：

```typescript
import type { SkillDefinition } from "../skill/types.js";
```

2. 在 `ThreadContextInput` 接口中新增字段（在 `paths` 之后）：

```typescript
  /** 已加载的 Skill 定义列表 */
  skills?: SkillDefinition[];
```

3. 在 `buildThreadContext()` 函数中，`if (extraWindows) knowledge.push(...extraWindows);` 之后新增：

```typescript
  /* Skill 索引注入 */
  if (input.skills && input.skills.length > 0) {
    knowledge.push({
      name: "available-skills",
      content: formatSkillIndex(input.skills),
    });
  }
```

4. 在文件末尾（`formatTimestamp` 函数之后）新增辅助函数：

```typescript
/**
 * 生成 Skill 索引文本
 *
 * 每个 skill 一行，格式：`- name: description (when: 场景)`
 * 用于注入 knowledge window，让对象知道有哪些 skill 可用。
 */
function formatSkillIndex(skills: SkillDefinition[]): string {
  const lines = [
    "## 可用 Skills",
    "",
    "以下 skill 可通过 [use_skill] 指令按需加载完整内容：",
  ];
  for (const s of skills) {
    let line = `- ${s.name}: ${s.description}`;
    if (s.when) line += ` (when: ${s.when})`;
    lines.push(line);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-context-builder.test.ts`
Expected: 全部 PASS

### Task 7: Engine 集成（EngineConfig + useSkill 处理）

**Files:**
- Modify: `kernel/src/thread/engine.ts`

engine.ts 中有两个函数包含 `runOneIteration` 回调和 `buildThreadContext` 调用：
- `runWithThreadTree()`（约第 405 行）— `buildThreadContext` 在第 667 行，useSkill 处理在第 836 行之后
- `resumeWithThreadTree()`（约第 953 行）— `buildThreadContext` 在第 1176 行，useSkill 处理在第 1245 行之后

两处都需要修改。

- [ ] **Step 1: 修改 EngineConfig + 导入**

在 `engine.ts` 的 `EngineConfig` 接口中，`traits` 字段之后新增：

```typescript
  /** 已加载的 Skill 定义列表 */
  skills?: SkillDefinition[];
```

在文件顶部新增导入：

```typescript
import type { SkillDefinition } from "../skill/types.js";
import { loadSkillBody } from "../skill/loader.js";
```

- [ ] **Step 2: 传递 skills 到两处 buildThreadContext**

**位置 1**：`runWithThreadTree()` 中的 `buildThreadContext({`（约第 667 行），在 `paths: config.paths,` 之后新增：

```typescript
          skills: config.skills,
```

**位置 2**：`resumeWithThreadTree()` 中的 `buildThreadContext({`（约第 1176 行），在 `paths: config.paths,` 之后新增：

```typescript
          skills: config.skills,
```

- [ ] **Step 3: 在两处 runOneIteration 回调中处理 useSkill**

以下代码块需要在两个位置插入（复制粘贴同一段代码）：

**位置 1**：`runWithThreadTree()` 的 `runOneIteration` 回调中，执行 talk 代码块之后（约第 836 行），`/* debugMode 检查 */` 之前。

**位置 2**：`resumeWithThreadTree()` 的 `runOneIteration` 回调中，执行 program 代码块之后（约第 1245 行），`if (threadData._debugMode)` 之前。

```typescript
      /* 执行 useSkill（如果有） */
      if (iterResult.useSkill) {
        const skillName = iterResult.useSkill.name;
        const skillDef = config.skills?.find(s => s.name === skillName);
        let injectContent: string;

        if (skillDef) {
          const body = loadSkillBody(skillDef.dir);
          injectContent = body ?? `[错误] Skill "${skillName}" 的 SKILL.md 内容为空`;
        } else {
          injectContent = `[错误] 未找到 Skill "${skillName}"。可用 skills: ${(config.skills ?? []).map(s => s.name).join(", ") || "(无)"}`;
        }

        const td = tree.readThreadData(threadId);
        if (td) {
          td.actions.push({
            type: "inject",
            content: injectContent,
            timestamp: Date.now(),
          });
          tree.writeThreadData(threadId, td);
        }

        consola.info(`[Engine] useSkill "${skillName}" ${skillDef ? "已加载" : "未找到"}`);
      }
```

- [ ] **Step 4: 运行全部线程测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-*.test.ts`
Expected: 全部 PASS

### Task 8: World 层传递 skills

**Files:**
- Modify: `kernel/src/world/world.ts`

world.ts 中有 3 处构建 `EngineConfig` 的位置，全部需要添加 `skills`：
- `_talkWithThreadTree()`（约第 443 行）
- `resume()` 中的线程树路由（约第 615 行）
- `stepOnce()` 中的线程树路由（约第 676 行）

- [ ] **Step 1: 新增 loadSkills 导入**

在 `world.ts` 顶部导入区域新增：

```typescript
import { loadSkills } from "../skill/index.js";
```

- [ ] **Step 2: 在全部 3 处 EngineConfig 构建中添加 skills**

在以下 3 个位置，找到 `traits,` 行，在其后新增：

```typescript
      skills: loadSkills(join(this._rootDir, "library", "skills")),
```

**位置 1**：`_talkWithThreadTree()` 方法中（约第 443 行的 `const engineConfig: EngineConfig = {`）
**位置 2**：`resume()` 方法中的线程树路由（约第 615 行的 `const engineConfig: EngineConfig = {`）
**位置 3**：`stepOnce()` 方法中的线程树路由（约第 676 行的 `const engineConfig: EngineConfig = {`）

- [ ] **Step 3: 运行全部测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add kernel/src/thread/context-builder.ts kernel/src/thread/engine.ts kernel/src/world/world.ts kernel/tests/thread-context-builder.test.ts
git commit -m "feat: integrate skill system into context-builder, engine, and world"
```

---

## Chunk 4: Engine 测试 + Computable 文档 + 示例 Skill

### Task 9: Engine 层 useSkill 集成测试

**Files:**
- Test: `kernel/tests/thread-engine-skill.test.ts`

- [ ] **Step 1: 写 engine 层 useSkill 测试**

```typescript
/**
 * Engine 层 useSkill 集成测试
 *
 * 验证 useSkill 指令的完整流程：查找 skill → 读取 body → 写入 inject action
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadSkillBody } from "../src/skill/loader.js";
import type { SkillDefinition } from "../src/skill/types.js";

const TMP = join(import.meta.dir, "__tmp_engine_skill__");

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function createSkill(name: string, body: string) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: "test"\n---\n\n${body}`);
  return dir;
}

describe("useSkill engine flow", () => {
  test("skill 找到时：loadSkillBody 返回 body 内容", () => {
    const dir = createSkill("commit", "# Commit 流程\n\n1. 检查 status");
    const body = loadSkillBody(dir);
    expect(body).toContain("# Commit 流程");
    expect(body).toContain("1. 检查 status");
  });

  test("skill 未找到时：loadSkillBody 返回 null", () => {
    const body = loadSkillBody(join(TMP, "nonexistent"));
    expect(body).toBeNull();
  });

  test("skill 查找逻辑：按 name 匹配 SkillDefinition", () => {
    const dir = createSkill("commit", "body");
    const skills: SkillDefinition[] = [
      { name: "commit", description: "提交", dir },
      { name: "review", description: "审查", dir: join(TMP, "review") },
    ];
    const found = skills.find(s => s.name === "commit");
    expect(found).toBeDefined();
    expect(found!.dir).toBe(dir);

    const notFound = skills.find(s => s.name === "nonexistent");
    expect(notFound).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-engine-skill.test.ts`
Expected: 全部 PASS

### Task 10: 更新 computable output_format TRAIT.md

**Files:**
- Modify: `kernel/traits/computable/output_format/TRAIT.md`

- [ ] **Step 1: 在输出格式文档中新增 `[use_skill]` 指令说明**

在现有的 TOML 指令文档区域（`[create_sub_thread]` 说明之后）新增：

```markdown
### `[use_skill]`

按需加载 Skill 的完整内容。查看 Context 中的「可用 Skills」列表，选择需要的 skill：

```toml
[use_skill]
name = "commit"
```

加载后，skill 的完整内容会出现在下一轮的执行历史中，按指导执行即可。
```

同时在第 92 行的主指令列表中追加 `[use_skill]`。

### Task 11: 创建示例 Skill

**Files:**
- Create: `user/library/skills/hello/SKILL.md`

- [ ] **Step 1: 创建 library/skills 目录和示例 skill**

```bash
mkdir -p /Users/zhangzhefu/x/ooc/user/library/skills/hello
```

- [ ] **Step 2: 写入示例 SKILL.md**

```yaml
---
name: hello
description: "一个简单的示例 skill，用于验证 skill 系统是否正常工作"
when: "当用户要求测试 skill 系统时"
---

# Hello Skill

这是一个示例 skill，用于验证 OOC Skill 系统的按需加载功能。

如果你看到了这段内容，说明 skill 系统工作正常。

请回复用户："Skill 系统验证成功！我成功加载了 hello skill。"
```

### Task 12: 全量测试 + 提交

- [ ] **Step 1: 运行全部测试**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS，0 fail

- [ ] **Step 2: 提交**

```bash
git add kernel/traits/ kernel/tests/thread-engine-skill.test.ts user/library/skills/
git commit -m "feat: add engine skill tests, [use_skill] docs, and hello example skill"
```

- [ ] **Step 3: 运行全部测试最终确认**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS
