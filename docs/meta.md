# Meta — OOC 概念树

> 草稿文档。从 Object 出发，展开 OOC 的完整概念结构。

<!--
@ref docs/哲学文档/gene.md — extends — 概念树形式的元分析
-->

---

## 项目结构与 Git 仓库

OOC 采用 **双仓库 + submodule** 结构。用户数据与内核代码分离，用户仓库通过 git submodule 引用内核。

```
ooc/                          ← user repo（用户仓库，git 根）
├── CLAUDE.md                 ← 项目指令
├── .env                      ← 环境变量（API Key 等）
├── kernel/                   ← git submodule（内核仓库）
│   ├── src/                  ← 后端源码（TypeScript, Bun runtime）
│   │   ├── cli.ts            ← CLI 入口
│   │   ├── server/           ← HTTP + SSE 服务
│   │   ├── flow/             ← ThinkLoop, Flow
│   │   ├── thread/           ← 线程树架构（ThreadsTree, Engine, Scheduler）
│   │   ├── world/            ← World, Scheduler, Router
│   │   ├── context/          ← Context 构建
│   │   ├── process/          ← 行为树, 认知栈
│   │   ├── stone/            ← Stone 操作
│   │   ├── trait/            ← Trait 加载/激活
│   │   ├── persistence/      ← 持久化读写
│   │   ├── executable/       ← 沙箱执行器
│   │   ├── thinkable/        ← LLM 配置
│   │   └── types/            ← 类型定义
│   ├── web/                  ← 前端源码（React + Vite + Jotai）
│   │   └── src/
│   │       ├── features/     ← 页面级组件
│   │       ├── components/   ← 通用组件
│   │       ├── store/        ← Jotai atoms
│   │       ├── hooks/        ← React hooks
│   │       ├── api/          ← API 客户端
│   │       └── lib/          ← 工具函数
│   ├── traits/               ← Kernel Traits（所有对象共享的基础能力）
│   │   ├── computable/       ← 思考与执行（树形：含 output_format, program_api, stack_api, multi_thread 子 trait）
│   │   ├── talkable/         ← 跨对象通信（树形：含 cross_object, ooc_links, delivery 子 trait）
│   │   ├── reflective/       ← 记忆与反思（树形：含 memory_api, reflect_flow 子 trait）
│   │   ├── plannable/        ← 任务规划
│   │   ├── library_index/    ← Library 资源查询
│   │   └── ...
│   ├── tests/                ← 单元测试（bun:test）
│   └── package.json
├── docs/                     ← 文档（哲学、架构、feature、规范）
│   ├── meta.md               ← 本文件
│   ├── 哲学文档/              ← gene.md, emergence.md, discussions.md
│   ├── 组织/                  ← 1+3 组织结构
│   ├── feature/              ← Feature 设计文档
│   ├── 规范/                  ← 编码规范、交叉引用
│   └── superpowers/          ← specs/ + plans/
├── library/                  ← 公共资源库 + Skill 管理器（Library 对象）
│   ├── .stone                ← 对象标记
│   ├── readme.md             ← Library 身份定义（含 Skill 市场交互能力）
│   ├── data.json             ← 资源统计 + 已安装 Skill 索引 + 市场凭证
│   ├── skills/               ← 公用 Skills（markdown 模板，含市场安装的 skill）
│   ├── traits/               ← 公用 Traits（对象间可复用）
│   └── ui-components/        ← 公用 UI 组件
├── stones/                   ← 对象持久化目录（每个对象一个子目录）
│   ├── {name}/
│   │   ├── .stone            ← 标记文件
│   │   ├── readme.md         ← 身份
│   │   ├── data.json         ← 动态数据
│   │   ├── memory.md         ← 长期记忆
│   │   ├── traits/           ← 用户自定义 Trait
│   │   ├── reflect/          ← ReflectFlow 数据
│   │   ├── ui/               ← 自定义 UI 文件
│   │   └── files/            ← 其他文件
│   └── ...
└── flows/                    ← 会话数据（每个 session 一个子目录）
    └── {sessionId}/
        ├── .session.json     ← Session 元数据（title）
        ├── readme.md         ← Session 工作状态摘要（supervisor 维护）
        ├── objects/{name}/   ← 单个 Object 的运行时数据（原 flows/ 重命名）
        ├── issues/           ← Issue 跟踪目录
        │   ├── index.json    ← 轻量索引
        │   └── issue-{id}.json ← 单条 issue 详情
        └── tasks/            ← Task 跟踪目录
            ├── index.json    ← 轻量索引
            └── task-{id}.json  ← 单条 task 详情
```

**运行方式**：从 user repo 根目录执行 `bun kernel/src/cli.ts start 8080`。

**路径约定**：
- 文档中引用后端代码：`kernel/src/...`
- 文档中引用前端代码：`kernel/web/src/...`
- 文档中引用 Kernel Traits：`kernel/traits/...`
- 文档中引用测试：`kernel/tests/...`
- 文档中引用对象目录：`stones/{name}/...`
- 文档中引用会话数据：`flows/{sessionId}/...`
- 文档中引用其他文档：`docs/...`（相对于 user repo 根）

---

## 概念树

