# 背景

OOC 是一种 AI 智能体（Agent）架构。

传统 Agent 的工作方式是：人类写一段 prompt，发给大语言模型（LLM），LLM 返回文本，
程序解析文本并执行动作，然后把结果拼回 prompt，再次发给 LLM。
在这种模式下，Agent 的「上下文」是一段不断增长的文本——它是扁平的、无结构的、一次性的。

OOC 提出一个不同的模型：**把 Agent 的上下文组织为「活的对象生态」**。

在 OOC 中，不存在一段巨大的 prompt。取而代之的是一组对象——
每个对象有自己的身份、数据、行为、思维方式和关系。
对象之间可以协作、对话、创建新对象。

# Meta — OOC 概念树

> 从 Object 出发，展开 OOC 的完整概念结构。
> 这是**全局入口**：概念总图 + 工程子树 + 源码锚点。

<!--
@ref docs/哲学/genes/ — extends — 概念树形式的元分析（13 条基因拆分后的路径）
-->

## 文档结构导航

本次重构（2026-04-21）后，docs/ 按三层组织：

- **[哲学/](哲学/)** — 元层 · 思想：13 条基因 + 12 条涌现 + 两个循环 + 统一性
- **[对象/](对象/)** — 本体层：存在 / 结构 / 认知 / 合作 / 成长 / 人机交互
- **[工程管理/](工程管理/)** — 元层 · 实践：目标 / 组织 / 流程 / 规范 / 验证

meta.md（本文件）= 全局概念树 + 工程子树。细节展开在上述三个顶级目录中。

重构前的原始文档保留在 `docs/.归档-20260421/`。

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
│   │   ├── thread/           ← 线程树架构（ThreadsTree, Engine, Scheduler, ContextBuilder）
│   │   ├── world/            ← World（对象加载、talk 入口）
│   │   ├── stone/            ← Stone 操作
│   │   ├── trait/            ← Trait 加载/激活/方法注册
│   │   ├── skill/            ← Skill 加载（SKILL.md 按需加载）
│   │   ├── persistence/      ← 持久化读写
│   │   ├── executable/       ← 沙箱执行器
│   │   ├── thinkable/        ← LLM 配置（含 tool calling 支持）
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
│   │   ├── base/            ← 指令系统基座（唯一 always trait，open/submit/close/wait 四原语）
│   │   ├── computable/       ← 代码执行（command_binding: program，含 program_api, file_ops, file_search, shell_exec, web_search, testable 子 trait）
│   │   ├── talkable/         ← 跨对象通信（command_binding: talk/return，含 cross_object, ooc_links, delivery 子 trait）
│   │   ├── reflective/       ← 记忆与反思（command_binding: return，含 memory_api, reflect_flow 子 trait）
│   │   ├── verifiable/       ← 验证能力（command_binding: return）
│   │   ├── plannable/        ← 任务规划（command_binding: create_sub_thread）
│   │   ├── debuggable/       ← 系统化调试（command_binding: program）
│   │   ├── reviewable/       ← 代码审查（command_binding: program）
│   │   ├── library_index/    ← Library 资源查询（command_binding: program）
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
- 文档中引用公共资源：`library/...`（Library 对象 + 公用 traits + skills + ui-components）
- 文档中引用其他文档：`docs/...`（相对于 user repo 根）

