# 指令生命周期与渐进式 Trait 加载设计

> 日期：2026-04-12
> 状态：Draft
> 作者：Alan Kay + Claude

## 1. 背景与动机

当前 14 个 kernel trait 全部 `when: always`，每轮 ThinkLoop 都注入所有 trait 的 readme 到 instructions。
debug 数据显示 instructions 占 16K chars（53% of context），大量 context 浪费在当前不需要的知识上。

核心问题：对象在读文件时不需要 talkable 的知识，在发消息时不需要 file_ops 的 API 文档。

## 2. 设计目标

1. **渐进式披露** — 对象在"空闲态"只看到极简基座（指令列表 + form 规则），进入某个指令后才加载相关 trait
2. **指令生命周期** — 每个指令有 begin/submit/cancel 三个阶段，形成 form 模型
3. **自动加载/卸载** — trait 通过 `when_command` hook 声明关联的指令，engine 自动管理
4. **引用计数** — 同类型 form 可并行，trait 在所有同类型 form 结束后才卸载
5. **Trait 重组** — 将工具类 trait 移入 computable 作为子 trait

## 3. 指令生命周期模型（Form 模型）

### 3.1 三阶段生命周期

```
空闲态（极简基座 context）
    ↓ 对象输出 [talk.begin] description = "通知 sophia"
    ↓ 系统返回 form_id，加载 talkable trait
指令准备态（talkable trait 已加载，对象可多轮思考）
    ↓ 对象输出 [talk.submit] form_id = "f_001" target = "sophia" message = "..."
    ↓ 系统执行 talk，引用计数 -1
空闲态（如果无其他同类型 form，卸载 talkable trait）
```

### 3.2 Form 操作

| 操作 | TOML 格式 | 说明 |
|------|-----------|------|
| 开启 | `[talk.begin]` + `description` | 创建 form，加载关联 trait，返回 form_id |
| 提交 | `[talk.submit]` + `form_id` + 指令参数 | 执行指令，引用计数 -1 |
| 取消 | `[talk.cancel]` + `form_id` | 放弃 form，引用计数 -1 |

### 3.3 TOML 格式示例

```toml
[talk.begin]
description = "通知 sophia 基因更新的结果"
```

系统注入 inject action：`Form f_001 已创建。talkable 知识已加载。`

```toml
[talk.submit]
form_id = "f_001"
target = "sophia"
message = """
G1 基因已更新，新增了关于自主决策的描述。
"""
```

```toml
[talk.cancel]
form_id = "f_001"
```

### 3.4 并行 Form

所有类型的 form 可以并行存在。同类型 form 共享 trait 加载（引用计数）。

**重要**：每次 LLM 输出只能包含一个 form 操作（begin/submit/cancel 三选一），因为 TOML 不允许重复 key。并行 form 通过跨多轮实现：

```
轮 1: [talk.begin] description = "通知 sophia"  → form_id = "f_001", 加载 talkable (refcount=1)
轮 2: [talk.begin] description = "通知 kernel"  → form_id = "f_002", refcount=2
轮 3: [talk.submit] form_id = "f_001" ...        → 执行, refcount=1
轮 4: [talk.submit] form_id = "f_002" ...        → 执行, refcount=0 → 卸载 talkable
```

不同类型也可并行（跨轮）：

```
轮 1: [program.begin] description = "读取文件"   → 加载 computable 系列
轮 2: [talk.begin] description = "通知进度"      → 加载 talkable（此时 context 同时包含两者）
轮 3: [program.submit] form_id = "f_003" ...     → 执行 program, 卸载 computable
轮 4: [talk.submit] form_id = "f_004" ...        → 执行 talk, 卸载 talkable
```

### 3.5 完整指令列表

| 指令 | begin | submit | cancel | 加载的 trait |
|------|-------|--------|--------|-------------|
| `program` | `[program.begin]` | `[program.submit]` | `[program.cancel]` | computable（含子 trait） |
| `talk` | `[talk.begin]` | `[talk.submit]` | `[talk.cancel]` | talkable |
| `talk_sync` | `[talk_sync.begin]` | `[talk_sync.submit]` | `[talk_sync.cancel]` | talkable |
| `return` | `[return.begin]` | `[return.submit]` | `[return.cancel]` | talkable, reflective, verifiable |
| `create_sub_thread` | `[create_sub_thread.begin]` | `[create_sub_thread.submit]` | `[create_sub_thread.cancel]` | plannable |
| `continue_sub_thread` | `[continue_sub_thread.begin]` | `[continue_sub_thread.submit]` | `[continue_sub_thread.cancel]` | plannable |
| `await` | `[await.begin]` | `[await.submit]` | `[await.cancel]` | （无额外） |
| `await_all` | `[await_all.begin]` | `[await_all.submit]` | `[await_all.cancel]` | （无额外） |
| `set_plan` | `[set_plan.begin]` | `[set_plan.submit]` | `[set_plan.cancel]` | （无额外） |
| `use_skill` | `[use_skill.begin]` | `[use_skill.submit]` | `[use_skill.cancel]` | （无额外） |

