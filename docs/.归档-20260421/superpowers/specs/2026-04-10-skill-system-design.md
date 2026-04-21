# OOC Skill 系统设计

> 日期：2026-04-10
> 状态：Draft
> 作者：Alan Kay + Claude

## 1. 背景与动机

OOC 已有成熟的 Trait 系统（TRAIT.md + index.ts），提供能力（bias + 可执行方法）。
但主流 AI Agent 生态普遍采用 Skill 概念（如 Claude Code 的 Skill 系统），
OOC 需要兼容支持 Skill，让对象能够发现、加载和使用标准的 SKILL.md 文件。

### Skill vs Trait

| 维度 | Trait | Skill |
|------|-------|-------|
| 定位 | 能力（bias + 方法） | 任务流程指导（纯 prompt） |
| 加载方式 | `when: always` 自动注入 / 条件激活 | 永远按需加载 |
| 可执行方法 | 有（index.ts） | 无 |
| 关系 | 并列独立 | 并列独立 |

两者并列共存，互不干扰。

**注意**：`trait/loader.ts` 已支持从 `library/traits/` 加载 SKILL.md 作为 Trait 的兼容格式。
本设计中的 `library/skills/` 是全新的独立目录，其中的 SKILL.md 不会被 Trait loader 扫描，
两者互不影响。

## 2. Skill 定义格式

### 2.1 目录结构

```
library/skills/           ← 全新目录，与 library/traits/ 平级
├── commit/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
└── debugging/
    └── SKILL.md
```

每个 Skill 是一个目录，包含一个 `SKILL.md` 文件。

### 2.2 SKILL.md 格式

```yaml
---
name: commit
description: "生成规范的 git commit message"
when: "当需要提交代码时"
---

# Git Commit 流程

1. 检查 git status，确认变更文件
2. 分析变更内容，生成 commit message
...（完整的任务流程指导）
```

### 2.3 Frontmatter 字段

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | 是 | string | Skill 唯一标识 |
| `description` | 是 | string | 一行描述，用于索引展示 |
| `when` | 否 | string | 使用场景的自由文本描述（注意：与 Trait 的 `when` 不同，Trait 的 when 是枚举值 always/never/条件字符串，此处为纯描述文本） |

与 Trait frontmatter 的区别：
- 无 `type`（Trait 有 how_to_think / how_to_use_tool / how_to_interact）
- 无 `deps`（Skill 不依赖其他 Skill）
- 无 `when: always`（Skill 永远按需加载）
- 无 `hooks`（Skill 不参与生命周期钩子）

## 3. Skill 加载与索引

### 3.1 加载流程

系统启动时，`loadSkills()` 扫描 `library/skills/` 目录：

1. 遍历子目录，查找 `SKILL.md` 文件
2. 用 `gray-matter` 解析 frontmatter（只提取 name + description + when）
3. 不读取 body 内容（按需加载时才从文件系统读取，不做缓存——Skill 数量少、文件小，IO 开销可忽略）
4. 返回 `SkillDefinition[]`

### 3.2 SkillDefinition 类型

```typescript
/**
 * Skill 定义（轻量，仅索引信息）
 *
 * 注意：when 字段为自由文本描述，与 TraitDefinition.when（枚举值）语义不同。
 */
interface SkillDefinition {
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

### 3.3 索引注入到 Context

在 `buildThreadContext()` 中，将 skill 索引生成为一个 `ContextWindow`，追加到 `knowledge` 数组：

```typescript
// 不新增 ThreadContext 顶层字段，直接作为 knowledge window 注入
knowledge.push({
  name: "available-skills",
  content: formatSkillIndex(skills),
});
```

索引文本格式：

```
## 可用 Skills

以下 skill 可通过 [use_skill] 指令按需加载完整内容：
- commit: 生成规范的 git commit message
- code-review: 代码审查流程
- debugging: 系统化调试方法
```

每个 skill 只占一行，context 消耗极小。

### 3.4 接口变更

```typescript
// ThreadContextInput 新增 skills 参数
interface ThreadContextInput {
  // ... 现有字段 ...
  /** 已加载的 Skill 定义列表 */
  skills?: SkillDefinition[];
}

