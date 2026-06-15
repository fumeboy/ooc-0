---
title: feishu_app — 飞书接入点单例 object（继承 agent，开 chat/doc + 起 lark relay）
description: feishu_app 家族单一权威——kind=object 单例、自引用 ooc.class、继承 _builtin/agent；own method open_chat/open_doc 实例化 feishu_chat/feishu_doc 子对象；World 启动起 lark event relay；children feishu_chat/feishu_doc 是两类窗 class
activates_on:
  "object::root": "show_description"
---

# feishu_app

> 飞书（Lark）接入点：一个继承 agent 的**单例 object**，把飞书群聊 / 文档作为子对象引入 context，并在 World 启动期拉起 lark 双向消息中继。
> 对象模型（class/object、单例·非单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间、agent 分层）见 class `knowledge/object-model.md`，本文不复述模型。
> **以设计为准**：存量代码部分接线已过期（自引用 class、未接线的 `init`、注释指向不存在的 `windows/index.ts`、root 旧 feishu 方法的残留测试），分歧逐条记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **ooc.kind = object**（`package.json` 自声明为实例，非 class 定义）。
- **ooc.class = `feishu_app`**（自引用——见差异 §5.1；语义上应是继承 `_builtin/agent`，registry 注册时显式设 `parentClass:"_builtin/agent"`）。继承链实质为 `feishu_app(实例) → feishu_app(class) → _builtin/agent → root`。
- **单例**：World 里恰一个 `objects/feishu_app` 实例，由 bootstrap 据 `ooc.kind=object` 幂等实例化；其 own 方法库使它成为自身 class 的单例。它既是 **agent**（继承 agent 得 `talk/plan/todo/end` agency），又是被 exec 的**接入点 object**（own `open_chat/open_doc`）——是清单里唯一兼具两种身份的 builtin。
- **职责**：作为飞书集成的统一接入面——开 feishu_chat / feishu_doc 子对象、承载飞书集成运行态、并在 World 启动期把飞书消息双向桥接到 OOC session（lark event relay）。

## 二、data 结构（types.ts）

object 自身运行时 data 只承载非敏感运行态（飞书凭证不入 data，由 `.world.json` 提供）：

- `openedChatObjectIds?: string[]` —— 经本接入点 open 过的 feishu_chat 子对象 id（供 readable 投影列出）。
- `openedDocObjectIds?: string[]` —— 经本接入点 open 过的 feishu_doc 子对象 id。

> agent 身份正文（self.md）是 agent 实例的 data 字段（object-model 核心 9），不在本 types.ts；feishu_app 当前缺 self.md（差异 §5.2）。lark relay 的连接状态（WS、routing 表）是 event-relay 进程内运行态，**不**入 object data。

## 三、能力

### object method（executable）

均 `for_ui_access` 未标记（agent 经类链调用，非 UI 请求）；改 data + 副作用（经 runtime 实例化子对象）：

- **`open_chat`** —— 把一个飞书群聊 / 单聊作为 feishu_chat 子对象引入 context。args：`chat_id`(必填)、`chat_name`、`chat_type`(group/p2p/topic)、`tail_count`(默认 30，clamp 1..100)。经 `ctx.runtime.instantiate("_builtin/feishu_app/feishu_chat", args)` 建实例，新 id 记入 `self.openedChatObjectIds`。
- **`open_doc`** —— 把一个飞书文档作为 feishu_doc 子对象引入 context。args：`doc_token`(必填)、`doc_kind`(doc/docx/sheet/base/wiki/drive_md，默认 docx)、`doc_title`。经 `ctx.runtime.instantiate("_builtin/feishu_app/feishu_doc", args)` 建实例，新 id 记入 `self.openedDocObjectIds`。

两者都 fail-soft：缺 `ctx.runtime` 或必填 arg 时返回人话错误字符串，不抛。继承自 agent 的 `talk/plan/todo/end` 不在本包定义、经类链回退到 `_builtin/agent`。

### window method（readable）

无自定义 window method（接入面板无展示程度切换）。

### 投影（readable）

投影成一个 `feishu_app` 接入面板 window：渲染 hint（open_chat/open_doc 用法 + 凭证配 `.world.json` + relay 由 server 启动期拉起）+ 已开 chat/doc 子对象 id 列表（`opened_chats` / `opened_docs`）。window 声明可调 object method `["open_chat","open_doc"]`。

### visible / persistable

无自定义 visible、无自定义 persistable——走系统默认（实例目录序列化；前端 feishu_chat/feishu_doc 详情面板拼链接所需的 `larkTenantHost` 由 world-config 模块下发，不在本 object）。

### construct

**无 construct**——单例 object，bootstrap 据空 Data 实例化（`instantiateBuiltinClassObjects` 读包 self.md 拷身份、按 `ooc.class` 设父类）。可被构造的是它的 children（feishu_chat/feishu_doc），不是它自己。

### init（World 启动级初始化）