## 4. Kernel Trait 重组

### 4.1 新目录结构

```
kernel/traits/
├── base/                    # 唯一的 always trait（极简基座）
│   └── TRAIT.md
├── computable/              # program 指令时加载
│   ├── TRAIT.md             # program API、输出格式
│   ├── output_format/
│   ├── program_api/
│   ├── stack_api/
│   ├── multi_thread/
│   ├── file_ops/            # ← 从顶层移入
│   ├── file_search/         # ← 从顶层移入
│   ├── shell_exec/          # ← 从顶层移入
│   ├── web_search/          # ← 从顶层移入
│   └── testable/            # ← 从顶层移入
├── talkable/                # talk/talk_sync/return 指令时加载
│   ├── TRAIT.md
│   ├── cross_object/
│   ├── delivery/
│   └── ooc_links/
├── reflective/              # return 指令时加载
│   ├── TRAIT.md
│   ├── reflect_flow/
│   └── memory_api/
├── verifiable/              # return 指令时加载
│   └── TRAIT.md
├── plannable/               # create_sub_thread 指令时加载
│   └── TRAIT.md
├── debuggable/              # program 指令时加载
│   └── TRAIT.md
├── reviewable/              # program 指令时加载
│   └── TRAIT.md
├── issue-discussion/        # talk 指令时加载
│   ├── TRAIT.md
│   └── index.ts
├── object_creation/         # create_sub_thread 指令时加载
│   └── TRAIT.md
└── library_index/           # program 指令时加载
    ├── TRAIT.md
    └── index.ts
```

### 4.2 base/TRAIT.md（极简基座）

唯一的 `when: always` trait，内容极简：

```yaml
---
name: kernel/base
type: how_to_think
when: always
description: 指令系统基座 — form 模型与可用指令列表
deps: []
---
```

内容包含：
- 可用指令列表（名称 + 一句话描述，不含详细用法）
- begin/submit/cancel 规则
- form 模型说明（form_id、引用计数、并行规则）
- 输出格式基本规则（裸 TOML，不要 ```toml 包裹）

### 4.3 Trait Frontmatter 变更

所有非 base 的 kernel trait 从 `when: always` 改为 `when: never`，新增 `command_binding`：

```yaml
# kernel/talkable/TRAIT.md
---
name: kernel/talkable
type: how_to_interact
when: never
command_binding:
  commands: ["talk", "talk_sync", "return"]
---
```

```yaml
# kernel/computable/TRAIT.md
---
name: kernel/computable
type: how_to_think
when: never
command_binding:
  commands: ["program"]
---
```

### 4.4 指令 → Trait 映射（通过 when_command hook 声明）

| 指令 | 加载的 trait（通过 hook 声明） |
|------|-------------------------------|
| `program` | computable, debuggable, reviewable, library_index |
| `talk` / `talk_sync` | talkable, issue-discussion |
| `return` | talkable, reflective, verifiable |
| `create_sub_thread` / `continue_sub_thread` | plannable, object_creation |
| `await` / `await_all` | （无额外） |
| `set_plan` | （无额外） |
| `use_skill` | （无额外） |

### 4.5 Context 大小对比

| 状态 | 现在 | 重组后 |
|------|------|--------|
| 空闲态 | ~16K chars | ~2K chars（仅 base） |
| program 中 | ~16K chars | ~8K chars（base + computable 系列） |
| talk 中 | ~16K chars | ~4K chars（base + talkable） |
| return 中 | ~16K chars | ~6K chars（base + talkable + reflective + verifiable） |

## 5. 指令绑定机制（commandBinding）

### 5.1 设计决策

`when_command` 不复用现有的 `TraitHook` 接口（`TraitHook` 是 inject 型，结构为 `{ inject, inject_title, once }`）。
而是在 `TraitDefinition` 上新增独立字段 `commandBinding`：

```typescript
interface TraitDefinition {
  // ... 现有字段 ...
  /** 指令绑定：声明此 trait 在哪些指令执行时被加载 */
  commandBinding?: {
    commands: string[];  // ["talk", "talk_sync", "return"]
  };
}
```

### 5.2 Frontmatter 格式

```yaml
# kernel/talkable/TRAIT.md
---
name: kernel/talkable
type: how_to_interact
when: never
command_binding:
  commands: ["talk", "talk_sync", "return"]
