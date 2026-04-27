# Refine 工具 + Knowledge Activator 统一

> 日期：2026-04-26
> 状态：设计草案，待实现
> 范围：单 thread 内的 open/refine/submit/close 工具重构 + Knowledge Activator 概念升级
> 明确不包含：sub thread、fork、嵌套 open、填表循环披露机制

> 2026-04-27 实现注记：本文中的 `COMMAND_TREE` / `command-tree.ts` 是设计期命名。
> 当前代码已改为扁平 `COMMAND_TABLE` / `kernel/src/thread/command-table.ts`，语义为多路径并行匹配。

## 背景

目前系统里，意图表达和参数累积的机制存在两个让人不舒服的地方：

1. **`submit(partial=true)` 的语义混淆** ——"半提交"听起来像"提交了半个东西"，实际上它做的是"补充参数、不执行"。命名错位导致 LLM 理解负担。
2. **trait 激活与其他知识形态（view、relation）各走一套**——trait 走 command_binding + 冒泡，relation 走 peers 索引 + 虚拟路径，view（即将引入的 VIEW.md）若再单独建一套则成第三轨。三类知识本质都是"按情境装载到 context 的可读文件"，没有理由分裂。

本设计聚焦于把这两件事**最小步骤**地理顺，不引入更大的架构变动。

## 设计核心

### 1. open / refine / submit / close 四工具重新分工

| 工具 | 做什么 | 是否接受 args |
|---|---|---|
| `open(action, args?)` | 在**当前 thread** 打开一个 form。带 args 时等价于 `open(action)` 紧接 `refine(args)`，是常见调用的便捷形式。 | 可选 args |
| `refine(args)` | 向 open 的 form **追加/修改 args**。可多次调用。每次调用更新 form 的累积参数，支持覆盖已填参数，可能深化命令树路径，从而触发新一轮知识激活。 | 任意 args |
| `submit()` | 执行当前 open 的 form。**不接受 args**——所有参数必须先通过 refine 提供。执行后 form 关闭。 | 无 |
| `close()` | 放弃当前 open 的 form，不执行。 | 无（可带 reason） |

#### 为什么 submit 不接受 args

把"填参数"和"执行"两个动作彻底分开，消除歧义：
- refine = 填参数（可反悔、可叠加）
- submit = 执行（参数已定，按下扳机）

LLM 看到 submit 不接受 args，自然知道"想改参数就 refine"。tool 签名本身就在教学。

### 2. partial submit 完全退役

- `submit` 的 `partial` 字段删除
- `FormManager.partialSubmit` 逻辑迁移到新的 `refine` tool 处理路径
- 所有相关文档（spec、trait 文件中的 bias、tool 描述）同步清理"partial submit"相关说明
- 不保留向后兼容——旧的 `submit(partial=true)` 直接报错，引导改写为 `refine(args)` + 后续 `submit()`

### 3. Knowledge Activator：统一三类知识激活

#### 3.1 重命名

`kernel/src/trait/activator.ts` → `kernel/src/knowledge/activator.ts`

概念升级：从"trait 激活器"扩展为"知识激活器"。

#### 3.2 接管的知识类型

| 类型 | 文件形态 | 当前实现位置 |
|---|---|---|
| **trait** | `kernel/traits/<name>/TRAIT.md` | 已有，命令树 binding + 冒泡 |
| **view** | `<...>/VIEW.md` | VIEW.md 和 TRAIT.md 是同一文件格式，统一交给 Activator |
| **relation** | `/<obj>/relations/<peer>.md`|

三类的共同本质：**按情境装载到 context 的可读 markdown 文件**。Activator 的职责就是"哪些这样的文件现在该出现在 context 里"。

#### 3.3 统一输出格式