// ThreadContext 不新增字段，skill 索引作为 knowledge window 注入
```

### 3.5 传递链路

```
World 启动时调用 loadSkills() → SkillDefinition[]
    ↓
EngineConfig 新增 skills 字段
    ↓
engine.ts 构建 ThreadContextInput 时传入 skills
    ↓
buildThreadContext() 生成 knowledge window
```

## 4. 按需加载机制

### 4.1 TOML 指令

对象在思考输出中使用 `[use_skill]` 指令触发加载：

```toml
[use_skill]
name = "commit"
```

这是一个 TOML 指令，和现有的 `[create_sub_thread]`、`[return]`、`[await]` 同级。

### 4.2 Parser 变更

`parseThreadOutput()` 新增解析 `[use_skill]` 段：

```typescript
/** use_skill 指令 */
interface UseSkillDirective {
  name: string;
}

interface ThreadParsedOutput {
  // ... 现有字段 ...
  /** 使用 skill */
  useSkill: UseSkillDirective | null;
}
```

### 4.3 三层架构处理流程

遵循现有的 parser → thinkloop → engine 三层架构：

**parser.ts**：解析 `[use_skill]` 段，提取 `name` 字段

**thinkloop.ts**：`runThreadIteration()` 将 `parsed.useSkill` 透传到 `ThreadIterationResult`

```typescript
interface ThreadIterationResult {
  // ... 现有字段 ...
  /** 需要加载的 skill（由 engine 负责读取文件并写入 inject action） */
  useSkill: UseSkillDirective | null;
}
```

thinkloop 是纯函数，不做 IO。它只标记"需要加载哪个 skill"，实际的文件读取由 engine 完成。

**engine.ts**：在 `applyIterationResult()` 之后处理 `useSkill`

```
runThreadIteration() → iterResult.useSkill = { name: "commit" }
    ↓
applyIterationResult() → 写入常规 actions
    ↓
engine 检查 iterResult.useSkill:
  1. 根据 name 在 config.skills 中查找 SkillDefinition
  2. 读取 SKILL.md 完整 body（readFileSync + gray-matter，取 content）
  3. 写入 inject action → { type: "inject", content: body }
  4. 未找到时写入错误提示的 inject action
    ↓
下一轮 context-builder: renderThreadProcess() 渲染 inject action
    ↓
