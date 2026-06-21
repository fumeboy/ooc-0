---
title: OOC 控制面编辑模型 —— 通用 stone-file-edit 原语 + class visible 改 data
status: verified
date: 2026-06-21
---

# OOC 控制面编辑模型重设计

> 承接 issue `2026-06-21-self-md-out-of-core-and-agency-relocation.md` 的 §六后续架构（用户 2026-06-21 articulate）。前一 issue 把 self.md 实现归位时，明确「PUT /self 等端点存废 / 编辑下沉 visible」是独立另案——即本 issue。

## 背景 / 动机

OOC 里「编辑一个 Object」当前是一组**按文件类型硬编码的 HTTP 端点**（self/readable/server-source 各一个 PUT）。两个问题：

1. **源文件编辑是 file-type-specific 端点，而非通用原语**：putSelf/putReadable/putServerSource 三个端点逻辑同构（都经 `runVersioned`→commit），只是写的文件名不同——这是「按类型开端点」的熵增，应塌成一个 **file-agnostic 的 stone 分支文件编辑原语**（"像 GitHub 网页编辑文件并 commit、不关心编辑的是什么文件"）。
2. **没有「class 自实现的 UI 编辑」通路**：OOC 的理想是 Object 持有并演化自身 UI（visible 维度），人类经前端编辑界面 → `callMethod` → `for_ui_access` method 改该 Object 的 **运行时 data**。但当前 HTTP `callMethod` 路径**无法改 data 并持久化**（零先例），class 无法真正自实现「编辑自己」。

这两条是**正交**的：① 编辑 git 版本管理的**源文件**（A1）；② 编辑运行时 **data**（A2）。二者在 **self.md** 处交汇（self.md 既是源文件、又是 agent `data.self` 的序列化）——这是本 issue 的关键待裁决。

## 现状（锚真实代码，main 分支）

**三个版本化源码编辑端点**（逻辑同构，均经 `runVersioned`）：

| 端点 | 路由 | 写文件 | service |
|---|---|---|---|
| putSelf | `PUT /api/stones/:id/self` | `self.md` | `service.ts:246` |
| putReadable | `PUT /api/stones/:id/readable` | `readable.md` | `service.ts:258` |
| putServerSource | `PUT /api/stones/:id/server-source` | `executable/index.ts` | `service.ts:270` |

- `runVersioned`→`httpDirectMainWrite`（`persistable/stone-versioning.ts:493`）：序列化 git 队列 → 写 `stones/main/` 工作树 → `gitCommitAll`（**直 commit main**）→ sync 到 packages。注意：HTTP 编辑是**直 commit main**，非 reflectable 的 feat-branch PR 路径。
- **knowledge 编辑已迁出**：走 `PUT /api/pools/:id/knowledge/files`（pools 不进 git、**非版本化**），旧 `/stones/:id/knowledge/files` 标 deprecated。故"四端点"实为**三个版本化源文件端点 + knowledge（pools/非版本化，另一类）**。

**前端编辑 UI 现状**：self/readable/server-source **三者前端均无编辑界面**（仅 `StoneFallback.tsx` 只读展示 self/readable）；唯一有编辑 UI 的是 knowledge（经 pools 端点 + FileViewer）。

**callMethod 改 data 的能力缺口**（`service.ts:364` callMethod）：
```ts
const ctx = { object: { id, class: objectId }, args };
const self = { dir: dir(objectId) };
return normalizeMethodResult(await entry.exec(ctx, self, args));
```
对比 thinkloop 内 object method（`runtime/window-manager.ts:246` + `window-persistence.ts`）：HTTP callMethod **缺 `reportDataEdit` 注入、缺 method 返回后的 persist 触发、缺 `ctx.thread`/`ctx.runtime`**。所有现有 `for_ui_access` method（thread.say / todo.mark_done / form.refine / process.exec）都在 thinkloop 内跑、都能 `reportDataEdit`——**HTTP 侧改业务 data 并持久化是零先例**。

**self.md 二象性**：agent `persistable.save`（`agent/persistable/index.ts`）= `writeSelf(resolveStoneIdentityRef(...), data.self)`。`resolveStoneIdentityRef`（`stone-worktree.ts:169`）：business session 落 session worktree、**main 上直写文件不经 runVersioned、不 commit**。即 `data.self` 落盘**无版本化承诺**，与 putSelf 的 runVersioned commit 路径**完全分离**。

