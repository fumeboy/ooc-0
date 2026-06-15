---
title: _builtin/filesystem — agent 持有的文件系统 tool-object（单例），方法造 file / search 窗
description: filesystem 家族单一权威——kind=object 单例 tool-object（无 data / 无 construct）；object method grep/glob/open_file/write_file 委托 runtime.instantiate 造 children file/search 实例；file（非单例 class，open_file/write_file 构造，edit/reload/close + set_viewport/set_range）、search（非单例 class，grep/glob 构造，open_match/close + set_results_window）
activates_on:
  "object::root": "show_description"
---

# _builtin/filesystem

> agent 经组合（HAS-A）持有的**文件系统 tool-object**：把"对文件世界的操作"收成一组连贯 object method，每个方法委托 runtime 造出 file / search 子对象（context window）。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间）见 `class/knowledge/object-model.md`，本文不复述模型。
> **以设计为准**：存量代码部分接线可能过期，分歧记入「五、源码现状与差异」并锚行号。

## 一、是什么（核心职责）

- **`ooc.kind = object`**（`packages/@ooc/builtins/filesystem/package.json:13`）——是一个具体**实例**，不是类定义。
- **继承**：注册时不带 `parentClass`（`register-builtins.ts:59` 无 meta）→ 隐式继承 `root`。**没有名为 `tool-object` 的注册父类**——"tool-object" 是设计角色名（被组合持有、被 exec 而非被 talk 的非-Agent Object），不是继承链上的具名 class。
- **单例 tool-object**：一个 world 一份文件系统，被多个 agent 共同持有；无 `construct`（`index.ts` 只装配 executable / readable）。**无 agency**（不被 talk、不跑 thinkloop）。
- 一句话职责：对文件世界的统一接入面——grep/glob 搜索、open_file/write_file 打开/写文件，结果以 children 对象（search/file 窗）出现在 context。

## 二、data 结构（types.ts）

`Data = {}`（空对象，`types.ts:10`）。filesystem **无业务数据**——只承载身份 + 方法面，所有产物都是它造出的 children 对象。窗信封（id/class/title/status/createdAt）由 runtime 管理，不在 Data。

## 三、能力

### object method（executable，`executable/index.ts`）

四个方法都是**委托类**：自身不改 data、无副作用持久态，经 `ctx.runtime.instantiate(classId, args)` 造出 child 实例，返回提示文本告知 agent 子对象已造出。`ctx.runtime` 缺失则 fail-loud（`requireRuntime`，`executable/index.ts:24`）。

- **`grep`** —— regex 搜内容；`instantiate("_builtin/filesystem/search", {…, mode:"grep"})`，造 search 窗。
- **`glob`** —— glob 通配搜文件名；`instantiate("_builtin/filesystem/search", {…, mode:"glob"})`，造 search 窗。
- **`open_file`** —— 打开文件为只读 file 窗；`instantiate("_builtin/filesystem/file", {path, lines, columns})`。
- **`write_file`** —— 整文件覆盖写；`instantiate("_builtin/filesystem/file", {path, content})`（content 触发 file construct 的 write 分支）。

缺必填参的引导由各 method `schema` 的 `required` + `description` 表达（无 form hook）。**均未标 `for_ui_access`**（不向 UI 暴露）。
> 这四个方法在 root god-object 上有同名重复（过渡态，见「五」）；命令面与 root 方法的关系归 executable 维度 `knowledge/root-methods-and-forms.md`，本文不复述。

### window method（readable）

无自定义 window method。`FilesystemWin = {}`（`readable/index.ts:15`）——filesystem 无展示投影态。

### 投影（readable，`readable/index.ts`）

恒投影成 `class:"filesystem"`，content 为静态身份文本 `"文件系统"`（object method 的 description 已足够丰富，readable 不赘述）；window decl 声明展示 `grep/glob/open_file/write_file` 四个 object method、无 window method。

### visible / persistable / construct

- **visible**：无自定义（filesystem 本体不在控制面单独成页）。
- **persistable**：走系统默认（Data 为空，无可序列化实例态）。
- **construct**：无——单例 class，由唯一规范实例直接寻址、被 agent 组合持有（by-reference 单例），不 instantiate。

