# Kernel Src 能力目录结构设计

## 背景

`kernel/src` 目前仍以工程实现模块为主要组织方式，例如 `thread/`、`trait/`、`persistence/`、`server/`。这在工程上可用，但和 OOC 在 `docs/meta.md` 中描述的对象能力模型不完全一致：读目录时不容易直观看出 OOC 具备哪些能力，也不容易从能力反向找到代码。

近期清理后，旧 `context/`、`process/` 已退役，`thread/` 是唯一执行路径；同时 `thread/` 自身继续承载 engine、commands、tools、context、scheduler、forms、super 等多种职责。下一步目录优化应该把源码组织成 OOC 能力地图，而不是继续把所有运行时细节堆在 `thread/` 下。

## 设计目标

1. 顶层目录尽量表达 OOC 的能力：能执行、能思考、能存储、能协作、能扩展、能被观察。
2. 保留少量必要实体目录，避免为了统一命名而牺牲工程可读性。
3. 让每个目录有清楚边界，文件位置能通过“这段代码服务哪种能力”判断。
4. 支持分阶段迁移，每一步都可 typecheck 和测试验证。
5. 不恢复旧概念目录：不引入 `flow/`、`process/`、旧 `context/`。

## 目标结构

```txt
kernel/src/
├── app/              # CLI、启动装配、运行配置
├── thinkable/        # 思考：LLM client、context 构建、ThinkLoop/engine
├── executable/       # 执行：tool 协议、command 表、program sandbox、effects
├── storable/         # 存储：stone/session/thread/memory/edit-plan/user-inbox 持久化
├── collaborable/     # 协作：talk、relation、peers、inbox、super routing
├── extendable/       # 扩展：trait loader、method registry、knowledge、skill
├── observable/       # 观察：HTTP/SSE/debug/context visibility/test runner
├── world/            # World 根对象、registry、cron/hooks
├── object/           # Stone/Object identity/model
└── shared/           # 通用类型、utils、logging、外部 integrations
```

`openable` 不作为独立目录；`open/refine/submit/close/wait` 是执行能力的一部分，归入 `executable/`。

`traitable` 重命名为 `extendable/`；trait、knowledge、skill 的共同作用是让对象扩展自己的思考方式、可调用方法和上下文知识。

## 二级目录结构

二级目录遵循两个原则：

1. **按子能力拆分**，不按当前文件名机械分组。
2. **保留 index.ts 作为能力门面**，跨目录调用尽量依赖门面或明确子模块，而不是深层互相穿透。

### app

```txt
app/
├── cli.ts            # CLI 入口
├── bootstrap.ts      # 运行时装配：World、server、hooks、默认配置
└── config.ts         # 环境变量与启动配置解析
```

当前只有 `cli.ts` 必须迁移；`bootstrap.ts` / `config.ts` 是后续把启动装配从入口文件中拆出时的目标位置。

### thinkable

```txt
thinkable/
├── llm/              # LLM 协议、client、provider config
│   ├── client.ts
│   └── config.ts
├── engine/           # ThinkLoop / Thread engine 主循环
│   ├── engine.ts
│   ├── types.ts
│   └── scheduler.ts
├── context/          # Context 构建和 message 渲染
│   ├── builder.ts
│   ├── messages.ts
│   └── compact.ts
└── thread-tree/      # 线程树数据结构的内存操作
    ├── tree.ts
    └── types.ts
```

边界说明：

- `llm/` 只负责模型调用协议，不知道 OOC 的对象/线程语义。
- `engine/` 负责调度一轮轮思考，但不直接处理每个 command 的细节。
- `context/` 只负责把当前世界视角渲染成 LLM 输入。
- `thread-tree/` 负责线程树内存结构和状态转换，不负责文件读写；文件读写归 `storable/thread/`。

### executable

```txt
executable/
├── tools/            # OpenAI tool schema：open/refine/submit/close/wait
│   ├── open.ts
│   ├── refine.ts
│   ├── submit.ts
│   ├── close.ts
│   ├── wait.ts
│   ├── schema.ts
│   └── index.ts
├── commands/         # openable command 表和每个 command 的执行逻辑
│   ├── index.ts
│   ├── types.ts
│   ├── program.ts
│   ├── talk.ts
│   ├── do.ts
│   ├── return.ts
│   ├── compact.ts
│   ├── plan.ts
│   └── defer.ts
├── sandbox/          # program 执行沙箱和 effect 追踪
│   ├── executor.ts
│   └── effects.ts
├── forms/            # open/refine/submit 的 FormManager
│   └── form.ts
└── protocol/         # command 执行辅助协议
    ├── xml.ts
    └── virtual-path.ts
```