```
Object（对象）
│
│   万物皆对象。对象是 OOC 的唯一建模单元。
│   一个对象 = 身份 + 结构 + 认知 + 行动 + 成长。
│
├── 存在 ── 对象如何"在"？
│   │
│   ├── 持久化（G7）
│   │   │   目录存在 → 对象存在。目录删除 → 对象消亡。
│   │   │   存在不是抽象的——它是文件系统中的一个路径。
│   │   │
│   │   ├── readme.md ── 身份（name, who_am_i）
│   │   ├── data.json ── 动态数据
│   │   ├── traits/ ── 能力定义
│   │   └── effects/ ── 行动记录
│   │
│   └── 形态（G2）
│       │   对象有两种存在状态，如同物质的势能与动能。
│       │
│       ├── Stone ── 静态/潜能态
│       │       能力已定义，但未被激活。
│       │       是"可以思考的东西"，但此刻没有在思考。
│       │
│       └── Flow ── 动态/现实态
│               ThinkLoop 正在运行。对象正在思考、行动、改变。
│               是 Stone 被一个具体任务唤醒后的活体。
│
├── 结构 ── 对象由什么组成？
│   │
│   ├── 身份（G1）
│   │   │   对象对自身的认知，分内外两面。
│   │   │
│   │   ├── thinkable.who_am_i ── 内在自我（仅自己可见）
│   │   │       完整的自我说明、思维方式、价值观。
│   │   │
│   │   └── talkable.who_am_i ── 外在自我（他者可见）
│   │           简短介绍 + 公开方法列表。
│   │           是对象在社交网络中的"名片"。
│   │
│   ├── 数据（G1）
│   │       动态键值对。对象的工作记忆。
│   │       随任务变化，不定义对象"是什么"，而是"当前在处理什么"。
│   │
│   ├── 能力 / Trait（G3）
│   │   │   对象的自我立法——不是外部赋予的功能，
│   │   │   而是对象定义"我如何思考、我遵守什么规则"。
│   │   │
│   │   ├── 可组合 ── 多个 trait 叠加形成复合能力
│   │   ├── 可进化 ── 从 readme-only → always-on → 内化为直觉
│   │   └── 自约束 ── trait 可以限制对象的行为边界
│   │
│   └── 关系 / Relation（G1, G6）
│       │   对象与其他对象的有向连接。
│       │   关系不是全局的——每个对象只知道自己的关系列表。
│       │
│       └── 社交网络（G6）
│               所有对象的关系汇聚成一张有向图。
│               对象通过关系发现彼此、建立协作。
│               World 是根节点，但不是全知的——它也只看到自己的关系。
│
├── 认知 ── 对象如何"知"？
│   │
│   ├── Context（G5）
│   │   │   对象每次思考时看到的全部信息。
│   │   │   对象不知道 Context 之外的任何事情。
│   │   │   Context 不是世界的影子——Context 就是对象的全部世界。
│   │   │
│   │   ├── whoAmI ── 我是谁（来自 readme.md）
│   │   ├── process ── 我在做什么（来自当前 Flow 的行为树）
│   │   ├── messages ── 别人对我说了什么（来自消息队列）
│   │   ├── windows ── 我正在观察什么（来自打开的数据窗口）
│   │   ├── directory ── 我拥有什么（来自持久化目录）
│   │   └── status ── 我的状态如何（来自运行时元数据）
│   │
│   ├── ThinkLoop（G4）
│   │   │   对象的思考引擎。每一轮：
│   │   │   Context → LLM → Program → 执行 → 新 Context → ...
│   │   │
│   │   ├── 感知 ── 读取 Context
│   │   ├── 思考 ── LLM 基于 Context 生成 Program
│   │   ├── 行动 ── 执行 Program 中的 actions
│   │   └── 循环 ── 行动结果写回 Context，触发下一轮
│   │
│   ├── 认知栈（G13）
│   │   │   对象的运行时 = 一个栈。
│   │   │   每个帧 = 一层认知作用域。
│   │   │
│   │   ├── 帧 0 ── 身份层（who_am_i + 沉淀的经验）
│   │   │       永远在栈底。是对象的"人格基座"。
│   │   │
│   │   ├── 帧 1..N ── 任务层（当前正在处理的事）
│   │   │       每个帧继承外层帧的作用域。
│   │   │       内层帧可以访问外层帧的变量，但不能修改。
│   │   │
│   │   └── 智慧 = 帧 0 的厚度
│   │           新手需要很多帧才能完成一件事。
│   │           专家的帧 0 已经内联了大量经验——同样的事只需要很浅的栈。
│   │
│   ├── 多线程（Thread）
│   │   │   Process Tree 支持多个命名的 focus cursor（线程）。
│   │   │   每个线程独立推进自己的执行栈。
│   │   │   默认两个线程：frontend（对外沟通）、backend（内部工作）。
│   │   │   线程间通过 signal 通信，signal 需要 ack + memo 确认。
│   │   │
│   │   └── 线程状态机
│   │           running → yielded（focus 离开 doing 节点）
│   │           yielded → running（go 重新激活）
│   │           running → finished（线程根节点被 return）
│   │
│   ├── 栈帧语义
│   │   │   每个 ProcessNode = 一个栈帧。
│   │   │   操作使用段落标记格式，与 [talk]、[action] 保持一致：
│   │   │
│   │   ├── [cognize_stack_frame_push] ── 压栈：创建普通子栈帧
│   │   │       支持属性段落：title（必填）、description、traits、outputs、outputDescription
│   │   ├── [cognize_stack_frame_pop] ── 弹栈：执行 when_stack_pop hooks，完成当前帧
│   │   │       支持属性段落：summary、artifacts（JSON 输出，合并到父节点 locals）
│   │   ├── [reflect_stack_frame_push/pop] ── 进入/退出内联 reflect 子栈帧
│   │   │       用于主动调整 plan、traits 或审视上文
│   │   ├── [set_plan] ── 更新当前节点的 plan 文本（展示在认知栈区域）
│   │   ├── stack_throw ── 抛出异常，触发 when_error hook
│   │   └── defer = create_hook("when_stack_pop", handler)
│   │           不引入独立概念，hook 系统统一处理。
│   │
│   ├── 节点类型与内联子节点
│   │   │   区分普通子栈帧和内联子节点：
│   │   │
│   │   ├── frame ── 普通子栈帧（[cognize_stack_frame_push] 创建）
│   │   │       独立生命周期，加入 todo 队列，触发 when_stack_pop 等 hooks
│   │   ├── inline_before ── before hook 内联子节点（自动创建）
│   │   │       在 [cognize_stack_frame_push] 时触发，完成后才执行原始 push
│   │   ├── inline_after ── after hook 内联子节点（自动创建）
│   │   │       在 [cognize_stack_frame_pop] 后触发，完成后回到父节点
│   │   └── inline_reflect ── reflect 内联子节点（[reflect_stack_frame_push] 创建）
│   │           主动触发，依附于父节点上下文
│   │
│   ├── Hook 时机扩展
│   │   │   栈帧级生命周期回调，运行时通过 create_hook 注册。
│   │   │
│   │   ├── when_stack_push ── 新栈帧创建时
│   │   ├── when_stack_pop ── 栈帧 pop 时（defer 统一为此，LIFO 执行）
│   │   ├── when_yield ── focus 离开 doing 节点时（被动触发）
│   │   ├── when_error ── stack_throw 冒泡到当前帧时
│   │   ├── before ── [cognize_stack_frame_push] 时（创建 inline_before 内联节点）
│   │   ├── after ── [cognize_stack_frame_pop] 后（创建 inline_after 内联节点）
│   │   └── reflect ── [reflect_stack_frame_push] 时
│   │       │
│   │       └── Hook 类型
│   │               inject_message ── 注入系统消息到 context（内联节点中记录为 inject action）
│   │               create_todo ── 创建 todo 项到队列
│   │
│   └── 注意力与遗忘（G5）
│           Context 有容量限制。不是所有信息都能同时存在。
│           遗忘不是丢失——是让不相关的信息退场，为当前任务腾出空间。
│           pop 帧时，有价值的内容内联到帧 0，其余释放。
│
├── 行动 ── 对象如何"做"？
│   │
│   ├── Process / 行为树（G9）
│   │   │   对象的行动计划。树状结构，可嵌套、可并行。
│   │   │
│   │   ├── 顺序节点 ── 按序执行子任务
│   │   ├── 并行节点 ── 同时执行多个子任务
│   │   └── 条件节点 ── 根据状态选择分支
│   │
│   ├── Effect / 副作用（G10）
│   │   │   对象作用于世界的唯一通道。
│   │   │   所有对外操作都是 Effect——没有"直接修改世界"这回事。
│   │   │
│   │   ├── 文件操作 ── 读写持久化数据
│   │   ├── 创建对象 ── 生成新的 Stone
│   │   ├── 发送消息 ── 与其他对象通信
│   │   └── 外部调用 ── API、工具、系统命令
│   │
│   ├── 消息 / Message（G8）
│   │   │   对象间通信的机制。消息是一种特殊的 Effect。
│   │   │   异步、不保证即时响应。
│   │   │
│   │   ├── talk ── 对话（请求-响应）
│   │   ├── delegate ── 委托（创建子任务）
│   │   └── broadcast ── 广播（通知所有关系对象）
│   │
│   └── Supervisor（全局代理）
│           Supervisor 是一个 stone，但拥有系统级特权：
│           1. 用户消息默认路由到 supervisor
│           2. 可访问 session 中所有 sub-flow 的状态（_session_overview）
│           3. 其他对象的 flow 事件自动通知 supervisor
│           Supervisor 通过自渲染 UI 展示任务看板。
│
├── 看板 ── 对象如何"管"？
│   │
│   ├── Issue（需求/问题）
│   │   │   Session 级别的需求跟踪单元。多对多关联 Task。
│   │   │   状态自由转换（无强制状态机），由 Supervisor 判断。
│   │   │
│   │   ├── 典型路径：讨论中 → 设计中 → 评审中 → 执行中 → 确认中 → 完成
│   │   ├── Comment ── 不可变评论（author + content + mentions）
│   │   ├── hasNewInfo ── 是否需要人类确认
│   │   └── reportPages ── 关联的 report 页面
│   │
│   ├── Task（执行单元）
│   │   │   Session 级别的执行跟踪单元。多对多关联 Issue。
│   │   │
│   │   ├── SubTask ── 子任务（id + title + assignee + status）
│   │   ├── hasNewInfo ── 是否需要人类确认
│   │   └── reportPages ── 关联的 report 页面
│   │
│   ├── 并发写入
│   │   │   per-session 写入队列串行化 issues/tasks 文件的读写。
│   │   │   三个写入者：supervisor trait、issue-discussion trait、后端 API。
│   │   │
│   │   └── session.serializedWrite(path, fn) ── 原子化读-改-写
│   │
│   └── Trait
│       ├── session-kanban ── Supervisor 专属，管理 Issue/Task 结构性操作
│       └── issue-discussion ── Kernel trait，所有对象共享，管理 Issue 评论
│
├── 成长 ── 对象如何"变"？
│   │
│   ├── 经验沉淀（G12）
│   │   │   对象通过经历改写自身结构。
│   │   │   这是 OOC 最激进的哲学主张：认知结构不是先天固定的，
│   │   │   而是在经验中成长的。
│   │   │
│   │   ├── 知识 ── 记住发生了什么（actions 历史）
│   │   ├── 能力 ── 提炼出怎么做（方法、模式）
│   │   ├── 直觉 ── 内化为不需要思考就能做（trait 升级为 always-on）
│   │   │
│   │   └── 沉淀循环
│   │           经历 → 记录(G10) → 反思(reflect)
│   │           → ReflectFlow 审视 → 沉淀为 trait → 改变帧 0
│   │
│   └── 自我修改
│           对象修改自己的 readme.md → 改变身份
│           对象创建新的 trait → 改变思维方式
│           对象重组 relations → 改变社交结构
│           ──→ 存在与认知同时被改变，因为它们是同一个东西。
│
└── 表达 ── 对象如何"显"？
    │
    ├── UI 即自我表达（G11）
    │       对象的视觉呈现不是外部设计的——
    │       它直接由对象的持久化数据生成。
    │       readme.md → 身份卡片
    │       data.json → 数据面板
    │       relations → 关系图
    │       对象改变自己 → UI 自动改变。
    │
    └── 自渲染（G11 实现）
            对象在 ui/index.tsx 中编写 React 组件（Stone 级别，唯一入口）。
            Flow 级别在 ui/pages/*.tsx 中编写（多页演示，无 index.tsx）。
            UI 路径从 files/ui/ 提升为 ui/（Stone 和 Flow 统一）。
            前端通过 Vite 原生 import 加载，自动热更新。
            无 ui/index.tsx 的对象使用通用视图（fallback）。
            有自定义 UI 时默认展示 UI Tab。
            渲染失败时自动降级到通用视图。
```

