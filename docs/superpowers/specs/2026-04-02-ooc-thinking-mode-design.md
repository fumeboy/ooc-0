# OOC Thinking 模式接入设计

> 目标：让 OOC 使用 LLM 原生 thinking 能力，并将其自动映射为系统内部的 `thought` 语义。
> 核心约束：assistant 输出协议中不再允许 `[thought]`；parser 不再解析 `[thought]`；前后端继续完整展示与持久化 thought。

---

## 背景

当前 OOC 的 thought 主要来自 assistant 显式输出的 `[thought]` 段。这带来三个问题：

1. **协议职责混乱**：`thought` 同时承担“模型内部思考”和“assistant 输出协议”两种语义，parser、thinkloop、SSE 都耦合到 `[thought]`。
2. **与模型原生能力脱节**：现有 `OpenAICompatibleClient` 只被动读取 `reasoning_content`，但没有显式启用 thinking，也没有把它定义为一等运行时语义。
3. **trait 指令污染**：`output_format` 等 trait 仍要求 LLM 显式输出 `[thought]`，导致 prompt 中残留已经不希望继续保留的旧协议痕迹。

本设计将 `thought` 从“输出协议”迁移为“provider 能力层产生的一类运行时语义”。

---

## 设计目标

### 必须达成

1. OOC 显式支持 LLM thinking 模式。
2. 原生 thinking 内容自动进入系统内部 `thought` 语义。
3. `process.json`、action 历史、SSE、前端时间线继续完整展示 thought。
4. assistant 输出中显式出现 `[thought]` 时，视为协议错误。
5. `kernel/src/flow/parser.ts` 中不再出现针对 `[thought]` 的解析判断。
6. `kernel/traits/kernel/output_format/TRAIT.md` 不再要求 LLM 输出 `[thought]`。

### 明确不做

1. 本次不实现多个 provider 的完整 thinking 接入，只完成 capability 抽象与 OpenAI-compatible 首个实现。
2. 本次不实现 thinking 权限控制、脱敏、摘要压缩。
3. 本次不改变 `program/talk/action/stack/directives` 的现有协议语义。

---

## 总体架构

新的职责分层：

### 1. Provider 能力层

负责：

- 开启 thinking 模式
- 读取 thinking 输出
- 将不同上游的字段适配为统一结构

输出统一的 LLM 结果：

```ts
type LLMResult = {
  assistantContent: string;
  thinkingContent: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};
```

### 2. ThinkLoop 语义映射层

负责：

- 将 `thinkingContent` 记录为系统 `thought` action
- 将 `thinkingContent` 通过 SSE 发为 `stream:thought`
- 将 `assistantContent` 交给 parser 解析为可执行协议
- 在本轮持久化中保持 thought 与 program/talk/action 的顺序一致性

### 3. Parser 协议层

只负责解析 assistant 最终输出中的结构化协议：

- `[program]`
- `[talk]`
- `[action]`
- `[cognize_stack_frame_push]`
- `[cognize_stack_frame_pop]`
- `[reflect_stack_frame_push]`
- `[reflect_stack_frame_pop]`
- `[set_plan]`
- `[finish]` / `[wait]` / `[break]`

parser 不再识别或生成 `[thought]`。

---

## 数据流

### 非流式

1. ThinkLoop 构造消息并调用 provider。
2. Provider 返回 `assistantContent` 与 `thinkingContent`。
3. ThinkLoop 先把 `thinkingContent` 记录成 `thought` action。
4. ThinkLoop 再将 `assistantContent` 交给 parser。
5. parser 仅解析结构化输出，生成 programs / talks / actions / stack ops / directives。
6. ThinkLoop 执行解析结果并落盘 `process.json`。

### 流式

流式结果拆成两条事件通道：

- `assistant_chunk`
- `thinking_chunk`

处理方式：

1. `thinking_chunk` 直接发 `stream:thought`，并累计到 `thinkingContentBuffer`。
2. `assistant_chunk` 发给结构化流式解析器，仅解析 program/talk/action/stack/set_plan。
3. 流结束后，ThinkLoop：
   - 把累计的 `thinkingContentBuffer` 落为 thought action
   - 把累计的 `assistantBuffer` 做最终 parser 解析与执行

这个设计保证 thought 流和 assistant 协议流并行，但职责不混淆。

---

## 接口设计

### Provider Capability 抽象

新增 capability 配置：

```ts
type ThinkingCapability = {
  enabled: boolean;
  mode?: string;
  budget?: number;
};
```

`DefaultConfig()` 扩展为：

- `thinking.enabled`
- `thinking.mode`
- `thinking.budget`

OpenAI-compatible provider 负责把这些配置映射到具体请求参数。能力层只定义抽象，不把 thinking 参数名写死在 ThinkLoop 或 parser 中。

