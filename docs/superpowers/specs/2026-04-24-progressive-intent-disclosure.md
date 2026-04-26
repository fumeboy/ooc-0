# 渐进式意图披露：要做的事与要激活的知识

TODO 还没考虑清楚

> ⚠️ **本文档中描述的 partial submit / submit(partial=true) 机制已于 2026-04-26 退役**，
> 由 `refine` tool 取代。详见 `docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md`。

> 日期：2026-04-24
> 状态：思考札记，待继续设计
> 主题：如何更好地做“要做的事”与“要激活的知识”的自动匹配

## 背景

当前系统里，知识激活主要围绕 command tree 与 `command_binding` 展开。对象打开某个 command 后，系统根据命令路径加载对应 trait。

这个机制能工作，但暴露了一个哲学和工程上的问题：对象并不总是知道 command tree 里有哪些子路径，也不总是知道应该通过 `partial submit` 逐步触发更深层的 trait 激活。

换句话说，系统内部知道行动空间，但对象未必能看见行动空间。不可见的能力，对对象来说就不是它真正拥有的能力。

## 核心洞察

这不是“如何展示 sub command”的问题，而是“对象如何逐步形成行动意图，并在形成过程中获得相关知识”的问题。

更好的心智模型不是 command tree，而是渐进式披露：

> 对象不是一次性知道所有参数，也不是一次性知道所有知识。它先表达一个粗意图，系统根据这个粗意图披露下一层需要知道的东西；对象再补充意图，系统再披露更具体的知识。

这有点像填写一个多步表格。每填一步，界面展示新的信息，帮助填写下一步。

在 OOC 中，这个“表格”不是 UI 表单，而是行动意图的成形过程。

## 设计方向

### 1. 从 command 转向 intent form

`open(command=talk)` 不应只被理解为打开一个工具表单，而应被理解为打开一个 Intent Form。

Intent Form 收集的参数， 同时也表达了对象的意图，并且可以通过这些参数的具体值，自动激活相关知识。

```yaml
intent_form:
  action: talk
  params:
    target: user
    mode: continue
    purpose: deliver
    output: text
    wait: true
    message: ...
```

比如这些参数表达的是“我要做什么”：

- `target`：我要和谁互动
- `mode`：开新线程、继续旧线程、回复创建者
- `purpose`：询问、回答、交付、委派、关系更新、经验沉淀
- `output`：文本、报告、表单、导航卡片、代码变更
- `stakes`：低风险、中风险、高风险
- `wait`：执行后是否等待对方

### 2. 渐进式披露流程

一个典型流程：

```text
open(action="talk")
→ 激活 talk 基础知识，知道 form schema, 知道参数含义

refine(target="user", arg2="xxx")
→ 披露 和 target 相关的 knowledge

refine(purpose="deliver")
→ 披露 delivery / verifiable / user presentation 知识

submit()
→ 提交表单执行
```

每次 refine 后，如果匹配到了新的知识，系统会自动激活并插入一条 inject 消息进行提示。

### 3. 知识匹配方式

见下文的 Knowledge Activator

### 4. partial submit 的迁移

`partial submit` 这个名字容易误导，因为它听起来像“提交半成品”。实际上它做的是：

- 表达一部分意图
- 让系统根据已表达意图披露下一层信息
- 推进认知表单，而不是执行动作

更准确的概念是：

```text
refine / disclose / fill_step / continue_form
```

也就是说，探索知识不应该伪装成“半个 submit”。对象不是在填 API 参数，它是在澄清意图。

因此需要废弃 `partial submit`， 新增 tool `refine` 专门用于填写 form, 并且 `submit` 不允许填写 form 参数，相关 kernel trait 需要一并调整。

## 落到线程树：open 即派生出 sub thread

Intent Form 不需要作为独立的状态机实现。它复用线程树的机制：