```ts
type KnowledgeRef = {
  type: "trait" | "view" | "relation"
  ref: string                           // 如 "@trait:talkable" / "@view:..." / "@relation:user"
  source:                               // 这条知识为什么被激活
    | { kind: "origin" }                // 来自 stone readme 的初始声明
    | { kind: "form_match", path: string }  // 来自命令树节点 binding（refine 累积参数推出的路径）
    | { kind: "relation", path: string } 
    | { kind: "open_action" }           // 来自 LLM 主动 open
  presentation: "summary" | "full"      // summary = 索引行；full = 进 open-files 全文
  open_file_args: string                // 打开 file 时的 args，比如 lines=200; presentation=full 时生效
  reason: string                        // 必带的解释字段
}
```

#### 3.4 存量归并

完成本设计后，这些存量机制不再独立存在：
- `getActiveTraits` 退役
- `<relations>` 区块的渲染逻辑迁入 context-builder 的统一渲染器（输入来自 Activator）
- `@relation:peer` 虚拟路径保留为 LLM 显式入口，但其行为与 Activator 输出在 open-files 中枢汇合

## 命令注册表（不是树）

`COMMAND_TREE` 这个名字保留，但它实际上不是层次化的"树"——它是 action 的注册表 + path 匹配器。每个注册项做三件事：

1. 声明这个 action 可能命中的 **path 集合**
2. 提供 **match 函数**：给定当前 args，从 path 集合中筛出命中项
3. 提供 **exec 函数**：用最终累积的 args 执行底层 command

```ts
COMMAND_TREE.talk = {
  paths: ["talk", "talk.continue", "talk.fork", "talk.new"],
  match: (args) => {
    const hit: string[] = ["talk"]
    if (args.context === "continue") hit.push("talk.continue")
    if (args.context === "fork")     hit.push("talk.fork")
    if (args.context === "new")      hit.push("talk.new")
    return hit
  },
  exec: (args) => {
    // 执行底层 command
  }
}
```

注意命令注册表上**不挂 bindings**。path 只是身份标签——"当前意图属于哪一类"——用来让知识反向关联。

### 知识反向关联到 path

每个 knowledge 文件（TRAIT.md / VIEW.md / relation md）在 frontmatter 里**自己声明**激活条件，包含可关联到的 path：

```markdown
---
name: talkable
activates_on:
  paths: [talk]              # 命中 "talk" 任一 path 时激活（前缀匹配）
---
```

```markdown
---
name: talkable_relation_update
activates_on:
  paths: [talk.continue]     # 仅在 talk.continue 命中时激活
---
```

```markdown
---
name: user_relation
activates_on:
  origin: true               # 只要属于本对象就激活
  # 或 paths / 其他维度
---
```

### Activator 的工作模型

1. **启动时**扫描所有 knowledge 文件的 `activates_on`，建立反向索引：`path → [knowledge_ids]`
2. **每次 refine 后**：
   - 调用对应 `COMMAND_TREE[action].match(args)` 得到当前命中 path 集
   - 查反向索引，取并集，得到候选 knowledge 集
   - 加上 origin 维度（stone readme 声明的）和其他维度（peers / open_action）
   - 输出统一 `KnowledgeRef[]`

这样 **命令注册表只管识别意图类型，knowledge 自己挂关联**。两者解耦——加新 knowledge 不需要改命令注册表，反之亦然。

## 数据流

### refine 调用时

```text
refine(args)
  ↓
FormManager 累积 args（后到覆盖先到）
  ↓
COMMAND_TREE[action].match(accumulatedArgs) → newPaths
  ↓
若 newPaths ≠ oldPaths：
  Knowledge Activator 查反向索引 → 候选 knowledge ids
  汇总 origin / 其他维度 → 新 KnowledgeRef[]
  diff → 新增 ref 进 open-files
  （已有 ref 不撤回，单调追加）
```

### submit 调用时

```text
submit()
  ↓
检查 form 是否处于"可执行"状态（command 路径明确、必填 args 齐）
  ↓ 不可执行
  报错，引导补 refine
  ↓ 可执行
  调用底层 command(form.accumulatedArgs)
  ↓
form 关闭
  ↓
卸载 transient knowledge（按 Phase 3 既有逻辑）
```

### close 调用时

```text
close(reason?)
  ↓
form 关闭
  ↓
卸载 transient knowledge
  ↓
不执行 command
```

