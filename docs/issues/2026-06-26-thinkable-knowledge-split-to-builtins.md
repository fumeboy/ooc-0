---
title: thinkable 维度二次拆分——core 产出 intents、knowledge 激活下沉 builtins（issue N）
status: verified
date: 2026-06-26
follows: 2026-06-26-retire-compress-mechanism.md
---

# thinkable 维度二次拆分

## 背景

用户原话：「thinkable 维度再进行干净的拆分，由 core 实现从 contextWindows(OocObjectRefs) 计算出 intents 列表（open 的 method exec form window 持有的 intents 集合），在 ReadableContext 增加 intents 字段，将 core/thinkable/knowledge 的内容都移动到 builtins class 实现内。也就是约定为：core 负责产出意图，ooc class 可以基于这个约定来实现基于意图的知识、记忆激活匹配，而 builtin class knowledge_base 就是实现之一」。

issue H 的 thinkable seam 拆分让 thread/scheduler/thinkloop 归 builtin、core/thinkable 仅留 `llm/` + `knowledge/`。本 issue 再砍一刀——`knowledge/` 也下沉 builtin，core/thinkable 收口为**仅 llm**（"思考接 LLM"的本质）；knowledge 激活变成 **ooc class 自决**的领域机制、builtin `knowledge_base` 是其实现之一。

## 设计意图（按用户原话拆解）

1. **core 产出意图**：core 实现从 `thread.contextWindows: OocObjectRef[]` 扫聚合 intents，方式不破坏 core/builtin 边界（不识别 class id）。
2. **ReadableContext.intents 字段**：core 把意图通过 ctx 注入；所有 readable render 看到 ctx.intents。
3. **knowledge 激活机制下沉 builtins**：parser / activator / Trigger 类型 / ActivationContext / computeActivations 全归 `builtins/knowledge_base/` 内部；core 不感知 knowledge 概念。
4. **ooc class 自决激活**：knowledge_base 是激活机制的一个实现实例；其它 class 可有自己的"基于意图的资源激活"机制（如 memory / tools / etc）。

## 影响面（survey 已 grep）

