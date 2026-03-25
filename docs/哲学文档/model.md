# Model — OOC 系统形式化模型

<!--
@ref .ooc/docs/哲学文档/gene.md — extends — Gene 的形式化表达（含 G13 认知栈）
-->

Gene 回答"由什么构成"，Model 回答"是什么"。

---

## 类型系统

### 对象（Object）

```
Object = ⟨Identity, State, Capability, Cognition, Face⟩

Identity = (name, thinkable.who_am_i, talkable.who_am_i, talkable.functions)  -- G1
State = (data, relations)                                                      -- G1, G6
Capability = (traits.methods)                                                  -- G3, G4
Cognition = (traits.biases, traits.windows)                                    -- G3, G5
Face = (ui/)                                                                   -- G11
```

### 形态（Form）

```
Form ::= Stone | Flow

Stone = Object                                    -- G2: 静态形态，被动响应
Flow = ⟨Stone, Process, Status, Messages⟩         -- G2: 动态形态，主动思考

Status ::= running | waiting | pausing | finished | failed
```

### Trait

```
Trait = ⟨name, readme, index?, when, deps⟩

readme: string                                    -- 文档/bias/context window
index?: Module                                    -- 方法定义（可选）
when: "always" | string | "never"                 -- 激活策略
deps: Trait[]                                     -- 依赖的其他 traits

-- 方法注册：始终全量注册，不受激活状态影响
RegisteredMethods(object) = ⋃{trait.index.exports | trait ∈ object.traits, trait.index ≠ ∅}

-- 激活状态：决定 readme 是否注入 context
ActiveTraits(object, node) =
  {t | t ∈ object.traits, t.when = "always"} ∪
  {t | t ∈ object.traits, t.name ∈ node.activatedTraits} ∪
  {t | t ∈ Deps(ActiveTraits)}
```

### Kernel / User Trait 继承

```
EffectiveTraits(object) = KernelTraits ⊕ object.traits

⊕ 规则:
  同名 trait → user object 版本覆盖 kernel 版本
  不同名 trait → 自动合并

持久化: object.traits 只序列化 user-level traits，kernel traits 不重复存储
```

---

## 思考模型

### Context 构建

```
Context = ⟨whoAmI, process, messages, windows, directory, status⟩

whoAmI = thinkable.who_am_i ⊕ ⋃{trait.readme.bias | trait ∈ ActiveTraits}
process = RenderProcessTree(flow.process, flow.focus)
windows = ⋃{trait.readme.window | trait ∈ ActiveTraits, trait 配置为 context window}
directory = [{name, talkable.who_am_i, talkable.functions} | obj ∈ World.objects]
```

### Think 函数

```
Think: Context → Output

Output ::= Thought | Program | Control
  Thought = string                                -- 思考过程
  Program = code                                  -- G4: 程序行动
  Control ::= Continue | Break | Wait             -- 流程控制
```

### Thinkloop

```
Thinkloop(flow) = loop {
  ctx ← BuildContext(flow)                        -- G5
  out ← LLM(ctx)
  segs ← Parse(out)
  flow' ← Execute(segs, flow)                     -- G4
  Record(flow'.process.focusNode.actions)          -- G10
  if flow'.status ∉ {running} then break
}
```

---

## 行为树模型

### Process

```
Process = ⟨root: Node, focus: NodeId⟩

Node = ⟨id, title, status, deps, activatedTraits, actions, summary?, children⟩

status ::= todo | doing | done
deps: NodeId[]                                    -- 必须等待完成
activatedTraits: TraitName[]                      -- 该节点激活的 traits
actions: Event[]                                  -- 该节点的行动记录
summary?: string                                  -- done 时的完成摘要
children: Node[]                                  -- 子节点

MaxDepth = 20
```

### Focus 移动

```
MoveFocus(process) =
  let current = process.focus
  if current.status = done then
    PopStack(current)                             -- 栈出：回到父节点
  else if current.children.any(doing) then
    PushStack(current.children.first(doing))      -- 栈进：进入 doing 子节点
  else if current.children.any(todo ∧ depsResolved) then
    PushStack(current.children.first(todo ∧ depsResolved))
  else
    current                                       -- 留在当前节点
```

### 栈进/栈出

```
PushStack(child):
  加载 child 的详细 context (messages, actions)
  应用 child.activatedTraits
  折叠 child 的兄弟节点为一行摘要

PopStack(child):
  回收 child 的详细 context，替换为 child.summary
  恢复父节点的 activatedTraits
  检查下一个兄弟节点
```

### 渲染（运行时格式）

```
RenderProcessTree(process, focus) =
  缩进文本 + 状态标记，无 XML 闭合标签

示例:
  调查研究"猫咪为什么喜欢纸箱"
      搜索相关新闻 [done] → 找到 3 篇相关文章
      搜索生物学知识 [doing] ← focus
      搜索心理学知识 [todo]
          (依赖: 搜索生物学知识)
      总结信息 [todo]
```

---

## 影响模型

### Effect 类型

```
Effect⟨S, T, M⟩ where S, T ∈ Objects, M ∈ Medium

Medium ::= SelfSpace | Message | PublicMethod | SharedFile
```

### 三种影响方向

```
SelfModification = Effect⟨A, A, SelfSpace⟩        -- G8: 我→我
  A.program → modify(A.persistDir/*)

ReceivingInfluence = Effect⟨B, A, Message | PublicMethod⟩  -- G8: 它→我
  B.talk(A, msg) → A.messages += (B, msg, in)
  B.call(A.method) → A.method.execute()

ExertingInfluence = Effect⟨A, B, Message | PublicMethod | SharedFile⟩  -- G8: 我→它
  A.talk(B, msg) → B.messages += (A, msg, in)
  A.call(B.method) → B.method.execute()
  A.write(shared/file) → B.read(shared/file)
```

