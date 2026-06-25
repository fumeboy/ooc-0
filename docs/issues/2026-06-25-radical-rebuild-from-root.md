---
title: OOC 从核心哲学根重新出发 —— 系统设计清单
status: draft
date: 2026-06-25
---

# OOC 从核心哲学根重新出发

## 缘起

近几日用户连续三轮 commit「clean thread impl code」删了 ~2300 行（含 `_shared/types/` 整目录 / `session-object-table.ts` / `window-manager.ts` / `observable-store.ts` / `init-windows.ts` 及 thread builtin 内 ~10 个文件），757 个 tsc 错误未收尾。

我作为 Supervisor 的第一次尝试是**抢救既有混乱**——加过渡字段、加 alias、恢复 deleted 文件。**这是熵增、错了**。

用户明确指示：**从 0 彻底重构**。本文档是这次彻底重构的**根设计**：从核心哲学逐步推导系统应该的形状，作为后续逐文件「保留 / 重写 / 删」决策的尺。

## A · 核心哲学根（不可动摇的根公理）

**OOC = Object Oriented Context**。

### A.1 一切是 object；class 是定义、object 是实例

任何系统组件都是某 class 的 instance。class 由五件套构成：
- `types.ts` — object data 的类型定义
- `readable/` — 怎么投影成 context window（LLM 视角）
- `executable/` — object 的 method（改 data / 副作用）
- `visible/` — UI（人类视角）+ visible/server for-ui API
- `persistable/` — 自定义序列化（缺省走系统默认）
- `index.ts` — 装配 `export const Class: OocClass`，统一收口

agent 类（= ooc object + LLM）在五件套上加：
- `thinkable/` — 怎么组织 thinkloop 一轮 think（仅 thread 类实际注册）

class 不支持继承；object 经 `ooc.class` 单跳继承 class。

### A.2 两个核心类型，分开干净

```ts
// 对象本身：持业务 data，活在 session 对象表
interface OocObjectInstance<Data = unknown> {
  id: string;
  class: string;
  data: Data;
}

// context window = 对它的引用 + 视角态
interface OocObjectRef<WinData = unknown> {
  id: string;          // = objectId(表 key)
  class: string;       // 缓存的注册 class
  title?: string;
  createdAt: number;
  data?: WinData;      // ★ 这就是 win 投影态（不是业务 data）
  closable?: boolean;
}
```

**关键**：`OocObjectRef.data` = 窗投影态（window method 返回的形态）。`OocObjectInstance.data` = 对象业务数据。两者按 `id` 关联，不在 ref 上挂业务 data。

### A.3 session 对象表

一个 session 内 `objectId → OocObjectInstance` 单一实例 map。`OocObjectRef` 经 `id` 解析对象 data。

owner = sessionId（**进程级 module 单例**，按 sessionId 索引），不挂线程树。worker 进出 session 时 set/clear。

### A.4 对象在 LLM 视角下 = context window

object 经 readable 投影成 `OocObjectRef`：
- 投影 class 按视角动态算
- window 展示内容由 readable render 算
- window method 调展示**程度**（详细/总结/压缩/viewport）—— 只动 `ref.data` 投影态、返回新 ref、不碰业务 data

### A.5 object method vs window method

- **object method**（executable）：改业务 data、可副作用
- **window method**（readable）：只动 `ref.data` 投影态、返回新 ref

同一 class 内不可重名（同 exec 入口分派）。

### A.6 生命周期

`construct` 诞生 → `active`（refcount 0→1）→ `unactive`（refcount 1→0）→ 无独立 destruct（删除是 `unactive` 返回 `{delete:true}` 自决）。

context window 即引用、close 即移除引用、归零触发 unactive。

### A.7 持久化三层

- **stones**：静（git 版本管理，长期身份/源码）
- **flows**：动（每 session 一份，git worktree 分支）
- **pools**：积（跨 session 沉淀的事实，不进 git）

### A.8 7 维度构成 agent

object base 4：readable / executable / visible / persistable
agent 增量 3：thinkable / collaborable / reflectable

非维度：observable（旁路观测）/ extendable（外接集成）

### A.9 thread

agent 一次智能运行的载体。**唯一**会话载体注册 class（thread / talk / reflect_request 都是它 readable 投影出的 window class）。

thread builtin 是当前最重的 builtin，**只是普通 class**——core 不该认它的具体函数名/字段位置，一切经 registry 泛型 seam（resolvePersistable / resolveThinkable / ...）。

## B · 从根推导：每个模块应该是什么

### B.1 `packages/@ooc/core/types/` — 纯契约层

只有契约接口、零运行时逻辑。文件：

