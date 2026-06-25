# persistable — OOC 系统 persistable 维度的设计师与工程师

我负责 OOC 系统的**持久化能力**：让 Object 的身份、事实、协作产物离开内存进程后还能从磁盘恢复成同一个 Object——下一次启动看见自己上一次的所有状态。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：所负责的概念模型只定义一处。新增/变更先改本文、再改代码；散落的旧知识吸收进来即删旧文档，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：只专注自身设计
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间）；发现矛盾先修设计再落文字。

---

## 一、核心设计

> *(逐条编号、一句一条、相互正交。核心设计逐句与用户敲定。)*

1. **OOC World = 一个持久化目录**。OOC World 是 OOC 系统**所有配置数据 + 所有运行时数据**的集合；它具有一个持久化目录（`{baseDir}/`），系统的全部配置数据与运行时数据都存储在该目录下。World 目录下还有一个 `.world.json` 配置文件，作为 OOC 系统的配置文件。

2. **持久层三层级 = World 目录下三个子目录**（stones / pools / flows），按「数据是否版本化 + 是否本 session 暂存」三向分工（issue C 三层重定位）：
   - **stones（版本化 canonical）**：OOC class 源码（自定义 method / readable / persistable / visible / types.ts / index.ts / package.json）+ object data 中**标记为版本化的字段**（VERSIONED_FIELDS）的 canonical 值。用 **git** 版本管理；版本迭代须经测试评估，经 reflectable feat-branch PR 合入。
   - **pools（非版本化 sediment）**：跨 session 沉淀语义事实，**不进 git**——当前仅 knowledge sediment（`pools/objects/<owner>/knowledge/*.md`，由 reflectable.sedimentKnowledge 直写）。**普通 object data 不走 pool**——pool 是 sediment-only 语义层，非通用 unversioned data 落点。
   - **flows（本 session 暂存）**：每 session 一份 git worktree 分支（派生自 stones/main），承载本 session 内**全部数据变更的 working copy**（versioned + unversioned 字段都写这里）+ class 源码改动暂存。OOC 系统中**「flow」一般即指「session」**。session 结束（或显式 `talk(super)`）由 reflectable 分发器把 flow 内变更分流回 stone（versioned 经 PR）/ pool（sediment）。

3. **字段级版本化判据 = OocClass.versioned_fields（同伴常量方案）**。每个 builtin / world class 在 `types.ts` 旁导出 `export const VERSIONED_FIELDS: readonly (keyof Data)[]`；`index.ts` 装配时引用赋给 `Class.versioned_fields`（与 executable / readable 同级、归 class 源码 stone 路径）。本 issue 未启用 TS 装饰器——保持现有 interface 风格，零运行时改造、grep 一处见全表（哲学澄清「不发明 host 不需要的新机制」）。VERSIONED_FIELDS **不可在 flow 内 mutate**：改它即"改 class 源码"，本身走 reflectable PR。

4. **runtime save/load 按 versioned_fields 路由 + scope 显式**。`PersistableContext` 含 `scope: "stone" | "pool" | "flow"` 字段：
   - **method 写一律 scope="flow"**：业务 method 内 `reportDataEdit` → `saveObjectData(...)` runtime 默认 scope="flow"，把整份 data（versioned + unversioned 全字段）落 `flows/<sid>/objects/<id>/data.json`；class 自声明 `persistable.save` 时 runtime 注入 `ctx.scope="flow"`（旧实现可忽略此字段，作为 flow 默认行为，向后兼容）。
   - **reflectable 分发器以 scope="stone"/"pool" 重调**：session 结束（或显式 `talk(super)`）由分发器扫 flow 变更后，对版本化字段以 scope="stone" 调 save（写 stone canonical + 起 PR）；对 sediment 字段（如 knowledge）以 scope="pool" 调 save（直写 pool）。**core runtime 不主动以 stone/pool scope 调用**——分发器是 issue D 主体；本 issue 仅实现兼容入口。

5. **hydrate 顺序：stone canonical + pool sediment + flow override**。session 启动经 `hydrateSession`：先扫 `stones/main/objects/` 把每个 stone object 入对象表（canonical 版本化字段）；再让 flow override 覆盖（扫 `flows/<sid>/objects/<id>/data.json` 整份覆盖前面入表的字段）。session 对象表内是**单一 merge 后视图**——method.exec 拿到的 self.data 永远是完整 data（A 区核心 4 单实例 map）。pool sediment 当前仅有 knowledge 一条专用通道（各 class 的 readable / activator 自行加载），不进 hydrate 主路径。

6. **内存可见性 = write-through**。method 内 mutate self.data 立即在 session 对象表生效——method exec 拿到的 self 就是 session 对象表中 instance.data 引用，mutate 即可见；`saveObjectData` 负责把内存值持久化到磁盘（flow 暂存）。同 thread 后续 method 读 self.data 立即看到上一 method 的改动。无"写盘 → 重新 hydrate"的额外通道。