`index.ts` 导出 `Class.init(world) => err`：World 启动时调一次，起 lark event relay。relay 据 `.world.json` 的 `LarkAppId/LarkAppSecret` 决定是否真启（缺凭证 no-op、不阻断启动）；返回错误信息（空=成功）。
> **此 `init` 当前未被运行时调用**（差异 §5.3）——relay 实际由 app server 直接 import `startLarkEventRelay` 拉起。

## 四、children（命名空间从属，不继承）

两个 child 都是**非单例窗 class**（`parentClass:null`、不继承 agent/root，是纯窗对象），由 feishu_app 的 method 经 construct 实例化；实例在 context 中投影为一个 window。窗信封字段（id/class/title/status/createdAt）由 runtime 管理，业务 data 见各自 types.ts。所有飞书 OAPI 调用经父包 `cli.ts` 的 `larkExec`（唯一通道，鉴权由 lark-cli 自管），写类方法强制 dry-run gate（`confirm:true` 才真发）。

### `_builtin/feishu_app/feishu_chat`（kind=class）

一个飞书群聊 / 单聊作为 context window。construct args = open_chat 同名 args，产 Data（chatId/chatName/chatType/mode="tail"/tailCount/buffer）。object method：
- `refresh`（拉最近 N 条 / 增量；改 buffer，无写副作用）、`search`（本群关键字搜索，临时切 mode=search）、`send`（发新消息，dry-run gate）、`reply`（引用回复，dry-run gate）、`subscribe`（登记周期 refresh 意愿，poller 未集成）、`close`。
- 鉴权：send/reply 默认 `--as bot`，其余 user。投影成行式消息流 window（chat 元信息 + buffer，截断 8192 bytes），无 window method。

### `_builtin/feishu_app/feishu_doc`（kind=class）

一个飞书文档作为 context window。construct args = open_doc 同名 args，产 Data（docToken/docKind/docTitle/content/mode="read"）。object method：
- `read`（拉全文到 content，markdown/blocks）、`search_in_doc`（已 read 内容内查，无副作用）、`append`（末尾追加，dry-run gate）、`patch_block`（改 block，dry-run gate + `expected_version` 防版本漂移）、`share_link`（据 docKind + `.world.json` 的 `larkTenantHost` 派生可分享 URL）、`attach_to_chat`（把 doc 链接发到 chat，dry-run gate）、`close`。
- 鉴权：默认 user（文档读写需用户授权），attach_to_chat 默认 bot。投影成文档 window（doc 元信息 + content.body，截断 12288 bytes），无 window method。

> 飞书 chat/doc 的 per-type knowledge 在父包 `feishu_app/knowledge/{feishu-chat,feishu-doc}.md`（`activates_on: object::feishu_chat / object::feishu_doc`），随框架包被 protocol knowledge loader 收集——children 自身无 knowledge 目录。激活机制由 thinkable·knowledge 维度实现，本文不复述。

## 五、源码现状与差异（设计 vs 实现）

§5.1 **`ooc.class` 自引用**（过渡态 / 应修）：`package.json:17` 写 `"class": "feishu_app"`——实例 stone 的父类声明指向**与自己同名**的 class（`packages/@ooc/builtins/feishu_app/package.json:14-18`）。真正的继承父是 `_builtin/agent`，仅靠 `register-builtins.ts:72` 显式 `register("feishu_app", FeishuAppClass, { parentClass: "_builtin/agent" })` 补上。这是「instance 与 class 同名」的特例：bare id `feishu_app` 既是 registry 里的 class 键（FeishuAppClass，父=agent），又是 bootstrap 建出的 `objects/feishu_app` 实例 id。链能解析（实例 class="feishu_app" → class feishu_app 的 parentClass=agent → root），但 `package.json` 的 `ooc.class` 字段语义被架空——父类真值不在包元信息里、而在代码 register 调用里。对照 object-model「`ooc.class` 是 object 的权威父类」（class/self.md 名词解释），这是字段权威外移的偏离。**应修**方向：让包 `ooc.class="_builtin/agent"`、registry 用 `_builtin/feishu_app` 作 class 键（与其它 builtin 对称，避免裸名 class 键 + 同名实例的特例）。

§5.2 **agent 实例缺 self.md**（应修）：feishu_app `ooc.kind=object` + 继承 agent ⇒ 按 object-model 核心 9 它是 agent 实例、应有 self.md 身份正文。但包内**无 self.md**（仅 `knowledge/{feishu-chat,feishu-doc}.md`）。bootstrap `instantiate-classes.ts:62-67` 读 self.md 失败即落空字符串 → 建出的 `objects/feishu_app` 实例 `self` 为空。后果同 supervisor 曾经的「靠 LLM 即兴演角色」根问题（class/self.md「继承统一收敛到 class」段）：feishu_app 作为可被 talk 的 agent 没有磁盘身份。**应修**：补 feishu_app/self.md（agent-facing 口吻陈述「我是飞书接入点 agent」）。