> `open(action)` 创建 sub thread——sub thread 继承 parent thread 在 fork 点的上下文和过程。open 支持 async: bool 参数，控制父 thread 是否进入 waiting。
> sub thread 内部按照"填表 → 披露 → 再填表"的节奏逐步澄清意图，最终提交动作或放弃。
> sub thread 执行 `submit` 或 `close` 时，父 thread 的 process 插入一条相同的 submit/close 记录，然后从 waiting 恢复 running。然后再由 parent thread 执行 action (sub thread 只负责填表提交，但不在 sub thread 执行)
> 在 parent thread 的上下文里，可以看到 sub thread 的 summary: 激活了哪些知识、进行了哪些行动(的标题)，具体过程折叠到 sub thread 内部。

### 为什么是 fork，而不是裁剪视图或临时助手

三个选项对比过：
- **临时意图助手对象**：哲学断裂——"我 open 了 talk，但思考的人不是我" 违反主体一致性。否决。
- **父对象身份 + 裁剪视图**：context 省，但对象在 sub thread 里的"自我"变成残缺版本，边界尴尬。否决。
- **完整 fork**（选定）：对象带着整个自己进入 sub thread，只是此刻的任务被限定为"完成这张 form"。主体一致、上下文完整、边界清晰。

### 机制隐身：sub thread 不解释 fork

sub thread 内部的对象**不需要任何额外说明**——既不需要被告知"你是父对象的副本"，也不需要被注入"你正在填一张表"的指令。

为什么这么说：fork 后 sub thread 看到的 process 里，最近一条记录就是 `open(action)` 的调用，紧随其后的就是它自己将要做的事。槽位填了什么、还缺什么，都会在 process 中自然展示。submit / close 是已有的工具。LLM 自然会接续"我刚 open 了一个 form，下一步把它做完或放弃"——不需要 kernel 额外铺一段任务陈述。

机制隐身的真正含义是：**没有任何为 sub thread 特设的 prompt 注入**。process 自身就是最完整的上下文。

### 映射表

| Intent Form 概念 | 线程树实现 |
|---|---|
| 打开表单 | `open(action)` → `create_sub_thread()`（fork），父 thread `await` |
| refine 一步 | sub thread 内的一次正常 thinking turn（无需新 tool） |
| 披露知识 | Knowledge Matcher 在 sub thread 的 context-builder 里注入，不污染父 thread |
| submit 执行 | sub thread 内调用底层 command 并 `return(outcome)` |
| close 放弃 | sub thread `return(status=abandoned, filled_slots, reason)` |
| 父 thread 视角 | 只看到 open + submit/close 两条记录，submit/close 记录附带过程概述（激活的 trait 标题 + 执行的 action 标题）|

### 此方案顺手解掉的几件事

- 「refine 是新 tool 还是 `submit(partial=true)`」——都不是，它就是 sub thread 的一次普通填表动作。概念消失。
- 「披露的知识会污染父上下文」——只在 sub thread 内部披露，父线程保持干净。
- 「对象试错、重来」——在 sub thread 内自由迭代，父 thread 无感。
- 「partial submit 命名尴尬」——不再需要这个词。
- 「sub thread 里的对象是谁」——就是父对象本身（fork 副本），不是助手、不是残缺视图。

## 填表循环：披露与填表的节奏

sub thread 内部按以下节奏推进：

```text
open(action, 初始槽位?)
  └─ 进入 sub thread
     │
     ├─ Round 0：披露与 action 相关的基本信息
     │    - form schema 中"不依赖任何槽位"的基础知识
     │    - 当前已填槽位（来自 open 参数）
     │    - 下一步需要澄清什么
     │
     ├─ Round 1：填表动作（一次 thinking turn）
     │    - 对象补填若干槽位，或调整已有槽位
     │    - 三种结局之一：
     │        a) 槽位更新，触发新一轮披露 → Round 2
     │        b) 槽位已完整且合理 → 确认提交，执行底层 command，return
     │        c) 判断意图无法成立 → 放弃，return(abandoned)
     │
     ├─ Round 2：披露更多信息（由 Round 1 的槽位变化触发）
     │    - Knowledge Matcher 基于新 filled_slots 重新匹配
     │    - 披露新增的知识 / 候选 action / 注意事项
     │
     ├─ Round 3：填表动作
     │    ...
     │
     └─ 终止：submit 或 abandon
```

