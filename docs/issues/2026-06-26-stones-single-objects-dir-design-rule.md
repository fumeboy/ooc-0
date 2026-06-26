---
title: 入 object self.md 核心——stones/<branch>/objects 单目录不分 class/object（issue O）
status: verified
date: 2026-06-26
follows: 2026-06-26-thinkable-knowledge-split-to-builtins.md
---

# 入 object self.md 核心——stones/<branch>/objects 单目录不分 class/object

## 背景

用户提问：「原先设计 固定目录 `stones/<branch>/objects` 和 `/classes` 分别放 ooc object 和 ooc class，但考虑到 children 目录下可以有 class 也可以有 object，再拆这个目录没太大意义」。

**事实核查**（survey）：
- 当前实施层早已倒向单目录——`core/persistable/common.ts.objectDir` 一律 `objects/<id>/`、`persistable.self.md` 核心 7 写「**同落** `objects/<id>/`」。
- `classes/` 字眼仅在 `docs/2026-06-07-*.md` 两个旧 plan（CLAUDE.md 声明逐步删的 `docs/`）里留过提案、**对象树设计权威 self.md / index.md 零提**。
- 但「**为什么不分**」**从未作为设计原则**写进 object/persistable self.md 核心段——读者只能从 path 函数行为反推。

这条裁决属"事实存在但未正式入设计"的灰区，本 issue 把它入设计原则、给后人明示锚点。

## 设计论证

不拆的三层理由（最强→次）：

1. **「class 是定义、object 是实例」的边界由 `ooc.class` binding 表达、不靠目录**：
   - object self.md 核心 1 已确立「class 必有 index.ts + types.ts + five-pack；object instance 不必有 index.ts——无 index.ts 的 object 不是新 class、是父 class 的一个 instance」。
   - 「是 class 还是 object」由**目录内是否有 `index.ts`** 派生——比顶层目录二分更准确。
   - 例：`_builtin/agent/`（class、有 index.ts）+ `supervisor/`（agent 实例、无 index.ts）当前都在 `objects/` 下；若拆 `classes/` vs `objects/`，「supervisor 这种实例但有完整 five-pack」的对象去哪？放 classes/ 不对（不是 class）、放 objects/ 又与 `_builtin/agent` 同根。**单目录无此歧义**。

2. **children 同目录混放天然不分** —— object self.md 核心 8「children id 以 parent id 为前缀（`parent_id/child_id`），仅命名空间从属、不继承」。`_builtin/agent/children/` 既有 class（thread / pr / plan / todo / method_exec_form / skill_index）也有 object（如果有）—— 内层不分、外层分会产生**对象树自洽性割裂**：内 children 单目录、外 stones 二分。

3. **实施一致性 + 历史已倒向**：实施层完整倒向单目录已 1+ 年（survey 验证）；docs/2026-06-07 提案从未被采纳；object/persistable self.md 都按"同落"描述。本 issue 仅作"事实入设计原则"。

## 改动提案

### 改动 1：object self.md 核心 1 / 8 间补一条原则

加入 object self.md 核心设计段（建议位置：核心 1 后或核心 8 后）：

```markdown
N. **stones/<branch>/objects 单目录不分 class/object**——OOC 协议层不
在持久化目录上做 class vs object 二分。「是 class 还是 object」由对象
目录内**是否有 index.ts** 派生（class 必有、object instance 必无；
见核心 1）；二分由 ooc.class binding 表达，不需另起目录树。**理由**：
（a）children 同目录混放天然不分（核心 8）——内层不分、外层分会产
生对象树自洽性割裂；（b）有 five-pack 但无 index.ts 的实例对象（如
supervisor）目录归属在二分方案下歧义；（c）单目录与 children 嵌套
模型对称、path 寻址一致（`objects/<parent_id>/children/<child_id>/`
均匀）。
```

具体编号、措辞由 Supervisor 拍板（建议作核心 11、与现有 10 条核心并列）。

### 改动 2：persistable self.md 核心 3 / 7 措辞精化

当前 persistable self.md 核心段提到 "stones/&lt;branch&gt;/objects/&lt;id&gt;/" 路径但未明示"不拆"原则——加一句指向 object self.md 新核心：

```markdown
- 路径形态 `stones/<branch>/objects/<id>/`，**不再拆 classes/ vs
  objects/**——由 object self.md 核心 N「单目录不分 class/object」
  论证。
```

### 改动 3：index.md `## OOC Class/Object Model` 节同步

在 index.md 该节末加一句指向新核心：「**目录形态：单 `objects/` 子目录、不拆 class vs object**（见 [object self.md 核心 N]）」。