**核心架构变更**：
- `core/thinkable/knowledge/` 4 个文件整体迁出（parser / activator / activator.expr / index）。
- `core/types/knowledge.ts` 类型整迁出（仅 core/persistable/stone-object.ts:31 一处注释引用，无 live caller）。
- `core/thinkable/` 拆分后**只剩 llm/** 子目录。

**协议层加 2 处**：
- `ReadableContext.intents: readonly string[]` —— 消费端注入。
- `ReadableModule.intents?(self): string[]` —— 供给端槽（class 自决暴露什么 intents）。

**core 加 1 个新文件**：
- `core/readable/intent-scan.ts`：扫 thread.contextWindows、经 `registry.resolveReadable(ref.class).intents?.(inst.data)` 聚合 intents。**core 仅依赖通用 registry + readable 槽、不识别任何 class id**。

**builtins 改造**：
- `builtins/agent/children/method_exec_form/index.ts`：readable 加 `intents: (self) => self.data.currentIntents ?? []`。
- `builtins/knowledge_base/`：承接迁入文件（parser / activator / activator.expr）；knowledge_base.readable.readable 改为内部扫激活 + 输出 `<knowledge>` XML（替代当前在 thread/thinkable/context.ts 内的逻辑）。
- `builtins/agent/children/thread/thinkable/context.ts`：删 `activationEnv()` + `loadKnowledgeIndex + computeActivations + renderKnowledge` 调用链；改为：thread 在 buildLlmInput 时由 core 算 ctx.intents、knowledge XML 渲染交给 knowledge_base class（作为 contextWindows 的一个 builtin window 渲出）。

**测试迁移**：`tests/knowledge-activator.test.ts` 跟随 activator 物理位置移动、import 改路径。

## 改动提案

### 改动 1：core 协议层加 2 处

`core/types/readable.ts`:
```ts
export interface ReadableContext {
  object: { id: string; class: string };
  intents: readonly string[]; // 新增：core 从 contextWindows 聚合
}

export interface ReadableModule<Data, Win> {
  readable: ReadableRender<Data, Win>;
  window: WindowViewDecl<Data, Win>[];
  /** 新增（可选）：class 自决暴露什么 intents 给上下文聚合；core scan 聚合 */
  intents?: (self: ReadonlySelfProxy<Data>) => readonly string[];
}
```

### 改动 2：core 新 `intent-scan.ts`

```ts
// core/readable/intent-scan.ts
export function scanIntents(
  refs: readonly OocObjectRef[],
  registry: ObjectInsRegistry,
  classRegistry: ClassRegistry,
): readonly string[] {
  const out = new Set<string>();
  for (const ref of refs) {
    const readable = classRegistry.resolveReadable(ref.class);
    if (!readable?.intents) continue;
    const inst = registry.getObject(ref.id);
    if (!inst) continue;
    const self = makeReadonlySelfProxy(inst.data as object);
    for (const i of readable.intents(self)) out.add(i);
  }
  return [...out];
}
```

### 改动 3：render-context.ts 构造 ctx 时注入 intents

`core/readable/render-context.ts:75` 调用方传 ctx 时附 `intents: pre-scanned`（thread.thinkable 在 buildLlmInput 之前算一次、传给所有 ref render）。

### 改动 4：迁出 core/thinkable/knowledge 整套

- `parser.ts` → `builtins/knowledge_base/activator/parser.ts`。
- `activator.ts` + `activator.expr.ts` → `builtins/knowledge_base/activator/` 同目录。
- `core/types/knowledge.ts` 全部类型 → `builtins/knowledge_base/types/knowledge.ts`（或 inline `types.ts` 内）。
- 删 `core/thinkable/knowledge/index.ts`（barrel）。
- `core/persistable/stone-object.ts:31` 注释清——若仅注释提及，改注释。

### 改动 5：method_exec_form 加 `intents` 供给槽

`builtins/agent/children/method_exec_form/index.ts`:
```ts
const readable: ReadableModule<Data, Win> = {
  readable: ...,
  window: [...],
  intents: (self) => self.data.currentIntents ?? [],
};
```

### 改动 6：thread/thinkable/context.ts 改造

- 删 `activationEnv()` 全函数（约 36 行）。
- 删 `loadKnowledgeIndex` / `computeActivations` / `renderKnowledge` 调用链。
- buildLlmInput 改为：
  - 调 `scanIntents(thread.contextWindows, registry, classRegistry)` 拿 intents。
  - 构造每个 ref 的 ctx 时附 intents。
  - knowledge XML 不再由 thread 内联渲——knowledge_base 自己作为 contextWindows 内的 builtin window 渲出（见改动 7）。

### 改动 7：knowledge_base.readable 承担激活+渲染

`builtins/knowledge_base/readable/index.ts`:
- readable.readable 内部从 ctx.intents（消费）+ self.data 内的 knowledge index 算激活。
- 触发协议 4 kind（window / method / intent / super）的具体实现归 builtin 自决；用户原话「ooc class 可基于这个约定实现激活匹配」——knowledge_base 是实现之一、保留 4 kind trigger 是其内部细节。
- 输出 `<knowledge>` XML 段，由 thread/context.ts 自包 `<window>` 壳（与其它 ref 同形）。

### 改动 8：windowViews / methodForms / inSuper 三 trigger 归宿

**待裁决（survey 推荐方案）**：
- 选项 (i)：**全部归 knowledge_base 内部自决**——knowledge_base 自己从 contextWindows 计算（需要 ctx 额外暴露 `contextWindows` 或 thread 经 caller 传入）。
- 选项 (ii)：**激活协议简化为单一 intent 维度**——退役 window/method/super trigger，all-in-intent。这跟用户「基于意图的激活匹配」一致。
- 选项 (iii)：保留 4 kind、windowViews/methodForms/inSuper 通过新 ctx 字段传入（如 ReadableContext.windows 等）—— 但污染 core ctx。

**倾向 (ii) 全 intent 化**——用户原话明确 "基于意图的知识、记忆激活匹配"；4 kind 中 window/method/super 都可建模为 intent（thread 在 super flow 产 `super` intent；form 持 `intent::xxx` 已是 intent；window decl 经声明产 `window::xxx` intent）。

### 改动 9：tests 迁移

- `tests/knowledge-activator.test.ts` 整文件移到 `builtins/knowledge_base/__tests__/activator.test.ts` 或保留在 packages/@ooc/tests/ 但 import 路径改。
- 现有 ActivationContext / Trigger / parser 测试不动语义、仅改 import。

### 改动 10：文档回流

- `thinkable/self.md`：删 knowledge 相关段（核心 + 细节）；只留 llm 子模块描述。
- `index.md` `## thinkable` 节同步——thinkable 维度收口为"LLM 客户端" + ThinkableModule 协议；激活机制完全归 builtin。
- `builtins/knowledge_base/` 内补一个 README 或 self.md 描述「激活机制实现」。
- `executable × thinkable` 跨维度节：`intent::` trigger 描述移到 knowledge_base 实现文档。