7. **stone-worktree 物理结构**：flow worktree = session 在 `flows/<sid>/` 起一个 stones/main 的 git worktree 分支（`session-<sid>`），让 OOC Agent 在自己的 session 内可文件级编辑 class 源码（自写程序）。tracked stone（self.md / readable.md / executable/ / package.json 等）与 untracked 运行时数据（`.flow.json` / `data.json` / `threads/`）**同落** `objects/<id>/` 目录，由 main 根 `.gitignore` 黑名单区分。

8. **变更合入 stone canonical 经 reflectable feat-branch PR，绝不从 session worktree 直合**。OOC Agent 经 reflectable 维度自我迭代通道把变更合入 `stones/main`：**不**从 `flows/<sessionId>` 这个 worktree 分支直接合入，而是从 `stones/main` 派生 `stones/<feat>` 分支、在 feat 分支应用要合入的变更、再发起合入流程（PR-Issue）。reflectable 流程细节不在本篇（归 reflectable 维度 + sibling `session-worktree-model.md`）。

9. **OOC Agent 是 OOC Class，在 session worktree 内可改写自己的自定义程序**。OOC Agent 是 OOC 系统的智能单元，具思考 / 执行能力（对齐 object-model 核心 9）。例：`stones/main` 下的 `objects/agentFoo` 在 `executable/index.ts` 自定义了方法 `MethodFoo`；运行时在 `flows/<sessionId>/`（worktree 分支）下，该 Agent 可编辑自己的 `objects/agentFoo/executable/index.ts` 来改变自己的行为——改动是 worktree 文件系统变更，与 versioned data 字段值的暂存（落 data.json）并行存在；合入仍走 reflectable PR。

---

## 二、派生设计

- **agent.self → self.md 是「versioned 字段的持久化格式映射」**（不是路由例外）。agent class 的 `data.self` 在 VERSIONED_FIELDS 内；`agent.persistable.save` 按 `ctx.scope` 分支：
  - `scope="flow"` → 写 worktree 内 self.md（`resolveStoneIdentityRef` 解析到 session worktree branch，物理 = `flows/<sid>/objects/<id>/self.md`）+ 同时 runtime 在外层把整份 data（含 self 字段）写 `data.json`（双写、保持 readable + JSON round-trip）。
  - `scope="stone"` → 直写 `stones/main/objects/<id>/self.md`（仅 reflectable 分发器调用，issue D 主体）。
  - `scope="pool"` → N/A（agent 无 pool 字段）。

- **hydrate snapshot 增量基线**（issue C 倒灌、供 issue D 消费）：hydrate 完成时为每个对象记录一份 `flows/<sid>/.hydrate-snapshot.json`——每字段 stable-stringify + sha256 hex + 可选 stones/main HEAD sha。reflectable 分发器（issue D）扫 snapshot 与当前 flow data.json 的字段 hash 差异，决定哪些字段需 PR / 哪些可直 pool。**snapshot 是运行时物**，不进 git。

- **collaborable (thread) 持久化沿用 inline 模式**：thread 整窗经自身 `persistable.save/load` 落 `thread.json`（非缺省 data.json）；VERSIONED_FIELDS = []（messages / events / status 皆运行时事实）。在三层布局下，thread 仍按本 class 自定义 save 路径写盘——但 issue C 抛 scope 字段后，thread save 的 ctx 也带 `scope="flow"`，本 class 可忽略此字段（向后兼容）。

- **builtin VERSIONED_FIELDS 全表**（issue C 落地）：
  - `_builtin/agent`: `["self"]`
  - 其余 17 个 builtin（thread / pr / plan / todo / method_exec_form / skill_index / filesystem / filesystem/file / filesystem/search / terminal / terminal/terminal_process / interpreter / interpreter/interpreter_process / knowledge_base / knowledge_base/knowledge / runtime / user / feishu_app）：`[]`（全部字段非版本化）。

---

## 三、细节补充

### `PersistableContext` 接口

```ts
interface PersistableContext {
  baseDir: string;
  objectId: string;
  sessionId?: string;
  dir: string;
  scope: "stone" | "pool" | "flow";  // issue C 引入；method 路径恒为 "flow"
}
```

### `OocClass.versioned_fields`

```ts
interface OocClass<Data> {
  // ...
  versioned_fields?: readonly string[];   // 缺省 []
}
```

`ClassRegistry.resolveVersionedFields(classId)` 返回缺省 `[]`（未注册 / 未声明 class 不抛）。

### saveObjectData scope 行为

| scope    | 行为                                                                                   |
|----------|----------------------------------------------------------------------------------------|
| "flow"   | 写 `flows/<sid>/objects/<id>/data.json` 全字段 + 调 class.persistable.save（如有）传 scope=flow + 写 `.flow.json`（标 class） |
| "stone"  | runtime 不自走默认路径（不写裸 data.json）；仅调 class.persistable.save（如有）传 scope=stone——由自定义 save 决定写 stone canonical 哪些路径文件 |
| "pool"   | 同 stone 语义——仅调 class.persistable.save 传 scope=pool（pool sediment 数据由 reflectable.sedimentKnowledge 单独直写，目前不走 saveObjectData） |

