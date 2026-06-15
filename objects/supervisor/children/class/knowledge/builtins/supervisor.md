---
title: supervisor — 顶层 OOC agent 实例（继承 _builtin/agent，唯一保留静态 self.md 的预置实例）
description: builtin supervisor 家族的单一权威定义：kind=object、继承 _builtin/agent、空 data、agency 全继承（无自定义 method）、own self.md 快照、控制面治理特权落点；其身份/职责权威活在 .ooc-world-meta 对象树本身，本文只描述它作为 builtin agent 实例的对象模型属性
activates_on:
  "object::root": "show_description"
---

# supervisor

> 顶层 OOC agent 实例——OOC world 的根 parent object、控制面治理动作（rollback / resolve PR-Issue）的恒定落点、reflectable 冒泡兜底 actor，也是 world 默认 talk 入口。
> 对象模型（class/object、单例·非单例、construct、继承、children、投影、agent 分层）见 `class/knowledge/object-model.md`，本文不复述模型。
> **范围界定**：supervisor 作为「OOC 该是什么」的设计权威，其身份/职责的内容权威活在 `.ooc-world-meta` 对象树本身（它就是这棵树的 root object）——本文**只**描述它作为 builtin agent 实例的**对象模型属性**（kind / 继承 / data / 能力来源 / own self.md 快照 / 投影 / 治理落点），不复述其职责内容。
> 以设计为准；存量代码偏离记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **`ooc.kind = object`**：是一个具体实例，不是 class 定义（`packages/@ooc/builtins/supervisor/package.json:13`）。它是 world 中枢的**唯一**实例（每 world 恰一个 supervisor），不是按需可造多个的非单例 class。
- **继承 `_builtin/agent`**（`package.json:14`）：经 `ooc.class="_builtin/agent"` 得继承链 `supervisor → _builtin/agent → root`，从 `_builtin/agent` 拿到 agency（talk/plan/todo/end）+ 身份持久化（self.md），从 root 拿到基类能力。它**是 agent**（跑 thinkloop、可被 talk），区别于被动的 user 与无 agency 的 tool-object。
- **一句话职责（对象模型层面）**：supervisor 是 OOC world 的根 agent object——user 与系统交互的默认对端、控制面 supervisor-only 治理动作的恒定 enactor、reflectable 新对象冒泡沉淀的兜底 super-actor。它的**业务能力全部继承自 `_builtin/agent`**，自身不写任何自定义 method；它的特殊性不在能力，而在**身份**（own self.md 快照）与 runtime 赋予它的**治理落点地位**。

## 二、data 结构（types.ts）

- `Data = {}`——**空**（`packages/@ooc/builtins/supervisor/types.ts:9`）。supervisor 无任何额外业务字段。
- 身份字段 `self`（self.md 正文）**不在 supervisor 的 types.ts 里声明，而是继承自 `_builtin/agent` 的 `Data = { self: string }`**（`packages/@ooc/builtins/agent/types.ts:9`）。这是「身份正文是 agent 实例 data 的一个字段，经 agent persistable 写入/读回实例目录 self.md」的对象模型核心 9 在 supervisor 上的具体落地：supervisor 的 own data 形状由继承链合成，自身只声明「无额外字段」。
- `status:"active"` 等对象信封态由 runtime 管理、不在 Data 内（见 `types.ts:7` 注释）。

## 三、能力

- **object method（executable）**：**无自定义**。supervisor 目录下没有 `executable/index.ts`、没有 `index.ts`——agency（talk/plan/todo/end）全部沿 class 链从 `_builtin/agent` 继承（`packages/@ooc/builtins/agent/executable/index.ts`），由 `resolveMethod` 沿 parentClass 链解析（cross-ref class self.md「method 解析沿 class 链回退」段）。这正是「own 身份 / 共享行为」设计的范例：supervisor 拷 own self.md 快照，但方法活继承 class、框架升级自动生效。
- **window method（readable）**：**无自定义 window method**。目录无 `readable/index.ts`；仅有静态 `readable.md`（agent-facing 对外公开介绍，见下投影段）。
- **投影（readable）**：supervisor 作为 context window 投影进**别的** agent / 别的视角时，走系统默认的 self/peer 窗投影 + 文件级 `self.md`（own 身份）/`readable.md`（对外介绍）解析，由 core readable 渲染（cross-ref readable 维度，本文不复述渲染实现）。supervisor 无自定义 readable 程序，故 stone-文件级沿 class 链回退也未触发（cross-ref class self.md「visible/readable 文件级回退尚未落地」边界）。
- **visible**：`visible/index.tsx` 存在但 `WindowDetail` 返回 `null`（`packages/@ooc/builtins/supervisor/visible/index.tsx:4`）——无自定义 self UI 详情页，走系统默认（web 控制面侧栏选 supervisor 直接发消息，见 `readable.md`）。
- **persistable**：**无自定义**，走继承自 `_builtin/agent` 的 persistable——`data.self` 写入/读回实例目录的 self.md，经 `resolveStoneIdentityRef` 路由（`packages/@ooc/builtins/agent/persistable/index.ts:24`）。supervisor 不另设序列化逻辑。
- **construct**：**无**。supervisor 是实例对象（`kind=object`），不是非单例 class，自身无 construct——它由 bootstrap `instantiateBuiltinClassObjects` 在每个新 world 幂等实例化（拷 `_builtin/agent` 不直接造它，而是 framework 包 supervisor 的 self.md 作 own 身份 + `ooc.class=_builtin/agent`），见「五」。

