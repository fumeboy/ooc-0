# LLM Input 协议漂移：结构不合法 / 工具约束矛盾 / 文档锚点过时

> 类型：bugfix
> 创建日期：2026-04-23
> 完成日期：2026-04-24
> 状态：finish（问题 1/2/3/4/6 修复；问题 5 按原计划挂起）
> 负责人：supervisor
> 优先级：P0（直接影响 tool calling 稳定性与调试可信度）

## 背景 / 问题描述

在一次 `llm.input.txt` 回顾中，发现 Context 输出与系统约束存在多处“协议漂移”，表现为：

- 输出结构不稳定（XML-like 结构可能不合法）
- 系统指令与真实 action 历史互相矛盾（导致模型在“遵守规则 vs 模仿历史”之间摇摆）
- 文档锚点与 `docs/meta.md` 最新结构不一致（导致对象引用错误路径）

这类问题会直接造成：tool call 失败、debug 信息不可用、以及长期“越修越乱”的 prompt 漂移。

## 证据（本次发现的具体问题）

### 1) XML/结构异常：重复 `<system>`

- `flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:1`
- `flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:2`

风险：解析器/前端 viewer/人类阅读都可能把它当成“两个 system 块”，出现歧义。

补充说明：该类结构异常的根因是**当前 XML-like 文本是“字符串拼接产物”**，而不是通过专门的结构化数据模型 + 序列化器生成；一旦某个片段重复 append，就会出现重复根/不闭合等问题。

### 2) `submit` 指令要求 `form_id`，但历史里缺失（刻意设计）

- 规则声明：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:569`
- 历史 action（talk submit）未带 `form_id`：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:2619`
- 历史 action（program submit）未带 `form_id`：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:2703`

风险：模型按历史模仿会产出不合规调用；按规则输出又与运行时记录不一致，形成不稳定循环。

补充说明：历史里不落 `form_id` 是**故意的**——已完结的 form id 属于历史残留，继续展示可能误导后续判断。

改进方向（折中）：可以考虑在 action 历史中输出占位符（例如 `form_id_finished_so_removed`）表达“此处曾有 form_id，但已移除以避免误导”。

### 3) `mark` 的序列化形态不统一（JSON vs XML 文本）

- 规则示例：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:551`
- 实际历史把 JSON 塞进 `<mark>...</mark>` 文本：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:2625`

风险：模型照抄后，工具层可能收到错误类型（字符串/文本而非数组对象）。

补充说明：`mark` 不应作为特例修；应随 1) 的“统一序列化输出”一并解决（结构化模型里 `mark` 永远是数据字段，序列化时自然落成一致格式）。

### 4) 文档锚点过时：identity 指向旧目录，与 `docs/meta.md` 不一致

- identity 中的旧路径（历史遗留，现应为 `docs/哲学/`）：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:77`
- `docs/meta.md` 最新三层导航为 `docs/哲学/`：`docs/meta.md:28`

风险：对象在回答“文档在哪里”时给出错误路径，进一步污染用户/对象的工作流。

### 5) 看板调用入口疑似过时：`kernel/plannable/kanban` 与当前实现映射不一致

- Supervisor 的 `session-kanban` trait 文档仍写：trait 为 `kernel/plannable/kanban`：`stones/supervisor/traits/session-kanban/TRAIT.md:62`
- `docs/meta.md` 的工程映射显示 session-kanban 是 Supervisor 专属 trait（位置：`stones/supervisor/traits/session-kanban/`）：`docs/meta.md:1291`

风险：按文档调用可能找不到 trait/method，或调用到错误的实现入口。

补充说明：当前同时存在 `kernel/plannable/kanban` 与 supervisor 专属 `session-kanban`，本迭代暂不调整该部分（避免引入更大语义变更）。

### 6) `lifespan` 与注释语义不一致（reporter 声称 always，但窗口显示 transient）

- `llm.input.txt` 中 reporter window 标注 `lifespan="transient"`：`flows/s_moawy07g_fngkap/objects/supervisor/threads/th_moawy0j4_kzll11/llm.input.txt:885`
- reporter trait 注释说明 “when 从 never → always”：`stones/supervisor/traits/reporter/TRAIT.md:11`

风险：模型在上下文里看到的“是否常驻/是否会被回收”与真实策略不一致，容易触发自我怀疑/震荡。

补充说明：**always 的 trait 语义上就应是 pinned**；不应因为 `open(type="command")` 的生命周期而呈现为 transient。需要检查 trait 加载/激活的生命周期标注与回收逻辑。