关键点：
- **披露和填表交替进行**，不是一次性披露所有知识。
- **每一次槽位变化都可能触发新披露**（Knowledge Matcher 在每轮重新匹配）。
- **增量披露而非全量替换**：已披露的知识保留在 sub thread 上下文里，新披露追加。
- **填表本身是 thinking turn**，不需要专门的 fill/refine tool；对象通过 output 中的 TOML 片段（或类似结构）声明槽位更新。
- **确认提交和放弃是终止动作**，必须显式。
- **不设硬性轮次上限**：是否多轮、几轮，由对象自己根据情境判断；kernel 不预设"3 轮强制收敛"之类的安全网，避免人为切断对象的合理思考。

## 嵌套 open：sub thread 内可以再 open

sub thread 在填表过程中，可以发现自己需要先做另一件事（比如填 talk form 时发现需要先查 user 的偏好——open 一个 read 动作）。它可以再 `open(action_2)` 派生一层 sub-sub thread，自身进入 waiting，sub-sub 终止后恢复并继续填原 form。

线程树本身已经支持任意深度嵌套，工程上不需要新机制。需要解决的是**认知约束**：LLM 在嵌套深时不能跳层乱答。

### 唯一活跃 form 原则

引擎层面：任意时刻**只有最新打开的 form（栈顶）所在的 sub thread 在 running**，其余祖先 thread 全部 waiting。这天然杜绝"跨层并发"。

不需要 prompt 层补强：sub thread 自己 process 的最近一条记录就是它当时的 `open(action)` 调用——LLM 自然聚焦在这个最新 open 上。如果有冲动"先做别的事"，正确做法就是再 open 一个新 form 进入更深一层；这是 open 工具的常识用法，不需要特设规则。

### 嵌套展示

父 thread 视角下，嵌套 open 仍然只折叠成两条记录（外层 open + 外层 submit/close）。外层的 process_summary 里把内层 open 当作**一项普通 executed_action** 记录，**不展开内层 process**：

```text
父 thread 看到：
  open(talk)
  submit(talk) {
    process_summary: {
      activated_traits: [user_relations, talkable_delivery, verifiable],
      executed_actions: [
        "open(read user/relations/self.md)",   // 内层 open，作为一条 action
        "talk(deliver, message=...)"
      ]
    }
  }
```

注意 "open(read ...)" 这一项**不附带任何来自内层 sub thread 的 process_summary**——内层激活了什么 trait、执行了什么 action，留在内层自己的 writeback 记录里。每层只描述自己的过程，不向上递归、不向下展开。每多一层嵌套，多一层折叠，外部干净度不变。

### 需要定义清楚的几个点

1. **快速路径**：`open(talk, target=..., msg=...)` 意图已完整时，sub thread 应在 Round 1 直接提交并 return，不强制走多轮填表。判定交给对象本身（"当前槽位足够、合理，直接提交"），不在 kernel 层做特判。

2. **sub thread 是"填参数"还是"执行动作"**：选择后者。sub thread 最终一步直接调用底层 command 并把结果作为 return payload。父 thread 收到的是"已执行结果"，不是"待执行参数"。这样避免父子两层都要处理参数编译。

3. **close 的返回契约**：close 必须携带 `{status: abandoned, filled_slots, reason}`。父 thread 基于"为什么放弃 + 已填了什么"决定下一步，而不是收到空返回。

4. **不为 sub thread 注入额外 prompt**：fork 后 process 已包含 `open(action)` 调用和后续槽位变化，足以让 LLM 自然接续。不需要 kernel 模板、不需要任务陈述、不需要解释 fork 机制——任何特设注入都是多余。