---

## 工程子树

> 概念树回答"是什么"，工程子树回答"怎么落地"。
> 每棵子树将抽象概念映射到具体的文件结构和源代码。

### 子树 1: 持久化 — "对象如何存在于文件系统"（G7）

```
stones/
│                                       （位于 user repo 根目录下）
├── {name}/                         ── 一个 Stone = 一个目录
│   ├── .stone                      ── 标记文件（目录存在 → 对象存在）
│   ├── readme.md                   ── 身份（who_am_i）
│   ├── data.json                   ── 动态数据（键值对）
│   ├── memory.md                   ── 长期记忆（跨任务持久存在）
│   ├── traits/                     ── 能力定义（Trait 文件）
│   ├── reflect/                    ── ReflectFlow 的持久化目录
│   │   ├── data.json               ── ReflectFlow 的运行时数据
│   │   ├── process.json            ── ReflectFlow 的行为树
│   │   └── files/                  ── ReflectFlow 的共享数据
│   ├── ui/                         ── 自渲染 UI（原 files/ui/）
│   │   └── index.tsx               ── Stone 唯一主界面入口
│   └── files/                      ── 其他共享文件
│
└── flows/{sessionId}/                 ── 一个 Session = 一个目录
    ├── .session.json               ── Session 元数据（title 等）
    ├── readme.md                   ── Session 工作状态摘要
    ├── objects/{name}/              ── 一个 Flow = 一个目录（原 flows/ 重命名）
    │   ├── .flow                   ── 标记文件（Flow 存活标志）
    │   ├── data.json               ── Flow 的运行时数据
    │   ├── process.json            ── 行为树（旧架构，节点状态、actions 历史）
    │   ├── threads.json            ── 线程树索引（新架构，rootId + nodes 元数据）
    │   ├── threads/{threadId}/     ── 线程运行时数据
    │   │   └── thread.json         ── 单个线程的 actions、locals、plan
    │   ├── memory.md               ── 会话记忆（仅当前任务可见）
    │   ├── ui/pages/               ── Flow 演示页面（原 files/ui/）
    │   └── files/                  ── Flow 共享数据
    ├── issues/                     ── Issue 跟踪
    │   ├── index.json              ── 轻量索引（id, title, status, updatedAt）
    │   └── issue-{id}.json         ── 单条 issue 完整数据
    └── tasks/                      ── Task 跟踪
        ├── index.json              ── 轻量索引
        └── task-{id}.json          ── 单条 task 完整数据

代码: kernel/src/persistence/reader.ts（读）, kernel/src/persistence/writer.ts（写）
      kernel/src/persistence/thread-adapter.ts（线程树 → Process 转换）
```

