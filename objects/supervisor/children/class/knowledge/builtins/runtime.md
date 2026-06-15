---
title: runtime — 向 agent 提供系统级（对象世界）接口的 tool-object
description: _builtin/runtime 的单一权威定义——kind=class / 继承 root / 单例工具对象（无 construct）；无 data；唯一 object method create_object（建新对象骨架落 session worktree）；无 children
activates_on:
  "object::root": "show_description"
---

# runtime

> `_builtin/runtime` 是 agent **组合持有**的工具对象，向 agent 提供**系统级、对象世界语义**的接口——当前唯一方法 `create_object`（建一个全新 OOC Object 的骨架落 session worktree）。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间）见 class `knowledge/object-model.md`，本文不复述模型。**以设计为准**：存量代码部分接线可能过期，分歧记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **`ooc.kind` = `class`**（`package.json:13`）。**`ooc.class`** 缺省 → 隐式继承 **`_builtin/root`**（`register-builtins.ts:62` 不带 parentClass 选项）。
- **单例工具对象**：`index.ts` 不导出 `construct`（`OocClass` 只装配 `executable` + `readable`，`index.ts:14`），无业务态 —— 一个 world 一份 runtime，**不可被 construct 出多实例**。
- **tool-object（非 Agent）**：被 agent 组合持有、被 **exec**（调它的方法），不被 talk、不跑 thinkloop。区别于 `filesystem`（字节级文件）：runtime 操作的是「对象世界」语义（建对象 / 类链 / 沉淀），是元能力面。
- **一句话职责**：把「agent 操纵对象世界」的系统级原语收口成一个成员窗——当前仅 `create_object`，是后续系统级接口（如对象生命周期、类链操作）的归集点。

> **命名辨析**：本 builtin `_builtin/runtime` ≠ 代码里到处出现的 `ctx.runtime`（后者是 ExecutableContext 上的 **WindowManager 句柄**，负责 instantiate/close 实例信封，与本 builtin 同名但不同物）。

## 二、data 结构（types.ts）

`export interface Data {}`（`types.ts:10`）—— **空**。runtime 是单例工具对象，无业务运行时数据；窗信封字段（id/class/status）由 runtime 句柄（WindowManager）管理、不在 Data 内。

## 三、能力

### object method（executable）

- **`create_object`**（`executable/index.ts:73`，`for_ui_access` 未标 → 仅 LLM 可调）—— scaffold 一个全新 OOC Object 的骨架（`package.json` + `self.md` + `readable.md` [+ `knowledge/`]）落**当前业务 session 的 worktree**。
  - **契约**：从 `ctx.thread.persistence` 取 `{ baseDir, sessionId, objectId(author) }`；缺 thread / 缺 persistence / 非业务 session（super 或空 session）→ fail-loud 返回 `[create_object] …` 文案（不静默）。
  - **args**：`objectId`(必填) / `selfMd`(必填全文) / `readableMd`(必填全文) / `knowledge`(可选 `{filename→content}`)。
  - **副作用边界**：只落 session worktree、**不 commit**；本 session 内当场可用（靠 session-aware 读），main 不变、别 session 读不到。**session 永不合入 main**——进 canonical 走独立 feat-branch PR（成功返回文案显式声明这条边界，`executable/index.ts:69`）。
  - 写盘原语 **由 persistable 维度实现**（`createObjectInSession`，cross-ref persistable `knowledge/stone-pool-flow-three-trees.md` 建对象段 + `session-worktree-model.md` 两条进 canonical 通道）；runtime 只做参数校验 + 委派。executable 侧契约见 executable `knowledge/root-methods-and-forms.md`「成员工具对象」段。

### window method（readable）

无自定义 window method（`readable/index.ts:33` `window_methods: []`）——runtime 无投影态（无 viewport 等展示态，`RuntimeWin` 为空接口 `readable/index.ts:16`）。

### 投影（readable）

固定投影成单一 window class **`runtime`**（`readable/index.ts:21`），渲染一段静态 `<about>` 身份/用途说明文本（系统级接口、create_object 落 session worktree），窗声明展示 `object_methods: ["create_object"]`（`readable/index.ts:31-33`）。无视角分支（无 thread/super 差异）。

