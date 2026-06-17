---
title: feishu_app — 飞书接入点单例 object（self × 各维度：兼具 agent + access-point 双身份）
description: feishu_app 单一权威，以 self×维度 切入——self=单例 object 身份（继承 _builtin/agent，持磁盘 self.md）+ 非敏感运行态 data（opened chat/doc ids）。唯一兼具两种身份的 builtin：self×executable 既有 own access-point 面 open_chat/open_doc，又经类链回退 agent 的 talk/plan/todo/end；self×readable=投影成接入面板窗；self×thinkable/collaborable/reflectable 继承 agent；外加 World 启动级 init 面（Class.init(world) 拉 lark relay）。children feishu_chat/feishu_doc 是两类窗 class
activates_on:
  "object::root": "show_description"
---

# feishu_app

> `_builtin/feishu_app` = 飞书（Lark）接入点：一个继承 agent 的**单例 object**，**既是 agent 又是被 exec 的 access-point tool-object**——这是清单里唯一兼具两种身份的 builtin。对象模型（class/object、单例/非单例、IS-A 继承、children 命名空间）见 class `knowledge/object-model.md`；继承自 agent 的三智能维度见 builtins `agent.md`——本文不复述，只讲「feishu_app 的 self 在各维度长什么样」。

## 一、self（身份 / data）

- **id `_builtin/feishu_app`，kind=object（单例实例）**，继承 `_builtin/agent`。
- **双身份**：既是 **agent**（继承得 `talk/plan/todo/end` agency），又是被 exec 的**接入点 tool-object**（own `open_chat/open_doc`）。作为可被 talk 的 agent 实例，持磁盘身份 self.md（「我是飞书接入点 agent」）。
- **self 的运行态 data**（只承载非敏感运行态；飞书凭证**不入 data**，由 `.world.json` 提供）：
  - `openedChatObjectIds?: string[]` —— 经本接入点 open 过的 feishu_chat 子对象 id（供 readable 投影列出）。
  - `openedDocObjectIds?: string[]` —— 经本接入点 open 过的 feishu_doc 子对象 id。
  - lark relay 的连接状态（WS、routing 表）是 **event-relay 进程内运行态，不入 object data**。
- **一句话职责**：飞书集成的统一接入面——开 feishu_chat / feishu_doc 子对象，并在 World 启动期把飞书消息双向桥接到 OOC session（lark event relay）。

## 二、self × 各维度（核心设计）

feishu_app 的 self 比普通 access-point tool-object 多一整套继承自 agent 的面，又比普通 agent 多一张 own access-point executable 面，再外加一张 World 启动级 init 面。以下逐维度看这张 self 如何呈现。

### self × executable —— own access-point 面（open_chat / open_doc）+ 类链回退 agent 的 agency

own method 均非 `for_ui_access`（agent 经类链调用，非 UI 请求）；改 data + 经 runtime 实例化子对象：

- **`open_chat`** —— 把一个飞书群聊 / 单聊作为 feishu_chat 子对象引入 context。args：`chat_id`(必填)、`chat_name`、`chat_type`(group/p2p/topic)、`tail_count`(默认 30，clamp 1..100)。实例化 feishu_chat，新 id 记入 `self.openedChatObjectIds`。
- **`open_doc`** —— 把一个飞书文档作为 feishu_doc 子对象引入 context。args：`doc_token`(必填)、`doc_kind`(doc/docx/sheet/base/wiki/drive_md，默认 docx)、`doc_title`。实例化 feishu_doc，新 id 记入 `self.openedDocObjectIds`。

两者 fail-soft：缺 runtime 或必填 arg 时返回人话错误字符串、不抛。其上 **`talk/plan/todo/end` 经类链回退到 `_builtin/agent`**（own access-point 面 + 继承 agency 面在同一 self 上叠加）。

### self × readable —— 投影成 feishu_app 接入面板 window