---
```

注意：使用 `command_binding`（snake_case）而非 `commandBinding`，与 frontmatter 的 YAML 风格一致。
`loader.ts` 的 `parseTraitHooks()` 不需要改动——`command_binding` 是独立字段，由 `loadTrait()` 直接解析。

### 5.3 收集函数

```typescript
/**
 * 收集指令绑定的 trait，返回需要加载的 trait ID 列表
 *
 * @param traits - 所有已加载的 trait 定义
 * @param activeCommands - 当前活跃的指令类型集合
 * @returns 需要激活的 trait ID 列表
 */
export function collectCommandTraits(
  traits: TraitDefinition[],
  activeCommands: Set<string>,
): string[]
```

遍历所有 trait，检查 `commandBinding.commands` 是否与 `activeCommands` 有交集。

### 5.4 Activator 变更（关键）

现有 `getActiveTraits()` 对 `when: "never"` 的 trait 直接 `continue` 跳过。
但新设计中，`when: never` 的 trait 可以通过 `activatedTraits`（scope chain）动态激活。

**必须修改 activator.ts**：

```typescript
// 现有（错误）
if (trait.when === "never") continue;

// 修改为
if (trait.when === "never" && !scopeSet.has(id)) continue;
```

这样 `when: never` 的 trait 如果出现在 scope chain 中（被 engine 通过 `tree.activateTrait()` 加入），仍然会被激活。

## 6. FormManager 实现

### 6.1 数据结构

```typescript
/** 活跃的 Form */
interface ActiveForm {
  formId: string;          // "f_001"
  command: string;         // "talk"
  description: string;     // "通知 sophia 基因更新"
  createdAt: number;
}

/** Form 管理器 */
class FormManager {
  private forms: Map<string, ActiveForm>;
  private commandRefCount: Map<string, number>;

  /** 开启 form，返回 form_id */
  begin(command: string, description: string): string;

  /** 提交 form，返回被提交的 form 信息 */
  submit(formId: string): ActiveForm | null;

  /** 取消 form，返回被取消的 form 信息 */
  cancel(formId: string): ActiveForm | null;

  /** 获取当前活跃的指令类型集合（引用计数 > 0 的） */
  activeCommands(): Set<string>;

  /** 获取所有活跃 form 列表（用于 context 展示） */
  activeForms(): ActiveForm[];

  /** 从持久化数据恢复（resume 场景） */
  static fromData(forms: ActiveForm[]): FormManager;

  /** 导出为持久化数据 */
  toData(): ActiveForm[];
}
```

### 6.2 form_id 生成

```typescript
function generateFormId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
```

## 7. Parser 变更

### 7.1 新增解析类型

```typescript
/** form begin 指令 */
interface FormBeginDirective {
  command: string;       // "talk"
  description: string;   // "通知 sophia"
}

/** form submit 指令 */
interface FormSubmitDirective {
  command: string;       // "talk"
  formId: string;        // "f_001"
  params: Record<string, unknown>;  // 指令参数（target, message 等）
}

/** form cancel 指令 */
interface FormCancelDirective {
  formId: string;        // "f_001"
}
```

### 7.2 ThreadParsedOutput 变更

兼容期（Phase 2）：同时保留旧字段和新字段，新字段优先：

```typescript
interface ThreadParsedOutput {
  // === 新 form 操作 ===
  formBegin: FormBeginDirective | null;
  formSubmit: FormSubmitDirective | null;
  formCancel: FormCancelDirective | null;

  // === 旧字段（兼容期保留，Phase 5 删除） ===
  thought?: string;
  program: ProgramSection | null;
  talk: TalkSection | null;
  talkSync: TalkSection | null;
  createSubThread: CreateSubThreadDirective | null;
  threadReturn: ThreadReturnDirective | null;
  awaitThreads: string[] | null;
  continueSubThread: ContinueSubThreadDirective | null;
  mark: MarkDirective | null;
  addTodo: AddTodoDirective | null;