### 子树 2: 认知构建 — "Context 如何被组装"（G5, G13）

```
Context
│
├── 六个组成部分
│   ├── whoAmI       ← stones/{name}/readme.md
│   ├── process      ← flows/{sessionId}/objects/{name}/process.json（当前行为树）
│   ├── messages     ← pendingMessages 队列（来自其他对象的消息）
│   ├── windows      ← Trait 定义的数据窗口（打开的文件/数据）
│   ├── directory    ← stones/{name}/ 目录列表
│   └── status       ← 运行时元数据（轮次、状态、时间）
│
├── 结构化遗忘
│   ├── focus 节点   ── 保留完整 actions 历史
│   └── 非 focus 节点 ── 仅保留摘要（autoSummarize 压缩）
│
├── Mirror 系统
│   └── 行为观察 → 统计模式 → 注入 Context → 触发自我反思
│
├── 三层记忆
│   ├── long-term memory  ── stones/{name}/readme.md（沉淀的经验）
│   ├── session memory    ── process.json 中的 actions 历史
│   └── recent history    ── 最近 N 轮的完整记录
│
└── Pause（人机协作检查点）
    ├── 触发: ThinkLoop 在 LLM 返回后、执行前检查暂停信号
    ├── 暂停时写出:
    │   ├── llm.input.txt  ── 本轮发送给 LLM 的完整 Context
    │   └── llm.output.txt ── LLM 返回的原始输出
    ├── 人工介入: 用户可查看、修改 llm.output.txt
    └── 恢复时: 读取 llm.output.txt 作为实际输出执行，然后删除两个临时文件

代码: kernel/src/context/builder.ts（组装）, kernel/src/context/formatter.ts（格式化）
      kernel/src/context/mirror.ts（Mirror）, kernel/src/context/history.ts（历史管理）
```

### 子树 3: 思考-执行 — "ThinkLoop 每一轮发生了什么"（G4, G9, G12, G13）

```
ThinkLoop
│
├── 单轮循环
│   ├── 感知    ── builder.ts 组装 Context
│   ├── 思考    ── LLM 基于 Context 生成输出（Thinking Mode 双通道）
│   │               Provider 返回 thinkingContent + assistantContent
│   │               thinkingContent 自动映射为系统 thought action
│   │               assistantContent 交由 parser 解析为执行协议
│   ├── 解析    ── parser 解析 assistant 输出中的结构化协议
│   │               仅识别 [program]/[talk]/[action]/stack ops/directives
│   │               不再解析 [thought]（thought 来自 Provider 原生能力）
│   │               assistant 输出中出现 [thought] 视为协议错误
│   ├── 执行    ── 逐条执行 actions（文件操作/消息/Effect）
│   ├── 记录    ── thought + actions + output 写入 process.json
│   └── 投递    ── 检查 pendingMessages，推进 focus
│
├── Thinking Mode（双通道架构）
│   │   thought 从"输出协议"迁移为"Provider 能力层产生的运行时语义"。
│   │   三层职责分离：
│   │
│   ├── Provider 能力层 ── 开启 thinking、读取 thinking 输出、适配为统一结构
│   │   └── LLMResult = { assistantContent, thinkingContent, usage }
│   │       LLMStreamEvent = thinking_chunk | assistant_chunk | done
│   ├── ThinkLoop 语义映射层 ── 将 thinkingContent 映射为系统 thought
│   │   ├── 记录为 thought action（落盘 process.json）
│   │   ├── 通过 SSE 发为 stream:thought
│   │   └── 持久化顺序：thought → program/talk/action → 执行结果
│   └── Parser 协议层 ── 只解析 assistant 最终输出中的结构化协议
│       ├── 不再识别 [thought]
│       └── assistant 输出 [thought] = 协议错误（deprecated_thought_section）
│
├── 行为树操作
│   ├── focus 推进     ── 完成当前节点 → 移动到下一个
│   ├── 节点创建       ── addTask / addParallelTasks
│   ├── 状态转换       ── pending → active → done / waiting
│   └── autoSummarize  ── 非 focus 节点压缩为摘要
│
├── 认知栈
│   ├── computeScopeChain  ── 从 focus 节点向上收集作用域链
│   ├── collectFrameHooks  ── 收集各帧的 hooks（before_finish 等）
│   └── getActiveTraits    ── 沿作用域链收集激活的 Traits
│
└── ReflectFlow — 对象的常驻自我反思
    │
    ├── 物理位置: stones/{name}/reflect/（data.json + process.json）
    ├── 创建: Flow.ensureReflectFlow() — sessionId 固定为 _reflect, isSelfMeta: true
    ├── 触发: 普通 Flow 调用 reflect(message)
    │         → World 投递消息到 ReflectFlow 的 pendingMessages
    ├── 执行: scheduler 调度 ReflectFlow，拥有独立行为树
    │         可修改 Stone 的 readme.md / data.json
    ├── 回复: replyToFlow(sessionId, message) — 回复发起对话的普通 Flow
    │
    └── 哲学意义: 实现 G12 沉淀循环的关键机制
                  经历 → reflect → ReflectFlow 审视 → 沉淀为 trait

代码: kernel/src/flow/thinkloop.ts（循环引擎）, kernel/src/flow/flow.ts（ensureReflectFlow）
      kernel/src/flow/parser.ts（协议解析，不含 [thought]）
      kernel/src/thinkable/client.ts（Provider 双通道返回）
      kernel/src/thinkable/config.ts（Thinking capability 配置）
      kernel/src/process/focus.ts（焦点推进）, kernel/src/process/tree.ts（行为树操作）
      kernel/src/process/cognitive-stack.ts（认知栈）
      kernel/src/world/world.ts（deliverToSelfMeta）, kernel/src/world/router.ts（talkToSelf）
```

### 子树 4: 协作 — "对象如何与其他对象交互"（G6, G8）