### visible / persistable

均无自定义——visible 不提供 UI（无 `visible/index.tsx`）；persistable 走系统默认（`index.ts` 的 `Class` 未装配 persistable）。作为成员窗注入时本就 `transient`、不落盘（cross-ref thinkable·context 成员注入）。

### construct

**无 construct**（单例工具对象）。runtime 不被构造出新实例；作为成员经 agent 组合按 type 串 by-reference 注入（id=class=`runtime`）。

## 四、children

无 children。

## 五、源码现状与差异（设计 vs 实现）

1. **kind 取值在 builtin 间不一致，归属待裁决**。`package.json:13` 写 `kind:"class"`；runtime 与 `knowledge_base`（亦 `kind=class`）、`filesystem`/`interpreter`/`terminal`（`kind=object`）同为「一个 world 一份、被组合持有、无 construct」的单例工具对象，却分两套 kind 取值。**注意此处两套口径冲突**：① 对象模型权威 `object-model.md` 核心 3 + 字段补充称「**单例与非单例皆是 class**，区别只在是否有 constructor；object 一旦自定义自己的函数方法就成为**自身 class 的单例**（`kind=class`，且单例 class 不可被继承）」——按此，runtime 自定义了 create_object，是单例 class，`kind=class` 反而**正确**，反倒是 filesystem 系的 `kind=object` 偏离。② supervisor 索引 `../../../../knowledge/builtins.md:51` 把 filesystem/interpreter/terminal 记为 `object`，并称 runtime/knowledge_base「若后续确认为单例则可改 `kind=object`」——按此倾向单例工具对象统一 `object`。两份权威自相矛盾，**这是 class 维度需拍板的 kind 语义根问题，本文不预设结论**，记入 open question 待 supervisor 与 object-model.md 对齐后统一全树。`kind` 当前不参与 registry 行为（`register-builtins.ts` 不读 package.json kind，靠显式 `register(...)` 调用，`:62`），故无论哪套口径胜出都只是语义正名、不改运行时。

2. **runtime 经组合注入对 agent 实际不可达 —— 设计的 thread-as-object 路径与存量 `ooc.members` 代码两侧都没接通（应修/对账）**。**先纠一处易混淆**：组合的**权威设计**（class `self.md` 组合段）已明示「成员经 **thread-as-object** 构造时作初始 context 提供，**取代旧的 `ooc.members` 静态 class 声明、不再单设字段**」——即 `ooc.members` 是**已退役**机制，不是设计主路。但**存量代码**仍只实现退役路径：`init.ts:294-297` 注释仍按 `ooc.members` 沿 class 链找成员，`readDeclaredMembers`（`init.ts:301`）读 `package.json` 的 `ooc.members`，`injectMemberWindowsIfObjectThread`（`init.ts:328`）据其结果注入；而**全部 builtin `package.json` 均无 `ooc.members`**（`_builtin/agent`/`_builtin/root`/`supervisor` 皆无），thread-as-object 那条新路径又尚未在 `injectMember*` 落地——两侧都断。实测 `readDeclaredMembers` 沿链返回 `[]`，supervisor 不注入任何成员窗；专门验端到端的 `core/executable/__tests__/member-composition.test.ts` 亦全红（0 pass / 3 fail）。**即 runtime（及 filesystem/terminal/interpreter/knowledge_base）当前不会作为成员窗出现在 agent context**，create_object 经组合路径对 agent 不可达。runtime 本体实现（注册/校验/委派）正确，断点在 agent/组合维度——属 thinkable·context / class 组合的接线缺口，非 runtime 问题。需 supervisor 拍板：是把代码迁到设计的 thread-as-object 初始 context 路径（并清退 `ooc.members` 读取与 `init.ts:294-297` 旧注释），还是回退设计、重新启用 `ooc.members`；当前是**设计已改、代码未跟**的过期接线。

