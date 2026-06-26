---
title: 6 项设计精修：open tool 原语 + readable 控可见性 + core 承担 ref/GC/XML 渲染 + thinkable 契约扩展
status: decided
date: 2026-06-26
follows: 2026-06-26-reflectable-redesign-as-flow-dispatcher.md
---

# 6 项设计精修

## 背景 / 动机

四个 2026-06-26 issue 合并 verified 后，用户基于完整体系给出 6 项精修——这些不是分散调整，是一组围绕**「core 应该承担什么、builtin 私域是什么」**与**「method 可见性归 readable surface 而非 protocol 字段」**两条主线的体系收口。

合并后 main 现状暴露的关键问题（survey 报告）：

- **`method.public` 是死字段**——协议层声明、0 处读端，纯自文档。
- **for_reflectable 协议层不存在**（issue A verified 已确认），但 method 可见性的真问题没解决——reflect_request 投影窗用 readable.window 的 `object_methods` 白名单 surface 4 个 reflect method，这条路径**已是事实可见性机制**，但还有平行的 protocol-level `public?` 字段共存，是设计冗余。
- **tool 原语和 dispatch 全部寄居 thread builtin**——core 只出了 LlmTool 通用类型；exec/close/wait schema、dispatch.ts、ThreadRuntime 的三原语实现都在 thread/thinkable/tools/。RuntimeHandle 接口不含 exec/close/wait。
- **refcount + 生命周期派发寄居 thread builtin**——`refcountInSession` 在 thread-runtime.ts，按 thread.contextWindows 扫描；core 不知 refcount 是什么。
- **context→XML 渲染寄居 thread builtin**——core 出 xml AST 工具但不出"如何把投影组装成 LLM context"逻辑。但 readable 投影是 core 维度核心契约，"如何渲"应是 core 责任。
- **ThinkableModule 当前两字段（think? / onSchedulerTick?）**——core 不知道某个 thread 还活着没、持着哪些 ref，所以核心机制都被迫"下放"thread builtin 私域。

用户 6 项精修构成一条收口路径：
1. **tool 原语补 open**：guide 触发独立原语（不再依赖 exec 双重职责）。
2. **删 public/for_reflectable，readable.window 是唯一可见性 source；agent 注册 super window**（替代 reflect_request 这个 issue D 用的名字）。
3. **context→XML 移 core**：readable 是 core 设计，core 出渲染器。
4. **refcount + 定时 GC 移 core**：runtime 边界精修。
5. **ThinkableModule 加 active()/refs()**：让 core 经 registry 查 thread 状态，配合 (4) 做 GC。
6. **thread 的 talk window 改 default**：按"展示给别人时与 talk 一致"语义对齐 issue B 的多视角约定。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## OOC Class/Object Model`（A 区）——核心 4「object 投影成 context window」；ref 持有面与 GC。
- `## executable`（B 区）——核心 1-2 tool 原语恒 3 个（exec/close/wait）；method/guide 二分（issue A verified）。
- `## readable`（B 区）——多视角投影；default 约定（issue B verified）。
- `## thinkable`（B 区）——ThinkableModule 模块槽；scheduler/thinkloop 是否经 registry 派发。
- `## reflectable`（B 区）——8 cores（issue D verified）；reflect_request 投影 window class。
- `## runtime`（E 区）——session 对象表 + ObjectRegistry。
- `## thread`（E 区）——thread builtin 五维寄居。
- `## executable × readable`（D 区）——window decl 装配契约。

涉及文件（合并后 main）：
- `packages/@ooc/core/types/executable.ts:101,128`（`public?` 字段）
- `packages/@ooc/builtins/agent/children/thread/thinkable/tools/schema.ts:8-50`（tool schema）
- `packages/@ooc/builtins/agent/children/thread/thinkable/tools/dispatch.ts:19-50`（dispatch）
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:88,201,217,334,346-388`（exec/close/wait/refcount/lifecycle）
- `packages/@ooc/builtins/agent/children/thread/thinkable/context.ts:30-185`（context 构造与 window→XML）
- `packages/@ooc/core/types/thinkable.ts:21-42`（ThinkableModule 接口）
- `packages/@ooc/core/runtime/object-registry.ts:338-407`（ObjectInsRegistry / sessionRegistries）
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts:108-133`（window decl）
- `packages/@ooc/builtins/agent/readable/index.ts:34-55`（agent 单视角 default decl）

## 改动提案

### 改动 1：新增 `open` tool 原语 + ObjectGuideMethod 删 schema

