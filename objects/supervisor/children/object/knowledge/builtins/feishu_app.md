---
title: feishu_app — 飞书接入点单例 agent object（self × 各维度：兼具 agent + access-point 双身份）
description: feishu_app 单一权威，以 self×维度 切入——self=单例 object（ooc.class=_builtin/agent，故是 agent，持磁盘 self.md）+ 非敏感运行态 data（opened chat/doc ids）。唯一兼具两种身份的 builtin：self×executable 既有 own access-point 面 open_chat/open_doc，又因 ooc.class=agent 而具 agent 的 agency；self×readable=投影成接入面板窗；self×thinkable/collaborable/reflectable 来自 agent；外加 active 钩起 lark event relay（class 级 long-lived service，issue P 后取代旧 Class.init 设计）。children feishu_chat/feishu_doc 是两类窗 class
activates_on:
  "object::root": "show_description"
---

# feishu_app

> `_builtin/feishu_app` = 飞书（Lark）接入点：一个 `ooc.class=_builtin/agent` 的**单例 object**，**既是 agent 又是被 exec 的 access-point tool-object**——这是清单里唯一兼具两种身份的 builtin。对象模型（class=四 facet 定义 / object=实例、单例 vs 非单例、`ooc.class` 单层 object→class 继承、class 不继承 class、children 命名空间从属）见 `object/self.md`；agent 的三智能维度（thinkable/collaborable/reflectable）见 thinkable `knowledge/agent.md` 与 builtins `agent.md`——本文不复述，只讲「feishu_app 的 self 在各维度长什么样」。

## 一、self（身份 / data）

- **id `_builtin/feishu_app`，kind=object（单例实例）**；`ooc.class=_builtin/agent`——经合法的单层 object→class 继承成为一个 **agent**（package.json `ooc.class` 字段；agent class 见 builtins `agent.md`）。
- **双身份**：
  - 作为 **agent**——具 `talk` agency（执行即创建 thread、跑 thinkloop）、持磁盘身份 self.md（「我是飞书接入点 agent」）、可被别的 object `talk`。
  - 作为被 exec 的 **access-point tool-object**——own `open_chat`/`open_doc` 两条 object method，把飞书 chat/doc 引入 context。
  - 两套面叠在**同一个 self** 上：own access-point method 由 feishu_app class 自带（`executable/index.ts`），agent 那套来自 `ooc.class=_builtin/agent`。
- **self 的运行态 data**（只承载非敏感运行态；飞书凭证**不入 data**，由 `.world.json` 提供）：
  - `openedChatObjectIds?: string[]` —— 经本接入点 open 过的 feishu_chat 子对象 id（供 readable 投影列出）。
  - `openedDocObjectIds?: string[]` —— 经本接入点 open 过的 feishu_doc 子对象 id。
  - lark relay 的连接状态（WS、routing 表）是 **event-relay 进程内运行态，不入 object data**。
- **一句话职责**：飞书集成的统一接入面——开 feishu_chat / feishu_doc 子对象，并经 active 钩把飞书消息双向桥接到 OOC session（lark event relay）。

## 二、self × 各维度（核心设计）

feishu_app 的 self 比普通 access-point tool-object 多一整套来自 agent 的智能面，又比普通 agent 多一张 own access-point executable 面，再外加一张 active 钩起 lark event relay 的 long-lived service 面（issue P 后取代旧 Class.init 设计）。以下逐维度看这张 self 如何呈现。

### self × executable —— own access-point 面（open_chat / open_doc）+ 来自 agent 的 agency

own method 均是 LLM-only object method（agent 经 thinkloop 调用，无 UI 入口；人机分流移交 visible/server）；不改 self 业务态、经 runtime 实例化子对象、把新 id 记入 self 的运行态 data：

- **`open_chat`** —— 把一个飞书群聊 / 单聊作为 feishu_chat 子对象引入 context。args：`chat_id`(必填)、`chat_name`、`chat_type`(group/p2p/topic)、`tail_count`(默认 30，clamp 1..100)。经 `ctx.runtime.instantiate("_builtin/feishu_app/feishu_chat", …)` 实例化，新 id 记入 `self.openedChatObjectIds`。
- **`open_doc`** —— 把一个飞书文档作为 feishu_doc 子对象引入 context。args：`doc_token`(必填)、`doc_kind`(doc/docx/sheet/base/wiki/drive_md，默认 docx)、`doc_title`。经 `ctx.runtime.instantiate("_builtin/feishu_app/feishu_doc", …)` 实例化，新 id 记入 `self.openedDocObjectIds`。