## 受影响设计元素

- `## thinkable`（B 区）—— 维度内核再收口、knowledge 整迁。
- `## readable`（B 区）—— ReadableContext + ReadableModule 协议扩字段。
- `## executable × thinkable`（D 区）—— intent 流向（method form → core scan → ctx → class 激活）。
- `## method_exec_form`（E 区）—— readable.intents 供给槽兑现。
- `## knowledge_base / knowledge`（E 区）—— 承接激活机制 ownership。
- `## thread`（E 区）—— thinkable/context.ts 大改、knowledge 渲染外包。
- `## runtime`（E 区）—— ClassRegistry.resolveReadable 加 intents 调用面。

未受影响：persistable / collaborable / reflectable / visible / observable / app 核心契约。

## 风险与权衡

1. **激活协议简化为单一 intent 维度（改动 8 选 ii）** 是设计层选边——需 reviewer 拍板。当前 4 kind（window/method/intent/super）建模能力是否真有 intent 不能替代的场景？例：
   - `window::<class>` 描述「某窗口存在时激活」——在 intent 化下，class 可在自己 readable.intents 内产 `present::<class>` intent。
   - `method::<X>::<Y>` 描述「某 form 调某 guide 时激活」——已经是 intent 概念（form 持 currentIntents）。
   - `super` —— thread 在 super flow self.data.sessionId === SUPER 时 readable.intents 产 `super` intent。
   全部可建模、协议简化成立。
2. **knowledge_base 内部 trigger 协议**：用户原话「knowledge_base 是实现之一」—— knowledge_base 自有 trigger 形态，未来其它 class 可有不同 trigger。OK。
3. **core 不识别 class id 边界**：方案 b（ReadableModule.intents 供给槽 + scanIntents 经 registry 聚合）—— 核心守住。
4. **数据迁移**：knowledge md 文件本身在 `stones/<owner>/knowledge/*.md`、`pools/<owner>/knowledge/*.md`——loader.ts 路径不变。激活逻辑搬家不影响 knowledge 数据。
5. **核心瘦身效果**：core/thinkable 仅剩 llm/、core 退潮 1 目录 + 4 文件 + 1 个类型文件——显著收口。
6. **knowledge_base readable 渲染面变大**：要承担 knowledge XML 渲染（之前在 thread/context.ts 内联）——属合理职责归属（knowledge 内容渲归 knowledge_base 自己）。
7. **测试迁移成本**：knowledge-activator.test.ts 全文件迁、import 改路径，零业务变化。

## 待裁决点

1. **改动 8 三 trigger 归宿**：方案 (ii) 全 intent 化 vs (iii) ctx 多字段 vs (i) ctx.contextWindows 全暴露。倾向 (ii)。
2. **knowledge 激活迁出后**，knowledge_base.readable.readable 渲染**整 `<knowledge>` XML 段** vs **多个 knowledge ref 各自渲一段**：survey 说 knowledge_base 是 tool-object class、其 children/knowledge 是 knowledge item class——可能每条 knowledge 一个 ref、各自 render。倾向**knowledge_base parent 一次渲整段**（保持当前 thread/context 内联 `<knowledge>` 形态、不破坏 LLM 看到的 prompt 形状）。
3. **scanIntents 性能**：每轮 thinkloop 跑一次扫 contextWindows 调每个 class.readable.intents——一般 thread context 10-20 个 ref、其中只有 method_exec_form 有 intents 实现、其它 readable.intents 缺省 undefined 快返。可接受。
4. **ReadableContext.intents 是否 required 而非 optional**：required `readonly string[]`（缺省空数组）—— 所有调用方必须显式构造、不允许漏。
5. **测试位置**：tests/knowledge-activator.test.ts 移 builtins/knowledge_base/__tests__/ 内 vs 留在 tests/ 改 import？OOC 项目 tests 集中在 `packages/@ooc/tests/`——保持现位、只改 import。

## review 记录