```
CollaborationAPI
│
├── 通信原语
│   ├── talk(target, message)       ── 对话：发送消息，等待回复
│   ├── delegate(target, task)      ── 委托：创建子任务，异步执行
│   └── reply(message)              ── 回复：响应 talk 或 delegate
│
├── 消息投递机制
│   ├── 发送方调用 talk/delegate
│   │   → router.ts 路由消息
│   │   → 写入目标 Flow 的 pendingMessages
│   ├── 目标 Flow 下一轮 ThinkLoop 感知到消息
│   │   → 创建中断节点（interrupt）插入行为树
│   │   → focus 推进到中断节点处理消息
│   └── 处理完成后 reply → 消息回传发送方
│
├── Session 管理
│   └── Session
│       ├── 一个 sessionId 对应一个 Session
│       ├── Session 管理同一任务中的多个 Flow（多个对象参与）
│       └── Session 结束时清理所有 Flow 的 .flow 标记
│
└── World 调度
    └── Scheduler
        ├── 维护所有活跃 Flow 的队列
        ├── 轮转调度：每个 Flow 执行一轮 ThinkLoop
        ├── 并发线程：同一 Flow 内多个 running thread 通过 Promise.all 并行执行
        │       fork_threads / join_threads / finish_thread API
        └── 检测终止条件：所有 Flow 都 done/waiting → Session 结束

代码: kernel/src/world/router.ts（消息路由）, kernel/src/world/session.ts（Session 管理）
      kernel/src/world/scheduler.ts（调度器）, kernel/src/world/world.ts（World 入口）
```

### 子树 5: Trait — "能力如何定义、加载、生效"（G3, G13）

```
Trait
│
├── 定义结构（TraitDefinition）
│   ├── name         ── 完整路径名（如 "kernel/computable", "lark/doc"）
│   ├── description  ── 能力描述（注入 Context 让 LLM 理解）
│   ├── bias         ── 思维偏置（影响 LLM 的决策倾向）
│   ├── windows      ── 数据窗口（Trait 激活时自动打开的数据源）
│   ├── hooks        ── 生命周期钩子（before_finish, before_wait, on_error）
│   ├── methods      ── 注册方法（ThinkLoop 中可调用的 actions）
│   ├── children     ── 子 trait ID 列表（树形结构时自动填充）
│   └── parent       ── 父 trait ID（树形结构时自动填充）
│
├── 树形结构与 Progressive Disclosure
│   │   Trait 支持任意深度的树形嵌套（如 kernel/computable/output_format）。
│   │   三层加载策略减少 Context 注入量：
│   │
│   ├── Level 1 ── 精简注入（always-on 父 trait 的精简 TRAIT.md）
│   ├── Level 2 ── 子 trait 描述可见（active 父 trait 的子 trait 一行描述）
│   └── Level 3 ── 按需激活（readTrait/activateTrait 加载完整内容）
│
├── 加载链路（三层，同名后者覆盖前者）
│   └── 1. kernel/traits/ → 2. library/traits/ → 3. stones/{name}/traits/
│       → loader.ts 解析 Trait 文件
│       → TraitDefinition[]
│
├── 激活逻辑
│   └── computeScopeChain 收集作用域链
│       → activator.ts 区分 kernel/user traits
│       → 激活的 Traits 注入 Context（bias + windows + hooks）
│
└── 方法注册
    └── MethodRegistry
        ├── Trait 的 methods 注册为可调用 action
        └── ThinkLoop 执行时查找并调用

代码: kernel/src/trait/loader.ts（加载）, kernel/src/trait/activator.ts（激活）
      kernel/src/trait/registry.ts（方法注册）, kernel/src/types/trait.ts（类型定义）
```

#### Kernel Traits — 三层结构

Kernel Traits 是所有对象共享的基础能力，位于 `kernel/traits/`。
它们按激活策略分为三层，组合起来定义了"作为 OOC 对象意味着什么"。

```
Kernel Traits
│
├── 基座层（when: always）── 定义最小可行智能体
│   │
│   │   这些 trait 始终激活，任何对象都具备。
│   │   它们的组合 = 能思考 + 能交流 + 能成长 + 不自欺 + 会拆解。
│   │   基座层 trait 采用树形结构：父 trait 精简注入，子 trait 按需激活。
│   │
│   ├── kernel/computable ── 思考与执行（G4, G13）
│   │   │   认知栈思维模式、输出格式速查、核心 API 签名。
│   │   │   没有它，对象无法行动。
│   │   │
│   │   ├── kernel/computable/output_format  ── TOML 输出格式完整规范
│   │   ├── kernel/computable/program_api    ── 完整 API 参考文档
│   │   ├── kernel/computable/stack_api      ── 栈帧 push/pop 语义
│   │   └── kernel/computable/multi_thread   ── 多线程 API
│   │
│   ├── kernel/talkable ── 与他者建立关系（G6, G8）
│   │   │   消息发送、回复、社交原则。
│   │   │   没有它，对象是孤岛。
│   │   │
│   │   ├── kernel/talkable/cross_object  ── 跨对象函数调用协议
│   │   ├── kernel/talkable/ooc_links     ── ooc:// 链接和导航卡片
│   │   └── kernel/talkable/delivery      ── 交付规范、协作交付
│   │
│   ├── kernel/reflective ── 从经验中学习（G5, G12）
│   │   │   reflect 沉淀通道、核心原则。
│   │   │   没有它，对象不会成长。
│   │   │
│   │   ├── kernel/reflective/memory_api    ── 记忆 API（Flow Summary, Self/Session）
│   │   └── kernel/reflective/reflect_flow  ── ReflectFlow 角色定义
│   │
│   └── kernel/verifiable ── 认识论诚实
│           "没有验证证据，不做完成声明。"
│           没有它，对象会自欺。
│
├── 认知工具层（when: conditional）── 按需激活的思维策略
│   │
│   ├── kernel/plannable        ── 任务拆解（G9）
│   ├── kernel/debuggable       ── 系统化调试
│   ├── kernel/object_creation  ── 创建新对象（G1）
│   └── kernel/web_search       ── 外部信息获取（G10）
│
└── 组合效应
        基座层的交叉：
        computable × talkable    = 能协作执行的智能体
        computable × reflective  = 能从错误中学习的智能体
        reflective × verifiable  = 不会把幻觉沉淀为经验的智能体
        全部组合                  = 最小可行的、能自我进化的 OOC 对象
```

### 子树 6: Web UI — "对象如何被看见"（G11）