5. **submit / close 记录的粒度（含过程概述）**：sub thread 终止时写回 parent 的记录不仅是结果，还要带 sub thread 过程的**结构化概述**：

   ```text
   {
     action: "talk",
     status: "submitted" | "abandoned",
     filled_slots: { ... },
     outcome: { ... command 返回 ... } | { reason: "..." },
     process_summary: {
       activated_traits: [trait_name_1, trait_name_2, ...],     // 过程中激活的 trait 名（去重）
       executed_actions: [action_title_1, action_title_2, ...]  // 过程中执行的 action 标题（按时间顺序）
     }
   }
   ```

   只取标题不取全文，让 parent 看到"我刚才 open 了 talk，过程中调用了 X 知识、做了 Y、Z 操作"，但不被中间细节淹没。

   **字段来源与归并规则**：
   - `filled_slots` **全量写回**，不裁剪、不区分 essential。slots 本身是 key-value，体量小，不会污染 parent 上下文，且省去维护 essential 标记的复杂度。
   - `activated_traits` 的标题就是 **trait name 本身**（trait 文件/注册表中的名字），无需额外 title 字段。
   - `executed_actions` 的标题在 **tool use 时由调用方设置**（每次 tool 调用自带 title 描述）。
   - 同一个 trait 在 sub thread 内被多次激活，**只记一次**（去重）。
   - actions **按时间顺序排列**，反映过程的真实节拍，不做重要性排序也不去重（同一 action 调用多次就出现多次）。
   - **内层 sub thread 的 process_summary 不向外蔓延**：嵌套 open 时，外层的 executed_actions 里只出现"open(inner_action)"这一条，内层自己的 activated_traits / executed_actions 留在内层的 writeback 记录里，不递归进入外层。每层只描述自己的过程，不重复祖先或子层的内容。

6. **fork 的具体语义（浅拷贝 + 快照引用）**：sub thread 在 fork 点**浅拷贝**自己的元信息，并**记录一个指向 parent 当前 process 与上下文的引用**（快照点）。sub thread 不深拷贝 parent 的 process / context 数据本身——它只在自己的 context-builder 里把"快照点之前的 parent 内容"作为只读基底拼进来。

   - parent 在 waiting 期间 process 不会增长（waiting 即冻结），所以引用安全。
   - sub thread 自己后续产生的 turns 写入 sub thread 的 process，不影响 parent。
   - sub thread 终止后，parent 恢复 running，从快照点继续追加自己的 turns。
   - 不需要 COW、不需要深拷贝——线程树本来就保证了"waiting 期间不写入"。

### Form schema 的角色

每种 action 的 form schema **就附在命令树根节点上**——不单独建表、不分层存放、不让 trait 维护"扩展声明"：

```ts
COMMAND_TREE.talk = {
  form: { slots: ["target", "context", "type", "output", "message", "wait"] },
  match, bindings, children
}
```

schema 唯一的字段是 **slots**——这张 form 可能包含的槽位列表，用于让对象知道"还能填什么"以及做参数校验。

不需要 seed、不需要任务陈述、不需要触发规则：
- "什么槽位组合激活什么知识" → 命令树节点的 matcher 函数 + bindings（见 Knowledge Activator）
- "对象怎么知道做什么" → fork 后的 process 已包含 `open(action)` 调用，无需额外注入

trait 想扩展某 action 时，通过已有的 `command_tree_bindings` 注册新子节点。新子节点引入的 args 自然进入路径——matcher 函数就要处理它们；slot 列表可在命令树合并时同步追加，不需要额外的 "extends_form" 机制。

## Knowledge Activator：统一的知识激活中枢

### 名字与定位

`kernel/src/trait/activator.ts` **更名** `kernel/src/knowledge/activator.ts`，从"trait 激活器"升级为"知识激活器"。

单一中枢，单一 API。所有"哪些知识应当出现在 sub thread 上下文里"的判断都收口到它身上，避免双轨干涉。

### 存量概念归并

完成本设计后，以下存量概念**全部归并**到 Knowledge Activator 名下，不再作为独立机制存在：

