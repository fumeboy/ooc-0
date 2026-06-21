---
title: 对象激活生命周期 active/unactive 经引用计数（close→canceled，无独立 destruct）
status: landed
date: 2026-06-21
---

# 对象激活生命周期 active/unactive 经引用计数

> 本 issue 为**追溯记录**：设计经听写敲定 + 4-lens 对抗 review + 实现已合入父仓 main（merge `0e808054`，feat/object-activation-lifecycle 5 commits，门禁全绿）。按新「系统设计调整工作流」补 issue + 驱动 authority 一致性回流。

## 背景 / 动机

thread 的 `close` 旧实现是一处半成品退潮：`close` 既是顶层原语、又在 thread 上注册成同名 object method，两者行为分叉（原语关窗无副作用 / 方法 archive fork 子线程），LLM 走原语会漏副作用，且与「close 是原语非 method」的设计权威矛盾。同时 `contract.ts` 留着一个 dead `destruct?` 槽（"机制待实现"）。

OOP 视角：thread 的 close 本质对应对象析构。但 OOC object 是**持久身份**、不应被"销毁"。用户洞察：**context window 即对 object 的引用；close 移除一个引用；引用计数归零触发可选生命周期钩子**——命名 `unactive`（停用，非 destruct），对称补 `active`。

## 现状（改前设计怎么说的）

- `## OOC Class/Object Model`（index.md A 区）：核心 1-9（class/object、单例、construct、单跳继承、children、agent=object+LLM）。**无生命周期项**。
- `## executable`：tool 原语恒 3 个（exec/close/wait）；close=关窗，无 closable 概念。
- `## thread`（index.md E 区）：横跨 thinkable/collaborable/readable/persistable 四维，**无 close→canceled / active / unactive 的生命周期描述**。
- `contract.ts`：dead `ObjectDestructor` + `OocClass.destruct?` 槽，无派发机制。

## 改动提案（已实现并合入 main）

1. **对象模型新增生命周期核心项**：`construct`（诞生，一次）/ `active`（refcount 0→1）/ `unactive`（refcount 1→0），皆可选、index.ts 的 `Class` 注册。**无独立 destruct**——删除是 `unactive` 返回 `{ delete?: boolean }` 的引用归零自决（delete:true 彻底移除含持久化文件）。复用 dead `destruct?` 槽为 `active?`/`unactive?`。
2. **`ContextWindow` 即引用**：`close` 原语移除一个引用；core `object-lifecycle.ts` 当场算 session(非终态线程内存树)refcount、归零派发该 class `unactive`（fast-path：无钩子零成本）。
3. **construct 可标结构窗不可关**：`OocObjectInstance.closable`，construct 期标 `false`（thread/creator 门面窗），close 原语 honor、拒关报错——取代旧「readable 不 surface close 方法」的弱保护（原语路径补严）。
4. **thread 的 `unactive` = 切新终态 `canceled` + 级联**：fork 子线程被关 fork 窗 → refcount 0 → canceled（同 done/failed 退出 refcount）→ 其窗不再计数 → 孙线程归零 → 级联 canceled；每节点即时 `writeThread` 防 reload 复活。`scheduler.emitChildEndNotifications` 纳入 canceled（唤醒等待父 + 可见）。
5. **退潮**：删 thread `close` 方法 + `archiveForkChild` + readable talk 投影的 `"close"` object_method；退役符号入 FORBIDDEN_PATTERNS。

## 受影响设计元素（对照 index.md `##` 清单）

- `## OOC Class/Object Model`（A）—— 新增生命周期核心项（construct/active/unactive/无 destruct/closable）。**index.md 已加核心 11，但 header 仍写「核心 1-10」、且与 object self.md 编号需对齐（见待裁决）。**
- `## executable`（B）—— close 原语新增 closable 守卫 + 移窗后 unactive 派发；3 原语口径不变（active/unactive 是 class 钩子、非新原语）。
- `## readable`（B）—— 结构窗 closable 表达从「不 surface 方法」改为「instance.closable 数据 + 原语 honor」；thread talk 投影 object_methods 去 close。
- `## persistable`（B）—— canceled 状态随 thread.json 持久化；`{delete:true}` 删 objectDir（自定义 persistable.delete? 推 phase-2）。
- `## thinkable`（B）—— `ThreadStatus` 加 `canceled` 终态；scheduler child-end 通知纳入 canceled。
- `## thread`（E）—— 核心新增：close→canceled 级联停用、active/unactive、结构窗不可关。**E-section 完全无生命周期描述，须回流。**
- `## executable × thinkable`（D）—— close 原语 → object-lifecycle 派发 → thread.unactive；scheduler 终态通知（可能波及）。
- `## reflectable × persistable`（D）—— canceled/{delete} 与 stone/flow 持久化边界（completeness 批评官确认是否波及）。

## 风险与权衡

- **过度机制化**：`active` 派发已实现但**零 builtin 消费者**（thread 无 active body）；`{delete}` 同样无消费者（dormant）；member-object unactive 经 audit 实证**零候选**（terminal/interpreter/file 等资源皆一次性）。基准是"勿造无消费者死机制"——本次按用户明确要求实现 active 机制（免遗忘），但保持 fast-path 零成本 + doc 标注扩展点（init 注入路径待 referencedObjectId 扩 member/peer 时补）。
- **编号漂移**：index.md core 11 vs object self.md 编号需对齐（成对回流防漂移，正是本工作流要管的）。
- **phase-2 连锁**：session 盘扫 refcount / 成员对象 unactive / peer 跨对象 canceled / 自定义 persistable.delete? / thread→done 释放引用（与 context.md core-11「thread 终止钩子」重叠，须合并不另起）——均 dormant，留 backlog。

