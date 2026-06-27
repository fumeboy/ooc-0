---
title: 退役 OocClass.init —— class 级 long-lived service 经单例 + active 钩表达（issue P）
status: verified
date: 2026-06-27
follows: 2026-06-26-stones-single-objects-dir-design-rule.md
---

# 退役 OocClass.init —— class 级 long-lived service 经单例 + active 钩表达

## 背景

用户提问触发了三个串联的 supervisor 思考：

1. 第一轮：「init 方法在热更新时怎么处理」—— survey 揭出 `OocClass.init?` 字段已在 `core/runtime/ooc-class.ts:62` 声明、design doc（feishu_app）描绘了用例（lark event relay 长连接），但**机制零实现**——全树零 caller、register 不调它、世界启动也不调它。是设计 stub。

2. 第二轮：「thread 需要 scheduler，knowledge 也需要常驻 service 扫描 knowledge 文档，对于这种场景，怎么设计比较好」—— 推翻了我之前的 C 方案（"用常驻 agent 模拟"），点出了真正的设计盲点：**两类场景需分**：
   - **runtime infrastructure**（thread scheduler）：由 worker.ts 启动、与 class lifecycle 无关、不是 class 级 service。
   - **class 级 service**（knowledge watcher / lark relay）：与具体 class 逻辑紧密绑定。

3. 第三轮（本 issue 推动）：OOC 现有维度其实已经表达「class 级 service」——**单例 object + active/unactive 钩**：
   - 单例 class = 单例 object（object self.md 核心 3）。
   - 单例对象永生场景下（被 root 持引用），active 即 once-per-process。
   - active 钩内启动 service / 维持 long-lived 资源；unactive 钩拆资源（reflectable 显式 delete 时触发）。
   - **零新机制、零新概念**——OOC 哲学「不重新发明 host language 既有机制 / 不发明新机制」（CLAUDE.md）。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## OOC Class/Object Model` 核心 11 lifecycle——active/unactive per-instance、construct per-instance、无 class-level hook。
- `## thinkable` —— issue N 后 thinkable 仅剩 llm/；scheduler 归 worker.ts。
- `## knowledge_base / knowledge` —— issue N 后 knowledge_base 是单例 builtin、默认挂 root contextWindows。
- `## runtime`、`## extendable`（feishu_app 维度）。

涉及文件：
- `packages/@ooc/core/runtime/ooc-class.ts:38-62`（OocClass.init? 字段声明 + "机制待实现"注释）
- `packages/@ooc/core/runtime/object-registry.ts:205-210`（register 不调 init——确认零实现）
- `.ooc-world-meta/.../object/knowledge/builtins/feishu_app.md`（design doc 描绘 init 用例）
- `.ooc-world-meta/.../object/self.md` 核心 11（lifecycle，加 class 级 service 表达说明）
- `.ooc-world-meta/.../knowledge/index.md` `## OOC Class/Object Model` 节（同步）

## 改动提案

### 改动 1：删 `OocClass.init?` 字段（zero-user stub）

`core/runtime/ooc-class.ts:62`:
```ts
// 删除
init?: (world: World) => string | Promise<string>;
// 同时删 :38-40 关于 init 机制待实现的注释
```

全树 grep 验证零 caller（survey 已确认）。

### 改动 2：object self.md 核心 11 加 class 级 service 表达说明

在核心 11（生命周期）末尾加：

```markdown
**class 级 long-lived service 表达**：OOC 协议层无 class-level
init/teardown 钩——class 想跑 long-lived service（如 fs.watch 守
knowledge md 变更、lark event relay 长连接、连接池等）经**单例 object
+ active 钩**自然表达：单例 class 的 object 在永生场景（被 root 持引
用、永不归零）下，active 钩即 process-level once；service 资源在
active 内启动，unactive 内拆（reflectable 显式 delete 时触发）。

**热更新语义**：class 源码 invalidate 不自动触发 active 重跑——已
active 实例的副作用对热更新**无感**；agent 想替换 service 实例需经
显式 reset（unactive + 重新引用触发新版 active）。这与 reflectable
自迭代的「PR merge → invalidate → 下次 hydrate 新版本生效」链路咬合
——非 service 类逻辑（method 实现）下次 hydrate 即新；service 类逻辑
（active 钩内启动的资源）需显式 reset 才换新版。
```