**协议层（core）**：
- 在 core 新增 tool 原语契约——把 tool 原语 schema 从 thread builtin 抽出来归 core（issue 改动 3 的前奏；tool 原语本就属 executable 维度核心）。
- 原语从 3 个扩为 4 个：**`exec` / `wait` / `close` / `open`**。
- `open` 签名：
  ```
  open(windowId: string, methodName: string, want: string)
  → 在 windowId 上找一个 guide method 名为 methodName，runtime 跑 guide.route（无 args 只有 want）→
    自动 instantiate method_exec_form，把 want 写入 form 的 data.want 字段、回显到 form readable 内；
    返回 { message: "已开启 <method> 表单（want: "<want>"）；继续 refine 补参或 submit 提交", refs: [formRef] }
  ```
- 与 exec 的关键区别：
  - exec 调 method 或 guide 都要传**全部参数**（args 已知场景）。
  - open 专配 guide，**不传 args**，只传 want（意图描述，用于驱动 route + 回显 context 引导 LLM 后续补参）。
- ObjectGuideMethod **删 schema 字段**——参数全靠 want（route 算 tip）+ refine 多轮补参；不再需要静态 schema 描述总参数空间（schema 在 method 上仍存在，单步直执行的 method 才需要 schema）。

**实施层（thread builtin）**：
- thread/thinkable/tools/schema.ts：新增 `OPEN_TOOL`；PRIMITIVE_TOOLS 数组从 3→4。
- thread/thinkable/tools/dispatch.ts：dispatch 加 `"open"` 分支 → runtime.open(windowId, methodName, want)。
- thread-runtime.ts：新增 `open(windowId, methodName, want)` 方法；内部解析 guide → runtime.runRoute → instantiate method_exec_form with data.want。
- method_exec_form types：Data 加 `want: string` 字段；readable 投影 context 段加入 `want` 子节点。
- 现 ThreadRuntime.exec 命中 guide 时 fallback 开 form 的路径（issue A 落地）**保留**——但调用方语义上**鼓励**用 open 表达"我有意图但还没填具体参数"。exec 仍可调 guide（参数齐时直 quickSubmit）。

**rationale**：tool 原语恒 3 个（exec/close/wait）的 reflectable self.md 表述需更新；这是发现 method/guide 二分后 tool 层级的对称——guide 应该有自己的进入原语（open）就像 method 有 exec、window 有 close。

### 改动 2：删 `method.public` / `for_reflectable`；readable.window 是唯一可见性 source；agent 注册 super window 替代 reflect_request

**`public?` 字段**：
- 协议层（`core/types/executable.ts:101` ObjectMethod + `:128` ObjectGuideMethod）**删除** `public?: boolean`。
- 各 builtin method 的 `public: true` 标记一并删（共 7 处：agent.talk / thread.say|reply / 4 reflect methods）。
- 这是个**死字段清理**——survey 报告确认无读端。

**`for_reflectable`**：协议层本就不存在；本 issue 收口语义——明确"哪些 method 在哪些视角可见"由 readable.window 的 `object_methods` / `guide_methods` 白名单决定。

**agent 注册 super window**：
- 重命名 issue D 的 `reflect_request` 投影 class 为 `super`——更简洁、与 super flow 概念一致（"super flow 下展示给 agent 自己的视角"="super window"）。
- `_builtin/agent/thread` 的 window 数组三档变：`default` + `talk` + **`super`**（替代 `reflect_request`）。
- computeProjectionClass：thread.sessionId === SUPER_SESSION_ID → `"super"`；否则按改动 6 路由。

**rationale**：「method 是否对 LLM 可见」一直是 readable 维度的事——它决定"被读"形态。protocol 层 boolean 字段是越界（executable reviewer 之前 issue A 的判断"政治标签不进机制层"，本次彻底执行）。`super` 比 `reflect_request` 更符合现有概念（issue D 已退「分发器」术语，统一为「super flow」+「reflect method」，再把窗叫 super 进一步收敛）。

### 改动 3：ContextWindow → XML 渲染移 core

**协议层（core）新增**：
- `packages/@ooc/core/readable/render-context.ts`（新文件）：
  ```ts
  export function renderContextWindow(
    ref: OocObjectRef,
    registry: ObjectInsRegistry,
    classRegistry: ClassRegistry,
  ): XmlNode | null;

  export function renderContextWindows(
    refs: OocObjectRef[],
    registry: ObjectInsRegistry,
    classRegistry: ClassRegistry,
  ): XmlNode[];
  ```
- 实现逻辑 = 当前 thread/thinkable/context.ts:30-53 `renderWindow` 的搬迁——经 `resolveReadableRender(ref.class)` → 调用得到 projection → 包成 `<window>` XmlNode。
- core 持核心算法；thread builtin 改 import 调用，不再自实现。