### Client 返回类型

当前的 `chat()` / `chatStream()` 需要从“返回字符串”升级为“返回双通道语义”。

建议形态：

```ts
type LLMStreamEvent =
  | { type: "thinking_chunk"; chunk: string }
  | { type: "assistant_chunk"; chunk: string }
  | { type: "done"; usage?: TokenUsage; raw?: unknown };
```

这样前后端与 ThinkLoop 都不需要再猜测某个文本块究竟是 thought 还是最终输出。

---

## Parser 改造

### 删除项

从 `kernel/src/flow/parser.ts` 中移除：

1. `[thought]` tag 的识别
2. `thought` 相关 legacy 解析
3. `thought` 相关 TOML section 解析
4. `createLLMOutputStreamParser()` 中的 `thought` 协议事件产出

### 新的 parser 约束

1. parser 输入永远是 **assistant 最终输出**，不再夹带原生 thinking。
2. 如果 assistant 输出中出现 `[thought]`，立即返回协议错误。
3. parser 的 `parsed.thought` 字段可以保留为兼容结构，但其值只能由外层注入，不能再由 parser 从文本中推导。

### 为什么保留 `parsed.thought` 字段

保留它可以减少 ThinkLoop 及下游数据结构改动面。新的语义变为：

- `parsed.thought` = 运行时注入的 thought
- 不是 parser 从输出协议中解析出来的 thought

这满足“parser 中不再判断 `[thought]`”的要求，同时避免一次性改动过多调用链。

---

## ThinkLoop 改造

ThinkLoop 是本次迁移的核心。

### 新职责

1. 在 LLM 调用前配置 provider thinking capability。
2. 在 LLM 调用后把 `thinkingContent` 映射为：
   - `flow.recordAction({ type: "thought" })`
   - `stream:thought` / `stream:thought:end`
   - `replyContent` 中的 thought 部分
3. 将 `assistantContent` 交由 parser 解析。
4. 若 assistant 输出中包含显式 `[thought]`，将其视为协议错误。

### 持久化顺序

为了让 `process.json` 易读，建议顺序保持为：

1. `thought`
2. `program` / `talk` / `action` / stack ops
3. 执行结果 / directive 状态变化

这样过程回放仍符合人的阅读顺序：先看到模型思考，再看到执行动作。

### 错误语义

新增一种明确错误：

```ts
type ProtocolErrorCode = "deprecated_thought_section";
```

错误文案应类似：

> assistant 输出了已废弃的 `[thought]` 段。thought 必须来自模型原生 thinking 通道，不能再出现在输出协议中。

---

## Trait 文档改造

### output_format

`kernel/traits/kernel/output_format/TRAIT.md` 需要完成以下更新：

1. 删除要求显式输出 `[thought]` 的描述
2. 将“思考内容”改写为系统自动采集
3. 保留并强化以下协议说明：
   - `[program]`
   - `[talk]`
   - `[action]`
   - stack push/pop
   - directives
4. 明确列出禁止事项：
   - assistant 输出中禁止出现 `[thought]`

### 其他 trait

至少同步更新：

- `kernel/traits/kernel/cognitive-style/TRAIT.md`
- `kernel/traits/kernel/computable/TRAIT.md`
- `kernel/traits/kernel/talkable/TRAIT.md`
- `kernel/traits/kernel/plannable/TRAIT.md`

这些文档要统一说明：

- 思考无需显式输出
- thought 来自模型原生 thinking
- assistant 只输出执行协议

---

## 前端改造

### 保留的能力

以下前端能力继续保留：

- thought 流式展示
- program/talk/action/stack 的过程展示
- 最终 process timeline 展示

### 需要改变的语义

前端不再把 thought 理解为“assistant 输出中的一个段落”，而改为：

- thought = 系统采集到的模型思考

这意味着：

1. `useSSE` 继续消费 `stream:thought`
2. timeline 视图与 session store 仍存 thought，但文案从“输出段落”改为“思考流”或“模型思考”
3. 如果有显示原始 LLM 输出的调试面板，应清楚区分：
   - assistantOutput
   - thinkingOutput

### 前端类型

`kernel/web/src/api/types.ts` 里如果有流式事件或过程事件的类型假设，需要增加“thought 来自独立通道”的语义说明，并避免把它当作 parser 产物。

---

## 后端 API / SSE 改造

### SSE

尽量不改事件名，降低前端破坏面：

- 保留 `stream:thought`
- 保留 `stream:thought:end`

但改变事件来源：

- 过去：来自对 assistant 文本里 `[thought]` 的解析
- 现在：来自 provider 原生 thinking 流

### 调试文件

建议将调试输出拆得更清楚：