边界说明：

- `tools/` 是给 LLM provider 看的 tool schema。
- `commands/` 是 OOC 内部 command 语义。
- `sandbox/` 是 program command 的执行环境。
- `forms/` 管理 open/refine/submit 的生命周期。
- `protocol/` 放 command 协议辅助工具，避免散落在 engine 附近。

### storable

```txt
storable/
├── stone/            # Stone/Object 静态数据读写
│   ├── reader.ts
│   └── writer.ts
├── session/          # Flow/session 数据读写和 session 列表
│   ├── reader.ts
│   ├── writer.ts
│   └── flow-data.ts
├── thread/           # ThreadTree 落盘、thread data 文件读写
│   ├── persistence.ts
│   └── process-compat.ts
├── memory/           # 长期记忆、embedding、GC、curation
│   ├── entries.ts
│   ├── embedding.ts
│   ├── gc.ts
│   └── curator.ts
├── edit-plans/       # 多文件编辑计划
│   └── edit-plans.ts
├── inbox/            # user inbox / read state 持久化
│   └── user-inbox.ts
├── frontmatter.ts
└── index.ts
```

边界说明：

- `storable/thread/` 只负责文件系统读写，不负责线程树运行规则。
- `process-compat.ts` 继续留在存储层，因为它服务旧 `FlowData.process` 持久化和 HTTP 兼容视图。
- `frontmatter.ts` 是读写 Markdown frontmatter 的基础设施，放在 `storable/` 根下供 stone/session/trait loader 使用。

### collaborable

```txt
collaborable/
├── talk/             # talk 协作流程和跨对象返回路由
│   └── collaboration.ts
├── inbox/            # thread inbox 限流、标记、复活相关辅助
│   └── inbox.ts
├── relation/         # relation 文件定位、读取、渲染
│   ├── relation.ts
│   └── peers.ts
├── super/            # super 对象路由和调度
│   ├── super.ts
│   ├── super-thread.ts
│   └── super-scheduler.ts
└── kanban/           # 会话协作看板能力，暂放在 collaborable
    ├── store.ts
    ├── discussion.ts
    ├── methods.ts
    └── types.ts
```

边界说明：

- `talk/` 处理对象间消息流。
- `inbox/` 处理消息容器规则。
- `relation/` 处理对象间关系知识。
- `super/` 是对象与自身镜像分身之间的特殊协作路径。
- `kanban/` 暂归协作能力；如果后续形成更完整的规划能力，可独立为 `plannable/`。

### extendable

```txt
extendable/
├── trait/            # Trait / View 加载、树构建、方法注册
│   ├── loader.ts
│   ├── registry.ts
│   └── index.ts
├── knowledge/        # KnowledgeRef、反向索引、激活计算
│   ├── activator.ts
│   ├── reverse-index.ts
│   ├── types.ts
│   └── index.ts
├── skill/            # SKILL.md 加载
│   ├── loader.ts
│   ├── types.ts
│   └── index.ts
├── activation/       # command path → trait/hook/open-files 的激活中枢
│   ├── hooks.ts
│   └── open-files.ts
└── index.ts
```

边界说明：

- `trait/` 管 trait 定义与方法。
- `knowledge/` 管什么知识何时进入 context。
- `skill/` 管外部技能文档。
- `activation/` 管运行时命令路径如何激活 trait、hook 和 open files，是 `thread/hooks.ts`、`thread/open-files.ts` 的新归属。

### observable

```txt
observable/
├── server/           # HTTP API 和 SSE
│   ├── server.ts
│   └── events.ts
├── debug/            # LLM input/output debug loop 文件
│   └── debug.ts
├── visibility/       # context visibility / thread tree 可见性
│   └── visibility.ts
└── test-runner/      # 测试运行、watch、coverage 摘要
    └── runner.ts
```

边界说明：

- `server/` 只负责 HTTP/SSE 表达层，业务逻辑应调用其他能力目录。
- `debug/` 是开发者观察 LLM 轮次的能力。
- `visibility/` 服务前端和调试视角，不参与真实调度。
- `test-runner/` 是系统自验证的观察入口。