## 四、children（命名空间从属，不继承）

children 物理在 `<parent>/children/<child>/`，id 以 parent id 为前缀；**不继承 filesystem**——注册时不带 parentClass（`register-builtins.ts:50,54`）→ 各自隐式继承 `root`（仅命名空间从属，对象模型核心 8）。

### `_builtin/filesystem/file`（kind=class，非单例）

文件窗。`construct`（`children/file/executable/construct.ts:212`）按 args 分两支：带 `content:string` → write_file（写盘 + worktree 版本化重定向），否则 open_file（校验存在 + worktree 读重定向）。产出初始 Data `{path}`（path = 实际读写落点，含 worktree 重定向）；失败 throw（runtime 不建窗）。

- **Data**：`{path:string}`（`children/file/types.ts:10`）。
- **object method**（`children/file/executable/index.ts`）：`reload`（语义提示，render 每轮重读）、`edit`（基于 old→new 精确唯一替换，支持 `edits[]` 批量原子改，复用 construct.ts 的 worktree 落点解析）、`close`（关窗、不删盘文件）。
- **window method**（`children/file/readable/index.ts`）：`set_viewport`（精细调渲染视口 line/column，写 `win.viewport`）、`set_range`（遗留，调 lines/columns 切片）。投影态 `FileWin = {viewport, lines?, columns?}` 与 Data 分离。
- **投影**：node:fs 读 `self.path` → 按 win.viewport 行/列切片 + 可选 lines/columns 二次切片 + 32KB 兜底截断，`class:"file"`。
- **visible**：`children/file/visible/index.tsx`（详情面板，path + lines/columns + 内容视图）、`children/file/visible/diff.tsx`（loop 时间机 unified merge diff）。
- **worktree 版本化重定向**（写落 session/feat 分支 worktree、绝不裸写 main 绕版本化）的设计权威归 **persistable** 维度，本文不复述其落点解析与 events 文案。

### `_builtin/filesystem/search`（kind=class，非单例）

搜索结果窗——把一次 glob/grep 结果以持久 object 留在 context，让 LLM 按 match index 引用而非从裸文本 re-parse。`construct`（`children/search/index.ts:121`）：grep 用 `grep-impl.ts`（优先 rg、回退 JS）、glob 用 `bun.Glob`；排序 + 截断到 200 条 → 返回纯 Data；失败 throw。grep vs glob 由 args 区分（带 path/glob/case_insensitive → grep，否则 glob）。

- **Data**（`children/search/types.ts:16`）：`{kind:"glob"|"grep", query, matches:SearchMatch[], truncated, searchRoot?}`；`SearchMatch = {index, path, line?, snippet?}`。
- **object method**（`children/search/executable/index.ts`）：`open_match`（按 match index 对其路径 `instantiate` 一个 file 窗，grep 命中附 ±40 行上下文）、`close`（关本 search 窗）。
- **window method**（`children/search/readable/index.ts`）：`set_results_window`（调 matches 渲染视口 tail N / 固定区间，写 `win.resultsViewport`；字段 `matches_tail`/`matches_start`/`matches_end` 内部翻译复用 `mergeTranscriptViewport`）。投影态 `SearchWin = {resultsViewport?}`，默认末 50 条。
- **投影**：kind + query + searchRoot + matches（经 results viewport 切片）→ `class:"search"`。
- **visible**：`children/search/visible/index.tsx`（详情面板）、`children/search/visible/diff.tsx`（matches 按 path+line 配对 diff）。

## 五、源码现状与差异（设计 vs 实现）

按 object-model.md 核验，filesystem 家族五件套分层基本符合（types.ts=纯 Data、index.ts 一处 `Class` 装配、executable/readable/visible 物理分离、construct 用 `construct` 而非 `constructor`、children 命名空间从属各自隐式继承 root）。偏离项：

