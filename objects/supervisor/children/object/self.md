# object — OOC 系统 对象结构 的设计师

# OOC 对象模型

> 本篇是 class 维度关于**「OOC 里 object / class 是什么、怎么继承、怎么组合、怎么分层」**的**单一权威**。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：OOC 对象模型只此一处。新增/变更先改本文、再改代码；散落的旧 class 知识吸收进来即删，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：本文只讲对象模型自身 + 它**对外暴露的接口**；**不讲其他维度怎么实现**。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间），也不得与其他权威冲突；发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **一切是 object；class 是定义，object 是实例**。
   **class 必有 `index.ts` + `types.ts` + 四件套**（readable / executable / visible / persistable）；agent 类额外注册 **thinkable** 模块槽（见核心 9）。**object instance 不必有 `index.ts`**——无 `index.ts` 的 object 不是新 class、就是父 class 的一个 instance（runtime 不在 ClassRegistry 注册新 class，见核心 4）。
   class 构成件：
   - **`readable`**（`readable.ts` / `readable/index.ts` / `readable.md`）—— 它**作为 context window 怎么向 LLM 展示**：渲染什么内容、按视角算出什么 class、提供哪些 window method。
   - **`executable`**（`executable/index.ts`）—— 它的 **object method**。
   - **`visible`**（`visible/index.tsx` + `visible/server/index.ts`）—— 它向 OOC 系统用户提供 UI 界面（tsx）+ 「给 UI 用的服务端 API」（visible/server，前端经 callMethod 调用、改 object data）。**tsx 是文件资源、不参与 OocClass 继承机制**（见 visible 维度 self.md）。
   - **`persistable`**（`persistable/index.ts`）—— 它的**自定义持久化逻辑**（缺省走系统默认）。
   - **`index.ts`** —— class 的**后端程序路由**（不含 visible 前端 tsx）：`export const Class = { construct?, active?, unactive?, executable, readable, persistable, thinkable?, visibleServer? }`，把各维度的程序入口收口在一处——含 **visible/server** for-ui 服务端 API 模块（前端 tsx 资源除外，那是 visible 自带）+ **`thinkable?`**（思考组织模块：buildInputItems/appendEvents/compress/onSchedulerTick；仅跑 thinkloop 的 thread 类注册、由 registry `resolveThinkable` 解析，见 thinkable 维度）；非单例 class 在此注册 **construct**（见核心 3）。槽名是 `construct` 不是 `constructor`——JS `Object.prototype.constructor` 会遮蔽后者（`({}).constructor === Object` 恒真），单例就无法被识别。
   - **`types.ts`** —— 定义该 class 的 **object data 结构**（object 自身运行时数据的类型；**不是** window 投影结构，见核心 4）。
   - 可选 **`common/`** —— 放公用的程序函数。

   **object** = 某 class 的实例，持运行时 **data**（结构由 `types.ts` 定义；如何序列化见核心 7）。

2. **OOC Class 协议层不内建任何继承 / dispatch chain 机制**：ClassRegistry 注册扁平的 class 定义，无 chain 元信息、无沿链 fallback；`resolveXxx` **本类直查**。object 经 `ooc.class` 单跳 binding 一个 class 作为身份模板。**class 想复用另一个 class 的能力，由其 `index.ts` 用 TS 标准 `import` + 对象 `spread`（或 method 级 import 函数 + 显式调）在源码侧完成**——「如何继承」属于 class 实现者的自由，OOC 协议不规约、不感知。典型写法：
   ```ts
   import { Class as agentClass } from "@ooc/builtins/agent";
   export const Class: OocClass<Data> = {
     ...agentClass,        // spread 父 facet（spread 是浅拷贝、facet 视为 immutable）
     id: "coder",          // 覆盖 id（顺序敏感：override 必须在 spread 之后）
     executable,           // 子自己的 executable（整模块替换；method-level merge 用 extendClass）
   };
   ```
   可选 helper：`extendClass(parent, overrides)`（`packages/@ooc/core/runtime/inherit.ts`，**只支持 `executable.methods` 一档** method-name 合并，扩字段必走新 issue）。**OOC 不推荐任何特定继承合并语义**——cookbook 平等展示「无 index.ts / 手写 spread / extendClass」三种范式。