### world

```txt
world/
├── world.ts          # World 根对象与 talk 入口
├── registry.ts       # 对象发现和目录索引
├── cron.ts           # 定时任务
├── hooks.ts          # build hooks
├── test-failure-bridge.ts
└── index.ts
```

边界说明：

- `world/` 保持实体目录，不能力化命名。
- `hooks.ts` 留在 `world/`，因为它是 World 级副作用编排。
- `test-failure-bridge.ts` 留在 `world/`，因为它把测试失败转成对象消息。

### object

```txt
object/
├── stone.ts          # Stone 模型和对象目录操作
├── self-kind.ts      # stone / flow_obj 自我类型识别
└── index.ts
```

边界说明：

- `object/` 是对象实体模型，不负责运行时思考。
- `Stone` 作为对象静态态的实现类保留文件名 `stone.ts`，但目录名升格为 `object/`。

### shared

```txt
shared/
├── types/            # 跨能力边界公共类型
│   ├── object.ts
│   ├── flow.ts
│   ├── trait.ts
│   ├── context.ts
│   ├── process.ts
│   ├── tool-result.ts
│   └── index.ts
├── utils/
│   └── serial-queue.ts
├── integrations/
│   └── feishu.ts
└── logging.ts
```

边界说明：

- `shared/types/` 是过渡性公共类型区。长期目标是把能力私有类型下沉到对应目录，只保留真正跨边界的 DTO 和领域模型。
- `shared/` 不接受业务文件。

## 当前文件迁移映射

| 当前路径 | 目标路径 |
| --- | --- |
| `cli.ts` | `app/cli.ts` |
| `thinkable/client.ts` | `thinkable/llm/client.ts` |
| `thinkable/config.ts` | `thinkable/llm/config.ts` |
| `thread/engine.ts` | `thinkable/engine/engine.ts` |
| `thread/engine-types.ts` | `thinkable/engine/types.ts` |
| `thread/scheduler.ts` | `thinkable/engine/scheduler.ts` |
| `thread/context-builder.ts` | `thinkable/context/builder.ts` |
| `thread/context-messages.ts` | `thinkable/context/messages.ts` |
| `thread/compact.ts` | `thinkable/context/compact.ts` |
| `thread/tree.ts` | `thinkable/thread-tree/tree.ts` |
| `thread/tools/**` | `executable/tools/**` |
| `thread/commands/**` | `executable/commands/**` |
| `executable/executor.ts` | `executable/sandbox/executor.ts` |
| `executable/effects.ts` | `executable/sandbox/effects.ts` |
| `thread/form.ts` | `executable/forms/form.ts` |
| `thread/xml.ts` | `executable/protocol/xml.ts` |
| `thread/virtual-path.ts` | `executable/protocol/virtual-path.ts` |
| `persistence/reader.ts` | 拆分为 `storable/session/reader.ts` 与 `storable/stone/reader.ts` |
| `persistence/writer.ts` | 拆分为 `storable/session/writer.ts` 与 `storable/stone/writer.ts` |
| `persistence/thread-adapter.ts` | `storable/thread/process-compat.ts` |
| `persistence/process-compat.ts` | `storable/thread/process-compat.ts` |
| `persistence/memory-*` | `storable/memory/*` |
| `persistence/edit-plans.ts` | `storable/edit-plans/edit-plans.ts` |
| `persistence/user-inbox.ts` | `storable/inbox/user-inbox.ts` |
| `persistence/frontmatter.ts` | `storable/frontmatter.ts` |
| `persistence/index.ts` | `storable/index.ts` |
| `thread/persistence.ts` | `storable/thread/persistence.ts` |
| `thread/flow-data.ts` | `storable/session/flow-data.ts` |
| `thread/hooks.ts` | `extendable/activation/hooks.ts` |
| `thread/open-files.ts` | `extendable/activation/open-files.ts` |
| `thread/types.ts` | `shared/types/thread.ts` |
| `thread/queue.ts` | `shared/utils/queue.ts` |
| `thread/self-kind.ts` | `object/self-kind.ts` |
| `thread/collaboration.ts` | `collaborable/talk/collaboration.ts` |
| `thread/inbox.ts` | `collaborable/inbox/inbox.ts` |
| `thread/relation.ts` | `collaborable/relation/relation.ts` |
| `thread/peers.ts` | `collaborable/relation/peers.ts` |
| `thread/super-thread.ts` | `collaborable/super/super-thread.ts` |
| `thread/super-scheduler.ts` | `collaborable/super/super-scheduler.ts` |
| `world/super.ts` | `collaborable/super/super.ts` |
| `kanban/**` | `collaborable/kanban/**` |
| `trait/**` | `extendable/trait/**` |
| `knowledge/**` | `extendable/knowledge/**` |
| `skill/**` | `extendable/skill/**` |
| `server/**` | `observable/server/**` |
| `thread/debug.ts` | `observable/debug/debug.ts` |
| `thread/visibility.ts` | `observable/visibility/visibility.ts` |
| `test/runner.ts` | `observable/test-runner/runner.ts` |
| `stone/**` | `object/**` |
| `types/**` | `shared/types/**` |
| `utils/**` | `shared/utils/**` |
| `logging.ts` | `shared/logging.ts` |
| `integrations/**` | `shared/integrations/**` |