## 改动提案

### A1 —— 通用 stone-branch-file-edit 原语

把 putSelf/putReadable/putServerSource 三个端点塌成一个 file-agnostic 原语：`PUT /api/stones/:id/file?path=<相对路径>`（或等价），body=content，经 `runVersioned` 写 `stones/main/objects/<id>/<path>` 并 commit。path 经白名单/穿越防护校验（限 stone 目录内）。typed 端点退役（或保留为薄 alias 一段过渡）。

### A2 —— callMethod 支持 for_ui_access method 改 data 并持久化

让 HTTP `callMethod` 路径具备 thinkloop 同等的 data-edit 持久化：load object 当前 data 注入 `self`、注入 `reportDataEdit`、method 返回后触发 `persistable.save`（复用 `saveObjectData` / `object-data.ts` 既有机制）。这样 class 的 visible 编辑界面 = 前端 → callMethod → for_ui_access method 改 data → 持久化，闭环。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## app`（B）—— 控制面端点：三 typed 端点塌为通用 file-edit 原语。
- `## visible`（B）—— class 自实现编辑界面经 callMethod 改 data 的通路（A2 的归宿）。
- `## executable`（B）—— `for_ui_access` object method 改 data：HTTP 侧 data-edit + 持久化触发。
- `## persistable`（B）—— 版本化写（runVersioned 的通用化）；callMethod 的 persist 触发；self.md `data.self` 落盘是否版本化。
- `## readable × visible`（D）—— `for_ui_access` 人机分流：HTTP callMethod 改 data 的契约。
- `## reflectable × persistable`（D）—— HTTP 直 commit main vs reflectable feat-branch PR 的边界（A1 的版本化写与沉淀通道的关系）。
- `## OOC Class/Object Model`（A）—— 核心 7（object method 标 for_ui_access 才可被 visible 请求）、核心 8（持久化可自定义）。
- `## agent`（E）—— self.md 二象性（源文件 vs data.self）。
- `## knowledge_base / knowledge`（E）—— knowledge 编辑已在 pools/非版本化，是否纳入通用原语（还是 pools 编辑自成一类）。

## 风险与权衡

- **self.md 双写路径**：A1（版本化文件编辑）与 A2（data→persistable.save 直写）对 self.md 各自为政——若不统一，同一份 self.md 有两条编辑路径、版本化语义不一致。
- **HTTP 直 commit main**：现有 putX 直 commit main（非 feat-branch PR），与 reflectable「stone 变更走 feat-branch PR」的沉淀纪律存在张力——通用化时要明确人类控制面编辑是否豁免该纪律。
- **callMethod 注入 thread/runtime**：A2 让 HTTP callMethod 具备改 data 能力，但它无 thread context——某些 method 依赖 ctx.thread/runtime，需明确 HTTP 侧能调哪些 for_ui_access method（纯 data-edit vs 需运行时上下文）。
- **path 白名单**：通用 file-edit 原语必须防目录穿越 + 限定可编辑文件集（不可写 package.json/.git 等）。

## 待裁决点

1. **self.md 二象性归哪条路径**：self.md 编辑走 A1（版本化文件）还是 A2（data.self → persistable.save）？若两者都要存在，如何让 persistable.save 也获得版本化 commit（让 A2 的 data 落盘复用 runVersioned），还是接受「源文件编辑版本化 / data 落盘不版本化」二分？
2. **A2 的持久化是否需版本化**：class 改 data（如 todo.status、form.tip）落 state.json 本就不进 git——A2 的 data-edit 是否一律非版本化（区别于 A1 的源文件）？agent 的 data.self 是特例（落 self.md/git）吗？
3. **A1 是否退役 typed 端点**：三 typed 端点直接删（改通用原语）还是保留薄 alias 过渡？前端无编辑 UI，删除阻力小。
4. **HTTP 编辑 vs feat-branch PR**：人类控制面经通用 file-edit 原语直 commit main 是否合理（豁免 reflectable feat-branch 纪律），还是也应走 PR？
5. **knowledge**：已在 pools/非版本化——纳入通用原语（但 pools 不进 git，与"版本化文件编辑"矛盾），还是 knowledge 编辑自成一类不并入？