### 改动 3：runtime infrastructure 与 class 级 service 边界说明

object self.md（或单独 knowledge md，倾向 inline 在核心 11 段后）补一段：

```markdown
**注意区分 runtime infrastructure**：thread scheduler / worker / job
lane 等不是「class 级 service」——它们由 OOC runtime 必须为所有
thread 实例提供（不属于 thread 类自己的声明）、由 worker.ts /
runtime 启动管理。这类 infrastructure 不走 class lifecycle 钩子，
**与本说明无关**。
```

### 改动 4：feishu_app design doc 改述

`.ooc-world-meta/.../object/knowledge/builtins/feishu_app.md`:
- 把「Class.init(world) → 起 lark event relay」改述为「feishu_app.active(self, ctx) → 首次激活时建立 lark client + 启动 event relay」。
- unactive 钩描述（unactive 在永生场景不触发；reflectable 主动 delete 时拆 lark client）。
- 删 `Class.init` 字面 + design doc 内的描述段。

### 改动 5：knowledge_base 是否补 active 钩实现 fs.watch（可选）

issue N 后 knowledge_base 已有 readable 渲染 / activator 等；当前**按需 load**（每次 readable render 时调 loader）—— 是否值得加 active 钩 + fs.watch 维护 in-memory KnowledgeIndex 取代每次 reload？

**留 followup**（不在本 issue scope）。本 issue 只立设计模式、不夹带具体 service 实现。

### 改动 6：index.md `## OOC Class/Object Model` 节同步

加一句：「**class 级 long-lived service** 经单例 + active 钩自然表达——OOC 协议层无 init/teardown 钩（已退役，详 object self.md 核心 11）；这与 runtime infrastructure（scheduler / worker）严格区分」。

### 改动 7：reset_singleton 操作（design-only，留 followup）

**不在本 issue 实施**，但 self.md 段需提及——agent 自迭代场景下「换新版 service」需要 reset_singleton 操作（unactive 旧 + 重新引用触发新 active）。具体 method 由谁实施留 followup issue。

## 受影响设计元素

- `## OOC Class/Object Model`（A 区）—— 核心 11 lifecycle 加 class 级 service 表达说明。
- `## extendable`（如有 / 由 feishu_app 引）—— init 退役。
- `## knowledge_base / knowledge`（E 区）—— 间接受益，service 模式立后可考虑加 active 钩 fs.watch（留 followup）。
- `## runtime`（E 区）—— class lifecycle 与 runtime infrastructure 边界明示。

未受影响：thinkable / readable / executable / persistable / collaborable / reflectable / visible 核心契约。

## 风险与权衡

1. **删 OocClass.init? 零回归**——survey 确认全树零 caller。
2. **active 钩复用为 service 启动入口**：与 issue G（thread refcount + active 派发）协议层一致——active 钩签名已就位，无需扩接口。
3. **热更新「无感」语义对 agent 自迭代的限制**：agent 改 active 钩内的 service 启动逻辑、PR merge 后必须经 reset_singleton 才生效——这是设计层取舍（vs B 方案 invalidate 主动 unactive→active 循环的复杂度）。
4. **reset_singleton 操作设计未落地**：本 issue 只立设计原则，不实施。issue P 落地后真有 agent 想 reset service 时再起 followup。
5. **「单例永生场景下 active=once-per-process」语义**需 self.md 显式说——避免读者误以为 active 是 per-instance 频繁触发。

## 待裁决点

1. **改动 5 knowledge_base fs.watch 是否本 issue 实施**：倾向**不实施**——本 issue 只立设计原则；具体 service 实现按需起 followup。
2. **reset_singleton 操作命名 + 归属维度**：是 reflectable 通道的 method？还是 runtime 提供的 builtin method？**留 followup**。
3. **改动 3 是否单独建 knowledge md**：把 runtime infrastructure 边界说清——是 inline 在 object self.md 核心 11、还是建 runtime/knowledge/class-vs-runtime-service.md？倾向 inline（一段话、不必单建文档）。
4. **`init` 字段是否进迁移映射段**：删字段时是否在 object self.md 迁移映射段加一条记录？倾向加（避免后人重新提案 init）。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 3 视角合审（object-model + extendable + 完整性批评官）。结论：**全部通过 + 6 处表述层修订**。