| 存量机制 | 归并方式 |
|---|---|
| Phase 0 起点：stone readme 的 `activated_traits` | Activator 的"起点源"输入 |
| Phase 4 过程：命令树 `command_binding` + `collectCommandTraits` 冒泡 | Activator 的"过程源"输入，由命令树节点上的 matcher 函数驱动 |
| Phase 5 终点：peers 扫描 + `<relations>` 索引区块 | Activator 输出中 `presentation=summary` 的 relation 项 |
| Phase 2/6 终点：`@relation:peer` 虚拟路径 LLM 主动 open | Activator 输出中 `presentation=full` 的 relation 项（也允许 LLM 走 open 显式触发） |
| `getActiveTraits` / `command_binding` 概念 | 退役，所有调用点改走 Activator |

不允许"既有命令树 binding 又有 trait 自声明 helps_when"的双轨——单源真相，命令树 + Activator 是唯一权威。

### 多源汇总

Activator 输入是 thread state 的若干切片，输出统一的 `KnowledgeRef[]`：

```text
inputs:
  origin:   stone.readme.activated_traits
  process:  FormManager.accumulatedArgs  → 命令树 matcher → 路径集 → 冒泡 bindings
  target:   thread peers + 当前 form 的 target slot
output:
  KnowledgeRef[] = [
    { type, ref, source, presentation, reason }
  ]
```

### KnowledgeRef 统一格式

```ts
type KnowledgeRef = {
  type: "trait" | "relation"           // 当前两类；未来可加 experience / memory
  ref: string                          // 如 "@trait:talkable" / "@relation:user"
  source:                              // 这条知识为什么被激活
    | { kind: "origin" }
    | { kind: "command_path", path: string }
    | { kind: "peer_index" }
    | { kind: "open_action" }
  presentation: "summary" | "full"     // summary = 索引行；full = 进 open-files 全文
  reason: string                       // 给 LLM / 给人类调试看的说明
}
```

context-builder 拿到这个列表后：
- `presentation=summary` → 渲染成一行索引（替代旧 `<relations>` 区块的实现，归一到统一渲染器）
- `presentation=full` → 进入 open-files 中枢（沿用 Phase 3 单调追加 / close 卸载机制）

### 命令树节点的函数式 matcher

每个命令树节点声明一段 **matcher 函数** 用于"根据 args 判断当前节点下命中哪些子路径"。函数可返回**多个**命中路径——同一组 args 可能同时激活多个 branch 的 binding。

```ts
type CommandNode = {
  // 给定当前 args，返回此节点下命中的子节点 key 列表（可空、可多个）
  match: (args: Args) => string[]

  // 此节点绑定的知识引用（命中本节点即激活）
  bindings: KnowledgeRef[]

  children: Record<string, CommandNode>
}
```

例子：

```ts
COMMAND_TREE.talk = {
  match: (args) => {
    const hit: string[] = []
    if (args.context === "continue") hit.push("continue")
    if (args.context === "fork")     hit.push("fork")
    if (args.context === "new")      hit.push("new")
    return hit
  },
  bindings: [{ type: "trait", ref: "@trait:talkable", presentation: "full", ... }],
  children: {
    continue: { match: (args) => args.type === "relation_update" ? ["relation_update"] : [], ... },
    fork:     { ... },
    new:      { ... },
  }
}
```

执行流程：
1. Activator 从 root 命令开始递归调用每个节点的 `match(args)`
2. 收集所有命中路径上的 bindings（冒泡 = 路径上所有祖先节点的 bindings 都激活）
3. 多路径同时命中时，bindings 取并集（去重）
4. 输出与起点源 + 终点源汇总后的 `KnowledgeRef[]`

**为什么用函数而不是声明式谓词**：
- 函数任意复杂度，省去 DSL 设计
- 同节点多路径命中天然支持
- 命令树扩展者一次写完，无需在多处维护匹配规则
- 测试容易（纯函数，单元测试直接喂 args 断言路径列表）