**架构说明**（2026-04-21 更新）：
- 线程树架构（`kernel/src/thread/`）是**唯一执行路径**。
- 旧的 `kernel/src/flow/` 目录以及 `kernel/src/world/{scheduler,session,router}.ts` 已在 2026-04-21 完全退役并删除（退役记录见 `docs/工程管理/迭代/all/20260421_feature_旧Flow架构退役.md`）。
- `OOC_THREAD_TREE` 环境变量不再生效——线程树架构下没有"回退"这回事。
- ReflectFlow（常驻自我对话）功能保留为"线程树版待设计"的 backlog，不在当前活跃代码路径。

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
│   │   ├── instructions ── 系统指令（来自激活的 kernel trait）
│   │   ├── knowledge ── 知识窗口（来自激活的 library/user trait）
│   │   ├── parentExpectation ── 父线程对我的期望（来自线程树节点 title + description）
│   │   ├── process ── 我在做什么（来自当前线程的 actions 历史）
│   │   ├── inbox ── 别人对我说了什么（来自线程 inbox，含 messageId 供 mark）
│   │   ├── activeForms ── 我正在进行的操作（来自 FormManager）
│   │   ├── directory ── 我拥有什么（来自持久化目录）
│   │   └── childrenSummary ── 子线程完成情况（来自线程树子节点摘要）
│   │
│   ├── 线程树 / Thread Tree（G13）
│   │   │   对象的运行时 = 一棵树。
│   │   │   每个节点 = 一个线程 = 一层认知作用域。
│   │   │   替代旧的"认知栈"和"行为树"，统一为单一数据结构。
│   │   │
│   │   ├── 根线程 ── 由用户消息或 talk 创建
│   │   │       是对象处理一个请求的入口。
│   │   │
│   │   ├── 子线程 ── 由 create_sub_thread 创建
│   │   │       继承父线程的 trait 作用域。
│   │   │       独立执行，完成后 return 结果通知父线程。
│   │   │
│   │   ├── Scope Chain ── 从当前节点沿树向上收集
│   │   │       决定哪些 trait 被激活、哪些知识可见。
│   │   │
│   │   ├── 节点状态 ── running / waiting / done / failed
│   │   │
│   │   ├── 线程复活（Thread Revival）
│   │   │       done 线程收到任何 inbox 消息时自动恢复为 running。
│   │   │       线程不是一次性执行单元，而是可反复唤醒的认知通道。
│   │   │       revivalCount 记录复活次数，Context 注入 revival_notice 提示。
│   │   │
│   │   └── 智慧 = 根节点的厚度
│   │           新手需要很多子线程才能完成一件事。
│   │           专家的根线程已经内化了大量经验——同样的事只需要很浅的树。
│   │
│   ├── ThinkLoop（G4）
│   │   │   对象的思考引擎。每一轮：
│   │   │   Context → LLM（含 tools）→ Tool Call → 执行 → 新 Context → ...
│   │   │
│   │   ├── 感知 ── 构建 Context（context-builder.ts）
│   │   ├── 思考 ── LLM 基于 Context + tools 生成 tool call 或文本
│   │   ├── 行动 ── Engine 处理 tool call（open/submit/close/wait）
│   │   └── 循环 ── 行动结果写回线程数据，触发下一轮
│   │
│   ├── 指令系统 / Tool Calling
│   │   │   对象通过三个 tool 与系统交互：
│   │   │
│   │   ├── open ── 打开上下文
│   │   │   │   三种类型：
│   │   │   ├── command ── 执行指令（program/talk/return 等），加载关联 trait
│   │   │   ├── trait ── 加载 trait 知识到上下文
│   │   │   └── skill ── 加载 skill 内容到上下文
│   │   │
│   │   ├── submit ── 提交执行（仅 command 类型）
│   │   │       传入 open 返回的 form_id + 指令参数。
│   │   │
│   │   ├── close ── 关闭上下文
│   │   │       command 类型 = 取消指令，trait/skill 类型 = 卸载知识。
│   │   │
│   │   ├── mark ── 标记 inbox 消息（附加在任意 tool 调用上）
│   │   │       ack（已确认）/ ignore（忽略）/ todo（待办）
│   │   │
│   │   ├── defer ── 注册 command hook（灵感来自 Go defer）
│   │   │       open(command=defer) + submit(on_command, content)
│   │   │       在目标 command 被 submit 时注入提醒文本到 Context
│   │   │       生命周期 = 线程级，线程 return 后自动清除
│   │   │
│   │   └── Form Manager ── 跟踪活跃 form 的生命周期
│   │           open 创建 form → submit 完成 form → close 取消 form
│   │           渐进式 trait 加载：open 时加载，submit/close 后卸载
│   │
│   ├── Thinking Mode（双通道架构）
│   │   │   thought 从"输出协议"迁移为"Provider 能力层产生的运行时语义"。
│   │   │
│   │   ├── Provider 能力层 ── 开启 thinking、读取 thinking 输出、适配为统一结构
│   │   │   └── LLMResult = { content, thinkingContent, toolCalls, usage }
│   │   └── Engine 语义映射层 ── 将 thinkingContent 映射为系统 thought
│   │       ├── 记录为 thought action（落盘 thread.json）
│   │       └── 通过 SSE 发为 stream:thought
│   │
│   ├── Inbox 机制
│   │   │   对象接收消息的统一入口。
│   │   │
│   │   ├── 消息来源 ── talk（其他对象）/ system（系统通知）/ thread_error（错误）
│   │   ├── 消息状态 ── unread / marked
│   │   ├── 展示 ── Context 中"未读消息"区域，含 messageId
│   │   ├── 标记 ── Object 通过 mark 参数主动标记（ack/ignore/todo）
│   │   └── 上下文保留 ── inbox 不过滤已标记消息，保持完整上下文
│   │
│   └── 注意力与遗忘（G5）
│           Context 有容量限制。不是所有信息都能同时存在。
│           遗忘不是丢失——是让不相关的信息退场，为当前任务腾出空间。
│           线程完成后，有价值的内容通过 return summary 传递给父线程，其余释放。
│
├── 行动 ── 对象如何"做"？
│   │
│   ├── 线程树调度（G9）
│   │   │   对象的行动由线程树驱动。
│   │   │   ThreadScheduler 管理线程执行顺序。
│   │   │
│   │   ├── 单线程循环 ── 每个 running 线程轮流执行一轮 ThinkLoop
│   │   ├── 子线程创建 ── create_sub_thread 创建子线程处理子任务
│   │   ├── 等待机制 ── await/await_all 等待子线程完成
│   │   └── 完成传播 ── 子线程 return → 结果写入父线程 inbox → 唤醒父线程
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
│   │   │
│   │   ├── talk ── 异步对话（发送消息，不等待回复）
│   │   ├── talk_sync ── 同步对话（发送消息，等待回复后继续）
│   │   └── inbox ── 消息收件箱（unread → Object 主动 mark）
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
│       └── issue-discussion ── 位于 `kernel/traits/talkable/issue-discussion/`（talkable 子 trait），所有对象共享，管理 Issue 评论
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
    ├── user/                        ── user 的 session 级数据（身份挂牌，不参与 ThinkLoop）
    │   └── data.json               ── user inbox 引用索引：{ inbox: [{threadId, messageId}, ...] }
    │                                 每次 talk(target="user") 追加一条引用（不存正文）
    │                                 前端凭 (threadId, messageId) 反查 thread.json.actions 里的正文
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
      kernel/src/persistence/user-inbox.ts（user inbox 引用式持久化，append/read）