3. **class 分单例 / 非单例**：
   - **非单例 class**：可复用模板，在 `index.ts` 的 `Class.construct` 注册 **construct**（`exec(args)` 产出新 object 实例的初始 data）。
   - **单例 class**：恰一个实例——object 一旦**自定义自己的函数方法**（持自己的 自定义程序逻辑），就成为**自身 class 的单例**（object 即 class）。
   - **单例不可被继承是源码组织约定**——OOC 协议层不强制（无运行时感知，已由核心 2 取消所有 chain 机制），由代码评审 / lint 拦截。

4. **object 在 LLM 视角下呈现为 context window**：object 持自身 **data**（核心 1 的 `types.ts`），由 object 的 **readable** 把 data **投影**成 context window——按视角动态算出 window 的 class 与展示内容，并声明该 window 展示哪些 object method。window 的投影态（如 viewport）与 object data **分离**。
   readable 还可提供 **window method** 调节展示**程度**（详细 / 部分 / 总结 / 压缩）：window method **只动 window 投影态、返回新的 window 状态对象**（不可变），不影响 object 行为、不改变 object data。

   **ServerLoader 双路径**（核心 1 / 核心 2 的运行时落地）：
   - **有 `index.ts`** → `import { Class } → registry.register(Class)`；子的继承经子源码 `import` + `spread` 在 `index.ts` 内表达，ServerLoader 不做任何 parentClass 兜底注入。
   - **无 `index.ts`** → **不向 ClassRegistry 注册新 class**；只在 session 对象表落 `OocObjectInstance{id, class: <ooc.class>, data}`——`OocObjectInstance.class` 字段本身承担「单跳实例 binding」角色，runtime 直接命中父 class 的字段（resolveXxx 用 `inst.class` 作 lookup key），不在 registry 再造一条空 Class 桥接。
   - 两条路径语义同质：无 `index.ts` 等价于「index.ts 只 spread 父」——前者由 instance.class 直指父、后者由子源码 spread 父；OOC 协议层一致（无 chain 元信息）。

5. **object method 由 executable 实现**：区别于 window method（核心 4），object method **可改变 object 数据、可产生副作用**。

6. **object 经 visible 自定义 UI 界面**：visible 除前端 tsx UI 外，还经 **`visible/server/index.ts`** 提供「给 UI 用的服务端 API」——前端经 callMethod 请求这些 for-ui server method（改 object data → persistable.save，非版本化）；其 ctx 有 world / session / object-self、**无 thinkloop thread**，与 executable object method 分两条独立签名。**人机分流不靠 object method 上的标记**（旧 `for_ui_access` 退役）——LLM 侧走 executable object method、人类侧走 visible/server。

7. **持久化可自定义**：object 经自定义 **persistable** 程序控制自己的**序列化目录与序列化方式**；未自定义则走**系统默认**持久化。

8. **children = 命名空间从属、不继承**：ooc class 可有 children class，ooc object 可有 children object；children **从属于 parent、但不继承 parent**——只是命名空间上 children 的 id 以 parent id 为前缀（`parent_id/child_id`）。