## review 记录

7 reviewer（app · visible · executable · persistable · agent · knowledge_base · 完整性批评官）fan-out，**5 待裁决点强收敛**：

**#1 self.md 二象性** —— 一致 **A1 only**：
- agent：A1 主、**A2 禁碰 data.self 当"身份编辑"**。关键——`persistable.save` 写的是 **session worktree 副本**（`resolveStoneIdentityRef` business session 落 `flows/<sid>/`），非 canonical main、本就无版本化承诺，这是**对的**（如 git working-tree vs commit）。三条路写三个不同位置：persistable.save→flow 副本(非版本化) / A1→stones main(commit) / reflectable feat-branch→PR——零冲突。
- visible：走 A1。A2 改 data.self 当身份编辑是"语义欺骗"（人类以为版本化了、实际只写 worktree 副本）。
- persistable：接受「A1 版本化 / A2 不版本化」二分，**拒绝让 persistable.save 经 runVersioned**（高频 reportDataEdit 接 git commit 会制造 commit 噪声、绕过 feat-branch 审核闸）。
- executable：版本化是 persistable 关切，method 只 `self.x=v` + reportDataEdit，存储自决。

**#2 data 版本化** —— 一致：A2 data 编辑**一律非版本化**（flow/state.json，如 pools sediment）；版本化只归 A1 或 reflectable PR。

**#3 typed 端点** —— 一致：**直接退役不留 alias**（前端无编辑 UI、backward-compat 约束为零）。A1=`PUT /stones/:id/file?path=`，path 防护三层：`safeKnowledgePath`（NUL/绝对/`..`，service.ts:32）+ 新增**白名单** `[self.md, readable.md, executable/index.ts]`（拒绝默认，禁 package.json/.git/node_modules/types.ts）+ `ensureInside`（service.ts:43）。intent=`http:putFile <id> <path>`。

**#4 直 commit main** —— 一致：**人类控制面 A1 直 commit main = 合理豁免**。`## reflectable × persistable` 铁律主语是 **OOC Agent**（约束 agent 自我迭代须经审核），人类=canonical 主权者、编辑本身即"已评审"（httpDirectMainWrite 注释已有此语义）。

**#5 knowledge** —— 一致：**不并入 A1**。按落点分：seed knowledge（stone/git）→ A1（`?path=knowledge/x.md`）；sediment knowledge（pool/非版本化）→ 独立 `/api/pools/` 端点。A1 只管 stone 版本化文件。

**完整性批评官挖出 3 个漏点：**
- 🔴 **`## filesystem` 漏列**：`filesystem.write_file`（agent 侧，强制 worktree+PR、**拒绝裸写 main**——`builtins/filesystem/children/file/executable/construct.ts:104-108`"控制面写请走 HTTP versioning endpoint"）是 A1（人类侧直 commit main）的**有意分工镜像**。须 doc 锁死：A1=人类特权直写 / write_file=agent worktree+PR / 永不混用。并发写冲突场景（A1 commit main 时 reflectable feat-branch 持同文件改动）issue 未提。
- 🔴 **A2 method 粒度**：非所有 for_ui_access method 可 A2——`thread.say` 依赖 ctx.thread、`form.submit/refine` 依赖 ctx.runtime（HTTP 侧 crash/throw）。需 guard 降级（`ctx.thread?.`）or 新标注 `for_ui_data_edit`。
- 🔴 **flows callMethod 同缺口**：`flows/service.ts:906` callMethod 同样缺 reportDataEdit（且 self 传空 `{}`）。A2 须 stones+flows 两处同修，否则不对称。
- 轻：observable（A1 无观测点/可 emit 事件）；行号偏移（stones callMethod 实 L318 非 364）。

现状 6 条断言经完整性批评官逐条核验**与代码一致**。

## 裁决

**总方向（据强收敛，确认）**：A1 与 A2 是两条正交的编辑通路，按「编辑源文件 vs 编辑 data」「版本化 vs 非版本化」「人类主权直写 vs agent 审核沉淀」三轴分清，**self.md 不二写**。