```

### 子树 2: 认知构建 — "Context 如何被组装"（G5, G13）

```
Context
│
├── 组成部分
│   ├── whoAmI          ← stones/{name}/readme.md
│   ├── instructions    ← 激活的 kernel trait 的 TRAIT.md（系统指令）
│   ├── knowledge       ← 激活的 library/user trait 的 TRAIT.md（知识窗口）
│   ├── parentExpectation ← 线程树节点的 title + description
│   ├── process         ← threads/{threadId}/thread.json 中的 actions 历史
│   ├── inbox           ← thread.json 中的 unread 消息（含 messageId）
│   ├── activeForms     ← FormManager 中的活跃 form 列表
│   ├── directory       ← stones/{name}/ 目录列表
│   └── childrenSummary ← 线程树子节点的完成摘要
│
├── Scope Chain（作用域链）
│   └── 从当前线程节点沿树向上收集
│       → 决定哪些 trait 被激活
│       → 决定哪些知识可见
│
├── 渐进式 Trait 加载
│   ├── base trait（always）── 始终注入，定义 open/submit/close 三原语
│   ├── command_binding ── open(command=X) 时加载 X 关联的 trait
│   │       如 open(command=program) → 加载 computable trait
│   └── open(type=trait/skill) ── 按需加载任意 trait 或 skill
│
├── 三层记忆
│   ├── long-term memory  ── stones/{name}/readme.md + memory.md
│   ├── session memory    ── thread.json 中的 actions 历史
│   └── recent history    ── 最近 N 轮的完整记录
│
└── Pause（人机协作检查点）
    ├── 触发: Engine 在 LLM 返回后、执行前检查暂停信号
    ├── 暂停时写出:
    │   ├── llm.input.txt  ── 本轮发送给 LLM 的完整 Context
    │   └── llm.output.txt ── LLM 返回的原始输出（含 tool calls）
    ├── 人工介入: 用户可查看、修改 llm.output.txt
    └── 恢复时: 读取 llm.output.txt 作为实际输出执行

代码: kernel/src/thread/context-builder.ts（组装）, kernel/src/thread/engine.ts（Engine 循环）
      kernel/src/thread/tools.ts（Tool 定义）, kernel/src/thread/form.ts（FormManager）
```

**可见性分类（4 色）** —— 每个节点在 focus 线程 Context 中的呈现形态：

- `detailed` — focus 自身：process 区段完整 actions 可见
- `summary`  — 祖先 / 直接子 / 同级兄弟，拥有 summary 字段
- `title_only` — 祖先 / 直接子 / 同级兄弟，没有 summary
- `hidden` — 其他节点（uncle / cousin / 孙节点等）

规则严格对齐 context-builder 的 `renderAncestorSummary`/`renderChildrenSummary`/`renderSiblingSummary`。
分类器：`kernel/src/thread/visibility.ts#classifyContextVisibility`
HTTP：`GET /api/flows/:sessionId/objects/:name/context-visibility?focus=:threadId`
UI：`ThreadsTreeView` "Ctx View" 切换（子树 6）