9. **ooc agent = ooc object with LLM**：在 readable / executable / visible / persistable 之上，额外具备 **thinkable / collaborable / reflectable**。agent 持名为 **`talk`** 的 object method——执行即创建一条 **thread**，thread 内运行 LLM 的 **thinkloop**，以此实现 agent 的智能。agent 的 **agency = `talk` / `plan`**（自我驱动的对外协作动作）；`end` / `todo` 是 **thread 作用域操作**（`end` 标记当前 thread 结束、`todo` 在当前 thread context 内登记 todo 对象），归 thread 的 object method，**不属 agent agency**。
   **`self.md` 是 agent 实例独有的身份**：agent 的 data 含一个 `self` 字段（身份正文文本），由 **agent builtin 的 persistable** 写入/读回实例目录的 `self.md`（实现归属 builtin，core 不拥有）、并经 **agent 自定义 readable** 把 `data.self` 投影为该 agent **self 门面窗的 self 视角内容**（他者视角渲 `readable.md`）——**不进 thinkloop instructions**（身份只活在 self 门面窗这一处）。非 agent 的 object（工具 object、class 定义）没有 self.md。
   **继承 agent 的 class 在自己 persistable 里复用 self.md 处理须 `import { readSelf, writeSelf }` 显式调**（这是核心 2 复用模式的实例）——`PersistableContext.objectId` 已携子身份，agent persistable 在解析路径时不假定 class，故无须改 `agent/persistable/self-md.ts`。

10. **对象有生命周期：`construct` 诞生 → `active` / `unactive` 按引用计数停启 → 无独立 destruct（删除是 `unactive` 的自决）**。**context window 即引用**：一个 object 在某 thread 的 context 里呈现为 context window（核心 4），这同时就是对该 object 的**一次引用**。三个生命周期钩子皆**可选**、与 `construct` 对称，皆在 `index.ts` 的 `Class` 注册：`construct` 在身份诞生时产出初始 data（一次，核心 3）；**`active`** 在 object 的引用数由 0 变 1（被某 context 首次引用）时触发；**`unactive`** 在最后一个引用被移除、引用数归 0 时触发。**删除是 `unactive` 的可选自决、无独立 destruct**：`unactive` 返回 `{ delete?: boolean }`——缺省 / `false` = 只**停用**（释放运行时资源、磁盘身份留存，之后被重新引用即再 `active`）；`delete: true` = 把该 object **彻底从 session 移除（含持久化文件）**。删除只发生在引用归零这一刻（故绝不留悬空引用），且由 object 自己决定——**没有独立的 destruct 钩子、没有强制销毁**；OOC object 默认是持久身份。**`close` 即移除一个引用**：close 原语把一个 context window 从某 thread 的 context 移除（引用减一），归零即触发该 object 的 `unactive`。**construct 可标结构窗不可关**：thread construct 构造初始 context 时，可把某些 context window 标记为不可关闭；对其执行 close 将被拒绝（结构窗例：thread 与 creator 的恒在通道）。
    **`active` / `unactive` 父子串调不内建**——子 override 这两个钩子时由子代码控制顺序（典型 `await parentClass.active?.exec(ctx, self); /* own logic */`，`parentClass` 是 import 来的引用、不是 spread 后字段）；漏调父钩子由代码评审拦截，OOC 协议层不感知。

> 核心 1-10 已逐条与用户敲定（仿 context.md 听写/grill 流程）。**系统自带 builtin class/object 的清单索引见 supervisor `knowledge/builtins.md`**（高内聚低耦合：本文只讲对象模型、不列具体 builtin）。派生设计 / 细节补充 / 模拟推演待补。

---

## 二、派生设计


---

## 三、细节补充

### 对象表与引用（核心 4）—— 运行态 single-source