  // === 保留（不受 form 模型影响） ===
  setPlan: string | null;
  useSkill: UseSkillDirective | null;
  actions: ActionSection[];
}
```

**兼容期优先级**：如果同时存在 `formSubmit` 和旧的 `talk` 字段，以 `formSubmit` 为准，忽略旧字段。
thinkloop 在兼容期检查：`if (iterResult.formSubmit) { /* 新路径 */ } else if (iterResult.talk) { /* 旧路径 */ }`

**Phase 5**：删除所有旧字段，只保留 form 操作 + setPlan + useSkill + actions。

**关于 `[thought]`**：thinking mode 已取代 `[thought]` 段（engine 从 thinkingContent 自动记录 thought action）。
兼容期保留 `thought` 字段以防旧格式输出，Phase 5 删除。

### 7.3 解析逻辑

parser 检测 TOML 中的 `[xxx.begin]`、`[xxx.submit]`、`[xxx.cancel]` 段：

```typescript
// 匹配 [command.action] 格式
for (const key of Object.keys(parsed)) {
  const match = key.match(/^(\w+)\.(begin|submit|cancel)$/);
  if (match) {
    const [, command, action] = match;
    // 提取对应字段...
  }
}
```

## 8. Engine 处理流程

### 8.1 begin 处理

```
对象输出 [talk.begin] description = "通知 sophia"
    ↓
parser → formBegin = { command: "talk", description: "通知 sophia" }
    ↓
thinkloop 透传 → iterResult.formBegin
    ↓
engine:
  1. FormManager.begin("talk", "通知 sophia") → form_id = "f_001"
  2. collectCommandTraits(traits, activeCommands) → ["kernel/talkable"]
  3. await tree.activateTrait(threadId, "kernel/talkable")
  4. 持久化 FormManager 状态到 threadData.activeForms
  5. 写入 inject action: "Form f_001 已创建。talkable 知识已加载。"
    ↓
下一轮 context 包含 talkable trait
```

### 8.2 submit 处理

```
对象输出 [talk.submit] form_id = "f_001" target = "sophia" message = "..."
    ↓
parser → formSubmit = { command: "talk", formId: "f_001", params: { target, message } }
    ↓
engine:
  1. FormManager.submit("f_001")
     - 如果 form_id 不存在 → 写入 inject action: "[错误] Form f_001 不存在。" → 跳过执行
     - 如果存在 → 引用计数 -1
  2. 执行 talk 逻辑（和现有一样）
  3. 如果 talk 类型引用计数 = 0 → await tree.deactivateTrait(threadId, "kernel/talkable")
  4. 持久化 FormManager 状态
  5. 写入 action 记录
```

### 8.3 cancel 处理

```
对象输出 [talk.cancel] form_id = "f_001"
    ↓
engine:
  1. FormManager.cancel("f_001")
     - 如果 form_id 不存在 → 写入 inject action: "[错误] Form f_001 不存在。"
     - 如果存在 → 引用计数 -1
  2. 如果引用计数 = 0 → await tree.deactivateTrait(threadId, ...)
  3. 持久化 FormManager 状态
  4. 写入 inject action: "Form f_001 已取消。"