### 子树 3: 思考-执行 — "Engine 每一轮发生了什么"（G4, G9, G12, G13）

```
Engine（线程树执行引擎）
│
├── 单轮循环
│   ├── 感知    ── context-builder.ts 组装 Context
│   ├── 思考    ── LLM 基于 Context + tools 生成输出
│   │               Provider 返回 content + thinkingContent + toolCalls
│   │               thinkingContent 自动映射为系统 thought action
│   │               toolCalls 交由 Engine 处理
│   ├── 执行    ── Engine 处理 tool call（open/submit/close/wait）
│   │               open → 创建 form + 加载 trait
│   │               submit → 执行指令（program/talk/return 等）
│   │               close → 取消 form + 卸载 trait
│   ├── 记录    ── thought + actions + output 写入 thread.json
│   └── 标记    ── 处理 mark 参数，标记 inbox 消息
│
├── Thinking Mode（双通道架构）
│   │   thought 从"输出协议"迁移为"Provider 能力层产生的运行时语义"。
│   │
│   ├── Provider 能力层 ── 开启 thinking、读取 thinking 输出
│   │   └── LLMResult = { content, thinkingContent, toolCalls, usage }
│   └── Engine 语义映射层 ── 将 thinkingContent 映射为系统 thought
│       ├── 记录为 thought action（落盘 thread.json）
│       └── 通过 SSE 发为 stream:thought
│
├── Tool Calling 路径（唯一路径）
│   │   LLM 必须返回 toolCalls；Engine 从每次 tool call 顶层
│   │   提取 title（一句话行动说明），写入 ThreadAction.title，
│   │   并通过 SSE flow:action 广播给前端 TuiAction 展示。
│   │
│   ├── open → FormManager.begin() + collectCommandTraits() + activateTrait()
│   ├── submit → FormManager.submit() + 执行指令 + deactivateTrait()
│   ├── close → FormManager.cancel() + deactivateTrait()
│   └── wait → tree.setNodeStatus(threadId, "waiting")
│   （原 TOML 兼容回退路径已于 2026-04-21 退役——parser.ts/thinkloop.ts 删除）
│
├── 线程树调度
│   ├── ThreadScheduler ── 管理线程执行顺序
│   │       每个 running 线程轮流执行一轮
│   │       子线程完成 → 唤醒等待的父线程
│   │       检测死锁（所有线程 waiting）→ 强制唤醒
│   └── 终止条件 ── 根线程 done/failed → 执行结束
│
└── ReflectFlow — 对象的常驻自我反思
    │
    ├── 物理位置: stones/{name}/reflect/（data.json + process.json）
    ├── 触发: 普通 Flow 调用 reflect(message)
    ├── 执行: 拥有独立行为树，可修改 Stone 的 readme.md / data.json
    │
    └── 哲学意义: 实现 G12 沉淀循环的关键机制
                  经历 → reflect → ReflectFlow 审视 → 沉淀为 trait

代码: kernel/src/thread/engine.ts（执行引擎）, kernel/src/thread/scheduler.ts（调度器）
      kernel/src/thread/tree.ts（线程树数据结构）, kernel/src/thread/context-builder.ts（Context 构建）
      kernel/src/thread/tools.ts（Tool 定义，含所有 tool 的 title 参数）
      kernel/src/thread/form.ts（FormManager）, kernel/src/thread/hooks.ts（Trait 加载钩子）
      kernel/src/thinkable/client.ts（Provider，含 tool calling 支持）
```

### 子树 4: 协作 — "对象如何与其他对象交互"（G6, G8）