按 design-workflow 步骤 2 fan-out 1 reviewer（thinkable + readable + knowledge_base 合审）。极高质量反馈、全部采纳 + 8 处漏点补全。

### review by thinkable / readable / knowledge_base —— 强烈支持方向 b + 方案 (ii)

**核心结论**：
- **方向 b 完全对齐用户原话**：「core 负责产出意图」=「core 做 traversal + aggregation + deduplication（协议层职责），class 做语义声明（readable.intents() 暴露）」。symmetric with readable.readable / readable.window 现有槽位职责——core 协调、class 自决。
- **方案 (ii) 全 intent 化强烈推荐**：协议干净度最高、与用户「基于意图的激活匹配」直接对齐、三 trigger 简化为单一语义空间；方案 (iii) ctx 多字段毫无收益、方案 (i) ctx 暴露 contextWindows 反向污染严重直接否决。
- **windowViews 命名漂移随本 issue 退潮**——issue J 漏债（`windowViews` 仍按"window classes"语义命名）顺手清，纳入本次范围合适。
- **knowledge_base 渲染走 contextWindows window 通道更对**——之前 `<knowledge>` 在顶层 system 段是 thinkable 维度越权直渲、违反"knowledge 是 knowledge_base readable 表现、走 window 通道"维度纯净。

**5 项具体裁决（reviewer 立场）**：

1. **scanIntents 归 thinkable**：scan 行为为 thinkloop 的 LLM input 构造服务（不是为 readable）；位置 `core/thinkable/context/scanIntents.ts`（或 thinkable 子模块）。
2. **intent 命名 `intent::<category>::<detail>` 三段式**：`category` ∈ `class | form_open | super_flow | user | ...`；便于 kb md frontmatter 前缀匹配（`intent::*::file*`）。
3. **ReadableContext.intents 类型 `Set<string>`**（非 array）——语义是去重集合、避免调用方再去重。
4. **knowledge_base 默认入 root ref**：builtin agent 模板默认挂一个 kb ref；否则迁移后所有 agent 默认丢失 knowledge —— **悄无声息的回归**。
5. **knowledge 渲染失败 fallback 完全无段**（不 core 兜底渲空段）：OOC 哲学一致「对象不在则其表现不在」、不要 core 隐式补偿。

**8 项漏点（落地必做）**：

1. **knowledge_base 入 root ref 归宿**：issue 须显式裁决何时何处默认挂载，否则迁移悄无声息回归（裁决 4）。
2. **现有 knowledge md 迁移清单（blocker）**：必须先 grep `activates_on` 实际格式 → 写迁移脚本 / 人工逐文件 diff：
   ```bash
   grep -rE 'activates_on|window::|method::|super::' \
     packages/@ooc/builtins/agent/knowledge/ \
     packages/@ooc/builtins/*/knowledge/
   ```
   - 现有 `window::<class>` → 改 `intent::class::<class>`
   - 现有 `method::<class>::<method>` → 改 `intent::form_open::<class>::<method>`
   - 现有 `super::active` → 改 `intent::super_flow::active`
3. **reflectable scan_changes / 其它 LLM input 假设**：查 `core/thinkable/reflectable/` + `core/persistable/stone-*` 是否有正则锚 `<knowledge>` 在顶层段——迁入 contextWindows 后该锚失效。
4. **observable 对 knowledge 激活旁路观测**：埋点位置从 thread/context.ts 内联迁到 kb readable.readable——LlmObservation 若单独捕获过"本轮激活了哪些 knowledge"，要同步迁移。
5. **method_exec_form intent 在 form close 后消失**：readable.intents 是 **stateless 投影、每轮 thinkloop 重算**——不缓存，form close 后自然消失。issue 明示。
6. **多 form 同时 open + 多 ref 同 class**：scanIntents 用 Set 去重，但 `intent::form_open::file::write` + `intent::form_open::file::read` 是两条独立 intent —— 用例段举例防误解。
7. **intent 命名空间用户开放性**：约定 `intent::user::*` 用户自定义；builtin 走 `intent::class::* / intent::form_open::* / intent::super_flow::*` 三类。
8. **storybook 断言改造**：grep `packages/@ooc/storybook/` ——已确认目录不存在（issue L survey），无 storybook 改造负担。

## 裁决

**采纳全部 + reviewer 5 项裁决 + 8 项漏点补全**。

### 核心裁决（13 项）