## 目标

- `llm.input.txt`：单根、结构稳定、可被 viewer/工具层一致解析。
- Tool calling：约束与真实执行历史一致（尤其是 `mark` 的数据形态；`form_id` 的历史展示策略明确且不会误导）。
- 文档锚点：与 `docs/meta.md` 保持一致，避免错误路径长期传播。

## 方案（修复方向）

### A. 结构规范化（Context 输出）

- 用“结构化数据模型 + 序列化工具”替代字符串拼接：保证单根、闭合、顺序稳定。
- 同步调整前端 `llm.input.txt` 的解析与展示组件：按序列化后的结构稳定解析（避免依赖脆弱的字符串特判）。

### B. 工具约束对齐（规则 vs 历史）

- `submit` 的 `form_id`：保留“历史不展示真实 form_id”的设计意图，但补充一个不误导的占位机制（如 `form_id_finished_so_removed`），并确保指令/样例不会驱动模型输出无效字段。
- `mark`：不做特殊分支，随序列化工具统一落盘与展示形态。

### C. 旧路径引用修复（文档锚点）

- 全量修复仍引用旧目录（现应为 `docs/哲学/`）的路径引用，使其与 `docs/meta.md` 的三层导航一致。

### D. 文档锚点清理（stones 文档）

- 统一 identity/trait 文档中对文档路径与 trait 入口的引用：以 `docs/meta.md` 为唯一真相源。
- 对容易扩散的“入口文案”（如 supervisor identity、session-kanban 使用说明）增加一次性校验/审查。

## 影响范围

- 涉及代码（预期）：Context 序列化与 `llm.input.txt` 生成路径、前端 `llm.input.txt` viewer 解析展示组件、trait 生命周期标注与回收逻辑。
- 涉及文档：
  - `stones/supervisor/traits/session-kanban/TRAIT.md`
  - `stones/supervisor/traits/reporter/TRAIT.md`
  - `stones/supervisor/readme.md`（若旧路径来自 identity 源）
  - `docs/meta.md`（作为对齐基准）

## 验证标准

- 同一场景生成的 `llm.input.txt` 可被前端 viewer 稳定解析（无重复根/明显结构错误）。
- LLM 按规则生成的 tool call 与运行时可执行性一致（不再出现“规则要求 form_id 但现实不提供/不记录”的矛盾）。
- supervisor identity 与 session-kanban/reporter 文档引用路径、入口与 `docs/meta.md` 对齐。

## 执行记录

### 2026-04-23 方案 A 第一块：XML 序列化正确性（CDATA + 属性转义）

**病灶定位**（原文档问题 1 / 3 的根因）：

`kernel/src/thread/engine.ts` 的 `renderAttrs` 对属性值不做任何转义；`serializeXml` 对叶子
content 原样 push 到行内（为了保留 Markdown 可读性）。一旦 Context 里的 whoAmI / TRAIT.md
内嵌 XML 示例 / 代码里的 `Array<string>` 或 `a & b` 流出，前端 DOMParser 就会 parse-error。

**改动**（与 user 建议对齐：CDATA 包装前先判断必要性，避免纯文本被无意义包装）：

- 新建 `kernel/src/thread/xml.ts`，把 `XmlNode` / `renderAttrs` / `serializeXml` 从 engine.ts
  抽出；同时加入：
  - `escapeAttr(v)`：属性值强制 XML 实体转义（`&amp;` / `&lt;` / `&gt;` / `&quot;`）
  - `contentNeedsCdata(content)`：只要出现 `<` / `>` / `&` 就返回 true
  - `wrapCdata(content)`：包 `<![CDATA[...]]>`；对 `]]>` 边界按标准做法拆成
    `]]]]><![CDATA[>` 防止提前闭合
  - `serializeXml` 的叶子分支：`contentNeedsCdata(raw) ? wrapCdata(raw) : raw`
    —— 纯文本保持原样（Markdown / 代码块不加任何包装，可读性无损）
- `kernel/src/thread/engine.ts`：移除内嵌的 `XmlNode` / `renderAttrs` / `serializeXml` 副本，
  改 import 自 `./xml.js`