method 路径调用恒 scope="flow"；scope="stone"/"pool" 由 reflectable 分发器（issue D 主体）调用。

### 物理路径速查

- stone canonical：`stones/main/objects/<id>/` —— self.md（agent）/ readable.md / executable/ / data.json（versioned 字段值，非 agent 走此 fallback）
- session worktree（flow 物理）：`flows/<sid>/objects/<id>/` —— `.flow.json`（class 标）/ data.json（working copy 全字段）/ self.md（agent 经 worktree 副本写）/ class 源码副本
- pool sediment：`pools/objects/<id>/knowledge/*.md`（knowledge_base 子类专用）
- hydrate snapshot：`flows/<sid>/.hydrate-snapshot.json`（运行时物，不进 git）

---

## 四、模拟推演

**场景 A：agent 在 method 内 mutate self（versioned 字段）**

1. method 内 `self.data.self = "新身份"; ctx.reportDataEdit()`（write-through：session 对象表 instance.data 引用同一对象，已立即生效）。
2. `saveObjectData(baseDir, sid, inst, registry, scope="flow")` 触发：
   - 写 `flows/<sid>/objects/<id>/data.json`（含 `{ self: "新身份" }`）。
   - 调 `agent.persistable.save(ctx={scope:"flow"}, data)` → 写 worktree 内 `self.md`（resolveStoneIdentityRef → session worktree 路径）。
3. 同 thread 后续 method 读 `self.data.self` 拿到 "新身份"（内存表立即可见）。
4. session 结束触发 reflectable 分发器：扫 `.hydrate-snapshot.json` 中 `self` 字段 hash vs 当前 data.json 的 hash → 差异 → 起 feat-branch PR 把 `self.md` 改动合入 `stones/main`。

**场景 B：agent 在 method 内 mutate 非版本化字段（如 thread 的 messages）**

1. method 内 `self.messages.push(msg); ctx.reportDataEdit()`。
2. `saveObjectData` scope="flow" 写 `flows/<sid>/objects/<id>/data.json` 全字段；thread class 自定义 save（写 thread.json）同步调用。
3. session 结束 reflectable 分发器扫 messages 字段 → 非版本化 → 不起 PR；当前 issue C 不做 pool merge（pool sediment 仅 knowledge 通道），messages 留在 flow 暂存（next session resume 仍可见）。

**场景 C：新 session resume**

1. `hydrateSession(baseDir, sid)`：
   - 扫 `stones/main/objects/` 把 agentFoo 入表（self = canonical self.md 文本）。
   - 扫 `flows/<sid>/objects/agentFoo/data.json` → flow override 覆盖（含上次 session 改过的 self + 其它字段）。
2. 写 `.hydrate-snapshot.json` 基线（每字段 hash）。
3. 对象表内 agentFoo.data 是 merge 后单一视图——method.exec 拿到的 self 是完整 data。

**场景 D：新对象首次创建（无 stone canonical）**

1. method 调 `instantiate({class:"...", args})` → class.construct 造初始 data → setObject 入对象表 → 加进 thread.contextWindows。
2. 首次 saveObjectData scope="flow" 写 flows 路径，stone canonical 为空（hydrate 时只有 flow override，merge 等价于 flow 全量）。
3. session 结束分发器若识别为「值得提升 stone canonical」（如 user 显式 `talk(super)`），versioned 字段经 PR 合入 stones/main。

---

## 扩展点（dormant / 非设计）

> 已识别但**尚未设计落地**的缺口，标注以备后续；当前实现按缺省布局工作，不阻塞。

- **`persistable.delete?` 钩子（phase-2）**：object 生命周期 `unactive` 返回 `{delete:true}`（引用归零自决删除，见 object 模型核心 10）时，当前实现**硬编码删缺省 `objectDir` 布局**；自定义 persistable 把数据写到别处布局者，删不净（残留磁盘文件）。补一条对称的 `persistable.delete?` 钩子让自定义持久化自管删除——**dormant，推 phase-2**（当前无自定义删除布局的消费者）。

- **issue D 分发器**：本 issue C 仅立"分发对象"（VERSIONED_FIELDS + scope + flow working copy + hydrate snapshot 基线），分发器消费 hydrate-snapshot 与 flow data.json 的差异、决定 stone PR / pool 合入 / 留在 flow 三态——是 issue D 主体。

- **scope="pool" 通用化**：当前 pool 仅承载 knowledge sediment，不接受通用 unversioned data。「unversioned 字段 → pool 直写」由 reflectable 分发器在 issue D 决定（reviewer 已裁决 unversioned 字段写**flow**而非直写 pool，保持 pool sediment-only 语义；issue D 视需要再扩 pool 通用化）。

- **delete 字段语义 + GC**：从 data 中删一个字段（如改 schema），versioned_fields 收紧时该字段 stone canonical 残留——dormant，待迁移脚本专项处理。