1. **方向 b + 方案 (ii) 全 intent 化**：
   - `ReadableContext.intents: Set<string>` 消费端（reviewer 立场 3：Set 而非 array）。
   - `ReadableModule.intents?(self: ReadonlySelfProxy<Data>): readonly string[]` 供给端槽（class 自决暴露）。

2. **`core/thinkable/context/scanIntents.ts`**（reviewer 立场 1：归 thinkable 而非 readable）：
   ```ts
   export function scanIntents(refs, registry, classRegistry): Set<string>;
   ```
   遍历 contextWindows → 经 `resolveReadable(ref.class).intents?.(self)` 聚合 Set。core 仅依赖通用 registry + readable 槽、不识别任何 class id。

3. **`core/thinkable/knowledge/` 4 文件 + `core/types/knowledge.ts` 整体迁出**到 `builtins/knowledge_base/activator/`（或 inline 在 builtins/knowledge_base/ 子目录）。

4. **knowledge_base.readable.readable 承担 `<knowledge>` 渲染**：作为 contextWindows 内普通 builtin window，self.data 含 knowledge index、ctx.intents 算激活、输出 `<knowledge>` 子节点。XML 形状从顶层 `<knowledge>` 段变为 `<window class="knowledge_base"><knowledge>...</knowledge></window>`——LLM prompt 形状变化，由 system instructions 引导（"窗内 `<knowledge>` 子节点是激活的知识"）。

5. **trigger 协议简化为单一 intent 维度**（方案 ii）：
   - kb md frontmatter 改 `activates_on` 单 intent trigger（`intent::class::<class>` / `intent::form_open::<class>::<method>` / `intent::super_flow::active` / `intent::user::*` 等）。
   - 退役 `window::` / `method::` / `super::` 三 kind；activator.expr.ts 内部 Trigger 联合类型简化为单 `IntentTrigger`。

6. **intent 命名 `intent::<category>::<detail>` 三段式**：
   - `class::<class>` —— root window readable.intents 产出（每条 contextWindows ref 一个）。
   - `form_open::<targetClass>::<guideName>` —— method_exec_form.readable.intents 产出。
   - `super_flow::active` —— super flow 内 thread / supervisor readable.intents 产出。
   - `user::*` —— 用户 ooc class 自定义命名空间。

7. **method_exec_form.readable 加 `intents` 供给槽**：
   ```ts
   intents: (self) => [`intent::form_open::${self.data.targetClass}::${self.data.guideName}`,
                       ...self.data.currentIntents.map(i => `intent::user::${i}`)],
   ```

8. **knowledge_base 默认入 root ref（reviewer 立场 4 + 漏点 1）**：
   - builtin agent 模板 / supervisor.construct 内默认挂一个 `_builtin/knowledge_base` ref 进 root contextWindows。
   - 否则迁移悄无声息回归——这是必须裁决。

9. **windowViews 命名漂移退潮**：删 ActivationContext.windowViews 字段、windowClasses 残余字面值；统一 `intent::class::*` 命名空间。