两者 fail-soft：缺 runtime 句柄或必填 arg 时返回人话错误字符串、不抛。其上 **agent 的 `talk` agency** 与这张 own access-point 面叠加在同一 self（复用程序靠 import agent class 的 export，不靠 class 继承 class）。

### self × readable —— 投影成 feishu_app 接入面板 window

投影成一个 `feishu_app` 接入面板 window：渲染用法 hint（open_chat/open_doc + 凭证配 `.world.json` + relay 由 server 启动期拉起）+ 已开 chat/doc 子对象 id 列表（`opened_chats` / `opened_docs`），window decl 声明可调 object method `open_chat`/`open_doc`。**无 window method**——接入面板无展示程度切换。

### self × thinkable / collaborable / reflectable —— 来自 agent（cross-ref，不复述）

feishu_app 因 `ooc.class=_builtin/agent` 而是 agent，这三张智能面随之具备：talk→thread→thinkloop（thinkable）、thread 间 `say`+inbox/outbox 跨对象协作（collaborable）、自我迭代（reflectable）。设计权威在 thinkable `knowledge/agent.md`（agent 抽象）/ `knowledge/thread.md`（thread）、collaborable `self.md`、reflectable `self.md`，本文只指明 feishu_app 从此处取得。

### self × construct —— 无（单例 object）

单例 object 即其唯一规范实例，无 construct；实例数据由 bootstrap 据空 Data 产出。

### self × visible —— 无自定义（系统默认）

无自定义 visible。前端 chat/doc 详情面板拼链接所需的 `larkTenantHost` 由 world-config 下发，**不在本 object**。

### self × persistable —— 系统默认（身份字段经 agent 落 self.md）

feishu_app 本体无自定义 persistable，走系统默认。其作为 agent 持有的身份字段 `self`↔实例目录 `self.md` 的写读，由 agent class 的 persistable 负责（见 builtins `agent.md`、persistable `self.md`）。

### self × active —— 单例 active 钩起 lark event relay（issue P 后取代 init）

class 级 long-lived service（lark event relay 长连接、双向消息桥接）经**单例 active 钩**表达——feishu_app 单例被 root 持引用永生（refcount 永 ≥1）、active 即 process-level once。`active(ctx, self) => void`：refcount 0→1 触发，自 `ctx.worldDir` 加载 `.world.json` 取 `LarkAppId/LarkAppSecret`，决定是否真启 lark event relay（缺凭证 no-op、不阻断激活）。relay 是飞书反向通道的承载，由此契约拉起；`unactive` 钩拆 lark client（永生场景下不触发；reflectable 主动 delete 时触发）。

**与原 `Class.init(world)` 设计的同构**：解析路径同构（同样从 `.world.json` 取 lark 凭证），契约从 class 级 `World` 句柄改为 object 级 `ObjectLifecycleHook` 的 ctx（含 worldDir / sessionId / args / reportDataEdit 等）。issue P 删 `OocClass.init?` 字段（zero-user stub）、收口到 active 钩——符合 OOC 哲学「不发明新机制」。**热更新语义**：agent 自迭代改 active 钩内的 relay 协议、PR merge 后旧 relay 继续跑、需经显式 reset 操作才换新版（reset 操作命名 + 归属维度留 followup）。

## 三、children（命名空间从属，不继承 feishu_app）

两个 child 都是**非单例窗 class**（纯窗对象，由 feishu_app 的 method 经各自 construct 实例化、在 context 中各投影成一个 window）；children 只是命名空间以 `_builtin/feishu_app/` 为前缀从属 feishu_app，与 feishu_app **无继承关系**（object-model 核心 8）。所有飞书 OAPI 调用经父包唯一通道 `larkExec`（鉴权由 lark-cli 自管），写类方法强制 dry-run gate（`confirm:true` 才真发）。

### `_builtin/feishu_app/feishu_chat`（class，非单例）