代价：matcher 不可序列化、不可前端可视化。这个代价目前可接受——matcher 本来就是 kernel 内部细节，不需要跨语言传递。

### 何时运行

每次 `FormManager.accumulatedArgs` 变化（即每次 sub thread 内任何会改 args 的动作之后），Activator 重新跑一次。命令路径不变就直接复用上次结果（FormManager 已追踪 commandPath）。

### 与 open-files 中枢的关系

Activator 决定"哪些 ref 应当 active"；open-files 决定"如何把 active 的 ref 装进 context、何时卸载"。两者职责互补不重叠：

- Activator：知识来源识别 + 选择
- open-files：context 装载 + 生命周期

## 设计原则

1. **行动先于命令**

   对象表达“我要做什么”，系统再映射到底层 command。

2. **知识由情境召唤**

   trait / relation / skill / memory 绑定的是 intent situation，不是 API 名称。

3. **披露必须可解释**

   每个被激活或推荐的知识都要说明 reason。

4. **表单推进就是认知推进**

   refine 不是半提交，而是“我补充了一个意图维度，请展开下一层世界”。

## 迁移路径草案

1. 改造 `open` 语义：不再在父 thread 内就地注入表单，而是 fork 出 sub thread 并让父 thread 进入 `await`。
2. 定义 sub thread 的 return/close 契约：return 携带 outcome，close 携带 `{status, filled_slots, reason}`；父 thread 恢复 running 时在 process 插入对应压缩记录（含 `process_summary`）。
3. 为 `talk` 命令树根节点补全 `form: { slots }`、函数式 matcher、bindings——schema 就附在节点上，不单独建表。
4. **Knowledge Activator 重构**：
   - `kernel/src/trait/activator.ts` → `kernel/src/knowledge/activator.ts`
   - 命令树节点声明 `match(args) => string[]` 函数 + `bindings: KnowledgeRef[]`
   - 实现 origin / process / target 三源汇总
   - 输出统一 `KnowledgeRef[]`，由 context-builder 按 `presentation` 渲染
5. **存量归并**：
   - `getActiveTraits` / `command_binding` 全部改走 Activator
   - `<relations>` 区块的渲染逻辑迁入 context-builder 的统一渲染器（input 来自 Activator 的 `presentation=summary` 项）
   - `@relation:peer` 虚拟路径保留为 LLM 显式触发入口，但其行为与 Activator `presentation=full` 输出殊途同归（在 open-files 中枢汇合）
6. 最终让命令树退到内部编译层，外部认知界面变成 open → sub thread → submit/close。

## 未决问题

- 低置信知识是只展示 candidate，还是允许对象一键 open？（注：当前 Activator 模型不存在 candidate 层——命中即激活；此问题留待未来若引入概率匹配再考虑）
- sub thread 的思考循环失败/超时/死循环时的兜底策略（强制 close？父 thread 收到什么？）
- 父 thread 在 waiting 期间能否被外部消息唤醒（抢占 sub thread）？还是严格等 sub thread 结束？
- 命令树 matcher 函数的可观测性：调试时如何追溯"为什么这条 binding 没命中"？是否需要 dry-run 工具列出每个节点的 match 结果？

## 暂定结论

推荐方向是：

> `open` 创建 sub thread 承载意图澄清过程，Knowledge Activator 在 sub thread 内按命令树路径 + 起点/终点维度统一激活知识，sub thread 自己决定何时调用底层 command 并 return。父 thread 的上下文只看到 open 和 submit/close 两条记录。

这能把 OOC 从"对象猜 hidden command 参数"推进到"对象在一个独立的思考空间里逐步表达行动意图、世界逐步显现相关知识、完成后干净回到主线"。

两条关键架构收益：
1. **不新增表单状态机**——Intent Form 成为线程树的一种使用约定。
2. **不新增匹配机制**——Knowledge Activator 把存量 trait 激活、relations 索引、`@relation:` 虚拟路径全部归并到单源真相，命令树节点的函数式 matcher 是唯一的过程维度规则源，避免双轨干涉。