### own self.md（agent 实例独有身份，supervisor 的唯一特殊文件）

- supervisor 是**唯一保留静态 self.md 的 builtin agent 实例**：framework 包 `packages/@ooc/builtins/supervisor/self.md` 持一份预置身份正文，bootstrap 时拷为 instance 的 own 快照（`data.self`）落 `stones/main/objects/supervisor/self.md`。
- 这份 self.md 的**内容权威不在这里**——supervisor 的身份/职责活在 `.ooc-world-meta` 对象树本身（supervisor `self.md` + `knowledge/` + 各 `children/<dim>/`）。framework 包里的 self.md 是给「裸 world（无对象树）也有个能开口的 supervisor」的 bootstrap 兜底身份，不是其职责的单一来源。
- supervisor 还带 framework 包 `knowledge/`（world-vocabulary / three-fold-persistence / nine-dimensions / creating-objects / supervisor-role），这些是 seed knowledge——每 thread 自动激活，经 class 链 / 自身目录 seed（cross-ref thinkable·knowledge 维度，本文不复述激活机制）。

## 四、children

无 children。（agency 相关的 thread/plan/todo/pr/method_exec_form/skill_index 是 `_builtin/agent` 的 children，supervisor 经继承得到它们的能力，但它们命名空间从属 agent、不属 supervisor。）

## 五、源码现状与差异（设计 vs 实现）

对照 object-model.md 核心设计逐条核验：

- **kind / class 正确，无废弃残留**：`package.json` 写 `ooc.kind=object` + `ooc.class=_builtin/agent`（`package.json:13-14`），符合「supervisor 是继承 agent 的实例」。未见旧 `kind:"builtin"` / `type:"object"`，也无已废弃的 `instantiate_with_new_world` 字段。**符合设计。**
- **身份 data 形状靠继承合成，自身 types.ts 留空**：supervisor `types.ts` 是 `Data={}`，`self` 字段来自 `_builtin/agent` 的 `Data`。**符合设计**（核心 9 + 单链继承）；注意 supervisor 的「真实 data 形状」须读继承链而非单看自身 types.ts。
- **own 身份 / 共享行为 = 范例**：self.md 拷快照（own）、agency method 活继承 class。**符合设计**，是 class 抽象「own 身份 / 共享行为」的标准落地。已知 trade-off：self.md 快照漂移（框架升级 agency 语义后 own self.md 可能描述旧契约），cross-ref class self.md「self.md 快照漂移」边界。
- **bootstrap 注释残留废弃术语 `instantiate_with_new_world`（应修·文档级）**：server 启动处注释仍写「把带 `ooc.instantiate_with_new_world` 的框架 builtin class（supervisor）……」（`packages/@ooc/core/app/server/index.ts:291`），但实际判定早已改为 `pkg.ooc.kind==="object"`（`packages/@ooc/core/app/server/bootstrap/instantiate-classes.ts:52`）。注释与实现矛盾，是退役符号未回流。**应修（文档/注释级，功能正确）。**
- **supervisor 实例化路径绕过 `_builtin/agent` 的 construct（过渡态/可关注）**：按对象模型，agent 实例的初始 data 应由 `_builtin/agent` 的 construct（`exec` 产 `{self}`，`packages/@ooc/builtins/agent/index.ts:29`）产出。但 bootstrap 实际是 `instantiateBuiltinClassObjects` 直接 `readFile(self.md)` + `createStone({self, class})`（`instantiate-classes.ts:62-76`），不调 construct。两条产 instance 的路径（construct vs bootstrap-copy）并存，supervisor 走后者。**过渡态（功能正确、可接受）**，但「造 agent 实例的初始 data」有两套机制，construct 在 bootstrap 场景未被使用。
- **治理特权靠 runtime 硬编码 `SUPERVISOR_OBJECT_ID="supervisor"` 兜，而非 class 模型表达（过渡态/可关注）**：supervisor 的「only-supervisor 能 rollback / resolve PR-Issue」「reviewer 集恒含 supervisor」「reflectable 冒泡兜底 actor」全部由散点字面量 `"supervisor"` 维持——
  - rollback fail-loud 强制 `supervisorAuthor === SUPERVISOR_OBJECT_ID`（`packages/@ooc/core/persistable/stone-versioning.ts:49,438`）；
  - 控制面 rollback / resolve-pr-issue 固定以 `SUPERVISOR_OBJECT_ID` 调底层（`app/server/modules/runtime/service.ts:574`、`api.rollback-stone.ts:10`、`api.resolve-pr-issue.ts:10`）；
  - feat-branch reviewer 集恒末位追加 supervisor（`packages/@ooc/core/persistable/stone-feat-branch.ts:46,103`）；
  - reflectable super-actor 兜底落 supervisor（`packages/@ooc/core/persistable/super-actor.ts:22,56`）；
  - recovery-check 以 `createdByObjectId:"supervisor"` 开 Issue（`app/server/bootstrap/recovery-check.ts:104`）；
  - `BUILTIN_OBJECT_IDS` 把 `"supervisor"` 与 user/feishu_app 并列硬编码（`_shared/types/thread.ts:85`）。
  这些断言「supervisor 是根 parent / 治理特权 object」的属性散落在 ~6 个文件的字面量里，而非由「根 parent object」这一模型角色自然推出。**过渡态（功能正确、可接受）**。