### 改动 4：清理旧 plan docs（顺手）

`docs/2026-06-07-*.md` 两个旧 plan 提到 `classes/` —— CLAUDE.md 已声明 docs/ 旧设计文档逐步删，本 issue 不夹带（属独立 followup）。但可在改动 1 注释或迁移映射段写"docs/2026-06-07 旧提案已不采纳"。

## 受影响设计元素

A 区：
- `## OOC Class/Object Model` —— 加一条核心原则。

B 区：
- `## persistable` —— 措辞指向新原则。

未受影响：所有其它维度 / builtin / runtime / 实施层（零代码改动）。

## 风险与权衡

1. **纯文档改动、零代码**——风险零。
2. **核心条目编号变动**：object self.md 现有 10 条核心、加 N 后变 11 条；按设计稳定性，加在末尾（11）比插入中间（N=2 或 N=9 之类）更稳。
3. **迁移映射保留 vs 退潮**：docs/2026-06-07 旧 plan 系列退役由 docs/ 清理工程统一做，不夹带本 issue。

## 待裁决点

1. **新核心条目编号 + 位置**：建议**末尾追加为核心 11**，与现有 1-10 不打乱。
2. **核心条目命名**：「stones/<branch>/objects 单目录不分 class/object」/「对象目录不拆 class vs object」/ 其它简称？倾向第二种更简洁、第一种更明示路径。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 1 reviewer（object-model）。极高质量反馈、全部采纳。

### review by object-model —— 通过 + 6 处补全

**方向**：合理"事实入设计"——`objects/` 单目录是整个 OOC class/object 模型在 stones 文件系统的唯一物化形态，不写出来会留歧义空间（新读者合理推断"class 与 object 形态不同 → 目录也应分两类"）。同时支撑 reflectable 自举语义。

**编号位置**：**核心 4 插入（不是末尾追加）**——与核心 2（class 必有 five-pack）+ 核心 3（instance 形态）形成「class/instance/物化布局」三段论：
- 2: class 的逻辑形态
- 3: instance 的逻辑形态
- 4: 二者在 stones 上的物理形态——同一 `objects/`、靠 `ooc.class` 区分

原核心 4-10 顺延 5-11。

**命名**：「objects/ 不分 class 与 object，靠 `ooc.class` 字段区分」——**区分机制必须写进标题**（"不分"单说会读成"无法区分"反而焦虑；区分机制是这条原则成立的前提）。

**论证补两点**：
- **reflectable 自举层**（最强论证）：class object 自身能被自己的 reflectable 改写（自写 five-pack）→ class object 必须和 instance object 同形（同目录、同 five-pack 结构）→ 否则"class 改自己"与"instance 改自己"需两套机制、违反"对象自我迭代是一等公民"哲学。**这是模型必然、不只是省事**。
- **退潮反向论证**：若分 `classes/` 与 `objects/` 会带来熵增——双倍扫描路径、reflectable 自写程序需判断"我是 class 还是 instance"再选目录、children 嵌套语法分叉、`talk()` 路由区分目标类型。"不分"不是默认、是主动选择。

**persistable 轻触改法**：核心权威在 object self.md，persistable 不重写"为什么不分"——核心 7 末尾追加一行 link 指引（"此布局的设计依据见 object 核心 4：[link]"），保持权威单一来源。

**6 处影响点补全**：
1. builtins/ 五件套（builtin class 同时是 instance）—— 显式声明"builtins/ 同样遵循 objects/ 单目录原则、与 stones/<branch>/objects 等价"。
2. reflectable 自写程序入口路径（`stones/<branch>/objects/<self>/executable/index.ts`）—— 路径合法性依赖本条规则、显式说明。
3. children 嵌套递归—— "children/<X>/ 等价于一层 objects/<X>/，递归套用本规则"，避免 supervisor children 树（object/persistable/reflectable/...）成为"特例"。
4. 新工作环境认知降坡（CLAUDE.md "关键约束 2"）—— 辅助论证、不强制写。
5. 设计-实施越界自检—— 警惕别把"目录允许放什么文件"下沉进 object self.md（那是 readable/executable/visible/persistable 的实施细节）。
6. 完整性批评官另派—— 本 reviewer 只以 object 模型主人视角答；按 workflow 仍需完整性批评官扫 index.md 全清单。**但本 issue 纯文档轻量、风险零，supervisor 自验**（不另派批评官）。

## 裁决

**采纳全部 + 6 处补全 + 关键编号修正**。

### 核心裁决

1. **object self.md 核心 4 插入**（不是末尾 11），原 4-10 顺延 5-11：