1. **A1 = 通用 stone 版本化文件编辑原语**：`PUT /stones/:id/file?path=`，三层 path 防护 + 白名单，经 runVersioned 直 commit main。退役 putSelf/putReadable/putServerSource。**只管 stone 版本化文件**（含 seed knowledge）。
2. **A2 = visible 服务端模块（用户 2026-06-21 重定向，取代「for_ui_access 挂 executable object method」）**：
   - `for_ui_access` 从 executable **抽出**——for-ui 方法不再是 executable object method、不再共用 `(ctx, self, args)` 签名（其 ctx 拿不到也不应拿当前 thinkloop thread）。
   - OOC class 的 **visible 维度**除 react UI 组件外，**还实现「给 UI 用的服务端 API」**，约定编程路径 `<ObjectDir>/visible/server/index.ts`，由 `<ObjectDir>/index.ts` 与 executable/readable/persistable **一并注册**。
   - **for-ui server method 的 ctx**：有 **world / session（目标 flow）/ object-self（data）**，**无 current thinkloop thread**。改 object data → 经 persistable.save 持久化（**非版本化**，flow 层）。因是独立目的模块，天然不写依赖 thinkloop thread 的操作——「guard vs 新标注」的复杂度消失。
   - **control 面 callMethod** dispatch 到 visible/server 模块（非 executable for_ui_access），stones+flows 两路同接。
   - **现有迁移面极小**：全 builtins 当前仅 `thread.say` 标 for_ui_access（`session-methods.ts:120`，人类发聊天）。thread.say 是 session 绑定（发给目标 flow 的 thread）——经 ctx 的 **session 信息**解析目标 flow/thread 派送（用「目标 session」而非「current thinkloop thread」），迁为 thread 的 visible/server method。
   - **影响 core 7**：「object method 标 for_ui_access 才可被 visible 请求」→ 改为「visible 模块经 `visible/server/` 提供 UI 服务端 API；人机分流不再靠 executable 上的 for_ui_access 标记」。
3. **self.md = A1 only**：人类编辑身份走 A1；A2 不接管 self.md。`persistable.save` 维持非版本化 worktree 副本（不改）。
4. **#4 豁免确认**：人类 A1 直 commit main；agent 改 stone 仍走 reflectable feat-branch PR。
5. **knowledge 按落点分**：seed→A1 / sediment→/api/pools/（不并入）。
6. **filesystem.write_file vs A1 doc 锁死**：人类特权直写 / agent worktree+PR，互斥不混用。
7. **A2 method 粒度（用户已定，否掉 guard/标注）**：见裁决 2——`for_ui_access` 抽出 executable、归 visible/server 独立模块（ctx 无 thread），问题在架构层消解，不需 guard 也不需新标注。

### 受影响设计元素（A2 重定向后补）
原列 9 项之外，visible/server 架构新增：`## filesystem`（write_file vs A1 分工，完整性批评官补）；executable 的 for_ui_access **退役**（抽出 executable）；visible 新增**服务端 API 模块**职责（`visible/server/`）；OOC Class/Object Model **核心 6/7** 改写（for_ui_access 不再挂 object method）；`## readable × visible` 分流改（不再「共用 window.methods 按 for_ui_access 过滤」，改为 visible/server 独立模块）。

### A2 小范围 review 裁决（2026-06-21）
3 reviewer(visible/collaborable·thread/executable·persistable)+代码实证强收敛，A2 大幅简化：
- **visible/server = 纯 data 编辑、仅 flow scope**；**say 不迁**(collaborable 会话派送、依赖 live thread；前端聊天走 deliverTalkMessage(source=user) 专路、say 的 for_ui_access 是 vestigial、退役零影响)。
- ctx 删 runtime/resolveThreadInSession；契约入 `core/_shared/types/visible-server.ts`(core 无 visible 目录)；直调 persistable.save(非 saveObjectData)；stone scope 延后；连带删 `_shared/types/registry.ts` 的 ui 死 case。
- A2=建机制(无现成 for_ui_access 方法可迁,全树仅 say)+demonstrator(给 todo 加 visible/server 方法验证)。