**rationale**：「ref → XML」核心是「ref 解析 class → 调 readable 投影」，readable 是 core 维度。把这步移 core 后：
- 其它（未来的）会话载体（不止 thread）可复用同一渲染器。
- core 控制 XML 结构稳定（窗 id/class/title 属性命名等）。
- thread builtin 只负责"如何把 windows + messages + knowledge 拼成最终 LLM input"——这是 thread 的 thinkloop 编排职责，仍归 thread。

### 改动 4：refcount + 定时 GC 移 core

**协议层（core）新增**：
- `packages/@ooc/core/runtime/refcount.ts`（新文件）：
  ```ts
  export function computeRefcount(
    sessionId: string,
    objectId: string,
    classRegistry: ClassRegistry,
  ): number;
  ```
  实现：遍历 sessionId 的 ObjectInsRegistry → 对每个 instance 调 `resolveThinkable(inst.class)?.refs?.(inst.data)` 拿 OocObjectRef[]，统计引用此 objectId 的次数。
- `packages/@ooc/core/runtime/gc.ts`（新文件）：
  ```ts
  export function startSessionGc(sessionId: string, opts?: { intervalMs?: number }): () => void;
  ```
  默认 intervalMs = 600_000（10 min）。定时跑：遍历 sessionId 的对象表 → 对每个非活 thread 实例（`resolveThinkable?.active?.(inst.data) === false`，配合改动 5）调 dispatchUnactive 行 link；引用 0 的 object 触发 unactive policy（既有逻辑）。

**实施层（thread builtin）变动**：
- 删 `thread-runtime.ts:334-344` 的 `refcountInSession`——改 import core helper。
- 删 dispatchActive/dispatchUnactive 内自扫 contextWindows 逻辑——改通过 core helper。
- 旧的「即时 refcount→0 触发 unactive」语义**保留**——core helper 不取代 close 时的同步触发，只新增「定时扫一遍兜底」机制（针对 thread done/failed 后 refs 应失效但未即时通知的场景）。

**rationale**：refcount 计算依赖"扫所有 holding 对象的 refs"——但**只有 thread 形状对象持 refs**（survey 报告确认）。这条结论让 refcount 可以一般化：core 不知道 thread 是什么，只知道"问每个 class.thinkable.refs?(data) 拿 OocObjectRef[]"——配合改动 5 的 ThinkableModule.refs() 实现。

**定时 GC** 的真正用例：thread 进 done/failed 终态后，其 contextWindows 上的 ref 在引用计数上仍占着——按目前 close/unactive 即时触发模型，**done 终态的 thread 不再调 close**，所以它们持的 ref 永不释放。定时 GC 扫一遍 inactive thread 即可回收。

### 改动 5：ThinkableModule 加 active() / refs()

**协议层（core）`types/thinkable.ts`**：
```ts
export interface ThinkableModule<Data = unknown> {
  think?(deps: ThinkableDeps, args: ThinkArgs): Promise<ThinkResult>;
  onSchedulerTick?(deps: ThinkableDeps, args: TickArgs): Promise<TickResult>;

  /** 当前 instance 是否还在活跃运行——running / waiting / paused 算活；done / failed 算非活。core 据此做 GC（改动 4）。 */
  active?(data: Data): boolean;

  /** 当前 instance 持有的对 OocObjectRef 的引用——core 据此计算 refcount（改动 4）。 */
  refs?(data: Data): OocObjectRef[];
}
```

**实施层（thread builtin）**：
- thread/thinkable/index.ts default export 加 `active` + `refs` 实现：
  ```ts
  active: (data: ThreadContext) => !["done", "failed"].includes(data.status),
  refs: (data: ThreadContext) => data.contextWindows,
  ```
- 配合改动 4 的 core refcount/GC 算法。
- 其它 builtin 的 thinkable 模块（如有）按需实现——但当前仅 thread 持 refs，其它返空数组或省略即可。

**rationale**：`active()` 让 core 知道"这条 thread 已结束、它的 refs 可以释放"；`refs()` 让 core 不必知道"哪个字段持 ref"。两条共同实现「core 经 registry 通用做 refcount/GC」——把 issue D 与 survey 报告里"refcount/lifecycle 寄居 thread builtin"的设计漂移彻底收口。

### 改动 6：thread 的 talk window 重命名 default

**前置事实（survey 报告）**：现 thread/readable/index.ts:108-133 三 decl：
- decl[0] `thread`（self 视角，过程 event + 与 creator 对话）
- decl[1] `talk`（与 peer/sub 会话）
- decl[2] `reflect_request`（super flow 反思视）

用户洞察：**talk window 是"展示给别人时与 thread 自视角一致"的视角**——caller 看自己 thread 是过程视图，对端看你的 thread 也是过程视图（你们之间的会话片段），两者展示形态本质一致；issue B 已确立"展示给别人时的默认状态 = default"约定，所以 talk 视角实质就是 default 视角。