---

## Flow 与 Sub-flow 模型

### Main Flow

```
当 Stone S 接收任务 T 时:
  创建 S.effects/T/ 作为 main flow 目录
  main flow = Flow(S, T)
  main flow 拥有 shared/ 目录
```

### Sub-flow

```
当 main flow 需要与 Stone B 交互时:
  创建 S.effects/T/flows/B.name/ 作为 sub-flow 目录
  sub-flow = Flow(B, T)                           -- 完整的 Flow 对象

约束:
  ∀ main flow M, ∀ Stone B:
    |{sub-flow of B in M}| ≤ 1                    -- 唯一性
  sub-flow.shared = main flow.shared              -- 复用 shared/
```

### 目录结构

```
.ooc/objects/{stone}/
└── effects/
    └── {task_id}/                                # main flow
        ├── process.json                           # 行为树 + focus
        ├── data.json                              # flow 数据
        ├── shared/                                # 共享文件区
        └── flows/
            └── {other_stone}/                     # sub-flow（完整 Flow）
                ├── process.json
                ├── data.json
                └── ...
```

---

## 学习模型

### 经验沉淀（Trait 成长）

```
TraitGrowth ::= Phase0 | Phase1 | Phase2 | Phase3

Phase0 = 无 trait                                  -- 经验仅在 actions 中
Phase1 = Trait(readme only)                        -- 知识：知道
Phase2 = Trait(readme + index.ts)                  -- 能力：会做
Phase3 = Trait(readme + index.ts, when="always")   -- 直觉：不需要想

Grow: Phase_n → Phase_{n+1}                        -- 在原地修改，不保留旧版本
```

### 学习循环

```
LearnCycle = 经历 → 记录(G10) → 反思 → 沉淀为 trait(G12) → 结构化遗忘(G5/G9) → 更高效思考

结构化遗忘 = PopStack(doneNode) → doneNode.context 回收为 summary
```

---

## World 模型

```
World = Object where persistDir = .ooc/

World.traits = {registry, router, lifecycle, ...}
World.objects = .ooc/objects/*
World.kernel = .ooc/kernel/

-- World 是生态本身，不是生态中的一个对象
-- 但它遵循 G1：有 readme.md, data.json, traits/, effects/
```

---

## 核心不变式

```
1. 对象是唯一建模单元                              -- G1
2. 对象只能通过公开接口影响其他对象                -- G8
3. 思考基于有限 Context，非全知                    -- G5
4. 行动通过输出程序，非直接操作                    -- G4
5. 状态持久化，重启后恢复                          -- G7
6. 经验沉淀为 trait 的有机成长                     -- G12
7. 结构化遗忘通过行为树 focus 实现                 -- G5, G9
8. Trait 方法始终注册，激活只控制认知注入           -- G3
9. Kernel traits 被继承，同名可覆盖                -- G3
10. 同一 Stone 在同一 main flow 下只有一个 sub-flow -- G2
11. 对象 = 认知栈，Stone = 空闲栈，Flow = 忙碌栈   -- G13
12. 每个栈帧同时包含过程和思维                     -- G13
13. before/after 是非递归元认知帧                   -- G13
```

---

## 认知栈模型（G13）

### 栈帧

```
StackFrame = ⟨task, traits, knowledge, actions⟩

task: string                                      -- 过程：做什么
traits: TraitName[]                               -- 思维：用什么来想
knowledge: Map<string, any>                       -- 局部数据
actions: Event[]                                  -- 行动记录

-- 帧 0 是特殊的：永远不 pop
Frame0 = StackFrame where
  task = "存在"
  traits = KernelTraits ∪ AlwaysOnTraits
  knowledge = Self(who_am_i, data, relations)
```

### 作用域链

```
ScopeChain(frame_n) = frame_n ∪ frame_{n-1} ∪ ... ∪ frame_0

-- Context 是作用域链的投影
Context(flow) = ScopeChain(flow.currentFrame)

-- 内层 shadow 外层
Resolve(key, frame_n) =
  if key ∈ frame_n.knowledge then frame_n.knowledge[key]
  else Resolve(key, frame_{n-1})
```

### before/after 元认知帧

```
MetaFrame ::= BeforeFrame | AfterFrame

-- 元认知帧不触发 hook（非递归）
BeforeFrame(frame) =
  需要的 traits ← Analyze(frame.task)
  Activate(需要的 traits)
  加载 knowledge

AfterFrame(frame) =
  if HasValue(frame) then
    Crystallize(frame) → 沉淀为 frame_0 的新 trait    -- G12
  Deactivate(frame.traits)
  清理 knowledge
```

### Push/Pop

```
Push(child_frame):
  Execute(BeforeFrame(child_frame))                   -- 非递归
  加载 child_frame 的详细 context
  折叠兄弟帧为摘要

Pop(child_frame):
  Execute(AfterFrame(child_frame))                    -- 非递归
  回收 child_frame 的 context → summary
  恢复父帧的 context
```

### 对象间通信

```
CrossStackPush(A, B, message):
  A 的某帧执行 talk(B.name, message)
  → B.stack.Push(StackFrame(task=message, traits=[], knowledge={}))
  -- Actor Model: 消息 = 跨栈的 push
```

### 经验内联

```
Inline(frame, frame_0):
  -- 高频帧内联到帧 0，类似编译器函数内联
  frame_0.traits += Crystallize(frame)
  -- 下次类似任务不需要 push 新帧，帧 0 直接处理

-- 智慧 = 帧 0 的厚度
Wisdom(object) ∝ |frame_0.traits|
```