## 六、倒推 ooc core 改进方向

- **「根 parent object / 治理特权」应是模型角色，而非散点硬编码 `"supervisor"`**。当前 rollback-only、reviewer 恒含、super-actor 兜底、recovery 落点全靠 ~6 处字面量 `"supervisor"` 维持，任一处漂移即破契约，且无法表达「换一个 object 当 world 根 parent」。direction：core 应有显式「root parent object」角色概念（cross-ref object-model.md 对象关系三轴的 parent-child 轴 + Supervisor=最顶层 parent），治理特权 / reviewer 兜底 / super-actor fallback 依「是否为 world 根 parent」判定而非依特定 id。rationale：把「supervisor 是根 parent」从约定升级为模型性质，消除重复字符串与漂移面。severity：medium。
- **agent 实例的初始 data 应单一来源，construct 与 bootstrap-copy 不应并存**。supervisor 实例化绕过 `_builtin/agent` 的 construct（`instantiate-classes.ts` 直接拷 self.md），使「造 agent 实例」有两套机制。direction：bootstrap 实例化也走 class 的 construct（construct 拿 self.md 文本作 `args.self` 产初始 data），统一「实例初始 data 由 construct 产」的对象模型契约。rationale：消除双路径、让 bootstrap 实例与 runtime 构造实例同源，construct 不再是 bootstrap 场景的死代码。severity：medium。
- **退役符号 `instantiate_with_new_world` 注释未全回流**。bootstrap 实现已切到 `ooc.kind==="object"` 判定，但 server 启动注释（`app/server/index.ts:291`）仍引用废弃 flag。direction：把废弃符号从所有注释/文档清除（接 check:doc-drift 扫描），与 object-model.md 迁移映射保持一致。rationale：退役符号在注释里残留是反复漂移源（cross-ref MEMORY「退役符号要全树文档回流」）。severity：low。
- **bootstrap 实例化自身 self.md 读路径绕过 builtin 寻址原语**。`instantiate-classes.ts:64` 对 supervisor 直接 `readFile(join(builtinDir,"self.md"))`，注释（同文件 :60-61）明说「bare id 不经 resolveBuiltinReadDir，故不走 readSelf」——builtin 磁盘读有两套（前缀走 `resolveBuiltinReadDir`、bare-id-bootstrap 走裸 readFile）。direction：统一 builtin 五件套磁盘读经单一寻址原语（cross-ref class self.md「寻址」段），避免 bootstrap 旁路。rationale：减少「builtin 怎么从磁盘读」的真相数，降低 supervisor 这类 kind=object builtin 的特例面。severity：low。