对象看到完整 skill 内容，按指导行动
```

### 4.4 与其他指令的优先级

`[use_skill]` 遵循现有的优先级规则：

- 可与 `[thought]`、`[set_plan]` 共存（它们总是先处理）
- `[return]` 和 `[await]` 会提前 return，如果同时出现 `[use_skill]`，后者被忽略
- 可与 `[program]` 共存（program 先执行，skill 内容在同一轮注入）
- 一次只能加载一个 skill

## 5. 模块划分

### 5.1 新增文件

```
kernel/src/skill/
├── types.ts      — SkillDefinition 类型定义
├── loader.ts     — 扫描 library/skills/，解析 frontmatter
└── index.ts      — 统一导出
```

### 5.2 修改文件

| 文件 | 改动内容 |
|------|---------|
| `thread/parser.ts` | 新增 `[use_skill]` 解析逻辑，ThreadParsedOutput 加 `useSkill` 字段 |
| `thread/thinkloop.ts` | ThreadIterationResult 加 `useSkill` 字段，runThreadIteration() 透传 parsed.useSkill |
| `thread/context-builder.ts` | ThreadContextInput 加 `skills` 参数，buildThreadContext() 生成 skill 索引 ContextWindow 注入 knowledge |
| `thread/engine.ts` | EngineConfig 加 `skills` 字段；构建 ThreadContextInput 时传入 skills；applyIterationResult 后处理 useSkill（读取 body → 写入 inject action） |
| `kernel/traits/computable/TRAIT.md` | 输出格式说明中新增 `[use_skill]` 指令文档 |

### 5.3 不改动的文件

- `trait/loader.ts` — Skill 和 Trait 完全独立
- `trait/activator.ts` — Skill 不走 Trait 激活逻辑
- `trait/registry.ts` — Skill 没有可执行方法

## 6. 测试计划

| 测试文件 | 覆盖内容 |
|---------|---------|
| `kernel/tests/skill/loader.test.ts` | SKILL.md 解析、frontmatter 提取、目录扫描、缺失文件处理 |
| `kernel/tests/thread/parser.test.ts` | `[use_skill]` 指令解析（正常 / 缺失 name / 空值） |
| `kernel/tests/thread/thinkloop.test.ts` | useSkill 字段透传、与 return/await 的优先级 |
| `kernel/tests/thread/context-builder.test.ts` | skill 索引 ContextWindow 生成、空 skills 列表、knowledge 注入 |
| `kernel/tests/thread/engine.test.ts` | useSkill 完整流程：查找 skill → 读取 body → 写入 inject action；skill 未找到时的错误处理 |

## 7. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Skill 来源 | 本地 SKILL.md 文件 | 简单可靠，和 Trait 一致 |
| 存储位置 | `library/skills/`（全新目录） | 和 `library/traits/` 平级，语义清晰，不与 Trait loader 的 SKILL.md 兼容格式冲突 |
| 调用方式 | TOML 输出标记 `[use_skill]` | 和现有 `[create_sub_thread]`、`[return]`、`[await]` 同级 |
| 架构集成 | 遵循 parser → thinkloop → engine 三层 | thinkloop 纯函数透传，engine 负责 IO（文件读取 + inject 写入） |
| Skill vs Trait 关系 | 并列独立 | Trait 管能力，Skill 管任务流程，职责分离 |
| 实现方案 | 轻量 Context 注入（方案 A） | 最小改动，和 Claude Code 模型一致 |
| 索引注入方式 | 作为 knowledge ContextWindow | 复用现有 ContextWindow 机制，不新增 ThreadContext 字段 |
| 内容注入方式 | 复用 inject action | 不新增 action type，复用现有基础设施 |
| 缓存策略 | 不缓存，按需读取 | Skill 数量少、文件小，IO 开销可忽略 |

## 8. 未来迭代（TODO）

以下机制参考 Claude Code 的 Skill 系统，当前 MVP 不实现，后续按需迭代。

| 优先级 | 机制 | 说明 | Claude Code 参考 |
|--------|------|------|-----------------|
| P1 | 参数替换 | `[use_skill]` 支持 `args` 字段，skill body 中用 `$ARGUMENTS` 占位符替换 | `substituteArguments()` in loadSkillsDir.ts |
| P1 | 模板变量 | skill body 中支持 `${OOC_SKILL_DIR}`（skill 目录）、`${OOC_SESSION_ID}`（会话 ID）等变量 | `${CLAUDE_SKILL_DIR}` 替换 |
| P2 | 预算管理 | skill 索引占 context 的固定比例（如 1%），超预算时三层截断（完整 → 部分截断 → 仅名称） | `formatCommandsWithinBudget()` in prompt.ts |
| P2 | 压缩保留 | 追踪已调用的 skill（`invokedSkills` 状态），context 压缩时保留已用 skill 内容 | `addInvokedSkill()` + compact.ts |
| P3 | 去重机制 | 通过 `realpath()` 解析符号链接，避免重复加载同一 skill | `getFileIdentity()` in loadSkillsDir.ts |
| P3 | 条件激活 | frontmatter 新增 `paths` 字段（gitignore 风格），根据当前操作的文件路径自动激活 skill | `activateConditionalSkillsForPaths()` |
| P3 | Shell 执行 | skill body 中支持 `` !`command` `` 语法，按需执行 shell 命令并替换为输出 | `executeShellCommandsInPrompt()` |
| P4 | 权限隔离 | frontmatter 新增 `allowed-tools` 字段，限制 skill 可使用的工具范围 | `allowed-tools` frontmatter |
| P4 | 多线程隔离 | `invokedSkills` 按线程 ID 作用域，避免跨线程 skill 状态混淆 | `agentId` 作用域 |