一个飞书群聊 / 单聊作为 context window。construct args = open_chat 同名 args，产 Data（chatId/chatName/chatType/mode="tail"/tailCount/buffer）。object method：`refresh`（拉最近 N 条 / 增量）、`search`（本群关键字搜索，临时切 mode=search）、`send`（dry-run gate）、`reply`（引用回复，dry-run gate）、`subscribe`（登记周期 refresh 意愿）、`close`。鉴权：send/reply 默认 bot，其余 user。投影成行式消息流 window（chat 元信息 + buffer，截断 8192 bytes），无 window method。

### `_builtin/feishu_app/feishu_doc`（class，非单例）

一个飞书文档作为 context window。construct args = open_doc 同名 args，产 Data（docToken/docKind/docTitle/content/mode="read"）。object method：`read`（拉全文到 content）、`search_in_doc`（已 read 内容内查）、`append`（dry-run gate）、`patch_block`（dry-run gate + `expected_version` 防版本漂移）、`share_link`（据 docKind + `larkTenantHost` 派生 URL）、`attach_to_chat`（把 doc 链接发到 chat，dry-run gate）、`close`。鉴权：默认 user，attach_to_chat 默认 bot。投影成文档 window（doc 元信息 + content.body，截断 12288 bytes），无 window method。

> 飞书 chat/doc 的 per-type knowledge 在父包 `feishu_app/knowledge/{feishu-chat,feishu-doc}.md`（`activates_on: object::feishu_chat / object::feishu_doc`），由 knowledge loader 收集；激活机制由 thinkable·knowledge 维度实现，本文不复述。

## 四、程序骨架（示意）

> 按 `object/knowledge/example.md` 的 ooc class 文件布局给出 design-level 骨架（大概示意、不必可编译）。feishu_app 是**单例 object**（无 construct）+ **agent**（`ooc.class=_builtin/agent`，agency 靠 import agent export 复用、非 class 继承 class）+ 一张 `active` 钩起 lark event relay（class 级 long-lived service，issue P 取代旧 init 设计）。children feishu_chat/feishu_doc 是**非单例窗 class**（有 construct）。

### feishu_app/package.json —— kind=object / class=继承的 agent

```json
{
  "name": "@ooc/builtins/feishu_app",
  "type": "module",
  "ooc": {
    "objectId": "_builtin/feishu_app",
    "kind": "object",
    "class": "_builtin/agent"
  }
}
```

### feishu_app/types.ts —— object data（只承载非敏感运行态）

```ts
export interface Data {
  openedChatObjectIds?: string[]   // 经本接入点开过的 feishu_chat 子对象 id
  openedDocObjectIds?: string[]    // 经本接入点开过的 feishu_doc 子对象 id
  // 飞书凭证不入 data，由 .world.json 提供；relay 连接态是进程内运行态，不落 data
}
```

### feishu_app/index.ts —— Class={executable, readable, active, unactive}（单例 object 无 construct）

```ts
import executable from './executable/index.ts'
import readable from './readable/index.ts'
import { startLarkEventRelay, stopLarkEventRelay } from './event-relay/index.ts'

// 单例 object：无 construct（实例数据 bootstrap 据空 Data 产出）。
// agent 的 agency 来自 ooc.class=_builtin/agent，非在此处再继承一个 class。
// class 级 long-lived service（lark event relay）经 active 钩起（issue P）。
export const Class = {
  executable,
  readable,
  // 单例 + 被 root 持引用永生场景：active 即 process-level once。
  // 据 ctx.worldDir 读 .world.json 取 LarkAppId/Secret；缺凭证 no-op。
  active: {
    description: 'Start lark event relay on first reference (process-level once)',
    exec: async (ctx /*, self */) => {
      try { await startLarkEventRelay({ baseDir: ctx.worldDir }) }
      catch (e) { console.error('[feishu_app.active] lark relay start failed:', e) }
    },
  },
  // refcount 1→0 拆 relay（永生场景下不触发；reflectable 主动 delete 时触发）。
  unactive: {
    description: 'Stop lark event relay on last dereference',
    exec: async (/* ctx, self */) => { await stopLarkEventRelay() },
  },
}
```

### feishu_app/executable/index.ts —— own access-point object method