```
types/
  executable.ts     — ExecutableContext / ObjectMethod / ObjectConstructor / LifecycleContext / ExecutableModule
  readable.ts       — ReadableContext / WindowMethod / WindowClassDecl / ReadableRender / ReadableModule / ReadableOutput / ReadableProjection
  persistable.ts    — PersistableContext / PersistableModule
                       PersistableContext = { baseDir, sessionId?, objectId, dir } —— 持久化执行上下文。
                       baseDir 来自 World，sessionId 是 session 上下文（缺省 = stone scope），objectId
                       是对象身份。**不再有 StoneObjectRef / FlowObjectRef / ThreadPersistenceRef 三个 Ref**，
                       一个 ctx 涵盖。
  visible-server.ts — VisibleServerModule
  thinkable.ts      — ThinkableModule（thread 类的 thinkloop 组织契约）
  intent.ts         — MethodCallSchema / ObjectMethodIntents / ObjectMethodResult
  knowledge.ts      — KnowledgeEntry / KnowledgeActivation
  self-proxy.ts     — SelfProxy / ReadonlySelfProxy / SelfMethods
  xml.ts            — XmlNode / xmlElement / xmlText
  permissions.ts    — RuntimePermissionDecision / decider
  context-window.ts — ContextWindow=OocObjectRef / ROOT_WINDOW_ID / objectDataOf / classOf / isSelfThreadWindow / threadWindowIdOf
  constants.ts      — SUPER_SESSION_ID / THREAD_CLASS_ID / KNOWLEDGE_CLASS_ID / FILE_CLASS_ID / PR_CLASS_ID / isXxxClass / isTalkLikeClass
  paths.ts          — CHILDREN_SUBDIR / nestedObjectPath / isBuiltinObjectId / toJson / StoneBranch
                       （纯 path helpers，不含 ref 类型）
  index.ts          — 汇总 re-export
```

**判据**：types 不引 runtime / builtin 任何东西，只引同层（含 ooc-class）。

### B.2 `packages/@ooc/core/runtime/` — 对象寄存

```
runtime/
  ooc-class.ts            — OocClass / OocObjectInstance / OocObjectRef / OocPackageMeta / World
  class-registry.ts       — ClassRegistry（class 注册 + resolveXxx 泛型 seam）+ builtinClassRegistry
  session-object-table.ts — sessionId → (objectId → OocObjectInstance) 进程级 map
                            getSessionObjectTable / iterateSessionObjectTable / set/get/clear / materializeWindow
  self-proxy.ts           — makeSelfProxy / makeReadonlySelfProxy / SelfMethods
  window-manager.ts       — WindowManager.fromThread(thread, registry).exec/close/wait/toData
                            （把 thread.contextWindows 当 mutable 集合操作的 facade）
  object-lifecycle.ts     — dispatchActive / dispatchUnactive / referencedObjectId（refcount → registry hook）
  hot-reload.ts           — stone fs.watch（不动）
  server-loader.ts        — 控制面通用 loader（不动）
  serial-queue.ts         — 单 driver 串行队列
  stone-registry.ts       — 多 stone 注册
  world-runtime.ts        — per-world subsystem 聚合
  index.ts
```

**判据**：runtime 提供泛型机制；不知道任何具体 class 业务。

### B.3 `packages/@ooc/core/persistable/` — 三层存储 IO

stones / flows / pools 物理 IO + path helpers。**零 builtin 业务知识**。

### B.4 `packages/@ooc/core/observable/` — 旁路观测

LlmObservation 记录、debug 文件落盘、log aggregator（去重限流）、ObservableStore（per-world 观测状态）。

### B.5 `packages/@ooc/core/thinkable/` — thinkable 共用模块

只剩两块：
- `llm/` — LLM client / providers / timeout
- `knowledge/` — parser + activator（求值引擎）

scheduler / recovery / thinkloop / context 全部归属 thread builtin（已在 thread/thinkable/ 下）。

### B.6 `packages/@ooc/core/app/` — 控制面

HTTP server（Elysia）+ runtime/worker。这层经 registry 泛型 seam 操作对象、不识别具体 class。

### B.7 `packages/@ooc/builtins/` — 具体类

