---
title: user — 代表人类用户的被动 object（agent talk 的对端）
description: builtin user 家族的单一权威定义：kind=object、不继承、空 data、无 object/window method、被动（不跑 thinkloop）、是 talk 的对端而非 talk 目标；inline UI token 协议挂在其 readable.md
activates_on:
  "object::root": "show_description"
---

# user

> 代表人类用户在 OOC world 内的占位 object——agent `talk` 的**对端**（人类一侧），自身不跑 thinkloop。
> 对象模型（class/object、单例·非单例、construct、继承、children、投影）见 `class/knowledge/object-model.md`，本文不复述模型。
> 以设计为准；存量代码偏离记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **`ooc.kind = object`**：是一个具体实例，不是 class 定义。
- **不继承**（无 `ooc.class`）：继承链回退到隐式 `root`（对象模型核心 2），但 user **不是 agent**——它不经 `_builtin/agent` 取 thinkable/collaborable/reflectable。
- **被动 object，不是 tool-object、不是 agent**：不被 exec（无工具方法）、不被 talk（不是 talk 目标），也不跑 thinkloop。它只是 web 会话里代表「人类一侧」的占位实体。
- **一句话职责**：作为 agent `talk` 的对端落地点——agent（如 supervisor）向 `user` 发消息时，消息进入 `user.root` thread 的 inbox，由 web 控制面渲染给真人看；真人在 UI 上的输入再作为对端回话注入会话。所有「user 的思考」由真人在 UI 完成，runtime 不为它调度 LLM。

## 二、data 结构（types.ts）

- `Data = {}`——**空**。user 无任何业务字段（`packages/@ooc/builtins/user/types.ts:7`）。
- 身份信封（id / class / title / status / createdAt 等）由 runtime/persistable 管理，不在 data 里。

## 三、能力

- **object method（executable）**：**无**。无 `executable/index.ts`——user 不被 exec，沿链回退到 root 的缺省（但语义上不期望被当工具调）。
- **window method（readable）**：**无自定义 window method**。无 `readable/index.ts`；仅有 agent-facing 的 `readable.md`（见下）。
- **投影（readable）**：user 自身**永不投影成 self window**（它不跑 thinkloop，没有「user 视角的 context」可言）——`selfId==="user"` 处处短路 self/member 窗注入，见「五」。但 user **会作为 peer object window 投影进别的 agent 的视角**：当某 agent 与 user 有过 talk（持 `talk_window(target="user")`）时，user 被列为该 agent 的 peer object window（`object-windows.ts:139` 明确「user 不再特殊排除」）；user 只被排除在**默认相邻 peer 自动发现**（sibling + 一级 children）之外（`object-windows.ts:152`、`init.ts:235` 过滤掉 `"user"`），不被排除在 talk 派生 peer 之外。它在 web 会话里的主要存在形态是 `user.root` thread 的承载，由 visible/web 控制面渲染。
- **`readable.md`（agent-facing 协议文档，非 window method）**：`packages/@ooc/builtins/user/readable.md` 定义了**给 user 发消息时可用的 inline UI token 协议** `[[ui{...}ui]]`——这是写给「向 user talk 的那一端 agent」看的展示协议（已注册组件 `file-link` / `follow-ups`），由 web 前端解析渲染（`packages/@ooc/web/src/shared/ui/InlineUiContent.tsx`，cross-ref visible 维度，本文不复述渲染实现）。注意：这是 user 作为「展示对端」对外暴露的**消息渲染契约**，不是 OOC 对象模型意义上的 object/window method。
- **visible**：`visible/index.tsx` 存在但 `WindowDetail` 返回 `null`（`packages/@ooc/builtins/user/visible/index.tsx:4`）——user 无自定义 self UI 详情页；它在 UI 上的呈现是 chat panel（人类一侧），由 web 控制面而非这个 visible 组件承担。
- **persistable**：无自定义，走系统默认。user flow object 与 `user.root` thread 由 flows service 在 `seedSession` 时按默认布局创建（`packages/@ooc/core/app/server/modules/flows/service.ts:427`）。
- **construct**：**无**。user 是实例对象（`kind=object`），不是非单例 class，无 construct。

## 四、children

无 children。

## 五、源码现状与差异（设计 vs 实现）

对照 object-model.md 核心设计逐条核验：