## 待裁决点

1. **object self.md 与 index.md 的对象模型核心编号对齐**：index.md 列到核心 11（agent=10、lifecycle=11），header 却写「核心 1-10」；object self.md 此前落 lifecycle 为核心 10。裁决统一编号 + 修 header。
2. **`## thread` E-section 回流粒度**：生命周期写多详（行为级"关 fork 窗→子 canceled+级联"足矣 / 还是含 active/unactive/closable 机制词）——倾向行为级（agent-facing voice）、机制词留 object self.md core + executable。
3. **executable/readable/persistable/thinkable 各 self.md 是否需逐一回流**，还是 index.md 节 + object self.md core 已足（completeness 批评官给意见）。

## review 记录

7 reviewer（OOC Class/Object Model · executable · readable · persistable · thinkable · thread）+ 完整性批评官，fan-out 实地核验对象树文档与合入代码（merge `0e808054`）。

- **零真冲突**：生命周期契约（construct/active/unactive/无独立 destruct/{delete?}/closable/canceled）与代码逐项相符（contract.ts UnactiveResult / object-lifecycle.ts dispatch / close.ts:62 closable 守卫 / init.ts closable:false / thread.ts canceled / scheduler.ts emitChildEndNotifications 纳 canceled）。纯文字回流。
- **readable = clean**（职责离场，无旧表述需退潮）；其余 5 元素 needs-reflow。
- **完整性批评官补漏**：① thread 真权威 = `thinkable/knowledge/thread.md`（issue 只点了抽象 ThreadStatus，漏了它；其 status 枚举缺 canceled 是与源码硬漂移）；② doc-drift 门禁 `check-doc-deprecated-drift.sh` 未同步退役符号（source gate 已加，成对缺口）；③④ collaborable / builtins/agent.md 可选低优。
- **驳回过度回流**：reflectable×persistable / executable×thinkable（D 区）/ user/pr/reflect_request 经核确认不波及（unactive v1 仅解析 fork 窗）。

## 裁决

**总判定：无 conflict，回流清单落完 + verify 绿即可标 `landed`。**

### 三待裁决
1. **编号**：index.md A 区下对齐 object self.md 的 10 项制（把「四件套构成 class」从 A 区 item 2 折回 item 1，其后 -1 → children=8/agent=9/生命周期=10；header「核心 1-10」即正确）。**不动 self.md**（它是单一权威，且 builtins.md/agent.md/terminal.md… 7+ cross-ref 与 index.md E 区都按 self.md 编号）。
2. **thread 回流粒度**：`thread.md`（真权威）写**行为级 agent-facing**（canceled 终态 / 关 fork 窗→子 canceled 级联 / 结构窗不可关 / 即时落盘 / 父收 child-end），**机制词不进**；index.md E 区 ## thread 一句交叉指针；机制词唯一落 object self.md 核心 10 + index.md A 区核心 10（已在）。
3. **各 self.md 分级**：executable self.md 回流（close 子项 + closable + unactive 指针）；persistable self.md 回流（{delete} dormant/phase-2 扩展点标注）；readable / thinkable 不回流。

### 一致性回流清单（强制成对，按序）
1. `index.md` A 区 `## OOC Class/Object Model`：item 2 折回 item 1，3-11 → 2-10（地基先做）。
2. `thinkable/knowledge/thread.md` §一：status 枚举补 canceled；close 旁注（关会话窗=撤回引用 / 关 fork 子窗→子线程级联 canceled / 结构窗不可关）；新增核心项「生命周期」（行为级）。
3. `index.md` E 区 `## thread`：补一句生命周期交叉（行为级 + cross-ref A 区核心 10）。
4. `executable/self.md` 核心 close 子项：补 honor closable + 移引用归零触发 unactive（机制一句指核心 10）。
5. `index.md` B 区 `## executable`：close 补「移除引用 + honor closable」+ 显式「active/unactive 是 class 钩子、非新原语，3 原语恒定」。
6. `persistable/self.md`：迁移映射/扩展点段补 {delete} dormant + persistable.delete? phase-2（明标非设计）。
7. `scripts/check-doc-deprecated-drift.sh` FORBIDDEN_PATTERNS：补 `archiveForkChild`/`ObjectDestructor`/`destruct\?:`（**精确，勿宽匹配 close**——terminal/interpreter/plan/file/search 的 close method 非退役对象）。
8. 父仓源码债（本 wave 引入）：`ooc-class.ts` `active?` 槽注释「v1 仅类型槽暂不接派发」已过时（active 本 wave 已接线）——同步改。

可选低优（非阻塞 landed，记 backlog）：index.md `## collaborable` fork 段一句；`builtins/agent.md` thread child 段一句。
旁注既有债（非本工作流，另立）：thread.md §一·3 把 `end` 列为 thread method（实为 agent 级）。

### backlog（dormant，非本次）
`active` 零消费者（fast-path 零成本，按用户要求保留+扩展点 doc 标注）/ `{delete}` dormant / persistable.delete? / session 盘扫 refcount / 成员对象 unactive / peer canceled / thread→done 释放引用（与 context.md core-11「thread 终止钩子」重叠须合并）。
