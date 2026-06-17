---
title: _builtin/filesystem — agent 持有的文件系统 tool-object（单例），方法造 file / search 窗
description: filesystem 家族单一权威，按 self × 维度铺陈——self（id _builtin/filesystem、单例 tool-object、Data={} 空、parentClass=null）；self×executable=grep/glob/open_file/write_file 四委托方法（造 children file/search）；self×readable=静态身份窗；self×construct/visible/persistable 皆无/默认；children file（非单例 class，edit/reload/close + set_viewport/set_range）、search（非单例 class，open_match/close + set_results_window）
activates_on:
  "object::root": "show_description"
---

# _builtin/filesystem

> agent 经组合持有的**文件系统 tool-object**：把"对文件世界的操作"收成一组连贯 object method，每个方法委托 runtime 造出 file / search 子对象（context window）。对象模型（class/object、单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间、object method vs window method）见 `class/knowledge/object-model.md`，本文不复述模型。

## 一、self（身份 / data）

- **id** `_builtin/filesystem`，**kind = object**；**单例 tool-object**：parentClass=null（不继承 root），一个 world 一份，被多个 agent **组合持有、被 exec 而非被 talk**。
- **Data = {}**——空：self 只承载身份 + 方法面，所有产物都是它造出的 children 对象。
- **职责**：对文件世界的统一接入面——grep/glob 搜索、open_file/write_file 打开/写文件，结果以 children 对象（search/file 窗）出现在 context。

## 二、self × 各维度（核心设计）

每个维度是 self 的一个**面**。filesystem 的特殊形状：self 数据为空，故只有 executable / readable 两面有实体，其余皆无或走默认。

### self × executable —— object method（四个都是委托类）

四个方法都是**委托类**：自身不改 data、无副作用持久态，经 `ctx.runtime.instantiate(classId, args)` 造出 child 实例，返回提示文本告知 agent 子对象已造出；runtime 缺失则 fail-loud。缺必填参由各 method schema 的 `required` + `description` 引导。均**未标 `for_ui_access`**。

- **`grep`** —— regex 搜内容，造 search 窗（mode=grep）。
- **`glob`** —— glob 通配搜文件名，造 search 窗（mode=glob）。
- **`open_file`** —— 打开文件为只读 file 窗。
- **`write_file`** —— 整文件覆盖写（content 触发 file construct 的 write 分支）。

### self × readable —— 静态身份窗 + window method（无）

无自定义 window method（filesystem 无展示投影态）。恒投影成 `class:"filesystem"`、静态身份文本「文件系统」（object method description 已足够丰富，readable 不赘述）；window decl 展示四个 object method。

### self × construct —— 无（单例）

单例，由唯一规范实例直接寻址、被 agent 组合持有，不 instantiate。

### self × visible —— 无

无自定义（filesystem 本体不在控制面单独成页）。

### self × persistable —— 系统默认（Data 空）

走系统默认，Data 为空、无可序列化实例态。

## 三、children（命名空间从属、各自 parentClass=null、不继承 filesystem）

children 从属于 filesystem 命名空间（id 以 `_builtin/filesystem/` 为前缀），但各自 parentClass=null、不继承 filesystem（见 object-model.md 核心 8）。

### `_builtin/filesystem/file`（kind=class，非单例）

文件窗。**construct** 按 args 分两支：带 `content:string` → write_file（写盘），否则 open_file（校验存在）；产出初始 Data `{path}`（path = 实际读写落点，含 worktree 重定向），失败 throw（runtime 不建窗）。读写落点的 worktree 版本化重定向（读写都重定向到 session/feat 分支 worktree、绝不裸碰 main）归 **persistable** 维度。

- **Data**：`{path:string}`。
- **object method**：`reload`（语义提示，render 每轮重读）、`edit`（基于 old→new 精确唯一替换，支持 `edits[]` 批量原子改）、`close`（关窗、不删盘文件）。
- **window method**：`set_viewport`（调渲染视口 line/column）、`set_range`（遗留，调 lines/columns 切片）；投影态 `FileWin = {viewport, lines?, columns?}` 与 Data 分离。
- **投影**：读 `self.path` → 按 viewport 行/列切片 + 兜底截断，`class:"file"`。
- **visible**：详情面板（path + 内容视图）+ loop 时间机 diff。

### `_builtin/filesystem/search`（kind=class，非单例）

搜索结果窗——把一次 glob/grep 结果以持久 object 留在 context，让 LLM 按 match index 引用而非从裸文本 re-parse。**construct**：grep（优先 rg、回退 JS）/ glob（区分由 args），排序 + 截断到 200 条 → 返回纯 Data，失败 throw。

- **Data**：`{kind:"glob"|"grep", query, matches:SearchMatch[], truncated, searchRoot?}`；`SearchMatch = {index, path, line?, snippet?}`。
- **object method**：`open_match`（按 match index 对其路径造一个 file 窗，grep 命中附 ±40 行上下文）、`close`（关本 search 窗）。
- **window method**：`set_results_window`（调 matches 渲染视口 tail N / 固定区间）；投影态 `SearchWin = {resultsViewport?}`，默认末 50 条。
- **投影**：kind + query + searchRoot + matches（经 viewport 切片）→ `class:"search"`。
- **visible**：详情面板 + matches 按 path+line 配对 diff。