**改动**：
- `_builtin/agent/thread` window 数组：从 `[thread, talk, reflect_request]` → **`[default, super]`** 两档。
  - **`default`**（替代 thread 自视角 + talk 对端视角合并）：object_methods = `["say", "reply", "end", "todo"]`（合并两 decl 现有 + 修正 survey 暴露的 `end`/`todo` 引用漂移）；window_methods = `[setTranscript, compress, resize]`。
  - **`super`**（issue D 的 reflect_request 改名，改动 2）：object_methods = 4 reflect methods + say + reply；window_methods 同。
- computeProjectionClass：sessionId === SUPER_SESSION_ID → `"super"`；其余一律 `"default"`（不再区分 self/talk 视角——它们本来就同视图）。

**rationale**：
- 落实改动 2 的「super window 替代 reflect_request」。
- 兑现 issue B 的「单视角默认 default」原则——thread 在用户视角下其实是"过程视图 + 反思视图"二档，反思视图具名 super、过程视图就是 default。**多视角具名豁免**规则在这里不再需要——thread 实际是单视角默认 + 一个 super 视角，正好符合 single-default 约定的精神（每个非默认视角都有具名）。
- 同时收口 survey 报告暴露的 cohesion 漂移（thread decl 引用 end/todo 但 method.say.ts 仅注册 say/reply）——合并后修齐。

## 受影响设计元素

对照 `knowledge/index.md`：

A 区
- `## OOC Class/Object Model` —— 核心 4 投影、核心 10 生命周期；ref 持有面与 GC 描述更新。