- `kernel/tests/thread-xml-escape.test.ts`：新增 27 个单元测试
  - escapeAttr 四字符转义（含 `&` 先序约束）
  - renderAttrs 属性转义 + 顺序保持
  - contentNeedsCdata 判定（含 `Array<string>` / `Record<string, any>` / `a && b`）
  - wrapCdata 单次 / 多次 `]]>` 边界拆分
  - serializeXml 叶子 CDATA 必要性、嵌套容器、自闭合
  - 回归守护：含 `Array<string>` + 属性含 `&` 的混合场景，外层无裸 `<` `>` `&` 残留
- 前端 `kernel/web/src/features/LLMInputViewer.tsx` 无需改动：DOMParser 把 CDATASection
  自动合并到 `el.textContent`，现有"叶子节点读 textContent"分支天然兼容

**验证**：
- `bun test tests/thread-xml-escape.test.ts` → 27 pass
- `bun test tests/thread-engine-xml-structure.test.ts` → 2 pass（无回归）
- 全量 `bun test` → 921 pass / 6 skip / 6 fail（fail 全是预存的 http_client 端口 19876 故障，与本次无关）
- `kernel/web` tsc + vite build 通过

**未在本块覆盖的项**（原文档问题 2 / 4 / 5 / 6）：

- 问题 2（submit 指令 form_id 与历史展示矛盾）：规则与历史的展示对齐策略，待后续单独
  处理（需要改写 action 历史渲染，有可能影响线程树序列化，独立出块更安全）
- 问题 4（identity 旧路径引用）：属于 stones 文档层面的修正，需 supervisor identity 与
  docs/meta.md 对齐，独立出块
- 问题 5（session-kanban trait 入口与 meta.md 不一致）：原文档已注明"本迭代暂不调整"
- 问题 6（lifespan always vs transient 注释漂移）：需查 trait 加载/激活的生命周期标注逻辑

### 2026-04-23 方案 A 第二块：吸收远端 github/main 并行修复

远端 `github/main af5c397` 对同一问题做了并行修复。diff 对比结果：
- 问题 1/3（XML 不合法 / mark 塞 JSON 文本）：远端**未改** `renderAttrs` / `serializeXml`，
  无 escape / CDATA —— 本地第一块已覆盖
- 问题 2（form_id 历史矛盾）：远端已修，本地未做 → 本次 port
- 问题 6（lifespan always 漂移）：远端已修，本地未做 → 本次 port
- 远端还顺带把 `renderThreadProcess` 从字符串拼接改成结构化 XmlNode + 递归值展开 —— 正是
  原文档问题 3 的"治本"路径（args 对象不再 JSON.stringify 塞进文本），本次 port

**本次 cherry-pick 式合并内容**（不引入远端的非 bugfix refactor，如 scheduler pause 语义变更）：

- `kernel/src/thread/context-builder.ts`
  - lifespan 计算不再做 legacy 覆盖，直接沿用 `getOpenFiles` 返回的 lifespan
    （open-files 已把 `stoneRefs + nodeMeta.pinnedTraits + when="always"` 统一归 pinned）
  - `cleanArgs` 在清除已关闭 form 的 `form_id` 后注入展示层占位符
    `form_id_finished_so_removed: true`，避免模型按"历史缺失 form_id"模仿
  - `renderThreadProcess` 从字符串拼接改为 XmlNode + 递归 `valueToXmlNode`：
    - `tool_use` 的 args 按字典序拆成子节点（原子值→叶子 content；对象→嵌套标签；
      数组→`<item index="N">...</item>`），**不再 JSON.stringify 塞进 content**
    - `program` 的 `code` / `result` 改成容器节点的子叶子，经 xml.ts 的 serializeXml
      自动 CDATA 包装（配合第一块的改动，args 含 `<` / `>` / `&` 时天然安全）
    - `compact_summary` / 其他类型按本地已有语义保留
    - 使用 `serializeXml(nodes, 1)`，外层 `<process>` 由 engine 包裹
- `kernel/src/thread/engine.ts`
  - 新增模块级 `isAlwaysTrait(traits, fullId)` 辅助
  - `<knowledge>` 注释补充"或该 trait 的 when=always（语义等价 pinned）"
  - 两处 form hint 文案追加"下一步：请调用 submit({"form_id":"..."}, ...) 提交"，
    对齐规则与历史展示，降低模仿误导
  - 四处 trait 卸载循环（run / resume × submit / close）加入 `isAlwaysTrait` 豁免
  - 两处 `_trait` 型 form close 分支加入 `isAlwaysTrait` 豁免