```ts
import type { ExecutableContext, ObjectMethod } from '<runtime>/executable'
import type { Data } from '../types.ts'

const openChat: ObjectMethod<Data> = {
  name: 'open_chat',
  description: 'Open a Feishu (Lark) chat (group / p2p) as a feishu_chat object in context.',
  schema: { chat_id: { type: 'string', required: true }, chat_name: { type: 'string' },
            chat_type: { type: 'string', enum: ['group', 'p2p', 'topic'] }, tail_count: { type: 'number' } },
  exec: async (ctx, self, args) => {
    if (!ctx.runtime) return '[feishu_app.open_chat] 缺少 runtime 句柄。'  // fail-soft
    const id = await ctx.runtime.instantiate('_builtin/feishu_app/feishu_chat', { /* …args… */ })
    self.openedChatObjectIds = [...(self.openedChatObjectIds ?? []), id]   // 记运行态
    return `已创建 feishu_chat（id=${id}）；建议 exec(method="refresh") 验证链路。`
  },
}

const openDoc: ObjectMethod<Data> = {
  name: 'open_doc',
  description: 'Open a Feishu (Lark) doc as a feishu_doc object in context.',
  schema: { doc_token: { type: 'string', required: true },
            doc_kind: { type: 'string', enum: ['doc', 'docx', 'sheet', 'base', 'wiki', 'drive_md'] },
            doc_title: { type: 'string' } },
  exec: async (ctx, self, args) => {
    if (!ctx.runtime) return '[feishu_app.open_doc] 缺少 runtime 句柄。'
    const id = await ctx.runtime.instantiate('_builtin/feishu_app/feishu_doc', { /* …args… */ })
    self.openedDocObjectIds = [...(self.openedDocObjectIds ?? []), id]
    return `已创建 feishu_doc（id=${id}）；建议 exec(method="read") 验证链路。`
  },
}

// agent 的 talk/plan agency 不在此重复声明——来自 ooc.class=_builtin/agent。
export default { methods: [openChat, openDoc] }
```

### feishu_app/readable/index.ts —— 投影成接入面板 window（无 window method）

```ts
import type { ReadableContext } from '<runtime>/readable'
import type { Data } from '../types.ts'

export default {
  readable: (ctx: ReadableContext, self: Data) => ({
    class: 'feishu_app',
    content: [
      /* hint：open_chat/open_doc + 凭证配 .world.json + relay 由 server 启动期拉起 */
      /* opened_chats（列 self.openedChatObjectIds）/ opened_docs（列 self.openedDocObjectIds）*/
    ],
  }),
  window: [
    { class: 'feishu_app', object_methods: ['open_chat', 'open_doc'], window_methods: [] },
  ],
}
```

### children/feishu_chat —— 非单例窗 class（construct + executable + readable）

```ts
// feishu_chat/index.ts
import executable from './executable/index.ts'
import readable from './readable/index.ts'
export const Class = {
  construct: {
    description: 'Open a Feishu chat (group / p2p) as a context window object.',
    schema: { chat_id: { type: 'string', required: true }, chat_name: { type: 'string' },
              chat_type: { type: 'string', enum: ['group', 'p2p', 'topic'] }, tail_count: { type: 'number' } },
    exec: (ctx, args) => ({ chatId: args.chat_id, chatName: /* … */ '', chatType: args.chat_type,
                            mode: 'tail', tailCount: /* clamp(args.tail_count, 30) */ 30, buffer: [] }),
  },
  executable,  // refresh / search / send(dry-run gate) / reply(dry-run gate) / subscribe / close
  readable,    // 投影成行式消息流 window；无 window method
}
```

### children/feishu_doc —— 非单例窗 class（construct + executable + readable）

```ts
// feishu_doc/index.ts
import executable from './executable/index.ts'
import readable from './readable/index.ts'
export const Class = {
  construct: {
    description: 'Open a Feishu doc as a context window object.',
    schema: { doc_token: { type: 'string', required: true },
              doc_kind: { type: 'string', enum: ['doc', 'docx', 'sheet', 'base', 'wiki', 'drive_md'] },
              doc_title: { type: 'string' } },
    exec: (ctx, args) => ({ docToken: args.doc_token, docKind: args.doc_kind ?? 'docx',
                            docTitle: /* … */ '', content: { format: 'markdown', body: '' }, mode: 'read' }),
  },
  executable,  // read / search_in_doc / append(dry-run) / patch_block(dry-run + expected_version) /
               // share_link / attach_to_chat(dry-run) / close
  readable,    // 投影成文档 window；无 window method
}
```

> feishu_app/persistable、feishu_app/visible 均无自定义（系统默认）——故骨架不给。所有飞书 OAPI 调用经父包唯一通道 `larkExec`（鉴权由 lark-cli 自管）。