B 区
- `## executable` —— 核心 2 tool 原语 4 个（exec/close/wait/**open**）；method.public 删；ObjectGuideMethod 删 schema。
- `## readable` —— 唯一可见性 source；window decl 与 method/guide surface 关系。
- `## thinkable` —— ThinkableModule 加 active/refs；context→XML 渲染移 core 后 thinkable 只编排 thinkloop 不直接构 context。
- `## reflectable` —— reflect_request 改名 super；核心 3 / 8 文字调整。

D 区
- `## executable × thinkable` —— tool 原语层级关系（exec/open/close/wait 都属 executable，thinkloop 调度属 thinkable）。
- `## executable × readable` —— method/guide surface 全由 readable 控制。
- `## readable × thinkable` —— context→XML 接口落 core。

E 区
- `## thread` —— window decl 改名 default + super；refcount/GC/context→XML 三件从 thread 私域迁出。
- `## pr / reflect_request` —— **退役 reflect_request 名**，改 super window。
- `## runtime` —— refcount.ts / gc.ts 新增。
- `## method_exec_form` —— data 加 want 字段。

C 区
- `## builtins` —— `_builtin/agent/thread` 三投影改两投影。

未受影响：persistable / collaborable / visible / observable / app 核心契约。

## 风险与权衡

1. **删 `public` 字段是破坏性 API 改动**——但全代码库 0 读端、各 builtin method 7 处标记可直接删。
2. **改动 4 的定时 GC 与 close 即时触发并存**：close 仍即时触发 unactive；GC 是兜底（10min 一次）。可能场景：thread done 后未及 close 持 ref → GC 触发释放；正常 close 路径不变。
3. **改动 5 的 active/refs 现仅 thread 实现**——其它 class 不实现这两个方法时 core 怎么算？默认 `active=true, refs=[]`——保守路径，不影响现有行为。
4. **改动 6 thread 改成两投影**：当前 caller 与 callee 在 thread 上看到的 contextWindows 完全相同（thread 内的所有窗都被双方看见）——确实可以合并为 default。但**对话消息归属**（say from caller 的进 talk 端 transcript / from callee 的进 thread 端 transcript）的渲染要在 default decl 内统一处理——这点要 readable render 内显式分支判断 caller-side / callee-side、生成对应内容（不靠投影 class 名区分）。
5. **改动 1 open 与 exec 并存**：exec 命中 guide 仍可开 form（issue A 落地路径保留）；open 是更显式的 guide 入口。两条路径并存语义清晰：exec=参数已齐直执行 / open=参数未齐先填表。
6. **改动 3 把渲染逻辑从 thread builtin 抽出**——thread builtin 后续 thinkloop 仍需调 core renderer 来构 context；context.ts 改造工作量中等。
7. **改动 6 改了 reflect_request 名为 super**——issue D 的所有引用要同步：method.reflect.ts 内是否引用 "reflect_request" 字面值？readable/index.ts decl class 字段；agent knowledge md；index.md `## pr / reflect_request` 节改名；reflectable.self.md。

## 待裁决点

1. **改动 1 open 是否完全独立 tool 原语，还是 exec 的特殊形式**？我倾向**独立原语**——LLM 协议层把 open / exec 区分开（不同 tool name），dispatch 直接看 tool name 分流；signature 不同（open 无 args 只 want；exec 有 args）；语义清晰。
2. **改动 1 want 字段类型**：string（用户提案）。是否允许结构化（如 `{ rationale, hints? }`）？建议**先 string**，YAGNI。
3. **改动 2 super window 内 method 集合**：reflect 4 method + say + reply 是否一并 + plan / todo / end？**裁决**：4 reflect method + say + reply（与 issue D 一致），plan/todo/end 不挂——它们是 default 视角（business session）的 thread method。super 视角只暴露反思相关 method。
4. **改动 4 GC 间隔 10min 是否可配**：通过 worldConfig.gcIntervalMs 配置。
5. **改动 5 active/refs 是否 optional**：是——其它 class 不实现则 core 用 `active=true, refs=[]` 默认。
6. **改动 6 合并 thread/talk decl 后，session 视图的 message 归属如何在单 decl 内表达**：default decl 的 readable render 内部按 caller/callee 视角分支渲——这是 readable render 内部细节，不在协议层。
7. **改动 3 core 渲染器是否需要支持 fallback 链**（resolveReadableRender → readable.md 名片 → placeholder）：是——把 thread builtin 当前的 3 步回退逻辑搬到 core 同步实施。

## review 记录

按 design-workflow 步骤 2，5 个 reviewer fan-out（executable / readable / thinkable+runtime / reflectable+thread / 完整性批评官）。结论：**方向整体正确，6 项是体系收口；reviewer 共识在 12 处具体裁决点**——详见裁决段。

### review by executable

- tool 原语从 3→4 **会破坏 self.md 核心 2 数字契约**，必须收口。倾向**「4 原语」**：talk/do/exec/open（注：executable reviewer 此处沿用旧 4 原语命名记忆；本 issue 实际原语是 `exec / close / wait / open`，编号 4 数字一致）。
- open 参数应是 `objectId`（与既有 do 对齐），不是 windowId；want 是 string 自由文本；返回 = 在 thread 挂 form context_window。
- exec 命中 guide 的 fallback **保留为兜底**；guide method description 显式 nudge 用 open。
- ObjectGuideMethod 删 schema 后参数描述靠 description + want + route.tip——不再做静态参数文档。
- method.public 是死字段（0 读端），可彻底删；但 grep 要扩到 builtin/前端/storybook。
- for_reflectable 已不在协议层；本 issue 形式化 readable.window 是唯一可见性 source。
- 漏点：visible/server 的 method 调用面是否经同一可见性闸；form 上线后的 tool 暴露规则；open 错误契约；storybook executable story 扩展。

### review by readable

- readable.window 唯一可见性 source 方向对——self.md 核心 5 需明示「method 不再持 `public`」。
- **改动 3 关键拆分**：「ref→payload（readable 维度）」与「payload→`<window>` XML 壳（thinkable 维度）」**应拆开**——否则 `<window>` 形状会反向绑架 visible 前端。API：
  ```
  core/readable/render-context.ts:
    renderReadable(ref, viewName, ctx) → { payload, source }
  thread/thinkable/context.ts:
    payload + ref.id/class → <window>...</window>
  ```
- 改动 6 thread 两投影合并 default **不破坏 render 纯净性**——前提是 thread 数据模型 collapse 到**单 transcript + author 字段**（render 纯投影、写入侧 author 字段由 say method 决定）。
- end/todo 漂移：thread decl 引用但 method.say.ts 未注册——本 issue 顺手修齐；end/todo 是 thread 业务能力，应补实现而非删引用。
- fallback 链 (render fn → readable.md 名片 → placeholder) 移 core，加 `source: 'render-fn' | 'static-card' | 'placeholder'` 字段供 observable / visible 消费。
- 漏点：**visible 前端 fallback 也复用同入口**；readable.md 名片路径归位；storybook readable story 拆分。

### review by thinkable / runtime

- 改动 4+5 方向对，是 thinkable / runtime 边界回正——前提：`ThinkableModule.refs()` 是**纯读声明**，不承担调度/GC 决策（决策留 core）。
- `active`/`refs` 字段当前粒度合适——active=boolean 够用（不要污染成 ThreadStatus）；refs 不拆 weak/strong（YAGNI）。
- close 与 GC 双轨：**倾向 GC 单一权威**（close 只改 refcount，入队等 GC 处理），避免 race；但若坚持 close 即时 unactive，需互斥锁 + GC 跳过 already-unactive 的 instance。
- done thread 处理：**递归 decRef**（不是简单删字段）——core 经 refs() 拿到 done thread 所有引用，对每个 target 调 decRef，归 0 触发对方 unactive。
- scheduler→thinkloop 派发未经 resolveThinkable seam（既有存量）**不夹带本 issue**，留下一轮。
- context 构造切分：**投影（windows→XML 段）归 core；拼装（messages/knowledge/system instructions 顺序）留 thinkable**。
- 漏点：observable 应消费 refcount 信号；persistable 不应用 refs() 决定 inline 序列化（两个 source of truth 分离）；reflectable 自写程序需要 knowledge 提示「实现 refs() 要枚举所有持 OocObjectRef 字段」。

### review by reflectable / thread

- reflect_request → super 改名**强制一次到位**——self.md 8 cores 中 4 条触动（core 3/4/6/8）；index.md `## pr / reflect_request` 节标题也改名为 `## pr / super`。
- super 多重指涉**是聚合不是混乱**——session/target/flow/window 四处都指向「reflectable 自我迭代场所」；self.md 加「super 四重一致指涉」段防止混淆。
- 改动 6 三投影→二投影**不破坏 peer 语义**——peer 维度的窗仍是 instance 层（每个 peer 一个 thread instance），decl 层合并 default 只是砍掉冗余 caller-vs-callee 投影差异。
- end/todo 应**补实现**（是 thread 固有业务能力），不删 readable 引用。
- super decl method 集合 = 4 reflect + say + reply（与 issue D reflect_request 一致），不挂 end/todo/plan。
- method.reflect.ts 内是否硬编码 `"reflect_request"` 字面——落地必查。

### review by completeness critic — Issue E

- 漏列元素：**`## visible`**（人机分流可见性同闸）/ **`## observable`**（refcount/source 可观测）/ **`## storybook`**（executable + reflectable + thread story 改造）。
- 行号全部准确（survey 数据可信）。
- 文字漂移：改动 6 风险段 4「caller 与 callee 看到的 contextWindows 完全相同」措辞应改为「contextWindows 相同、messages 按方向分歧渲不同标签」。
- 「super window」/「投影 class super」混用——统一为「投影 class `super`，该投影即 super 窗」。
- **顺手清 index.md 残留「分发器」字眼**——`## reflectable` L100 + `## pr / reflect_request` L191——是 issue D verified 漏清的漂移，本 issue 既然触 reflectable 顺手收口。
- 越界（建议下沉 self.md）：`startSessionGc` 默认 600_000ms / 函数签名细节归实施。

## 裁决

按 reviewer 共识落 12 项关键裁决，**采纳全部 6 项改动**。

### 裁决要点

1. **tool 原语从 3→4 个**：exec / close / wait / **open**。
   - **open(objectId, methodName, want: string)**——开启 guide 的显式入口；签名：
     - `objectId`: 目标 object（与 do/exec 一致用 objectId 字面）
     - `methodName`: guide name
     - `want: string`: 自由文本意图描述
   - **返回**: `{ message: "已开启 <method> 表单（want: \"<want>\"）；继续 refine 补参或 submit 提交", refs: [formRef] }`——与 exec 命中 guide 时开 form 同形态。
   - runtime 内部：解析 guide → 跑 guide.route(ctx, self, {})（args 为空）→ 拿 ObjectMethodIntents → 不管 quickSubmit，**一律开 form**（want 写入 form.data.want；不像 exec 路径有 quickSubmit fast-path）。
   - exec 命中 guide 时 fallback 开 form 路径**保留为兜底**；guide method description 显式 nudge 用 open。
   - executable self.md 核心 2「tool 原语恒为 4 个」（原 3 改 4）；schema.ts PRIMITIVE_TOOLS 数组扩为 4 个 LlmTool。
   - want 写入 form.data 后 form readable render `context` 段加入 `want` 子节点回显。

2. **ObjectGuideMethod 删 schema 字段**：guide 协议从 8 字段→7 字段（删 schema?）。guide 对 LLM 描述参数空间靠 description + route.tip + want；不做静态参数文档。method 协议保留 schema?（单步直执行场景仍需要）。

3. **删 method.public**：
   - `ObjectMethod.public?` + `ObjectGuideMethod.public?` 协议层删字段。
   - 各 builtin 标 `public: true` 处全删（共 7 处：agent.talk / thread.say|reply / 4 reflect methods）。
   - **grep 范围扩大**：`grep -rn "\.public\|public:" packages/@ooc .ooc-world-meta` 确认无残留消费者；前端 / storybook / observable / persistable 全树扫一遍。
   - 配合 `check:deprecated-symbols` 守门。

4. **method 可见性唯一 source = readable.window**：
   - executable self.md 显式声明「method 不持有独立可见性字段；某 method 是否对某视角可见，**完全**由该视角 window decl 的 `object_methods` / `guide_methods` 决定」。
   - 这是 form 化 issue A/D 已有约定（reflect 系 method 经 reflect_request decl 白名单 surface）。

5. **agent 注册 super window 替代 reflect_request**：
   - `_builtin/agent/thread` 的 window decl class 字段：reflect_request → **super**。
   - method.reflect.ts 内 `"reflect_request"` 字面值全改 `"super"`。
   - 整树 grep `reflect_request` 替换为 super（除 issue 历史文档 + 迁移映射 段）。
   - reflectable self.md 8 cores 中 4 条（core 3/4/6/8）改 `reflect_request → super`；额外加「super 四重一致指涉」说明段。
   - index.md `## pr / reflect_request` 节标题改为 **`## pr / super`**（元素 id 改名）；相关交叉引用同步。
   - **顺手清** index.md `## reflectable` L100 + `## pr / reflect_request` L191 残留「分发器」字眼（issue D 已退役 term）。

6. **改动 3 拆开两层归属（readable / thinkable）**：
   - core 新增 `packages/@ooc/core/readable/render-context.ts`：
     ```ts
     export type ReadableSource = "render-fn" | "static-card" | "placeholder";
     export interface ReadableResult {
       payload: string | XmlNode[];
       source: ReadableSource;
       warning?: string;  // placeholder 时携带原因（如 "no readable.md, no render fn"）
     }
     export function renderReadable(
       ref: OocObjectRef,
       registry: ObjectInsRegistry,
       classRegistry: ClassRegistry,
     ): ReadableResult;
     ```
     fallback 三档：resolveReadableRender → readable.md 名片 → placeholder。
   - thread builtin context.ts 改为：调 `renderReadable(ref, ...)` → 拿 payload → 自己包 `<window id class title>` XmlNode（XML 包装留 thinkable）。
   - readable self.md 核心 7 加「core 提供 `renderReadable` 入口；thinkable / visible 等消费者一律走此入口」+ ReadableResult.source 字段说明。

7. **改动 4 + 5 refcount/GC 移 core**：
   - `packages/@ooc/core/runtime/refcount.ts`（新）：`computeRefcount(sessionId, objectId, classRegistry): number`——遍历 sessionId 的 ObjectInsRegistry → 对每个 inst 调 `resolveThinkable(inst.class)?.refs?.(inst.data) ?? []`，数引用 objectId 的次数。
   - `packages/@ooc/core/runtime/gc.ts`（新）：`startSessionGc(sessionId, opts?): () => void`——定时（默认 600_000ms，可配 `worldConfig.gcIntervalMs`）：
     - Pass 1：扫所有 inst → done/failed thread（`resolveThinkable?.active?.(inst.data) === false`）→ 对其 refs() 中每个 target 调 decRef → 归 0 触发 dispatchUnactive。
     - Pass 2：扫全 inst → refcount==0 且 active==false（或 active 未声明=true 但 refcount==0 时间窗）→ dispatchUnactive。
   - close 路径**保留即时触发**（不改为入队），但 dispatchUnactive 实现要幂等（GC 扫到 already-unactive 静默跳过）—— reviewer 之间分歧裁决为「close 即时 + GC 兜底 + unactive 幂等」。
   - thread-runtime.ts 删 `refcountInSession` 私域实现，改 import core helper；dispatchActive/Unactive 内自扫 contextWindows 改 import core 接口。
   - **scheduler→thinkloop 派发未经 resolveThinkable seam 不夹带本 issue**——留下一轮独立 issue「thinkable seam 治理」。

8. **ThinkableModule 加 active / refs 字段**：
   ```ts
   export interface ThinkableModule<Data = unknown> {
     think?(...);
     onSchedulerTick?(...);
     active?(data: Data): boolean;       // default true（不实现 = 永远 active）
     refs?(data: Data): OocObjectRef[];  // default []（不实现 = 不持 ref）
   }
   ```
   - thread builtin thinkable/index.ts 实现 `active: (d) => !["done","failed"].includes(d.status)`、`refs: (d) => d.contextWindows`。
   - 文字提示：`refs()` 是「runtime 引用图声明」，**不**用于 persistable 序列化决策（persistable 自己的 schema 决定）。
   - reflectable knowledge 加一条「写 thinkable 模块时实现 refs() 必枚举所有持 OocObjectRef 的字段」。

9. **改动 6 thread 两投影 default + super**：
   - window decl 数组：`[{class:"default",...}, {class:"super",...}]`——thread/talk 两投影合并 default；reflect_request 改名 super。
   - default decl: object_methods = `["say", "reply", "end", "todo"]`；window_methods = `[setTranscript, compress, resize]`。
   - super decl: object_methods = `["scan_changes", "create_pr_for_versioned", "sediment_unversioned", "create_pr_for_class_edits", "say", "reply"]`；window_methods 同 default。
   - computeProjectionClass：`if (sessionId === SUPER_SESSION_ID) return "super"; else return "default";`——单一三元表达式（不再区分 caller/callee 投影 class）。
   - readable render：**单 transcript 模型**——thread data 内仅一份 transcript（list of `{author: "caller" | "callee", ...message}`），render 时不分支投影 class、按 author 字段渲不同 prefix（`[self:] / [callee:]`）。
   - 写入侧（say method）：根据 caller==self 决定 entry.author 字段。
   - **end/todo 漂移修齐**：实测 thread executable 实现状态——补 method.end.ts / method.todo.ts 或确认是否本来在别处；本 issue 落地必须修齐 cohesion（注册期 fail-loud）。

10. **受影响设计元素补**：`## visible`（人机分流可见性同闸，删 for_ui_access）/`## observable`（refcount + ReadableResult.source 信号可观测）。`## storybook` 不是 index.md 一级元素、由各维度 tests.md 承载，故由各维度 self.md 内 tests.md 引用更新。

11. **术语统一**：投影 class 名 = `"super"`（字符串值）；用「**super 窗 / super 视角**」（人话术语）指代该投影；不再用「reflect_request」「分发器」。

12. **想 issue 不裁决（留 followup）**：scheduler→thinkloop 派发经 registry seam；persistable 与 refs() 的边界细化；form 上线后 tool 暴露规则。

### 落地步骤（worktree `.worktree/six-refinements`）

1. core types：`types/executable.ts` 删 `public?`、`ObjectGuideMethod` 删 `schema?`、`RuntimeHandle` 加 `open(objectId, methodName, want)` 签名；`types/thinkable.ts` 加 `active?` / `refs?`。
2. core readable：新文件 `core/readable/render-context.ts`（renderReadable + ReadableResult + 3 档 fallback）。
3. core runtime：新文件 `runtime/refcount.ts` + `runtime/gc.ts`；object-registry.ts 内 dispatchActive/Unactive 改为 import core hook。
4. thread builtin：
   - tools/schema.ts 加 OPEN_TOOL；tools/dispatch.ts dispatch 加 "open" 分支。
   - thread-runtime.ts：实现 `open(objectId, methodName, want)`；删 `refcountInSession`、改 import core；删 builtin 私域 dispatchActive/Unactive（如有）。
   - thinkable/index.ts 实现 `active` + `refs`。
   - thinkable/context.ts 改 import `renderReadable` + 自己包 `<window>` XML 壳。
   - readable/index.ts: 改 window 数组为 default + super 二档；改 computeProjectionClass；end/todo 漂移修齐。
   - executable: 补 method.end.ts / method.todo.ts 实现（如 issue D 落地遗漏）；method.reflect.ts 把 reflect_request 字面改 super。
5. method_exec_form：types Data 加 `want?: string`；readable render context 段加 want 子节点；构造期接收 want（从 runtime.open 注入）。
6. method.talk.ts / method.say.ts / method.reflect.ts：删 `public: true`。agent talk method 同样删。
7. 全树 grep `reflect_request`、`method.public`、`for_reflectable`——清干净（除迁移映射段）。
8. 文档回流：
   - executable.self.md 核心 2 改 4 原语 + 删 public + ObjectGuideMethod 删 schema + open vs exec 决策表。
   - readable.self.md 核心 5/7 加可见性单一来源 + renderReadable 入口锚点 + ReadableResult.source 字段。
   - thinkable.self.md 加 ThinkableModule.active/refs + context 切分（投影归 core / 拼装留 thinkable）。
   - reflectable.self.md 8 cores 改 reflect_request → super（4 条）+ 加「super 四重一致指涉」段；删「分发器」字眼。
   - index.md：`## executable`、`## executable × thinkable`、`## executable × readable`、`## readable × thinkable`、`## reflectable`、`## reflectable × persistable`、`## thread`、节标题 `## pr / reflect_request → ## pr / super`、`## runtime`、`## method_exec_form` 同步。
   - super-flow.md / self-evolution.md / pr-review.md / end-reflection.md：所有 `reflect_request` 字面替换 super。
9. tests：
   - executable: 新增 `tools-open.test.ts`（open dispatch + form 挂载 + want 回显）。
   - readable: 新增 `render-readable.test.ts`（3 档 fallback + source 字段）。
   - runtime: 新增 `refcount-gc.test.ts`（refcount 计算 + GC 兜底 done thread + close 即时触发 + unactive 幂等）。
   - reflectable: existing tests 改 reflect_request → super。
10. 质量门：`bun run check:tsc` + 全量 `bun test packages/@ooc/tests/` 必须绿。

## 落地验收

（待 landed 后填）