- **不采纳**：远端对 `isPaused` 测试的行为变更（从"跳过调度"→"执行一轮后暂停"）属于
  scheduler 设计决策，本地线程树 scheduler 已有独立语义，不并入本次 bugfix

**验证**：
- `bun test` → 921 pass / 6 skip / 6 fail（fail 全为 pre-existing http_client 端口故障，
  数字与前一块完全一致，无新增回归）
- `bun test tests/thread-engine-xml-structure.test.ts tests/thread-xml-escape.test.ts` → 29 pass
- `bun test tests/thread-engine.test.ts tests/thread-engine-skill.test.ts` → 21 pass

**覆盖结论**：原文档 6 条问题中 1/2/3/6 已修复（本地第一块 + 本块合并）；4/5 仍未覆盖，
待后续独立迭代。

### 2026-04-24 方案 A 第三块：Identity 旧路径修复（问题 4）

根因：2026-04-21 docs/ 三层重构后，`docs/哲学文档/` 拆成 `docs/哲学/{genes,emergences,discussions}/`，
老的单文件 `gene.md` / `emergence.md` / `discussions.md` 被拆成目录 + 多个文件；但 identity 文档与
README 中仍残留旧路径或旧单文件名，LLM 读到后会尝试 open 不存在的路径。

**排查规则**：只改"路径形式"或"单文件名路径"引用；保留属于历史证据的引用（归档路径、验证用例执行记录、
历史讨论等）。

**kernel 仓库改动**（commit 3331b49）：
- `README.md`：文档清单里的 `gene.md` / `emergence.md` → `docs/哲学/genes/` / `docs/哲学/emergences/`；
  组织结构路径 `docs/组织/` → `docs/工程管理/组织/`
- `traits/reflective/super/TRAIT.md`：`@ref docs/哲学文档/gene.md#G12` →
  `@ref docs/哲学/genes/g12-经验沉淀.md`

**user 仓库改动**：
- `CLAUDE.md`：Step 9 的 `更新 discussions.md / emergence.md` → `更新 docs/哲学/discussions/ 或
  docs/哲学/emergences/ 下对应文件`
- `docs/meta.md`：目录树节点 `哲学文档/ ← gene.md, emergence.md, discussions.md` 重写为真实的
  三层结构（`哲学/` / `对象/` / `工程管理/`）
- `stones/supervisor/relations/kernel.md`：`涉及哲学文档（gene.md / emergence.md）` →
  `涉及哲学文档（docs/哲学/genes/ 或 docs/哲学/emergences/）`
- `stones/sophia/readme.md`：三处
  - 职责表述 `维护哲学文档（gene.md, emergence.md, discussions.md, model.md）` →
    `维护哲学文档（docs/哲学/genes/、docs/哲学/emergences/、docs/哲学/discussions/、model.md 等）`
  - 行为铁律 `记录到 discussions.md` → `记录到 docs/哲学/discussions/ 下对应文件`
  - 示例台词 `已更新 gene.md#G13，已记录到 discussions.md` →
    `已更新 docs/哲学/genes/g13-认知栈即运行模型.md，已记录到 docs/哲学/discussions/ 下对应讨论`
- `stones/kernel/readme.md`：三处
  - 行为铁律 `绝不修改 gene.md` → `绝不修改 docs/哲学/genes/ 下任何文件`
  - TDD 示例 `阅读 gene.md#G4 和 gene.md#G2` → 指向具体 `g04-*.md` / `g02-*.md`
  - 哲学缺陷场景 `gene.md 没有定义` → `docs/哲学/genes/g13-*.md 没有定义`

**跳过的历史证据**（故意保留，不视为漂移）：
- `docs/哲学/discussions/README.md` 中 `.归档-20260421/哲学文档/discussions/` — 归档路径本就指向重构前的快照
- `docs/工程管理/验证/用例/用例002/success.md` — 用例执行证据（当时路径就是旧结构）
- 讨论文件 / 旧迭代文档里零散的 `gene.md#Gxx` / `emergence.md` 等历史性笔记

**验证**：
- kernel `bun test` → 921 pass / 6 skip / 6 fail（fail 全为 pre-existing 故障，零新增回归）
- identity 链 supervisor / kernel / sophia 的 readme 与 CLAUDE.md、meta.md 路径引用自洽

**覆盖结论更新**：原文档 6 条问题中 1/2/3/4/6 已修复；仅 5（session-kanban trait 入口不一致，
原文档已注明"本迭代暂不调整"）挂起，不再纳入本迭代范围。本迭代可转 finish。