### object-model 视角

- 删 init?（zero-user stub）+ 单例 active 钩表达 class 级 service **合理**——与核心 10/11 已就位的 active/unactive 钩零冲突，无需新机制。
- 改动 2/3 inline 在核心 11 段末「注意区分」短段陈述、不单独建 knowledge md（避免割裂）；但文字 ~14 行偏长、需精简到 8-10 行（编辑规范第 5 条）。
- **关键补全（修订 1）**：「永生不是单例属性，是『单例被根级 context 静态引用』的组合结果」——避免读者误以为 "class 一标单例 → service 自动跑"。

### extendable 视角（feishu_app 唯一动机用户）

- active 钩表达 lark event relay 启动 OK，但 **ctx 形态需明示**——active 钩内自 `ctx.worldDir` 加载 `.world.json` 取 LarkAppId/Secret，与原 `Class.init(world)` 解析路径同构。**修订 2**。
- feishu_app 单例被 root.contextWindows 持引用 → refcount 永 ≥1、unactive 永不触发 → active 真等价 once-per-process。corner case（未被 root 持引用）语义自洽——「永生由根级引用承诺、非单例属性」。
- 热更新无感对 lark relay 合理取舍——relay 协议稳定、agent 自迭代主要改 chat/doc method，reset 操作 friction 可接受。
- **修订 3**：feishu_app.md L 105-123 程序骨架内 `init: async (world) => { ... }` 块同步改写为 active 钩骨架（不只改设计描述）。

### 完整性批评官视角

- A-E 全清单扫完——`## builtins` 间接波及（builtins.md 可能提 feishu_app.init 用法、grep 确认）；其余元素均不受波及。
- 改动 1-7 间链路自洽——改动 5（knowledge_base fs.watch）留 followup ≠ 不实施、改动 6（index.md 同步）当前 issue 实施，二者不冲突。
- **修订 4**：改动 6 文字「已退役 init/teardown 钩」措辞改正面陈述「OOC 协议层无 class-level init/teardown 钩——class 级 long-lived service 经单例 + active/unactive 钩自然表达」（避免读者困惑"退役什么"）。
- **修订 5**：改动 7 + 待裁决 2 + 风险 4 三处的 `reset_singleton` 改「reset 操作」（去掉蛇形命名暗示，design 层不规约 method 符号）。
- **修订 6**：受影响元素段末加完整性 disclaim「已扫 index.md A-E 全清单」+ 风险 1 增补 grep trace 命令 + 改动 6 末尾 disclaim「具体 service 实现按需起 followup」。

## 裁决

**采纳所有改动 + 6 处表述层修订**。

### 核心裁决

1. **删 `OocClass.init?` 字段**（`core/runtime/ooc-class.ts:62` + `:38-40` 注释）。grep `\.init\s*(` packages/@ooc/core/ packages/@ooc/builtins/ 显示零 caller（survey + 落地实测）。

2. **object self.md 核心 11 末尾 inline 加 class 级 service 表达说明 + runtime infrastructure 边界说明**（精简至 8-10 行）。明文要点：
   - class 级 long-lived service 经单例 + active 钩自然表达。
   - **永生由「单例 + 被根级 context 静态引用」的组合结果**，不是单例属性自动赋予——若 service 类未被根 context 引用、active 不触发、service 不启动。
   - 热更新对已 active 副作用**无感**；agent 自迭代「方法类逻辑下次 hydrate 即新；service 类逻辑（active 内启动的资源）需显式 reset 才换新版」。
   - **注意区分 runtime infrastructure**：thread scheduler / worker / job lane 由 worker.ts 启动管理、不属 class lifecycle、与本说明无关。