```
Web UI 概念树
│
│   前端是对象世界的"眼睛"。
│   每个 UI 概念都对应一种"看见对象"的方式。
│
├── Shell（外壳）── 整体布局骨架
│   │   三栏结构：LeftRail + Stage + MessageDock
│   │
│   ├── LeftRail（左侧栏）── 导航 + 文件树区域
│   │   ├── BrandMark ── OOC Logo（阿基米德螺旋 + 三圆点关系图）
│   │   ├── ModeSwitch ── 三 Tab 切换器（Flows / Stones / World）
│   │   ├── SessionBar ── 当前 Session 标题栏（列表切换 + 标题编辑）
│   │   └── TreePane ── 文件树区域（根据 ModeSwitch 切换内容）
│   │       ├── SessionsList ── Session 列表（Flows 模式，无活跃 session 时）
│   │       ├── SessionFileTree ── Session 文件树（Flows 模式，有活跃 session 时）
│   │       │       注入虚拟节点：index（session 入口）、ui（自渲染 UI）、.stone（对象源）
│   │       └── FileTree ── 通用文件目录树（Stones / World 模式）
│   │               带 marker 图标：Box=stone, GitBranch=flow, Folder=普通目录
│   │
│   ├── Stage（舞台）── 主内容区
│   │   ├── EditorTabs ── IDE 风格文件标签栏（多 tab 切换 + 关闭）
│   │   │       顶部路径面包屑 + 小圆角 label 样式 tab
│   │   ├── Breadcrumb ── 路径面包屑导航（Header 与 Content 之间）
│   │   ├── RefreshButton ── 手动刷新按钮
│   │   └── ViewRegistry ── 视图注册表（根据文件路径分发到对应视图）
│   │           注册机制：match + priority + tabKey + tabLabel
│   │           替代原 ViewRouter 的硬编码路由
│   │
│   └── MessageDock（消息坞）── 右侧消息面板（仅桌面端 Flows 模式）
│       │   固定对话对象为 supervisor，可折叠/展开。
│       ├── MessageBubble ── 消息气泡（用户消息右对齐，对象消息左对齐）
│       ├── StreamingIndicator ── 流式回复实时展示
│       └── MessageInput ── 消息输入框
│
├── 视图注册表（ViewRegistry）── "打开什么路径，看到什么视图"
│   │
│   │   注册机制：每个视图组件注册 match/priority/tabKey/tabLabel。
│   │   路径 → 按优先级匹配 → 渲染对应组件（props: { path }）。
│   │   tabKey 决定是否复用已有 tab。
│   │
│   ├── stones/{name}              → StoneView（ObjectDetail 或 DynamicUI）[priority: 50]
│   ├── stones/{name}/reflect/     → ReflectFlowView（Process + Data）[priority: 80]
│   ├── flows/{sessionId}          → SessionKanban（看板视图）[priority: 120]
│   ├── flows/{sid}/issues/{id}    → IssueDetailView（Issue 详情页）[priority: 130]
│   ├── flows/{sid}/tasks/{id}     → TaskDetailView（Task 详情页）[priority: 130]
│   ├── flows/{sid}/objects/{name} → FlowView（Flow 详情，含 Readme/Data/UI Tab）[priority: 100]
│   ├── **/process.json            → ProcessJsonView（行为树查看器）[priority: 40]
│   ├── *.json                     → CodeViewer（CodeMirror JSON 高亮）[priority: 0]
│   ├── *.md                       → MarkdownViewer（Markdown 渲染）[priority: 0]
│   └── *                          → CodeViewer（CodeMirror 纯文本/代码高亮）[priority: 0]
│
├── 页面级视图 ── 占据 Stage 全部空间的完整页面
│   │
│   ├── WelcomePage（欢迎页）── 无活跃 session 时的首页
│   │       系统介绍 + 对象概览卡片（名称 + talkable.whoAmI）+ 输入框
│   │
│   ├── ChatPage（对话页）── 用户与对象的主对话界面
│   │   │   浮动输入框 + 对话时间线 + 对象信息面板
│   │   │
│   │   ├── ChatTimeline ── 对话时间线（消息 + actions 按时间排序）
│   │   │   ├── TalkCard ── 对话消息卡片
│   │   │   └── ActionCard ── Action 卡片
│   │   ├── FloatingInput ── 底部浮动输入框（@ mention + 发送）
│   │   ├── ObjectInfoPanel ── 右侧对象信息面板（Readme / Data / Shared）
│   │   └── MentionPicker ── @ 对象选择下拉框
│   │
│   ├── StoneView（Stone 视图）── 对象的完整身份展示
│   │   │   ObjectDetail 或 DynamicUI（自渲染优先）
│   │   │   Header：左侧头像+名称，右侧按钮组 Tabs
│   │   │
│   │   ├── ObjectDetail ── 通用 Stone 详情页（多 Tab）
│   │   │   ├── ReadmeTab ── ObjectReadmeView（两栏：左 readme + 右名片）
│   │   │   │   ├── ReadmeContent ── Readme 正文（Markdown 渲染）
│   │   │   │   ├── ProfileCard ── 对象名片（boring-avatars 头像 + 基本信息）
│   │   │   │   ├── TraitsList ── Trait 列表（点击弹出详情模态窗）
│   │   │   │   └── MethodsList ── Public Methods 列表
│   │   │   ├── DataTab ── 数据键值对表格（复杂值可折叠展开）
│   │   │   ├── EffectsTab ── Session 列表（点击进入 FlowDetail）
│   │   │   ├── MemoryTab ── 长期记忆展示（Markdown 渲染）
│   │   │   └── UITab ── 自渲染 UI 标签页（如果对象注册了自定义 UI）
│   │   │
│   │   └── DynamicUI ── 统一动态 UI 加载器（Stone + Flow）
│   │           Vite 动态 import（@vite-ignore）
│   │           渲染失败自动降级到 fallback
│   │
│   ├── FlowView（Flow 视图）── 单个 Flow 对象的详情
│   │   │   Header：左侧头像+名称+状态Badge，右侧按钮组 Tabs
│   │   │
│   │   ├── TimelineTab ── 时间线（消息 + actions 按时间排序）
│   │   ├── ProcessTab ── 行为树视图（复用 ProcessView）
│   │   ├── ReadmeTab ── 对象 Readme（复用 ObjectReadmeView）
│   │   ├── DataTab ── 分栏设计（左栏 Flow data + 右栏 Stone data）
│   │   └── UITab ── Flow 自渲染 UI（DynamicUI 加载 ui/pages/*.tsx）
│   │
│   ├── SessionKanban（Session 看板）── Session 级总览（替换原 SessionGantt）
│   │   │   双栏布局：readme | Issues + Tasks（上下排列）
│   │   │
│   │   ├── ReadmePanel ── 左栏：readme.md 渲染（supervisor 维护的 session 摘要）
│   │   ├── IssuesPanel ── 右栏上部：Issue 按状态分组展示
│   │   │   ├── IssueCard ── Issue 卡片（标题 + 关联 task 数 + 参与者 + hasNewInfo 红点）
│   │   │   └── 分组顺序：需确认 → 讨论中 → 设计中 → 评审中 → 执行中 → 确认中 → 完成 → 关闭
│   │   ├── TasksPanel ── 右栏下部：Task 按状态分组展示
│   │   │   ├── TaskCard ── Task 卡片（标题 + 子任务进度条 + hasNewInfo 红点）
│   │   │   └── 分组顺序：执行中 → 完成 → 关闭
│   │   └── 空分组不显示
│   │
│   ├── IssueDetailView（Issue 详情页）── Issue 讨论、评论、关联管理
│   │   │   虚拟路径：flows/{sessionId}/issues/{issueId}
│   │   │   Tabs：描述 | 评论 | 关联 Tasks | Reports
│   │   │
│   │   ├── DescriptionTab ── Issue 描述（Markdown 渲染）
│   │   ├── CommentsTab ── 时间线评论列表 + 用户输入框
│   │   ├── LinkedTasksTab ── 关联的 Task 列表
│   │   └── ReportsTab ── 关联的 report pages（DynamicUI 加载 ui/pages/*.tsx）
│   │
│   └── TaskDetailView（Task 详情页）── Task 子任务、关联管理
│       │   虚拟路径：flows/{sessionId}/tasks/{taskId}
│       │   Tabs：描述 | 子任务列表 | 关联 Issues | Reports
│       │
│       ├── DescriptionTab ── Task 描述
│       ├── SubTasksTab ── 子任务列表（pending/running/done 状态）
│       ├── LinkedIssuesTab ── 关联的 Issue 列表
│       └── ReportsTab ── 关联的 report pages
│   │
│   └── FlowDetail（Flow 详情）── 嵌入式 Flow 查看（EffectsTab 内使用）
│   │   ├── MessagesView ── 消息列表
│   │   ├── ProcessTab ── 行为树视图
│   │   └── PausedPanel ── 暂停状态面板（Context + LLM Output + 恢复按钮）
│
├── 行为树可视化（ProcessView）── 对象思考过程的可视化
│   │   双栏布局：左 ActionTimeline + 右 NodeTree
│   │
│   ├── ActionTimeline ── 左栏：选中节点路径上的 actions 时间线
│   │   │   沿 scope chain 向上收集所有 actions，按节点分组展示
│   │   │
│   │   ├── NodeHeader ── 节点标题（状态圆点 + 标题 + focus 标记 + action 计数）
│   │   ├── ActionCard ── Action 卡片（详见卡片组件）
│   │   └── NodeSummary ── 节点摘要（虚线边框，压缩后的内容）
│   │
│   └── MiniTree ── 右栏：节点树缩略视图
│           可展开/折叠，点击切换选中节点
│           状态圆点：绿=done, 橙=doing, 灰=pending
│           focus 节点标记 "(focus-on)"
│
├── 卡片组件 ── 信息展示的基本单元
│   │
│   ├── ActionCard（Action 卡片）── 展示单条 action
│   │   │   圆角卡片，header + body 结构，Safari tab 风格圆角过渡
│   │   │
│   │   ├── CardHeader ── 头部（对象头像 + 类型 Badge + 时间 + 工具栏）
│   │   │   ├── TypeBadge ── 类型标签（thought/program/inject/message_in/message_out/pause）
│   │   │   └── Toolbar ── 工具栏（Zoom-in / Copy / Ref 按钮）
│   │   ├── CardBody ── 内容区
│   │   │   ├── 普通类型 → MarkdownContent 渲染
│   │   │   └── program/action 类型 → 默认单栏（只显示 input），Output 在 Maximize（Modal）中展示
│   │   └── ZoomSheet ── 展开详情侧滑面板（Sheet）
│   │
│   └── TalkCard（对话卡片）── 展示单条对话消息
│       │   与 ActionCard 同风格，header 显示 from → to
│       │
│       ├── CardHeader ── 头部（发送方头像 + from → to + [talk] 标签 + 工具栏）
│       ├── CardBody ── 内容区（MarkdownContent 渲染）
│       └── ZoomSheet ── 展开详情侧滑面板
│
├── 全局覆盖层 ── 浮于所有内容之上的交互层
│   │
│   ├── CommandPalette（命令面板）── Cmd+K 全局搜索
│   │   │   三种模式：搜索 / 对象详情 / 文件详情
│   │   │
│   │   ├── SearchMode ── 搜索对象、输入 ooc:// URL
│   │   ├── ObjectDetailMode ── 对象摘要（头像 + Traits + Relations + Functions + Shared Files）
│   │   └── FileDetailMode ── 文件内容预览
│   │
│   ├── OocLinkPreview（链接预览）── ooc:// 链接侧滑弹窗
│   │   ├── ObjectPreview ── 对象摘要预览
│   │   └── FilePreview ── 文件内容预览
│   │
│   └── TraitModal（Trait 详情模态窗）── 点击 Trait 弹出的详情窗口
│           显示 Trait 的 methods + readme 全文
│
├── 原子组件 ── 最小可复用的 UI 单元
│   │
│   ├── ObjectAvatar（对象头像）── 确定性颜色 + 首字母圆形头像
│   │       基于名称 hash 选择颜色，无需后端数据
│   │
│   ├── Badge（标签）── 语义化彩色标签
│   │   ├── StatusBadge ── Flow 状态（running/waiting/finished/failed/pausing）
│   │   └── ActionBadge ── Action 类型（thought/program/message_in/...）
│   │
│   ├── MarkdownContent（Markdown 渲染器）── 统一的 Markdown 展示
│   │       支持 GFM、代码高亮、表格、ooc:// 链接拦截
│   │
│   ├── CodeMirrorViewer（代码查看器）── 只读代码展示（CodeMirror 6）
│   │       支持 JSON / JS / TS / Markdown 语法高亮
│   │
│   ├── CodeBlock（代码块）── 简单的 pre 代码块（可限高）
│   │
│   ├── Sheet（侧滑面板）── 从屏幕边缘滑出的面板
│   │       用于 ActionCard Zoom-in、OocLinkPreview 等
│   │
│   ├── FloatingGradient（浮动渐变）── 三色光球背景装饰
│   │
│   └── ErrorBoundary（错误边界）── React 错误捕获 + 降级展示
│
├── 状态管理（Jotai Atoms）── 全局响应式状态
│   │
│   ├── session atoms ── Session/Flow/UI 核心状态
│   │   ├── activeTabAtom ── 当前 ModeSwitch 选中的 Tab
│   │   ├── activeSessionIdAtom ── 当前活跃 Session ID
│   │   ├── activeSessionFlowAtom ── 当前活跃 Session 的 Flow 数据
│   │   ├── editorTabsAtom ── 打开的文件标签列表
│   │   ├── activeFilePathAtom ── 当前选中的文件路径
│   │   ├── lastFlowEventAtom ── 最新 SSE 事件（驱动全局刷新）
│   │   ├── streamingTalkAtom ── 流式对话内容
│   │   ├── streamingThoughtAtom ── 流式思考内容
│   │   ├── refreshKeyAtom ── 手动刷新计数器
│   │   └── messageSidebarOpenAtom ── MessageDock 展开/折叠状态
│   │
│   ├── objects atoms ── Stone 对象列表
│   │
│   └── ooc-link atoms ── ooc:// 链接弹窗状态
│
├── 实时通信（SSE）── 服务端推送事件流
│   │
│   ├── useSSE hook ── 建立 SSE 连接，分发事件到 atoms
│   ├── flow:start ── Flow 启动事件
│   ├── flow:message ── 新消息事件
│   ├── flow:action ── 新 Action 事件
│   ├── flow:talk ── 流式对话事件
│   ├── flow:thought ── 流式思考事件（来源：Provider 原生 thinking，非 parser 产物）
│   ├── stream:program ── 流式 program 事件
│   ├── stream:action ── 流式 action 事件
│   └── stream:thought ── 流式 thinking_chunk（来自 Provider thinking 通道）
│
└── ooc:// 协议 ── 前端内部链接系统
    │   对象间导航的统一寻址方式
    │
    ├── ooc://object/{name} ── 指向一个 Stone 对象
    ├── ooc://file/{name}/{path} ── 指向对象的共享文件
    └── MarkdownContent 自动识别并拦截 ooc:// 链接
        → 点击打开 OocLinkPreview 侧滑面板

代码: kernel/web/src/App.tsx, kernel/web/src/router/, kernel/web/src/features/, kernel/web/src/components/
      kernel/web/src/store/, kernel/web/src/api/client.ts
```