```

### 8.4 线程结束时的清理

当线程结束（return/done/failed）时，engine 自动 cancel 所有活跃 form：

```typescript
// 在 applyIterationResult 中，当 statusChange === "done" 或 "failed" 时
for (const form of formManager.activeForms()) {
  formManager.cancel(form.formId);
}
// 不需要 deactivateTrait（线程已结束，trait 状态无意义）
```

这确保 FormManager 状态一致，不会有悬挂的 form。

### 8.5 Context Builder 集成

`buildThreadContext()` 中：
1. 从 `threadData.activeForms` 恢复 FormManager 状态
2. 基于 `FormManager.activeCommands()` 调用 `collectCommandTraits()` 获取需要加载的 trait
3. 将这些 trait 加入 activatedTraits（和现有的 scope chain 机制合并）
4. 在 context 中展示活跃 form 列表（让对象知道自己有哪些未完成的 form）

## 9. 模块划分

### 9.1 新增文件

```
kernel/src/thread/form.ts    — FormManager 实现
kernel/traits/base/TRAIT.md  — 极简基座 trait
```

### 9.2 移动文件

```
kernel/traits/file_ops/      → kernel/traits/computable/file_ops/
kernel/traits/file_search/   → kernel/traits/computable/file_search/
kernel/traits/shell_exec/    → kernel/traits/computable/shell_exec/
kernel/traits/web_search/    → kernel/traits/computable/web_search/
kernel/traits/testable/      → kernel/traits/computable/testable/
```

### 9.3 修改文件

| 文件 | 改动 |
|------|------|
| `thread/parser.ts` | 新增 `[xxx.begin]`/`[xxx.submit]`/`[xxx.cancel]` 解析；兼容期保留旧指令解析 |
| `thread/thinkloop.ts` | ThreadIterationResult 新增 formBegin/formSubmit/formCancel；兼容期保留旧字段 |
| `thread/engine.ts` | 集成 FormManager；begin 时 await activateTrait、submit/cancel 时 await deactivateTrait；form_id 生成和注入；线程结束时清理活跃 form |
| `thread/hooks.ts` | 新增 `collectCommandTraits()` 函数（基于 commandBinding 收集 trait） |
| `thread/context-builder.ts` | 基于 activeCommands 决定加载哪些 trait；activeForms 展示在 context |
| `thread/types.ts` | ThreadDataFile 新增 `activeForms?: ActiveForm[]` |
| `types/trait.ts` | TraitDefinition 新增 `commandBinding?: { commands: string[] }` 字段 |
| `trait/activator.ts` | **关键改动**：`when: "never"` 的 trait 如果出现在 scopeChain 中仍然激活（`if (trait.when === "never" && !scopeSet.has(id)) continue;`） |
| `trait/loader.ts` | 解析 frontmatter 的 `command_binding` 字段，映射到 `TraitDefinition.commandBinding` |
| 所有 kernel trait TRAIT.md | `when: always` → `when: never` + 新增 `command_binding` |

### 9.4 不改动

- `skill/` — Skill 系统独立
- `world/world.ts` — trait 加载逻辑不变

## 10. 测试计划

| 测试文件 | 覆盖内容 |
|---------|---------|
| `tests/thread-form.test.ts` | FormManager: begin/submit/cancel、引用计数、activeCommands、并行 form、toData/fromData |
| `tests/thread-parser.test.ts` | 新增 begin/submit/cancel 解析测试 |
| `tests/thread-thinkloop.test.ts` | formBegin/formSubmit/formCancel 透传 |
| `tests/thread-hooks.test.ts` | when_command hook 收集、多指令匹配 |
| `tests/thread-context-builder.test.ts` | activeCommands 影响 trait 加载、activeForms 展示 |

## 11. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 基座 trait | 极简 base（唯一 always） | 空闲态 context 最小化 |
| 指令生命周期 | begin/submit/cancel form 模型 | 支持多轮准备、并行 form、显式取消 |
| Trait 加载触发 | commandBinding 独立字段 | 不复用 TraitHook 接口（结构不同），解耦清晰 |
| 并行规则 | 所有类型可并行，每轮只能一个 form 操作 | TOML 不允许重复 key，并行通过跨轮实现 |
| 引用计数 | 同类型 form 共享 trait | 避免重复加载/过早卸载 |
| 工具 trait 位置 | 移入 computable 子目录 | file_ops/shell_exec 等是 program 的工具 |
| Form 持久化 | ThreadDataFile.activeForms | 支持 resume 场景 |
| activator 改动 | `when: never` + scopeChain → 仍激活 | 关键：让动态 activateTrait 对 never trait 生效 |
| 兼容期策略 | 新旧字段共存，新字段优先 | Phase 2-4 渐进迁移，Phase 5 删除旧字段 |
| 线程结束清理 | 自动 cancel 所有活跃 form | 防止 FormManager 状态不一致 |
| form_id 无效处理 | 注入错误提示，不执行指令 | 让对象知道错误并重新 begin |
| thought 定位 | thinking mode 取代，兼容期保留字段 | Phase 5 删除 |

## 12. 迁移策略

这是一个破坏性重构，需要分阶段实施：

1. **Phase 1**：新增 FormManager + when_command hook + base trait（不删旧代码）
2. **Phase 2**：parser 支持新旧两种格式（兼容期）
3. **Phase 3**：移动工具 trait 到 computable 子目录
4. **Phase 4**：所有 kernel trait 切换为 when: never + when_command
5. **Phase 5**：删除旧的扁平指令解析代码