3. **`__tests__/runtime.test.ts` 已全红、用废弃 registry API（应修）**。实跑 4 项 0 pass / 4 fail：`builtinRegistry.getObjectDefinition(...)` 不再存在（registry 已改为 `resolveObjectMethod` / `resolveReadable` / `resolveObjectMethods` 等沿类链解析的 API，`object-registry.ts:172`/`:207`），且 `import("@ooc/builtins/runtime/readable.js")`（`runtime.test.ts:25`）路径已失效（readable 现在 `readable/index.ts`）。测试随 registry 重构与 readable 目录化漂移但未更新——是测试维护债，应迁到现行 resolve* API。runtime 实现本体未受影响。

4. **builtins 索引与 persistable 文档残留「create_object = root method」旧称（doc drift，应回流）**。create_object 已从 root 迁到 runtime（`executable/index.ts:6` 注释「从 root 迁来」），但 persistable `knowledge/stone-pool-flow-three-trees.md:29` 仍称「`create_object` root method」。属退役符号文档未回流（与 MEMORY「退役符号要全树文档回流」一致），建议回流改为「runtime.create_object 成员方法」。

5. **runtime 渲染窗 class 名与 builtin id 同名（`runtime`），与 `ctx.runtime` 句柄三处同名，是命名拥挤（低，可接受/择机正名）**。投影 class 串 `"runtime"`（`readable/index.ts:21`）、registry 键 `_builtin/runtime`、句柄 `ctx.runtime` 三者语义不同却共享词根，对读者有歧义；功能正确，记一笔，非阻塞。

## 六、倒推 ooc core 改进方向

1. **`ooc.kind` 取值需有 lint/校验，且模型层先把单例工具对象的 kind 口径定死**：同构的单例工具对象当前分两套（runtime/knowledge_base `class` vs filesystem/interpreter/terminal `object`），且 `object-model.md`（单例即 class）与 supervisor 索引（倾向 object）两份权威互相矛盾、无机制阻止漂移。先由 class 维度在 `object-model.md` 把「自定义 own method 的单例工具对象 kind 取什么」拍死，再让 core 加 boot 校验（kind 与 construct/单例性一致），按定稿口径统一全树。severity: medium。

2. **组合成员注入须 fail-loud / 有 boot 自检，且先把「设计的注入路径」收敛成唯一一条**：成员注入当前两路皆断——设计已切到 thread-as-object 初始 context，但代码仍只走退役的 `ooc.members`、而它全树无一处声明，`readDeclaredMembers` 静默返回 `[]`，runtime/filesystem/terminal 这些「应被持有的工具」对 agent 静默不可达（连专测 `member-composition.test.ts` 都全红）。core 应：先依设计把注入收敛到 thread-as-object 单一路径、清退 `ooc.members` 读取，再加 boot 自检「应被某 agent 持有的工具是否真注入成功」，缺则响亮报警——避免「注册了≠用得上」的闭环断裂（呼应 MEMORY「建对象闭环断裂」create→use 断裂同源）。severity: high。

3. **系统级接口需要一个稳定归集面（runtime 的定位本身）**：create_object 是「对象世界元能力」的第一条，后续对象生命周期 / 类链操作 / 沉淀治理等系统级原语应有明确归属——runtime 作为这一面的成员对象是对的方向，但 core 尚无「系统级接口 vs 字节级工具(filesystem)」的清晰契约边界划分（哪些算 runtime、哪些算 filesystem/persistable），易回流堆叠。建议 core 明确 runtime 成员的能力边界（对象世界语义层），与 filesystem（字节层）、persistable（落盘层）三层分工成文。severity: low。

4. **builtin 包内 `__tests__` 随 core API 重构漂移、不入主 gate**：runtime 的测试用了已删的 `getObjectDefinition`、引了已改目录的 `readable.js`，全红却没拦住任何提交——说明 registry/readable 重构时 builtin 包级测试既未同步、也不在 CI gate 内。core 应把 builtin 包测试纳入统一 gate，并在 registry API 变更时强制扫消费方（呼应 e2e false-positive 的「PASS 不等于真通」经验）。severity: medium。