### 子树 7: 看板数据 — "Session 如何管理需求与任务"

```
Kanban
│
├── 数据结构
│   ├── Issue（需求/问题讨论）
│   │   ├── id                    ── 唯一标识，如 "ISSUE-001"
│   │   ├── title                 ── 标题
│   │   ├── status                ── 状态（自由转换，无强制状态机）
│   │   │       discussing | designing | reviewing | executing | confirming | done | closed
│   │   ├── description           ── 描述（markdown）
│   │   ├── participants          ── 参与讨论的对象名称列表
│   │   ├── taskRefs              ── 关联的 task id 列表（多对多）
│   │   ├── reportPages           ── 关联的 report 页面路径
│   │   ├── hasNewInfo            ── 是否有需要人类确认的新信息
│   │   └── comments: Comment[]   ── 评论列表（不可变）
│   │
│   ├── Task（执行单元）
│   │   ├── id                    ── 唯一标识，如 "TASK-001"
│   │   ├── title                 ── 标题
│   │   ├── status                ── running | done | closed
│   │   ├── description           ── 描述（markdown）
│   │   ├── issueRefs             ── 关联的 issue id 列表（多对多）
│   │   ├── reportPages           ── 关联的 report 页面路径
│   │   ├── subtasks: SubTask[]   ── 子任务列表
│   │   └── hasNewInfo            ── 是否有需要人类确认的新信息
│   │
│   └── Comment（评论，不可变）
│       ├── id, author, content
│       ├── mentions              ── @的对象列表
│       └── createdAt
│
├── 文件存储
│   ├── issues/index.json         ── 轻量索引数组 [{id, title, status, updatedAt}]
│   ├── issues/issue-{id}.json    ── 单条 issue 完整数据
│   ├── tasks/index.json          ── 轻量索引数组
│   └── tasks/task-{id}.json      ── 单条 task 完整数据
│
├── 写入者与并发控制
│   ├── supervisor → session-kanban trait
│   ├── 其他对象   → issue-discussion trait
│   ├── 用户评论   → 后端 API (POST /api/session/{sid}/issues/{id}/comments)
│   └── 并发安全   → session.serializedWrite(path, fn) 串行化读写
│
├── Trait
│   ├── session-kanban（Supervisor 专属）
│   │   │   位置：stones/supervisor/traits/session-kanban/
│   │   │   通过 task_dir 变量定位 session 目录
│   │   │
│   │   ├── createIssue / updateIssueStatus / updateIssue / closeIssue
│   │   ├── setIssueNewInfo
│   │   ├── createTask / updateTaskStatus / updateTask
│   │   ├── createSubTask / updateSubTask
│   │   └── setTaskNewInfo
│   │
│   └── issue-discussion（Kernel trait，所有对象共享）
│       │   位置：kernel/traits/issue-discussion/
│       │   负责评论和讨论，通过 mentions 投递消息通知
│       │
│       ├── commentOnIssue(issueId, content, mentions?)
│       ├── listIssueComments(issueId)
│       └── getIssue(issueId)
│
└── 前端交互
    ├── Kanban 视图 ── 三栏（readme + Issues + Tasks）
    ├── Issue 详情页 ── 描述 | 评论 | 关联 Tasks | Reports
    ├── Task 详情页 ── 描述 | 子任务 | 关联 Issues | Reports
    └── hasNewInfo 重置 ── 打开详情页时自动清除红点

代码: kernel/src/kanban/store.ts（数据读写）, kernel/src/kanban/methods.ts（session-kanban trait methods）
      kernel/src/kanban/discussion.ts（issue-discussion trait methods）
      kernel/web/src/features/SessionKanban.tsx, kernel/web/src/features/IssueDetailView.tsx
      kernel/web/src/features/TaskDetailView.tsx, kernel/web/src/api/kanban.ts
```

---

## 两个循环

概念树不是静态的。它被两个循环驱动：

```
展开循环（正向）：
  身份(帧0) → 能力(Trait) → 计划(Process) → 思考(ThinkLoop) → 行动(Effect)
                                                                    │
沉淀循环（逆向）：                                                    │
  身份(帧0) ← 沉淀(G12) ← 反思(reflect) ← 记录 ← 经验 ←─────────┘
```

对象从身份出发，展开为行动；行动的结果沉淀回身份。
这个循环每转一圈，帧 0 就厚一层。

---

## 统一性

从这棵树可以看到，所有概念最终汇聚于一个等式：

**Object = 存在 ∩ 认知 ∩ 行动 ∩ 成长**

传统系统中，这四者是分离的：
- 数据库管存在
- 提示词管认知
- 函数管行动
- 没有人管成长

OOC 中，它们是同一个对象的四个面。
改变任何一个面，其他三个面同时改变——因为它们共享同一个持久化目录。