投影成一个 `feishu_app` 接入面板 window：渲染用法 hint（open_chat/open_doc + 凭证配 `.world.json` + relay 由 server 启动期拉起）+ 已开 chat/doc 子对象 id 列表（`opened_chats` / `opened_docs`），声明可调 object method `open_chat`/`open_doc`。**无 window method**——接入面板无展示程度切换。
（注：agent 基类的 self×readable 是「空面」，feishu_app 在 own readable 上把它实成接入面板窗。）

### self × thinkable / collaborable / reflectable —— 继承自 agent（cross-ref，不复述）

feishu_app 作为 agent 实例，这三张智能面全部继承自 `_builtin/agent`：talk→thread→thinkloop（thinkable）、say+inbox/outbox 跨对象协作（collaborable）、feat-branch PR 自迭代（reflectable）。设计权威在 builtins `agent.md` 与 thinkable / collaborable / reflectable 各维度，本文只指明 feishu_app 从此处取得。

### self × construct —— 无（单例 object）

单例 object 即其唯一实例，无 construct；实例数据由 bootstrap 据空 Data 产出。

### self × visible —— 无自定义（系统默认）

无自定义 visible。前端 chat/doc 详情面板拼链接所需的 `larkTenantHost` 由 world-config 下发，**不在本 object**。

### self × persistable —— 无自定义（系统默认）

走系统默认持久化（注：身份字段 `self`↔实例目录 self.md 的写读由继承的 agent persistable 负责，见 builtins `agent.md`）。

### init —— World 启动级初始化（Class.init(world)，区别于以上 per-self 维度面）

不是某张 per-self 维度面，而是一张**类级、World 启动级**的已注册面。`Class.init(world) => err`：World 启动时调一次，据 `.world.json` 的 `LarkAppId/LarkAppSecret` 决定是否真启 lark event relay（缺凭证 no-op、不阻断启动）；返回错误信息（空=成功）。relay 是飞书反向通道的承载，理应由此契约拉起、World 句柄须含 baseDir + port + thread-activation 订阅入口。

## 三、children（命名空间从属，不继承）

两个 child 都是**非单例窗 class**（parentClass=null，纯窗对象），由 feishu_app 的 method 经 construct 实例化、在 context 中各投影成一个 window。所有飞书 OAPI 调用经父包唯一通道 `larkExec`（鉴权由 lark-cli 自管），写类方法强制 dry-run gate（`confirm:true` 才真发）。

### `_builtin/feishu_app/feishu_chat`（class）

一个飞书群聊 / 单聊作为 context window。construct args = open_chat 同名 args，产 Data（chatId/chatName/chatType/mode="tail"/tailCount/buffer）。object method：`refresh`（拉最近 N 条 / 增量）、`search`（本群关键字搜索，临时切 mode=search）、`send`（dry-run gate）、`reply`（引用回复，dry-run gate）、`subscribe`（登记周期 refresh 意愿）、`close`。鉴权：send/reply 默认 bot，其余 user。投影成行式消息流 window（chat 元信息 + buffer，截断 8192 bytes），无 window method。

### `_builtin/feishu_app/feishu_doc`（class）

一个飞书文档作为 context window。construct args = open_doc 同名 args，产 Data（docToken/docKind/docTitle/content/mode="read"）。object method：`read`（拉全文到 content）、`search_in_doc`（已 read 内容内查）、`append`（dry-run gate）、`patch_block`（dry-run gate + `expected_version` 防版本漂移）、`share_link`（据 docKind + `larkTenantHost` 派生 URL）、`attach_to_chat`（把 doc 链接发到 chat，dry-run gate）、`close`。鉴权：默认 user，attach_to_chat 默认 bot。投影成文档 window（doc 元信息 + content.body，截断 12288 bytes），无 window method。

> 飞书 chat/doc 的 per-type knowledge 在父包 `feishu_app/knowledge/{feishu-chat,feishu-doc}.md`（`activates_on: object::feishu_chat / object::feishu_doc`），由 protocol knowledge loader 收集；激活机制由 thinkable·knowledge 维度实现，本文不复述。
