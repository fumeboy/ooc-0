# LLM Input 协议漂移：结构不合法 / 工具约束矛盾 / 文档锚点过时

> 类型：bugfix
> 创建日期：2026-04-23
> 状态：todo
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