```markdown
4. **`objects/` 不分 class 与 object，靠 `ooc.class` 字段区分**——
   class object 与 instance object 在 stones 文件系统中**同形**：
   均落 `stones/<branch>/objects/<id>/` 目录，复用同一 five-pack 结构；
   二者由对象目录内**是否有 `index.ts`** 派生（class 必有、instance
   必无），运行时由 `ooc.class` binding 表达继承关系。

   **理由**（三层论证）：
   - **reflectable 自举层**：class object 自身能被自己的 reflectable
     改写（自写 five-pack）——这要求 class 与 instance 同形（同目录、
     同五件套），否则"class 改自己"与"instance 改自己"需两套机制、
     违反"对象自我迭代是一等公民"哲学。
   - **children 嵌套自洽**（核心 8）：children 同目录天然不分 class
     /object（如 `_builtin/agent/children/` 既有 class 也有 object）。
     若顶层 `stones/<branch>/` 分 `classes/` vs `objects/`，内层 children
     不分、外层分会产生对象树自洽性割裂。
   - **退潮反向论证**：拆分双目录会带来熵增——双倍扫描路径、reflectable
     自写程序判断"我是 class 还是 instance"再选目录、children 嵌套语法
     分叉、`talk()` 路由区分目标类型。"不分"是主动选择、不是默认。

   **覆盖关系**：
   - `builtins/` 五件套（builtin class 同时作 instance）遵循本规则。
   - `children/<X>/` 等价于一层 `objects/<X>/`，递归套用。
   - reflectable 自写程序入口路径 `stones/<branch>/objects/<self>/executable/index.ts`
     的合法性依赖本条规则。
```

2. **persistable self.md 核心 7 末尾追加一行 link 指引**（不重写论证）：
```markdown
此布局的设计依据见 object self.md 核心 4「objects/ 不分 class 与
object」。
```

3. **index.md `## OOC Class/Object Model` 节**末尾加一句指引：
```
**目录形态**：单 `objects/` 子目录、不拆 class vs object、靠 `ooc.class`
区分（见 [object self.md 核心 4]）。
```

4. **核心编号顺延**：object self.md 原核心 4-10 自动变为 5-11。如有别处 self.md / index.md 引用"object 核心 N"具体编号，落地时同步。

5. **不夹带**：docs/2026-06-07-* 旧 plan 系列退役 → 独立 docs/ 清理工程。

### 落地步骤（main 直改、纯文档）

1. 改 `.ooc-world-meta/stones/main/objects/supervisor/children/object/self.md`：核心 4 插入、原 4-10 顺延 5-11。
2. 改 `.ooc-world-meta/stones/main/objects/supervisor/children/persistable/self.md`：核心 7 末尾追加 link。
3. 改 `.ooc-world-meta/stones/main/objects/supervisor/knowledge/index.md`：`## OOC Class/Object Model` 节末尾加目录形态指引。
4. grep 其它 self.md / index.md 有无引用"object 核心 N"具体编号（如 "见核心 4 投影"等）——若有同步更新到顺延后编号。
5. commit 到 meta 仓 main、不动 packages（零代码）。

## 落地验收

**verified（2026-06-26）**——纯文档零代码、reviewer 5 项裁决全兑现、cross-ref 全树修齐。

- **改动 1**：object self.md 核心 4 插入「`objects/` 不分 class 与 object，靠 `ooc.class` 字段区分」（三段论：reflectable 自举 + children 嵌套自洽 + 退潮反向论证 + 覆盖关系），原核心 4-10 顺延 5-11。
- **改动 2**：persistable self.md 核心 7 末尾追加 link「此布局的设计依据见 object self.md 核心 4」。
- **改动 3**：index.md `## OOC Class/Object Model` 节核心 1-11 同步（新核心 4 加 + 顺延 5-11 + 核心契约表述「核心 1-11」）。
- **改动 4**：cross-ref ripple 修齐——
  - object/self.md 内部「核心 4」/「核心 7」/「核心 9」/「核心 10」自引用顺延（行 24/31/34/82/93/100/104）。
  - knowledge/lifecycle.md 「核心 10 对象生命周期」→ 核心 11；「核心 9 多视角」→ 核心 5 多视角投影（语义更准）。
  - object/knowledge/builtins/{filesystem,terminal}.md「核心 8/9」→ 9/10。
  - knowledge/index.md / knowledge/builtins.md「核心 8/9」→ 9/10。
  - thinkable/knowledge/{knowledge-activation,thread,agent}.md「核心 1-10」→「核心 1-11」（sed 批量）。

零代码改动、零回归风险。落地 commits 待 push。