## 关于 thread 目录

目标状态下不保留 `kernel/src/thread/` 作为顶层目录。

原因：

- `thread/` 是运行时数据结构，不是单一能力。
- 当前 `thread/` 已经混合 engine、context、commands、tools、persistence、collaboration、debug 等职责。
- 如果保留 `thread/`，它会继续变成大筐。

线程树相关代码会拆到：

- `thinkable/`：engine、scheduler、context、thread tree
- `storable/`：thread 文件读写和 flow data 投影
- `collaborable/`：inbox/relation/super
- `executable/`：commands/tools/forms
- `observable/`：debug/visibility

## 分阶段迁移计划

### Phase 1：建立目录和 re-export 桥接

创建目标目录，先移动低耦合文件，并在旧路径保留短期 re-export。

优先移动：

- `logging.ts`
- `utils/**`
- `integrations/**`
- `server/events.ts`
- `thread/xml.ts`
- `thread/virtual-path.ts`

验证：

- `bun run typecheck`
- 相关 targeted tests

### Phase 2：迁移 extendable 和 executable

迁移 trait/knowledge/skill 以及 tools/commands。

原因：

- 这些边界已比较清楚。
- 最近已经拆分过 commands/tools，迁移成本可控。

验证：

- `tests/trait.test.ts`
- `tests/loader-methods.test.ts`
- `tests/method-registry.test.ts`
- `tests/openable-commands.test.ts`
- `tests/refine-tool.test.ts`
- `bun run typecheck`

### Phase 3：迁移 storable 和 object

迁移 persistence、stone、自我类型识别、thread 持久化。

验证：

- `tests/persistence.test.ts`
- `tests/thread-persistence.test.ts`
- `tests/memory-*.test.ts`
- `tests/user-inbox*.test.ts`
- `bun run typecheck`

### Phase 4：拆空 thread

迁移 engine/context/scheduler/collaboration/debug/visibility。

这是风险最高的阶段，应拆成多个小 PR 或小提交。

验证：

- `tests/thread-engine.test.ts`
- `tests/thread-context-builder.test.ts`
- `tests/thread-scheduler.test.ts`
- `tests/thread-collaboration.test.ts`
- `tests/thread-visibility.test.ts`
- `bun test`

### Phase 5：更新文档和删除桥接

更新：

- `docs/meta.md`
- `docs/工程管理/组织/kernel.md`
- 涉及源码锚点的 gene 文档
- trait 相关文档里的路径示例

最后删除旧路径 re-export，保证源码和文档都只指向新目录。

## 迁移约束

1. 每次迁移只移动一个能力边界，避免同时改行为。
2. 除 import path 外，不做功能重构。
3. 每个阶段必须有 targeted tests + `bun run typecheck`。
4. `thread/` 删除前，必须先用搜索确认没有生产 import。
5. `shared/` 不能成为杂物间；新增文件需要说明为什么没有更具体的能力归属。
6. 文档路径更新放在最后阶段，避免迁移中途文档指向不存在的路径。

## 成功标准

- `kernel/src` 顶层目录能作为 OOC 能力地图阅读。
- `thread/` 不再是顶层大目录。
- `docs/meta.md` 的项目结构和真实源码一致。
- `bun run typecheck` 通过。
- `bun test` 全量通过。
- 搜索旧路径 `src/thread/commands`、`src/thread/tools`、`src/trait`、`src/knowledge` 等时，只剩迁移记录或历史文档。
