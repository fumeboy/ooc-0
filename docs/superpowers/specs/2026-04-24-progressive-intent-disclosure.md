# 渐进式意图披露：要做的事与要激活的知识

> 日期：2026-04-24
> 状态：思考札记，待继续设计
> 主题：如何更好地做“要做的事”与“要激活的知识”的自动匹配

## 背景

当前系统里，知识激活主要围绕 command tree 与 `command_binding` 展开。对象打开某个 command 后，系统根据命令路径加载对应 trait。

这个机制能工作，但暴露了一个哲学和工程上的问题：对象并不总是知道 command tree 里有哪些子路径，也不总是知道应该通过 `partial submit` 逐步触发更深层的 trait 激活。

换句话说，系统内部知道行动空间，但对象未必能看见行动空间。不可见的能力，对对象来说就不是它真正拥有的能力。

## 核心洞察

这不是“如何展示 sub command”的问题，而是“对象如何逐步形成行动意图，并在形成过程中获得相关知识”的问题。

更好的心智模型不是 command tree，而是渐进式披露：

> 对象不是一次性知道所有参数，也不是一次性知道所有知识。它先表达一个粗意图，系统根据这个粗意图披露下一层需要知道的东西；对象再补充意图，系统再披露更具体的知识。

这有点像填写一个多步表格。每填一步，界面展示新的信息，帮助填写下一步。

在 OOC 中，这个“表格”不是 UI 表单，而是行动意图的成形过程。

## 设计方向

### 1. 从 command 转向 intent form

`open(command=talk)` 不应只被理解为打开一个工具表单，而应被理解为打开一个 Intent Form。

Intent Form 收集的不是底层 API 参数，而是语义槽位：

```yaml
intent_form:
  action: talk
  slots:
    target: user
    mode: continue
    purpose: deliver
    output: text
    wait: true
    message: ...
```

这些槽位表达的是“我要做什么”：

- `target`：我要和谁互动
- `mode`：开新线程、继续旧线程、回复创建者
- `purpose`：询问、回答、交付、委派、关系更新、经验沉淀
- `output`：文本、报告、表单、导航卡片、代码变更
- `stakes`：低风险、中风险、高风险
- `wait`：执行后是否等待对方

最后执行时，系统再把 intent form 编译成实际 tool 参数。

### 2. 渐进式披露流程

一个典型流程：

```text
open(action="talk")
→ 展示 Step 1：选择/填写 target

refine(target="user")
→ 披露 user/relations/self.md
→ 展示 Step 2：选择 purpose

refine(purpose="deliver")
→ 披露 delivery / verifiable / user presentation 知识
→ 展示 Step 3：填写 message、output、wait

submit()
→ 编译成 talk 参数并执行
```

每次 refine 后，系统返回三类内容：

```xml
<intent_form action="talk" status="in_progress">
  <filled>
    <slot name="target">user</slot>
  </filled>

  <next_slots>
    <slot name="purpose" options="ask, answer, deliver, delegate, relation_update" />
  </next_slots>

  <disclosed_knowledge>
    <knowledge name="stones/user/relations/self.md" reason="target=user" />
  </disclosed_knowledge>
</intent_form>
```

对象不需要知道隐藏的 `talk.continue.relation_update`。它只需要回答下一步：“这次 talk 的 purpose 是什么？”

### 3. 知识由情境召唤

知识不应该只绑定 command，而应声明自己适用于什么意图情境。

例如 `stones/user/relations/self.md`：

```yaml
activation:
  helps_when:
    - action: talk
      target: user
  provides:
    - user_presentation_preferences
  disclosure: summary_then_full
```

例如 `verifiable`：

```yaml
activation:
  helps_when:
    - purpose: deliver
      output: code_change
    - purpose: deliver
      stakes: medium_or_high
  provides:
    - completion_gate
    - verification_protocol
```

例如 `relation_update`：

```yaml
activation:
  helps_when:
    - action: talk
      purpose: relation_update
  provides:
    - relation_update_protocol
```