```
agent/                        — agent class 本身
  index.ts                    — Class，agency = talk / plan
  executable/method.talk.ts
  executable/method.plan.ts
  readable/                   — 渲 data.self
  persistable/                — 读写 self.md
  children/
    thread/                   — 唯一会话载体
      index.ts                — Class
      types.ts                — ThreadContext / ThreadStatus / ProcessEvent / ThreadMessage / ThreadWin
      executable/             — say / reply / end / todo
      readable/               — 投影成 thread / talk / reflect_request 三种 window class
      persistable/            — thread.json save/load
      thinkable/              — thinkloop / scheduler / recovery / context 全在这里
        scheduler.ts
        thinkloop.ts
        recovery.ts
        context/              — buildInputItems / pipeline / renderers / budget / windows
        tools/                — exec / close / wait 三原语
        compress.ts           — context 压缩 policy
    pr/                       — PR 评审窗
    todo/                     — todo 列表项
    plan/                     — 计划步骤
    method_exec_form/         — 填表式渐进执行
    skill_index/              — 技能索引
filesystem/                   — 文件操作 tool object
  index.ts                    — Class，methods: grep / glob / open_file / write_file
  children/
    file/                     — 文件窗
    search/                   — 搜索结果窗
interpreter/                  — TS/JS 解释器 tool
  children/interpreter_process/
terminal/                     — Bash terminal tool
  children/terminal_process/
knowledge_base/               — 知识库 tool
  children/knowledge/
runtime/                      — 系统级接入（create_object 等）
example/                      — 教学样板
feishu_app/                   — 飞书集成
  children/feishu_chat/ feishu_doc/
user/                         — 被动 object（被 talk）
supervisor/                   — 顶层 agent 实例
```

### B.8 `packages/@ooc/tests/` — 测试

按维度组织。当前 757 红中相当一部分来自测试桩，**测试是 last 修**——核心源码先绿、测试再补。

## C · 关键转向 / 跟以前不同的点

1. **session 对象表挂 sessionId、不挂线程树根**：scheduler 经 `iterateSessionObjectTable(sessionId, cb)` 扫所有 thread；不再走 `_parentThreadRef`。
2. **`thread.persistence` 出 ThreadContext**：持久化定位（baseDir/sessionId/objectId/threadId）由 runtime 经 ctx 传入；thread.json 只存纯 data。
3. **`thread.class` 出 ThreadContext**：class 在 `OocObjectInstance{id,class,data}` wrapper 上；hydrate 后 wrap 时拼回。
4. **`inbox`/`outbox` 收敛进 `messages: ThreadMessage[]` 单一通道**（with `from: "caller" | "callee"` 标方向）。
5. **`_parentThreadRef` / `childThreads` / `_objectTable` 内存指针出 ThreadContext**：父子关系只看 contextWindows 中其他 thread ref。
6. **`inboxSnapshotAtWait` / `waitingOn` 退役**：waiting 唯一含义=scheduler 跳过；唤醒规则只看 messages/events 是否增长。
7. **`OocObjectRef.data` = win 投影态**：window method 返回它；旧的 `.win` 字段不存在，旧的 `parentWindowId`/`status`/`objectRef`/`referencedObjectId` 字段不存在，结构归属/状态/引用都在 ref 自身（id 即引用）。
8. **`StoneObjectRef` / `FlowObjectRef` / `ThreadPersistenceRef` 三个 Ref 全部消除**：它们是把文件路径包装成"ref"，反 OO（OO 哲学的根：ref 应指 object，不该描述路径段）。真正的对象引用是 `OocObjectRef`（`id` + `class` 足矣）；持久化场所通过 `PersistableContext { baseDir, sessionId?, objectId, dir }` 表达——baseDir 是 World 级配置、sessionId 是 session 上下文、objectId 是对象身份，三者打包进 ctx 而非 ref。thread 跟 file/search/process 一样有自己的 objectId（如 `t_abc`），不再需要"二级寻址"。


## D · 重构路径（阶段 3 执行顺序）

从根到叶：

1. **types/** 全部齐了（先把契约凿干净）
2. **runtime/** —— session-object-table / class-registry / window-manager / object-lifecycle / self-proxy / ooc-class
3. **persistable/** —— stones/flows/pools 物理 IO（无 thread 知识）
4. **observable/** —— ObservableStore / debug-file / log-aggregator
5. **thinkable/knowledge/** 与 **thinkable/llm/** —— core 内仅剩两块
6. **builtins/agent/children/thread/** —— 最重的 builtin，全部重写
7. **其他 builtins**（filesystem / terminal / interpreter / knowledge_base / agent 本身 / pr / todo / plan / runtime / feishu_app / example / user / supervisor）
8. **app/server/** —— HTTP 控制面（经 registry 泛型 seam）
9. **tests/** —— 测试桩补齐

## E · 风险与节制

1. **不要试图同时改太多文件**：从根到叶一波一波过。每波过完跑 tsc，确认绿了再下一波。
2. **每个文件落地前问**：「按新模型，这个文件应该是什么？」如果回答是「啥都不该是、应该删」，就删。
3. **测试不阻塞核心源码 review**：先让核心绿、再补测试。

> 落地从阶段 3 开始；每写完一个文件 update 任务列表。