- `llm.input.txt`：发送给模型的 prompt
- `llm.output.txt`：assistant 最终输出
- 若现有调试体系允许，可增加 thinking 专用调试输出（例如内存对象或单独文件），以避免把 assistant 输出和 thinking 混在一个文件里

本次不强制新增调试文件，但建议在 `raw` 或日志中保留原始 provider 响应，方便后续排障。

---

## OpenAI-compatible 首个实现

本次只要求 OpenAI-compatible 打通。

### 要做的事情

1. 配置层支持 thinking 开关
2. 请求层将 capability 映射到上游 thinking 参数
3. 响应层抽取：
   - 非流式 `reasoning_content` / 等价字段
   - 流式 delta 中的 thinking 字段
4. 统一组装为 `assistantContent` 与 `thinkingContent`

### 不在本设计中固定的内容

不同 OpenAI-compatible 网关的 thinking 参数名并不统一，因此本设计要求在 `OpenAICompatibleClient` 内实现一层显式参数映射：先定义 OOC 内部统一 capability 字段，再由 provider 适配层把它映射到具体网关请求参数；ThinkLoop、parser、前端不得直接依赖任何上游私有字段名。

---

## 兼容与迁移策略

### 强废弃 `[thought]`

此次迁移不做软兼容：

- assistant 输出 `[thought]` 直接算协议错误
- 不再尝试兼容解析
- 不再在 trait 文档中留下任何继续鼓励 `[thought]` 的说明

### 为什么要强废弃

如果继续兼容 `[thought]`，则 parser、trait、prompt、前端心智都会继续混合两种来源：

- 原生 thinking
- assistant 显式 thought

这与本次目标相反，会让系统长时间处于“双协议并存”的脆弱状态。

---

## 测试策略

### 单元测试

1. provider 非流式：正确拆分 `assistantContent` 与 `thinkingContent`
2. provider 流式：正确产出 `thinking_chunk` 与 `assistant_chunk`
3. parser：
   - 不再支持 `[thought]`
   - assistant 输出中出现 `[thought]` 时返回协议错误
4. 流式 parser：只处理 program/talk/action/stack/set_plan

### 集成测试

1. ThinkLoop 可在无显式 `[thought]` 的情况下正常记录 thought action
2. thought 会正确出现在 `process.json`
3. thought 会正确通过 SSE 到达前端
4. supervisor 类复杂 flow 仍能完成 stack push/pop、talk、finish

### 前端验证

1. thought 流继续实时显示
2. thought 与 program/talk 并行流不串线
3. 历史回放与 process 时间线中仍能看到 thought

---

## 风险与应对

### 风险 1：上游模型/网关对 thinking 参数支持不一致

应对：provider capability 抽象 + OpenAI-compatible 首个实现中保留可扩展映射。

### 风险 2：前端仍隐含假设 thought 来自 parser

应对：保持 SSE 事件名不变，只替换来源；同时修正文案与类型语义。

### 风险 3：旧 trait / prompt 残留继续诱导输出 `[thought]`

应对：统一清理 kernel traits，并加入协议错误测试，确保一旦回流立即暴露。

### 风险 4：调试时 assistant 输出与 thinking 输出混淆

应对：在 provider 返回结构与日志中显式区分双通道内容。

---

## 实施范围

### 涉及文件（预期）

- `kernel/src/thinkable/config.ts`
- `kernel/src/thinkable/client.ts`
- `kernel/src/flow/parser.ts`
- `kernel/src/flow/thinkloop.ts`
- `kernel/tests/parser.test.ts`
- `kernel/tests/flow.test.ts`
- `kernel/traits/kernel/output_format/TRAIT.md`
- `kernel/traits/kernel/cognitive-style/TRAIT.md`
- `kernel/traits/kernel/computable/TRAIT.md`
- `kernel/traits/kernel/talkable/TRAIT.md`
- `kernel/traits/kernel/plannable/TRAIT.md`
- `kernel/web/src/hooks/useSSE.ts`
- `kernel/web/src/api/types.ts`
- `kernel/web/src/store/session.ts`
- `kernel/web/src/components/ProcessView.tsx`（若当前 thought 展示逻辑位于该处，则纳入本次范围）

### 不在范围内

- 多 provider 全量适配
- thinking 内容权限控制
- thinking 压缩与摘要
- 大规模 UI 改版

---

## 验收标准

满足以下条件即视为本设计落地成功：

1. OOC 能通过配置显式开启 thinking 模式。
2. 原生 thinking 自动成为系统内的 thought action。
3. parser 中不再解析 `[thought]`。
4. assistant 输出中出现 `[thought]` 会触发协议错误。
5. `output_format` 不再要求 thought 输出。
6. 前后端仍能正确展示与回放 thought。
7. 关键体验用例在无显式 `[thought]` 的情况下正常通过。