- **【应修】search.open_match 用裸 class id `"file"` instantiate，将抛 constructor-not-found**：`children/search/executable/index.ts:75` 调 `runtime.instantiate("file", …)`。registry 的 `normalizeClassId` 只 strip `_builtin/` 前缀（`object-registry.ts:44-46`），bare `"file"` 解析为键 `"file"`——但 file class 注册键是 `_builtin/filesystem/file` → 归一为 `filesystem/file`（`register-builtins.ts:50`）。两键不同，`resolveConstructor("file")` 链上无命中（`object-registry.ts:163`）→ `instantiate` throw "class 'file' has no constructor registered"（`manager.ts:130`）。filesystem 本体的 open_file/write_file 用的是全 id `_builtin/filesystem/file`（`executable/index.ts:22`），open_match 漏了前缀。应改为 `_builtin/filesystem/file`。
- **【应修】`__tests__/filesystem.test.ts` 全文失效（4/4 fail）**：用已退役的 `builtinRegistry.getObjectDefinition`（registry 无此方法，实测 `TypeError`）、断言已废字段 `intents`/`constructorKind`/`registerExecutable`、`import @ooc/builtins/filesystem/readable.js` 当 callable 找 `about` tag——均 Wave 4 前 API。属退潮未清的死测试，应删除或重写为新契约（`getClass`/`resolveObjectMethod`/`resolveConstructor`）。
- **【应修】children file 的 `file-window-method.test.ts` 同样用退役 API（实测 4/4 fail）**：`children/file/__tests__/file-window-method.test.ts` 用 `getObjectDefinition("file")` + `def.windowMethods`/`def.methods` + `window.state.viewport` + `import …/file/readable.js` callable（`:6,15,32` 等）——均 Wave 4 前形态（现 readable 是 module、投影态在 `win` 非 `state`、查询走 `getClass`）。**仅此一个文件腐烂**，删除或重写。同目录 `file-visible-diff.test.tsx`（7/7 pass）与 `children/search/__tests__/search-visible-diff.test.tsx`（4/4 pass）现仍绿、勿动。
- **【过渡态，可接受】root god-object 与 filesystem 同名方法重复**：root 仍持有 grep/glob/open_file/write_file 同名方法。class self.md「现状」段记此为 deliberate 过渡（移除一步即破约 30 个把工具当 root 方法内联的测试）；功能正确，待组合收敛后移除 root 同名方法。
- **【文档漂移，非本 builtin 源码】executable 维度 `knowledge/root-methods-and-forms.md:17` 仍称 agent 经 `ooc.members` 持有成员**：`ooc.members` 已退役（class self.md：组合改由 thread-as-object 构造时提供初始 context 成员）。本 builtin 源码无 `ooc.members`，是 sibling 维度 doc 未回流；记一条供 supervisor 协调回流。
- **【索引一致】class `self.md:16-17`** 把 filesystem 列为单例 tool-object（成员 by-reference 注入）、file（`open_file` 构造）/ search 列为非单例 class，与源码一致，无需修。

## 六、倒推 ooc core 改进方向

- **runtime.instantiate 的 class id 解析无 children 短名兜底/校验** —— bare `"file"` 既不报"该用全 id"也不在注册期被拦，直到运行时 instantiate 才 throw（且文案是泛化的 constructor-not-found）。core 应：要么 `instantiate` 失败文案提示"是否漏了 `_builtin/<parent>/` 前缀 / 最近匹配的注册键"，要么提供 children 短名在 parent 命名空间内的解析约定，避免每个 child 互造时手抄全 id 易错。severity=high（已是潜在功能 bug）。
- **builtin 包内 `__tests__` 随 registry API 重构静默腐烂、不在 CI gate** —— filesystem 家族两个测试文件（`__tests__/filesystem.test.ts`、`children/file/__tests__/file-window-method.test.ts`）全引用 Wave 4 前 API 仍留在树上（同家族另两个 *visible-diff* 测试仍绿）。core/harness 应把 builtin 包测试纳入 `test:storybook` 之外的常驻 gate（或退役 API 时加 check 扫 builtin `__tests__` 的禁用符号），让退潮强制同步。severity=medium。
- **"单例 tool-object 被组合持有"缺运行时可验证的注册凭证** —— filesystem 是单例 object 却经 `register-builtins.ts` 与非单例 class 同路注册（仅"无 construct"隐式区分单例）。core 缺一个显式标记/校验"此 class 是单例、不可 instantiate、应 by-reference 注入成员"，使单例性可在注册期断言而非靠约定。severity=low。