10. **现有 knowledge md 迁移清单**（漏点 2 blocker）：
    - 落地前 grep 全树 `activates_on` 实际格式。
    - 迁移脚本：window:: → intent::class::、method::X::Y → intent::form_open::X::Y、super:: → intent::super_flow::。
    - 现有 builtins/agent/knowledge/*.md 全部按脚本改写。

11. **readable.intents stateless 投影**：每轮 thinkloop 重算、不缓存、form close 自然消失。文档明示。

12. **reflectable / observable / persistable 影响排查**（漏点 3 + 4）：落地前 grep 是否有正则锚 `<knowledge>` 顶层段假设；observable LlmObservation 若埋点 knowledge 激活、同步迁。

13. **knowledge 渲染失败 fallback 完全无段**（reviewer 立场 5）：kb 不在 ref 集时整段消失、不 core 兜底——OOC 哲学一致。

### 落地步骤（worktree `.worktree/thinkable-knowledge-split`）

1. core 协议层加 2 处（ReadableContext.intents + ReadableModule.intents?）。
2. core 新文件 `core/thinkable/context/scanIntents.ts`。
3. 迁出 core/thinkable/knowledge/ 4 文件 + core/types/knowledge.ts → builtins/knowledge_base/activator/。
4. 简化 Trigger 类型（删 window/method/super、留 intent）。
5. method_exec_form readable 加 intents 供给槽。
6. **现有 knowledge md grep + 迁移脚本**（落地前必做）。
7. knowledge_base.readable.readable 承担激活+渲染。
8. thread/thinkable/context.ts 改造：删 activationEnv、调用 scanIntents 算 ctx.intents 注入。
9. builtin agent 模板默认挂 kb ref（裁决 8）。
10. reflectable / observable 假设排查。
11. tests/knowledge-activator.test.ts 跟随迁移、import 改路径。
12. 文档回流：thinkable/self.md（删 knowledge 段）、knowledge_base 内新增 README 或 self.md 描述激活机制、index.md `## thinkable` 节同步。
13. 质量门：tsc + 全量 tests 绿。

### 不夹带

- `## thinkable` 维度其它进一步拆分（如 thinkloop 完全归 thread builtin、core/thinkable 整退役）——未来视需要另起。
- knowledge 数据模型重构（KnowledgeIndex / KnowledgeDoc 结构）——本 issue 只迁位置不动数据形态。

## 落地验收

**verified（2026-06-26）**——独立 verification reviewer 核 13 项裁决全兑现。

**13 项裁决兑现度全 ✅**：
- core 协议层 ReadableContext.intents (Set<string>) + ReadableModule.intents?(self, ref) 二参签名扩。
- core/thinkable/context/scanIntents.ts 新增（thinkable 归属、core 经 readable 槽聚合不识别 class id）。
- core/thinkable/knowledge/ + core/types/knowledge.ts 整删；builtins/knowledge_base/activator/ 5 文件齐。
- Trigger 简化为单 intent kind；parser 仅认 `intent::` 前缀。
- intent 三段式命名 `class::* / form_open::* / super_flow::* / user::*` 落地。
- method_exec_form 加 `targetClass` data 字段 + readable.intents 供给。
- knowledge_base.readable 承担 `<knowledge>` XML 渲染；空 index fallback 不渲段。
- knowledge_base 默认 root ref：thread.construct (`thread/index.ts:53`，issue 前已存在) + method.talk.createSuperThread (新增、`:122-124`)。
- 12+1 篇 knowledge md `activates_on` 全迁 `object::|method::|super::` → `intent::xxx`。
- windowViews / methodForms / inSuper 全树退潮 0 命中。
- readable.intents stateless 投影（每轮重算）。

**reviewer 误报澄清**：reviewer 提 P1-1「业务 thread 未挂 kb ref」属误读——`thread/index.ts:53` 业务 thread.construct 早已默认挂 kb ref（issue 前现状），落地者补的是 super flow 路径（`method.talk.ts:122-124`）。两路径都挂、回归零风险。

**落地者意外项评估**：
- method_exec_form `targetClass` 字段 + intents 签名扩 `(self, ref)` 二参：reviewer 评估合理（targetClass 比 ref 反查 class 更直接）。
- ref 二参在 thread.readable.intents 已用 `ref.window_view` 派生视角 intent——签名扩有实际消费方。
- thread/context.ts 识别 `KNOWLEDGE_BASE_CLASS_ID` 预加载 ref.data.index：builtin→builtin 协作合理（thread 是唯一掌握 worldDir + ownerId 的 caller）。
- ReadableContext.intents 必填（非 optional）：所有调用方显式构造 `new Set()` 或预扫聚合——契约对称干净。

**退潮验收**：grep `core/thinkable/knowledge\|core/types/knowledge` 仅注释路径回流；`windowViews\|methodForms\|inSuper` 0 命中；knowledge md `object::|method::|super::` 0 命中。

**质量门**：tsc 干净；knowledge-activator 9 pass / 0 fail；全量 123 pass / 1 fail（web-e2e 预先红与本 issue 无关）。

**P2 followup（reviewer 提，不阻塞）**：
- **P2-1**：core scanIntents 兜底产 `class::<full_id>` + `class::<short_name>` 双形态——落地者额外引入、issue 未授权。设计上 generic（路径解析、不识别 class 语义、不破 core 边界）但是协议层增量、需追写进 readable/self.md 设计文档（或评估退回 class 自决）。建议另起小 issue 评估。
- **P2-2**：meta 仓 commit `3d34b83` push origin（已 push）。

落地 commits：`150a8547`（feat/thinkable-knowledge-split）+ `3d34b83`（meta 仓 main）。