匹配器输入当前 form state，输出候选知识：

```text
filled slots:
  action=talk
  target=user
  purpose=deliver
  output=code_change

activate:
  - user/relations/self.md
  - talkable/delivery
  - verifiable
```

每个激活项必须带 reason。对象要知道知识为什么出现。

### 4. 披露分层

不是所有匹配到的知识都应该全文进入上下文。建议分三层：

```text
candidate：只显示名字和激活理由
preview：显示摘要和关键规则
active：全文进入 context
```

例如：

```xml
<knowledge_candidates>
  <candidate name="verifiable" reason="你正在交付代码变更" />
</knowledge_candidates>
```

高置信、低成本知识可以自动 active。低置信、高成本知识先 candidate，让对象选择是否打开。

### 5. partial submit 的重新解释

`partial submit` 这个名字容易误导，因为它听起来像“提交半成品”。实际上它做的是：

- 表达一部分意图
- 让系统根据已表达意图披露下一层信息
- 推进认知表单，而不是执行动作

更准确的概念是：

```text
refine / disclose / fill_step / continue_form
```

也就是说，探索知识不应该伪装成“半个 submit”。对象不是在填 API 参数，它是在澄清意图。

## 可能的数据结构

```ts
interface IntentFormState {
  formId: string;
  action: string;
  filledSlots: Record<string, unknown>;
  nextSlots: SlotSpec[];
  missingRequiredSlots: string[];
  disclosedKnowledge: KnowledgeRef[];
  activeKnowledge: KnowledgeRef[];
  executionReady: boolean;
}
```

每种 action 提供自己的渐进式表单 schema。

例如 `talk`：

```yaml
action: talk
steps:
  - ask: target
  - ask: mode
    depends_on: target
  - ask: purpose
    depends_on: target, mode
  - ask: threadId
    when: mode=continue and target!=this_thread_creator
  - ask: output
    when: purpose=deliver
  - ask: message
  - ask: wait
compile:
  target -> submit.target
  mode -> submit.context
  message -> submit.msg
```

## 设计原则

1. **行动先于命令**

   对象表达“我要做什么”，系统再映射到底层 command。

2. **知识由情境召唤**

   trait / relation / skill / memory 绑定的是 intent situation，不是 API 名称。

3. **披露必须可解释**

   每个被激活或推荐的知识都要说明 reason。

4. **表单推进就是认知推进**

   refine 不是半提交，而是“我补充了一个意图维度，请展开下一层世界”。

5. **对象只需要回答下一步问题**

   对象不应被要求背诵隐藏 sub command。系统负责根据已填槽位计算下一步可行动空间。

## 迁移路径草案

1. 保留现有 `open/submit`，先把 `partial=true` 的注入文案改造成更明确的 refine 语义。
2. 为 `talk` 建第一个 Intent Form schema，替代 command tree 的显式子命令发现。
3. 增加 Knowledge Matcher：根据 filled slots 匹配 trait / relation / skill / memory。
4. 将 trait 的 `command_binding` 逐步升级或补充为 `activation.helps_when`。
5. 最终让 command tree 退到内部编译层，外部认知界面变成 intent form。

## 未决问题

- `refine` 应该作为新 tool，还是复用 `submit(partial=true)` 但改变语义和展示？
- Intent Form schema 放在哪里：kernel 内置、trait 自声明，还是对象可扩展？
- Knowledge Matcher 应该先规则匹配，还是引入向量/语义匹配？
- 低置信知识是只展示 candidate，还是允许对象一键 open？
- 现有 command_binding 如何与 activation.helps_when 共存和迁移？

## 暂定结论

推荐方向是：

> Intent Form 负责渐进式披露，Knowledge Matcher 负责自动激活知识，Command 只负责最后执行。

这能把 OOC 从“对象猜 hidden command 参数”推进到“对象逐步表达行动意图，世界逐步显现相关知识”。