§5.3 **`Class.init` 未接线**（过渡态）：`ooc-class.ts:37-50` 把 `init:(world)=>err` 定为 World 启动级 class 初始化契约，注释明言「机制（World 启动时遍历调 init）**待实现**」。feishu_app `index.ts:32-39` 实现了 `init`（起 relay），但运行时**不经此契约调用**——app server `index.ts:238` 直接 `import { startLarkEventRelay } from "@ooc/builtins/feishu_app"` 并调用，且 `index.ts:202` 直接调 `maybeForwardToLark` 接 thread-activation notifier。即：relay 的真实拉起是 core 对 feishu_app 的**硬编码 import**，`Class.init` 是平行的、尚未通电的声明。两处还有签名错配：`init` 形参类型 `World{baseDir}`，但 feishu_app 内 `startLarkEventRelay({ baseDir: world.baseDir } as unknown as ServerConfig)` 强转成 ServerConfig（`index.ts:34`）——init 通电前 `World` 句柄需补齐 relay 所需字段（至少 `port` 给反向 fetch）。

§5.4 **注释指向不存在的 `windows/index.ts`**（应修文档）：feishu_app/feishu_chat/feishu_doc 的 `index.ts` 顶注均称注册发生在 `windows/index.ts`（如 `feishu_app/index.ts:9`、`feishu_chat/index.ts:6`），但实际注册在 `packages/@ooc/core/runtime/register-builtins.ts:70-72`（`windows/` 目录已于早前重构解散）。陈旧路径注释，应回流。

§5.5 **root 旧 feishu 方法残留测试**（过渡态，非 feishu_app 自身问题）：飞书接入已迁出 root、收口到 feishu_app 的 `open_chat/open_doc`（`builtins/root/executable/index.ts:8` 注释；root 不再有 `open_feishu_*`）。但 `core/executable/__tests__/commands.test.ts:62-70` 仍断言 `getOpenableMethods()` 含 `open_feishu_chat`/`open_feishu_doc`，且该测试 import 的 `getOpenableMethods` 已不在 `manager.ts` 导出——测试加载即 `SyntaxError`、属已登记的破测试（大重构延后修测试）。与 feishu_app 设计无关，迁移收尾时一并清。

§5.6 **`subscribe` poller 未集成 / 非纯文本消息占位**（已知占位）：feishu_chat `subscribe` 仅登记 `subscribePollIntervalMs` 字段、无周期 refresh（`executable/index.ts:304` 注「poller TBD」）；event-relay `parseEvent` 对 image/file/interactive 等非 text 消息只回占位串（`event-relay/index.ts:259-262`）。功能边界、可接受。

§5.7 **lark relay 路由表内存级 / SDK 无显式 close**（已知边界）：`event-relay` 的 chat→session routing 是 worker 进程内 Map（重启重建，`event-relay/index.ts:40-65`）；stop 函数无法真关 WS（SDK 未暴露 close，靠进程退出，`:134-143`）。单 worker 假设下可接受。

## 六、倒推 ooc core 改进方向

- **接通 `Class.init` World 启动钩子**（severity: high）：feishu_app 是 `Class.init` 契约的唯一用例，却被 core 硬编码 import 绕过。core 应在 World 启动期遍历注册 class 调 `init`、并把 `World` 句柄补齐为 relay 真正所需（baseDir + port + thread-activation 订阅入口），让飞书集成不靠 core 对具体 builtin 的特例 import——否则每加一个需后台通道的 builtin 都要改 app server。
- **消除「裸名 class 键 + 同名实例」特例**（severity: medium）：feishu_app 用 bare id 作 class 键、又自引用 `ooc.class`，破坏了「`_builtin/<id>`=class、bare id=instance」的寻址对称（class/self.md 寻址段）。core 应支持「`ooc.kind=object` + `ooc.class=_builtin/<id>` 的 builtin 实例」这一组合，让 feishu_app 走 `_builtin/feishu_app` 标准 class 键 + 独立实例 id，免去 register 时手填 parentClass 的字段权威外移。
- **agent 实例 self.md 缺失的 fail-loud**（severity: medium）：`ooc.kind=object` 且继承 agent 链却无 self.md 时，bootstrap 静默落空字符串建出无身份 agent。core 应在实例化继承 agent 的 builtin 时校验 self.md 存在（缺则 warn/拒），避免「可被 talk 但无磁盘身份」的 agent 悄然产生。
- **反向通道与 object 运行态的归属**（severity: low）：relay 的连接状态 / routing 表是飞书集成的核心运行态，却落在 event-relay 进程内全局变量、与 feishu_app object data 割裂——object 投影面板只能陈述「relay 由 server 启动」而无法反映真实连接态。core 若提供「object 持有进程级长连接句柄并投影其状态」的承载位，可让接入点 object 的 readable 如实反映 inbound 通道健康，而非靠 console.log 观测。