3. **feishu_app design doc 改述**（按 reviewer 修订 2+3）：
   - `Class.init(world)` → `feishu_app.active(self, ctx)`——首次激活时建立 lark client + 启动 event relay；active 钩内自 `ctx.worldDir` 加载 `.world.json` 取 LarkAppId/Secret（与原 `Class.init(world)` 解析路径同构、契约从 class 级 World 句柄改为 object 级 active ctx）。
   - 同步删 feishu_app.md L 105-123 内 `init: async (world) => { ... }` 程序骨架 → 改写为 active 钩骨架。
   - 加 unactive 钩描述（永生场景不触发；reflectable 主动 delete 时拆 lark client）。

4. **index.md `## OOC Class/Object Model` 节加一句**（按修订 4 正面陈述）：「**class 级 long-lived service** 经单例 + active/unactive 钩自然表达——OOC 协议层无 class-level init/teardown 钩；这与 runtime infrastructure（scheduler/worker）严格区分（详 object self.md 核心 11）」。末尾 disclaim「具体 service 实现按需起 followup（如 knowledge_base fs.watch）」。

5. **builtins.md 扫一遍**（受影响元素 disclaim 后落地必做）：若曾列 feishu_app.init 用法 → 同步改 active；grep 后无命中则跳过。

6. **不实施 / 留 followup**：
   - knowledge_base fs.watch 服务化（issue P 只立设计模式、不实现）。
   - reset 操作（命名 + 归属维度留 followup；issue 不规约 method 符号）。

7. **迁移映射**：object self.md 末尾「迁移映射（非设计/旧）」段加一条记录：`OocClass.init? 字段（曾埋作 World 启动级 class 初始化、机制零实现）→ 已删除（issue P）——class 级 long-lived service 经单例 + active 钩表达`。避免后人重新提案 init。

### 落地步骤（main 直改、纯文档 + 1 行代码删字段）

1. 删 `core/runtime/ooc-class.ts:62` `init?` 字段 + `:38-40` 相关注释；运行 `bun run check:tsc` 验证零 caller。
2. object self.md 核心 11 末尾加 class 级 service 表达说明（精简 8-10 行）。
3. object self.md 迁移映射段加一条 init 退役记录。
4. feishu_app.md design doc 改写（删 init 块、加 active 钩骨架 + ctx.worldDir 链路明示）。
5. index.md `## OOC Class/Object Model` 节加 class 级 service 表达一句 + runtime infrastructure 边界明示。
6. builtins.md grep + 必要时改写。
7. commit + push（主仓 1 行代码删 + meta 仓多文件文档回流）。

## 落地验收

**verified（2026-06-27）**——主体改动落地清单：

**主仓 1 改动**：
- `core/runtime/ooc-class.ts`: 删 `OocClass.init?` 字段（zero-user stub）+ 相关 JSDoc 注释 + `World` interface（仅供 init 用、零 user）；加入「class 级 long-lived service 经单例 + active 钩」注释块。tsc 干净，125 测试全过。

**meta 仓 4 改动**：
- `object/self.md` 核心 11 末尾 inline 加 class 级 service 表达说明 + runtime infrastructure 边界明示。
- `object/self.md` 迁移映射段加 `OocClass.init? 字段已删除（issue P）` 记录。
- `object/knowledge/builtins/feishu_app.md` 改写（design doc：`init` → `active 钩`；line 3 description + line 27 引述 + line 58-62 详述段 + line 80 骨架注释 + line 104-125 程序骨架全改）。
- `knowledge/index.md` `## OOC Class/Object Model` 节核心 11 末尾加 class 级 service 表达 + runtime infrastructure 边界一句。
- `knowledge/builtins.md` line 35 feishu_app 描述「`init` 起 lark event relay」→「`active` 钩起 lark event relay」。

**退潮验收**：
- grep `\.init\s*(` packages/@ooc/core/ packages/@ooc/builtins/ → **零 caller**（survey 已确认 + 落地实测）。
- meta 仓 `init` 字面残留全部合规——object/self.md 迁移映射段 + feishu_app.md 改写后明示迁移历史 + issue 历史文档。

**质量门**：tsc 干净 / 全量 125 测试 / 0 fail / 363 expect（issue O 后基线保持）。

**Followup（不阻塞 verified）**：
- knowledge_base fs.watch 服务化（按需起 followup）。
- reset 操作（命名 + 归属维度）—— agent 自迭代真切需要换新版 service 时再起 followup。

落地 commits 待 push。