- **两类型分立**：`OocObjectInstance<Data> = { id, class, data }` = **对象本身**（持 data）；`OocObjectRef<Win>` = **context window**（对对象的引用 + 视角态、**不持 data**）。`ContextWindow = OocObjectRef`。
- **session 对象表**：一个 session（= 内存线程树）内 `objectId → 唯一一个 OocObjectInstance`（identity map）。挂线程树**根** thread、随 job 释放（**非永生全局表**，owner = `runtime/session-object-table.ts`）；= flows 磁盘（独立对象 `data.json` / inline 对象随 thread-context）的运行态镜像，磁盘仍是真相。
- **context window = 引用**：`OocObjectRef` 持 `id`（=objectId，表 key，窗身份与对象身份 1:1）+ 缓存 `class` + 本窗视角态（`window_view?` 视角投影 hint / status / title / win / closable / createdAt / parentWindowId）；**不持 data**——磁盘只落 ref、内存经 **`objectDataOf(ref, table)`** 从对象表按 `ref.id` 解析 data（`classOf(ref)=ref.class` 缓存免查表）。同 objectId 多窗 ⇒ 同一表项 ⇒ 读同一份 data。
- **`window_view` 不参与对象身份**（issue J）：`ref.window_view?: string`（optional） = 该窗的**投影视角**（如 `default` / `self` / `super`），由 ref 创建点显式写（如 thread.construct 写 `"self"`、createSuperThread 写 `"super"`）或缺省落 `DEFAULT_WINDOW_VIEW`。**不参与身份**——同 `(id, class)` 的两个 ref 可持不同 `window_view`（如 caller / callee 两端看同一条 thread）。equality / dedup 比较使用 `refIdentity(ref): { id, class }` helper（`core/types/context-window.ts`）剥离视角字段。**runtime-owned**：agent 自写 method 应只读、不应自改 `ref.window_view` 自我提权到 self/super 视角；调用方需要指定视角时经 `runtime.instantiate({..., windowView?})` args 透传，由 runtime 写入 ref。
- **live-ref 作用域**：仅 **in-process 同 job fork 子树**（单 driver 串行推进、无竞争、本轮无锁）改即处处见；cross-job / cross-session / cross-object 各自 `readThread` 独立内存树、走磁盘 last-writer-wins（A **不承诺** live、物理上也做不到，Case A 在该层仍开放——不可笼统说「A 消解 Case A」）。`read_only` 不废、降为未来 cross-actor share 的设计储备。
- **token 计量**：按**窗**各计其渲染产物——同一 objectId 在不同视角窗渲不同文本、各占预算（核心 9 多视角），**非按 object 去重**；A 的红利是 data 存一份，**不等于** token 计一次。
- **现状（诚实标注）**：独立对象现每次 open 铸新 id、门面窗 data 空 ⇒ 真实跨窗 data 共享当前稀有（表多 1:1）；本设计先钉「window=ref / 一 objectId 一 instance」的**结构与解析层**，是后续「稳定/去重 objectId」让共享真正生效的地基。
- **程序实现走查**（对象表模块 / fromThread·instantiate 收敛 / 末-ref-evict / 各源码锚点）见 `knowledge/lifecycle.md`。

### 生命周期（核心 10）—— 接口与边界

- **三钩子接口**：`active?` / `unactive?`（`OocClass` 槽，与 `construct` 并列、在 `index.ts` 的 `Class` 注册），签名 `exec(ctx, self) => void | { delete?: boolean }`——`ctx` 带 `targetId`（refcount 变动的对象 id），`self` = runtime 据 `targetId` 解析注入的**目标对象 data**（钩子 body 直接操作 self、不必从 ctx 自解析目标；无目标 data 时 self 为 undefined）；与 `construct` 不同，作用于**既有**对象、不产 Data。
- **`closable` 字段**：`OocObjectInstance.closable`（缺省可关；construct 标 `false` = 结构窗，close 原语拒关报错）。
- **引用 = context window**：一个 object 在某 thread context 里的窗即对它的**一次引用**；refcount 在 **session 内非终态线程**间统计，自引用（self 门面窗）不计。
- **分层边界（与 construct 同构）**：core 提供**泛型**机制（引用计数 + active/unactive 派发，零 class 特判、不 import 任何具体 class）；各 class 提供**钩子 body**（policy）。
- **删除语义**：`unactive` 返回 `{ delete: true }` 才彻底移除（含持久化文件）；删除只在引用归零这一刻、由对象自决——故无悬空引用、无强制销毁、无独立 destruct。
- **程序实现走查**（派发引擎 / 触发 seam / thread 的 unactive 通知 policy / 各源码锚点）见 `knowledge/lifecycle.md`。

---

## 四、模拟推演


---

## 迁移映射（非设计 / 旧）