```
协作模型
│
├── 通信原语
│   ├── talk(target, message)       ── 异步对话：发送消息到目标对象
│   ├── talk_sync(target, message)  ── 同步对话：发送消息并等待回复
│   └── return(summary)             ── 完成当前线程，返回结果给创建者
│
├── Inbox 机制
│   ├── 消息写入 ── talk 消息写入目标线程的 inbox
│   ├── 消息展示 ── Context 中"未读消息"区域（含 messageId）
│   ├── 消息标记 ── Object 通过 mark 参数主动标记
│   │       ack（已确认）/ ignore（忽略）/ todo（待办）
│   ├── 上下文保留 ── inbox 不过滤已标记消息，保持完整上下文
│   ├── 溢出处理 ── 超过上限时自动 mark(ignore) 最早的 unread
│   └── 线程复活 ── 向 done 线程写入消息时自动唤醒为 running（revivalCount +1）
│
├── User Inbox（session 级引用式收件箱）
│   │   user 是身份挂牌、不参与 ThinkLoop，但系统需要记录"谁给 user 发过什么"
│   │   以便前端 MessageSidebar 能按对象聚合 + 未读角标。
│   │
│   ├── 路径 ── flows/{sessionId}/user/data.json
│   ├── 结构 ── { inbox: [{threadId, messageId}, ...] }
│   ├── 引用式 ── 只存 (threadId, messageId) 对，不复制消息正文
│   │       正文在发起对象的 thread.json.actions[] 里，前端凭 id 反查
│   ├── 写入时机 ── 任意对象 talk(target="user") 时，world 在 SSE 广播外追加一条引用
│   ├── 写失败不阻塞 ── console.error，不回滚 SSE，不抛
│   ├── 串行化 ── per-sessionId Promise 链（防并发写丢）
│   ├── talk_sync(user) ── 不设 waiting 状态（user 永不回复，避免死锁）
│   └── HTTP API ── GET /api/sessions/:sid/user-inbox → { inbox: [...] }
│
├── 子线程协作
│   ├── create_sub_thread ── 创建子线程处理子任务
│   ├── continue_sub_thread ── 向已创建的子线程追加消息（done 线程自动复活）
│   ├── await / await_all ── 等待子线程完成
│   └── 子线程 return → 结果写入父线程 inbox → 唤醒父线程
│
├── Session 管理
│   └── Session
│       ├── 一个 sessionId 对应一个 Session
│       ├── Session 管理同一任务中的多个对象的线程树
│       ├── 跨对象协作在同一个 session 下
│       │   └── onTalk 回调传递 sessionId 给 _talkWithThreadTree
│       │       使所有对象的线程树在 session/objects/ 目录下
│       └── Session 结束时清理所有 Flow 的 .flow 标记
│
└── World 调度
    └── ThreadScheduler
        ├── 管理单个对象内的线程执行顺序
        ├── 每个 running 线程轮流执行一轮 Engine 循环
        ├── 子线程完成 → checkAndWake 唤醒等待的父线程
        ├── 死锁检测 → 所有线程 waiting 时强制唤醒
        └── 终止条件 → 根线程 done/failed → 执行结束

代码: kernel/src/thread/engine.ts（执行引擎，含 talk/create_sub_thread 处理）
      kernel/src/thread/scheduler.ts（线程调度器）
      kernel/src/thread/tree.ts（线程树，含 writeInbox/markInbox/awaitThreads）
      kernel/src/thread/collaboration.ts（跨对象协作 API）
      kernel/src/world/world.ts（World 入口；含 handleOnTalkToUser helper）
      kernel/src/persistence/user-inbox.ts（user inbox 引用式持久化）
```

### 子树 5: Trait — "能力如何定义、加载、生效"（G3, G13）

```
Trait
│
├── 定义结构（TraitDefinition）
│   ├── name         ── 完整路径名（如 "kernel/computable", "lark/doc"）
│   ├── description  ── 能力描述（注入 Context 让 LLM 理解）
│   ├── readme       ── TRAIT.md 内容（激活时注入 Context）
│   ├── command_binding ── 关联的指令列表（open 时自动加载）
│   ├── methods      ── 注册方法（沙箱中可调用的函数）
│   ├── children     ── 子 trait ID 列表（树形结构时自动填充）
│   └── parent       ── 父 trait ID（树形结构时自动填充）
│
├── 树形结构与 Progressive Disclosure
│   │   Trait 支持任意深度的树形嵌套（如 kernel/computable/file_ops）。
│   │   三层加载策略减少 Context 注入量：
│   │
│   ├── Level 1 ── 精简注入（always-on 父 trait 的精简 TRAIT.md）
│   ├── Level 2 ── 子 trait 描述可见（active 父 trait 的子 trait 一行描述）
│   └── Level 3 ── 按需激活（open(type=trait) 或 command_binding 加载完整内容）
│
├── 加载链路（三层，同名后者覆盖前者）
│   └── 1. kernel/traits/ → 2. library/traits/ → 3. stones/{name}/traits/
│       → loader.ts 解析 Trait 文件
│       → TraitDefinition[]
│
├── 渐进式激活（command_binding 驱动）
│   │   Trait 不再始终激活，而是按需加载：
│   │
│   ├── open(type=command, command=X) → collectCommandTraits 查找 X 关联的 trait → activateTrait
│   ├── open(type=trait, name=Y) → 直接 activateTrait(Y)
│   ├── submit/close 后 → 检查 refcount → deactivateTrait
│   └── FormManager 跟踪活跃 form，驱动 trait 加载/卸载
│
└── 方法注册
    └── MethodRegistry
        ├── Trait 的 methods 注册为沙箱可调用函数
        ├── buildSandboxMethods 按 activatedTraits 过滤注入
        └── call_function 指令直接调用 trait 方法

代码: kernel/src/trait/loader.ts（加载）, kernel/src/trait/registry.ts（方法注册）
      kernel/src/thread/hooks.ts（collectCommandTraits）
      kernel/src/thread/tree.ts（activateTrait/deactivateTrait）
      kernel/src/types/trait.ts（类型定义）
```

