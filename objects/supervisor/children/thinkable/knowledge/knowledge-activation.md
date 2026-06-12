---
title: knowledge 激活协议（双源加载 + activates_on trigger）
description: thinkable 如何双源加载知识并按 activates_on trigger 渐进激活，含 object::root always-on 修复
activates_on:
  "object::root": "show_description"
---

# knowledge：双源加载 + trigger 渐进激活

Object 持有的 markdown 知识不是一次全喂——按 `activates_on` trigger 在合适时机渐进激活，控制每轮 context 体积。

## 双源加载（`packages/@ooc/core/thinkable/knowledge/loader.ts:56`）

`loadKnowledgeIndex()` 从两个源加载，并沿祖先 / parentClass 继承链合并：

- **stone seed**：本 Object 的 stone `knowledge/` 目录（设计期写定、进 git；OOC objects 现统一落 `.ooc-world-meta/stones/main`，路径由 persistable 提供，我只读 ref）。
- **pool sediment**：跨 session 沉淀的事实（不进 git）。

继承链合并规则：祖先 seed + parentClass 链 seed + self stone + self pool，子级永远 override 父级（CSS-cascade 语义），运行时 sediment override 设计层 seed。同相对路径冲突时后 set 胜出；仅 sediment↔seed 冲突 console.warn，继承覆盖不 warn（设计正常路径）。祖先的 sediment 默认私有、**不下传**。

### 二维激活 grid：任务进度轴 × 领域层级轴

knowledge 激活实际是二维的：
- **横轴 = 任务进度**（method path / form refinement）—— 由 `activates_on` trigger 表达，执行推进到哪激活到哪。
- **纵轴 = 领域层级**（children 层级的父子嵌套继承）—— 由物理嵌套 + frontmatter `inheritable` 表达。

纵轴解决的问题：一组同领域子 Agent（如 sentry/*）的公共知识无处放——放全局没人加载、放每个子 Agent 又重复 N 份。方案是子 Agent 物理嵌套在 parent 的 `children/` 下（objectId 用 `/` 编码层级，如 `sentry/sentry_event`），parent 的 knowledge 只有显式标 `inheritable: true` 才下传。

**默认安全设计**：缺省 / `false` 都不下传——避免父级 knowledge 误下传膨胀子 Agent context。要跨 Agent 共享某条认知，必须把它从 sediment 提升到 stone seed 并标 inheritable，进 git review。loader 只扫祖先 `stoneKnowledgeDir`、**从不扫祖先 poolKnowledgeDir**——即便 sediment 写了 inheritable 也不下传，这是 loader 路径选择决定的、不是 frontmatter 决定的（sediment 是 Agent 私有运行时认知，跨 Agent 共享有隐私问题）。

## 激活级别（`knowledge/activator.ts:26`）

`computeActivations()` 对每篇知识按当前 thread 求激活级别：

- `show_description`：只露 title + description
- `show_content`：展开正文进 context

多 trigger 命中取 max。

## trigger 语法与求值（`knowledge/activator.expr.ts`）

`activates_on` 是 **trigger map**（2026-05-28 起，取代旧的 path-list 双桶）。`parseTrigger()`（`activator.expr.ts:56`）解析五类表达式为 AST kind：

- `object::<type>` —— 任意 open 的该类 object 出现时命中
- `method::<object_type>::<method>` —— thread 中存在 open 的 method_exec form 且其 parentObject.type 与 method 匹配
- `object_id::<id>` —— 特定 objectId 的 object 出现在 context 中
- `intent::<name>` —— 任一活跃 form 的 intent 集合匹配（支持 `program.*` wildcard 后缀）
- `super` —— `thread.persistence?.sessionId === SUPER_SESSION_ID`

旧格式 `window::<type>` 在 parse 阶段自动归一化为 `object::<type>`（向后兼容，但应优先写新格式）；任何其它形态（`command::`、裸 path 如 `root`/`talk`）一律 throw（fail-loud）。

`evaluateTrigger()`（`activator.expr.ts:176`）是纯函数，输入 trigger + thread 输出 boolean，对应 AST kind 求值。

### object::root always-on（关键修复）

`object::root`（旧写 `window::root`）被文档化为「root window 每个 thread 都有，等价任何时候」。但 root 是 manager 提供的**虚拟隐式父 window**，从不 push 进 `thread.contextWindows`——若按扫窗口匹配 `type==="root"` 的 open window 则**永不命中**，导致沉淀的 memory 永不激活、召回闭环静默断（reflectable harness 发现）。

修复：object case 特判 `trigger.objectType === "root"` → 直接 `return true`（`knowledge/activator.expr.ts:186`，链路注释 :182-:185）。一处特判，不动 parse 路径，坐实契约承诺。

## 出厂身份作废

每轮注入框架序言「你是谁：身份只由 self.md 定义」（`packages/@ooc/builtins/root/knowledge/interaction-core.md`，经 protocol processor 按 `object::root` always-on 激活）——防止 LLM 即兴演角色，身份唯一来源是 self.md。

## 未决：死知识

无 `activates_on` frontmatter 的 pool knowledge 永不自动激活；写错 schema 的 sediment 仅 warn 跳过。靠 LLM 自觉，缺统一写入期闸门 / 巡检。这是 thinkable 当前最高价值的待办。