- **kind 正确**：`package.json` 写 `ooc.kind=object`（`packages/@ooc/builtins/user/package.json:13`），符合「user 是实例不是 class」。未见旧 `kind:"builtin"` / `type:"object"` 残留，也无已废弃的 `instantiate_with_new_world`——这点比多数存量 builtin 干净。**符合设计。**
- **无 self.md，符合核心 9**：user 不是 agent，目录下没有 self.md。符合「self.md 只属 agent 实例」。**符合设计。**
- **空 data，符合定位**：`Data={}`，纯占位（`types.ts:7`）。**符合设计。**
- **被动性靠 runtime 多处硬编码字符串 `"user"` 兜，而非靠 class 模型表达**（过渡态/应关注）：user「不被调度、不能作 talk 目标、自身不投影 self 窗」全部由 runtime 散点 special-case 实现——
  - worker 跳过 `job.objectId === "user"`（`packages/@ooc/core/app/server/runtime/worker.ts:51,57`）；
  - thread-activation notifier 对 `ref.objectId !== "user"` 才入 jobManager（`packages/@ooc/core/app/server/index.ts:199`）；
  - `seedSession` / talk 路径拒绝 `targetObjectId === "user"`（`flows/service.ts:405`、`:510`）；
  - context init 对 `selfId === "user"` 跳过 self window / member 窗注入（`thinkable/context/init.ts:181,226,331`、`object-windows.ts:69`），并以 `isUserRootThread`（`init.ts:77`，line 111 短路）令 user.root 不注 creator window；同时把 `"user"` 从**默认相邻 peer 自动发现**里过滤掉（`init.ts:235`、`object-windows.ts:152`）——注意 user 仍会作为 **talk 派生 peer** 进别的 agent 视角（`object-windows.ts:139` 显式不再排除）；
  - `BUILTIN_OBJECT_IDS` 把 `"user"` 与 supervisor/feishu_app 并列硬编码（`_shared/types/thread.ts:85`）。
  这些断言「user 是被动 object」的属性散落在 ~8 个文件的字面量 `"user"` 判断里，而非由 user 这个 class/object 的能力声明（无 executable→不被 exec；非 agent→不跑 thinkloop）自然推出。**过渡态（功能正确、可接受）**，但「被动」是从对象模型可推导的性质，目前靠重复字符串判定而非模型表达。
- **readable.md 承载的不是 self 身份而是消息渲染协议**：按对象模型，agent-facing 的 `readable.md` 是 class 作为 context window 怎么向 LLM 展示。user 的 readable.md 实际写的是「**别的** agent 向 user 发消息时」的 inline UI token 协议——读者是 talk 对端的 agent，不是 user 自己（user 不跑 thinkloop、无 LLM 读它）。语义上更接近「user 这个对端的消息展示契约」。**非缺陷但定位特殊**：这份协议挂在 user 下是合理的归属（它描述「发给 user 的消息长什么样」），但它不是核心 4 意义上的「user 自身投影成 window 的 readable」。

## 六、倒推 ooc core 改进方向

- **被动性应从对象模型可推导，而非 runtime 散点硬编码 `"user"`**。当前「不调度 / 不能被 talk 目标 / 不自身投影 self 窗」靠 ~8 处字面量 `objectId==="user"` 判断维持，新增类似被动实体（如再来一个外部对端占位）须重复同套 special-case，且任一处漏改即漂移。direction：用对象模型本身表达被动——例如「无 executable ⇒ 不被 exec」「非 agent（不继承 `_builtin/agent`）⇒ 不跑 thinkloop / 不进 worker 队列 / 不投影 self window」，让 worker / init / flows 依能力声明判定而非依特定 id。rationale：消除重复字符串、把「user 是被动 object」从约定升级为模型性质，降低新增被动 object 的成本与漂移面。severity：medium。
- **agent-facing 文档语义轴缺一格——「发给某对端的消息渲染契约」无处归位**。user 的 readable.md 实为「talk 对端的消息展示协议」，被借 readable.md 这个本应承载「self 投影」的槽位。direction：core 可显式区分两类 agent-facing 文本——(a) 某 object「自身投影成 window」的 readable（核心 4）、(b) 某对端「接收消息的渲染契约」（如 inline UI token 协议）；后者归 visible/collaborable 的展示协议层。rationale：避免读者混淆 readable.md 是写给「这个 object 的 LLM」还是「向它发消息的 LLM」，对 user 这种无 LLM 的被动对端尤其。severity：low。
- **`BUILTIN_OBJECT_IDS` 把异质实体并列硬编码**（`thread.ts:85` 把 supervisor〔agent 实例〕/ user〔被动 object〕/ feishu_app〔继承 agent 的接入点〕塞进同一个解析白名单）。direction：builtin 寻址应由 `_builtin/<id>` 前缀 + kind/继承统一推导（cross-ref class self.md「寻址」段），而非维护一张手工实例白名单。rationale：白名单与 builtins 清单两处真相易漂移、新增 builtin 实例须记得改这张表。severity：low。