## 范围明确

### 在本设计范围内

- 新增 `refine` tool
- 删除 `submit` 的 `partial` 字段及相关代码、文档
- 重命名 `trait/activator.ts` → `knowledge/activator.ts`
- Activator 接入 view (VIEW.md) 文件类型
- Activator 输出 `KnowledgeRef[]` 统一格式
- `<relations>` 渲染逻辑归并到统一渲染器

## 影响范围

### 涉及代码

**新增**：
- `kernel/src/knowledge/activator.ts`（从 trait/activator.ts 改名 + 扩展）
- `kernel/src/knowledge/types.ts`（KnowledgeRef 等类型）
- `kernel/src/thread/tools.ts` 增加 refine tool

**修改**：
- `kernel/src/thread/tools.ts` submit schema 删除 partial 与 args
- `kernel/src/thread/form.ts` partialSubmit → applyRefine
- `kernel/src/thread/engine.ts` 处理 refine 路径，触发 Activator
- `kernel/src/thread/context-builder.ts` 接入新 Activator 输出
- `kernel/src/thread/command-tree.ts` 节点结构加 `form` 字段、`match` 函数化
- `kernel/traits/talkable/**` 等现有 trait 文件中的 partial submit bias 清理

**退役**：
- `kernel/src/trait/activator.ts`（迁至 knowledge/）
- `submit(partial=true)` 路径

### 涉及文档

- 删除/重写所有提及 partial submit 的文档（spec、emergence、experiments）
- 同步更新 `docs/架构/` 下相关图与说明
- `docs/哲学/emergences/` 下若 E14 三阶段激活模型有"trait 激活"措辞，统一为"知识激活"

## 迁移路径

每步独立 commit、独立 revert。

1. **Activator 改名**：`trait/activator.ts` → `knowledge/activator.ts`，类型从 `TraitRef` 升为 `KnowledgeRef`，所有调用点同步改名。功能行为不变。
2. **Activator 扩展 view 支持**：增加 `view` 类型 + VIEW.md 文件加载逻辑。
3. **Activator 归并 relation**：把 peers / `<relations>` 渲染输入改为 Activator 输出。
4. **命令注册表结构升级**：每个注册项带 `paths`、`match(args) => paths[]`、`exec(args)`。注册项不挂 bindings。同时为 knowledge 文件 frontmatter 增加 `activates_on` 字段，建立反向索引。
5. **新增 refine tool**：tool 定义、engine 处理、FormManager 接入。
6. **submit 收敛**：删除 partial 字段、删除 args 字段；旧调用路径报错。
7. **文档清理**：删除所有 partial submit 提及，更新架构图。

## 验证标准

### 单元测试

- Activator 三源汇总输出正确（origin / process / target 各产出对应 ref）
- KnowledgeRef 去重 / 排序 / presentation 分流
- refine 多次累积参数，命令路径正确深化
- submit 在参数不全时正确报错
- close 不执行 command 但正确卸载知识
- view (VIEW.md) 文件能被 Activator 识别加载

### 集成测试

- 完整流程：`open(talk)` → `refine({target:user})` → `refine({context:continue, type:relation_update})` → `submit()` → 验证执行 + 知识装载序列符合预期
- view 文件激活路径走通

### Bruce 验收

- 让 LLM 自然走 open → 多次 refine → submit 流程，观察是否流畅
- 验证 LLM 不会再尝试 `submit(partial=true)`（旧用法应报错引导）

### 回归

- `bun test` 0 new fail
- 既有 thread 在重启后能正常加载（旧的 `submit(partial=true)` 历史记录不影响读取）

## 设计原则

1. **工具命名应当自解释**——refine = 改参数；submit = 执行。语义明确，无需 prompt 解释。
2. **同质机制应当合一**——trait/view/relation 都是"按情境装载的 markdown 文件"，单源真相单一中枢。
3. **本次设计不越界**——只动这两件事；sub thread / fork / 渐进披露等更大设计放到后续。
4. **不考虑向后兼容**——旧机制直接退役，新机制干净上线。