### 实现进度
- **A1+A2 已合入 main**（commit 42e2c059，A1=PUT /stones/:id/file + A2=visible/server 模块）。worktree/分支已清。CI gate 64/0、零新增红。
- **A1（通用 stone-file-edit 原语）已实现并全绿**（worktree 分支 feat/control-plane-editing-model）：`PUT /stones/:id/file`(body path+content) 取代 putSelf/putReadable/putServerSource；path 白名单 `[self.md, readable.md, executable/index.ts, visible/index.tsx, knowledge/*.md]`；读端点 + knowledge(pools) 保留；前端无写调用方。test:storybook 64/0、零新增红。
- **A2（visible/server 模块）已实现并全绿**：新增 visibleServer 模块机制(契约 `_shared/types/visible-server.ts` ctx=world/session/object-self 无 thread)+registry resolveVisibleServer+dispatch helper(load data→exec→reportDataEdit persistable.save/系统默认 state.json)+flows/stones callMethod 改 dispatch;退役 ObjectMethod.for_ui_access(整删死代码 filterMethodsByVisibility/say 去标记);demonstrator=todo visibleServer(set_content/toggle_done)+TC-VIS-06 验闭环;6 旧 for_ui_access story 迁 visibleServer。say 不迁(人类聊天走 deliverTalkMessage(source=user) 既有专路)。test:storybook 64/0,for_ui_access 0 live 残留,全量零新增红。

### 实现分支
源代码实现在 `.worktree/control-plane-editing-model`（分支 `feat/control-plane-editing-model`，基于 main e7bf9e33）。设计回流已 push ooc-0(4f0539e)。

### 一致性回流清单（落地后）
- `app/self.md` + `index.md ## app`：源文件编辑收口为单一 file-edit 原语 + path 白名单。
- `persistable/self.md` 核心 5：补「reportDataEdit→saveObjectData 始终 flow 内非版本化写，即便 class 落 stone 路径（如 self.md）」；补「人类控制面写(httpDirectMainWrite,版本化) 与 agent data 写(reportDataEdit,非版本化) 两条分离写路径」。
- `index.md ## reflectable × persistable`：主语精确化「人类经 A1 直 commit main 豁免，铁律约束 agent」。
- `agent.md self×persistable`：补「版本化归属三条路」说明（persistable.save=worktree 副本无版本化 / A1=人类 commit / feat-branch PR=agent）。
- **`visible/self.md` + `index.md ## visible`**：新增**服务端 API 模块**职责——visible 除 tsx UI 外，经 `<ObjectDir>/visible/server/index.ts` 实现 for-ui server method（ctx: world/session/object-self，无 thread；改 data→persistable.save）；由 index.ts 一并注册；callMethod dispatch 此处。补 A1(源文件)/A2(data) 前端分工。
- **`executable/self.md` + `index.md ## executable`**：for_ui_access **退役**——人机分流不再靠 executable object method 上的 for_ui_access 标记，移交 visible/server 模块（独立签名、ctx 无 thread）。
- **`object/self.md` 核心 6/7 + `index.md ## OOC Class/Object Model`**：核心 7 改写（visible 经 visible/server 提供 UI 服务端 API，非 for_ui_access 挂 object method）；class 模块集补 visible/server。
- `index.md ## readable × visible`：分流点从「共用 window.methods 按 for_ui_access 过滤」改为「executable=LLM 侧 object method / visible(+visible/server)=人类侧」。
- `index.md`：`## filesystem` 补 A1(人类直写) vs write_file(agent worktree+PR) 互斥分工。
- `## knowledge_base/knowledge`：seed→A1 / sediment→pool 端点 落点切分。
- **builtin md**：`thread` 的 say 从 executable for_ui_access 迁 thread `visible/server`；现存 `for_ui_access` 符号全树退役回流（builtin md + 各 self.md）。


### 后续裁决：stone scope 无 object-program-call（用户 2026-06-21 拍板）
**所有运行时功能由 flow session 承接；不存在、也不该为 stone scope 设计「调 object 自定义程序」的路径**。stone scope = 静态源码（git 版本化身份/程序定义），无 runtime data。故：
- stone scope **无 visible/server data 落点**（A2 v1 仅 flow scope 的悬而未决问题，**裁定为不需要**）。
- stones `/call_method`（对象程序调用）应**移除**——stone client（`visible/index.tsx` 主页）是只读展示，交互（改 data）经 flow scope。
- 前端 ObjectClientRenderer 的 stone-scope callMethod 路径移除；flow client 才调 visible/server method。