#### Kernel Traits — 两层结构

Kernel Traits 是所有对象共享的基础能力，位于 `kernel/traits/`。
通过 `command_binding` 渐进式加载，组合起来定义了"作为 OOC 对象意味着什么"。

```
Kernel Traits
│
├── 基座层（when: always）── 始终注入
│   │
│   └── kernel/base ── 指令系统基座
│           定义 open/submit/close/wait 四原语 + mark 机制（附加参数）。
│           是唯一的 always trait，极简。
│
├── 能力层（when: never, command_binding 驱动）── 按需加载
│   │
│   │   这些 trait 在 open(command=X) 时自动加载，submit/close 后自动卸载。
│   │   它们的组合 = 能思考 + 能交流 + 能成长 + 不自欺 + 会拆解。
│   │
│   ├── kernel/computable ── 代码执行（command_binding: program）
│   │   │   核心 API 签名、沙箱变量、文件操作。
│   │   │   没有它，对象无法行动。
│   │   │
│   │   ├── kernel/computable/program_api    ── 完整 API 参考文档
│   │   ├── kernel/computable/file_ops       ── 文件操作详细说明
│   │   ├── kernel/computable/file_search    ── glob/grep 详细说明
│   │   ├── kernel/computable/shell_exec     ── exec/sh 详细说明
│   │   ├── kernel/computable/web_search     ── 互联网搜索
│   │   └── kernel/computable/testable       ── 测试执行能力
│   │
│   ├── kernel/talkable ── 与他者建立关系（command_binding: talk, talk_sync, return）
│   │   │   消息发送、回复、社交原则。
│   │   │   没有它，对象是孤岛。
│   │   │
│   │   ├── kernel/talkable/cross_object  ── 跨对象函数调用协议
│   │   ├── kernel/talkable/ooc_links     ── ooc:// 链接和导航卡片
│   │   ├── kernel/talkable/delivery      ── 交付规范、协作交付
│   │   └── kernel/talkable/issue-discussion ── Issue 讨论与评论（所有对象共享，虽在 talkable 下但偏向看板）
│   │
│   ├── kernel/reflective ── 从经验中学习（command_binding: return）
│   │   │   reflect 沉淀通道、核心原则。
│   │   │   没有它，对象不会成长。
│   │   │
│   │   ├── kernel/reflective/memory_api    ── 记忆 API（Flow Summary, Self/Session）
│   │   └── kernel/reflective/reflect_flow  ── ReflectFlow 角色定义
│   │
│   ├── kernel/verifiable ── 认识论诚实（command_binding: return）
│   │       "没有验证证据，不做完成声明。"
│   │       没有它，对象会自欺。
│   │
│   ├── kernel/plannable        ── 任务拆解（command_binding: create_sub_thread）
│   ├── kernel/debuggable       ── 系统化调试（手动激活，无 command_binding）
│   ├── kernel/reviewable       ── 代码审查（手动激活，deps: verifiable）
│   ├── kernel/library_index    ── Library 资源查询（command_binding: program）
│   └── kernel/object_creation  ── 创建新对象的指南（command_binding: create_sub_thread）
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
│   │   │   拆分成上下两个圆角卡片，中间 gap-1.5 露出背景
│   │   │
│   │   ├── 上部卡片 ── Logo 区域
│   │   │   ├── BrandMark ── OOC Logo（阿基米德螺旋 + 三圆点关系图）
│   │   │   ├── Title ── "Oriented Object Context"
│   │   │   └── ControlButtons ── 三个等宽圆角按钮（pause/debug/online）
│   │   │       灰色圆角容器，按钮改成 rounded-md，高度 24px
│   │   │
│   │   └── 下部卡片 ── Tab + 内容区域
│   │       ├── ModeSwitch ── 三 Tab 切换器（Flows / Stones / World）
│   │       ├── SessionBar ── 当前 Session 标题栏（列表切换 + 标题编辑）
│   │       ├── TreePane ── 文件树区域（根据 ModeSwitch 切换内容）
│   │       │   ├── SessionsList ── Session 列表（Flows 模式，无活跃 session 时）
│   │       │   ├── SessionFileTree ── Session 文件树（Flows 模式，有活跃 session 时）
│   │       │   │       注入虚拟节点：index（session 入口）、ui（自渲染 UI）、.stone（对象源）
│   │       │   └── FileTree ── 通用文件目录树（Stones / World 模式）
│   │       │           带 marker 图标：Box=stone, GitBranch=flow, Folder=普通目录
│   │       └── ActivityHeatmap ── 当月使用热力图
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
│       │   user 的多线程消息中心。默认与 supervisor 对话，但 Body 可展示
│       │   任意 threadId 的 process；Header 红 dot 角标提示其他 thread 未读。
│       │   代码：kernel/web/src/features/MessageSidebar.tsx
│       │       + MessageSidebarThreadsList.tsx
│       │       + hooks/useUserThreads.ts
│       │
│       ├── Header ── 顶部工具条
│       │   ├── target avatar + session id（当前对话对象）
│       │   ├── 上下消息导航（ChevronUp/Down）
│       │   ├── pause/resume toggle
│       │   ├── threads 切换按钮（MessageSquare icon）
│       │   │       红 dot 角标：其他非当前查看 thread 有未读消息时显示
│       │   │       unread 判定：allUnreadMessageIds 排除 currentThreadId 的消息
│       │   └── main/sidebar 布局切换
│       │
│       ├── Body（process 视图）── sidebarView="process" 时
│       │   │   只展示 currentThreadId 对应节点的 actions
│       │   │   （跨 subFlows 用 findThreadInAllSubFlows 定位节点）
│       │   │   空状态分两种：
│       │   │     currentThreadId=null  → "向 supervisor 发起对话"
│       │   │     线程无 action        → "此线程暂无内容"
│       │   ├── TuiUserMessage ── user 侧消息
│       │   ├── TuiTalk ── 对象侧消息
│       │   ├── TuiAction ── process action 一行展示
│       │   └── TuiStreamingBlock ── 流式 thought / talk / action
│       │
│       ├── Body（threads 视图）── sidebarView="threads" 时
│       │   │   MessageSidebarThreadsList 双栏：
│       │   ├── 左栏：我发起的
│       │   │       subFlows 的 process.root（user 主动 talk 创建的线程）
│       │   │       每项：对象头像 + thread title + status 圆点
│       │   └── 右栏：收到的（iMessage 风格按对象聚合）
│       │           按 user-inbox 反查 + 按对象分组
│       │           卡片：对象头像 + 名 + 最新消息缩略 + 未读 badge + 时间
│       │           展开后显示该对象下所有 thread 的缩略列表
│       │
│       ├── MessageInput ── 消息输入框（@ mention + 发送）
│       │
│       └── 未读持久化 ── localStorage（本迭代临时方案）
│               key: ooc:user-inbox:last-read:{sid}
│               value: string[]（已读的 messageId 列表）
│               切到某 thread 时自动 markMessagesRead
│               后续独立迭代做后端 read-state
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
│   │   │   ├── TuiTalk ── 对话消息一行展示（TuiBlock.tsx 内）
│   │   │   └── TuiAction ── Action 一行展示（tool_use 首行显示 title，详见下）
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
│   │   │   主体：Object Readme 全屏展示
│   │   │   抽屉：底部升起的抽屉页（默认 90% 高度）
│   │   │
│   │   ├── Readme（主体）── 对象 Readme 全屏展示
│   │   └── 底部抽屉 ── iOS 风格装饰条 + Tab 内容
│   │       ├── TimelineTab ── 时间线（消息 + actions 按时间排序）
│   │       ├── ProcessTab ── 行为树视图（复用 ProcessView）
│   │       ├── DataTab ── 分栏设计（左栏 Flow data + 右栏 Stone data）
│   │       ├── MemoryTab ── 会话记忆展示
│   │       └── UITab ── Flow 自渲染 UI（DynamicUI 加载 ui/pages/*.tsx）
│   │
│   ├── SessionKanban（Session 看板）── Session 级总览
│   │   │   主体：所有对象的 threads tree 可视化
│   │   │   抽屉：底部升起的抽屉页（初始 160px，展开 90%）
│   │   │
│   │   ├── Threads Tree 列表（主体）── 垂直排列所有对象的线程树
│   │   │   ├── 对象分隔标题 ── 头像 + 对象名
│   │   │   ├── ThreadsTreeView ── 复用 FlowView 的线程树组件
│   │   │   │   ├── 节点状态圆点 ── running / waiting / done / failed / pending / paused
│   │   │   │   ├── 图钉 ── 右键菜单 10 种颜色 + 系统蓝色图钉（最近查看）
│   │   │   │   └── Ctx View 切换 ── 按 focus 线程的 Context 可见性给每个节点着色
│   │   │   │       四色图例：detailed / summary / title_only / hidden
│   │   │   │       点击节点 → 切换 focus → 全树重算（调用 context-visibility API）
│   │   │   ├── 加载策略 ── supervisor 优先，其他并发加载
│   │   │   └── SSE 刷新 ── 只刷新变化的对象（防抖批量处理）
│   │   │
│   │   └── 底部抽屉 ── iOS 风格装饰条 + Issues/Tasks 左右分栏
│   │       ├── IssuesPanel ── 左栏：Issue 按状态分组展示
│   │       │   ├── IssueCard ── Issue 卡片（标题 + 关联 task 数 + 参与者 + hasNewInfo 红点）
│   │       │   └── 分组顺序：需确认 → 讨论中 → 设计中 → 评审中 → 执行中 → 确认中 → 完成 → 关闭
│   │       └── TasksPanel ── 右栏：Task 按状态分组展示
│   │           ├── TaskCard ── Task 卡片（标题 + 子任务进度条 + hasNewInfo 红点）
│   │           └── 分组顺序：执行中 → 完成 → 关闭
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
│   │   ├── TuiAction ── Action 一行展示（详见卡片组件）
│   │   └── NodeSummary ── 节点摘要（虚线边框，压缩后的内容）
│   │
│   └── MiniTree ── 右栏：节点树缩略视图
│           可展开/折叠，点击切换选中节点
│           状态圆点：绿=done, 橙=doing, 灰=pending
│           focus 节点标记 "(focus-on)"
│
├── 卡片组件 ── 信息展示的基本单元（TuiBlock.tsx 中统一定义）
│   │
│   ├── TuiAction（Action 一行展示）── 展示单条 action
│   │   │   TUI 风格：一行前缀字符 + label + 内容；inject 默认折叠
│   │   │   ThreadAction 类型：thinking/text/tool_use/program/inject/message_in/
│   │   │                     message_out/set_plan/mark_inbox/create_thread/thread_return
│   │   │
│   │   ├── HeaderLine ── 头部一行
│   │   │   ├── 前缀字符 + label（类型着色）
│   │   │   ├── tool_use 主标题 ── action.title（LLM 自叙的行动说明，主色、font-medium）
│   │   │   ├── tool_use 副标题 ── toolName(args 摘要)（次级色、小字、低透明度）
│   │   │   │       无 title 时 fallback 为此行的主展示
│   │   │   ├── program 成功/失败标记（✓/✗）
│   │   │   ├── objectName（可选）
│   │   │   ├── 时间戳 ── 右侧对齐
│   │   │   └── CopyBtn ── hover 显示
│   │   ├── ContentArea（expanded 才显示，支持 maxHeight 截断滚动）
│   │   │   ├── thinking → Markdown（italic）
│   │   │   ├── program → pre 截断 + "查看全文"模态窗
│   │   │   └── text / inject 等 → Markdown
│   │   └── FullTextModal ── Radix Dialog 全屏展开
│   │
│   └── TuiTalk（Talk 一行展示）── 展示对象间对话消息
│       │   TuiBlock.tsx 中与 TuiAction 同风格
│       │
│       ├── HeaderLine ── 前缀 ❯ + label talk + from → to + 时间戳 + CopyBtn
│       └── ContentArea ── MarkdownContent（text-[13px]）
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
│   │       用于 OocLinkPreview 等（TuiAction 使用 Radix Dialog 的 FullTextModal）
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
│   └── issue-discussion（talkable 子 trait，所有对象共享）
│       │   位置：kernel/traits/talkable/issue-discussion/
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
  身份(readme) → 能力(Trait) → 计划(线程树) → 思考(Engine) → 行动(Effect)
                                                                    │
沉淀循环（逆向）：                                                    │
  身份(readme) ← 沉淀(G12) ← 反思(reflect) ← 记录 ← 经验 ←─────────┘
```

对象从身份出发，展开为行动；行动的结果沉淀回身份。
这个循环每转一圈，对象的经验就厚一层。

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
