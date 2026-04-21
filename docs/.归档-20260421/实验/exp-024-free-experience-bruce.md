# Exp 024: Bruce 自由体验测试

> 日期：2026-04-14
> 验证者：Bruce
> 触发：自由体验，无特定变更触发

## 体验场景

### 场景 1: 向 sophia 问一个哲学问题

- 目的: 作为用户，我想了解 OOC 的 G1 基因核心思想，看看 sophia 作为哲学层能不能给出有深度的回答
- 操作: `curl -X POST http://localhost:8080/api/talk/sophia -d '{"message": "G1 基因的核心思想是什么？请用你自己的话解释，不要照搬原文。"}'`
- 预期: sophia 用自己的语言解释 G1，给出有洞察的回答
- 实际: sophia 花了 206 秒（41 个 actions），最终没有回答问题，而是返回了"我已加载 gene.md，请提问"

**体验评估:**
- 任务完成: ❌ 未完成 — sophia 没有回答问题，只是加载了文件然后等待
- 结果质量: ⭐ (1/5) — 没有回答问题，只有文件加载成功的通知
- 等待时间: 首次响应 ~0.01s（但返回的是 running 状态），总完成 206.6s
- 进度反馈: ❌ 无 — HTTP 响应立即返回 `{"status":"running","sessionId":null}`，之后没有任何渠道获取进度
- 交互自然度: ⭐ (1/5) — 我问了问题，它说"请提问"，完全不自然
- 主观感受: "极度挫败。我问了一个直接的问题，等了 3 分半钟，它告诉我文件加载成功然后让我再问一遍。它明明已经在 inbox 里看到了我的问题。"

**关键发现:**
1. Sophia 试图通过 trait 系统加载 "gene" trait 失败（该 trait 不存在）
2. Sophia 转而用 program 读取文件，但 `readFile` 返回 null（路径错误）
3. Sophia 反复尝试不同的文件读取方式，`glob` 和 `listDir` 都不可用
4. 最终用 `fs.readFileSync` 成功读取，但此时已经"忘记"了用户的原始问题
5. 整个过程产生了 41 个 actions，其中大量是重复的 thought 和失败的 program

**证据:**
- 线程 actions 显示 41 步才完成
- `thread_return` 内容是"已成功读取并加载 gene.md...请提出你的问题"
- 用户原始消息在 inbox 中 status=marked，但未被处理

---

### 场景 2: 向 kernel 问一个技术问题

- 目的: 测试 kernel 对系统架构的理解能力
- 操作: `curl -X POST http://localhost:8080/api/talk/kernel -d '{"message": "你能简单介绍一下线程树架构吗？它解决了什么问题？"}'`
- 预期: kernel 给出清晰的技术解释
- 实际: kernel 给出了结构清晰、内容准确的回答

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 回答结构清晰，包含定义、操作列表、解决的 5 个问题、一句话总结
- 等待时间: 约 60 秒
- 进度反馈: ❌ 无 — 同样是立即返回 running 状态
- 交互自然度: ⭐⭐⭐⭐ (4/5) — 回复格式清晰，像在和一个资深工程师对话
- 主观感受: "这个回答非常棒，是我期望的质量。但等待一分钟没有任何反馈，差点以为系统卡了。"

**证据:**
- kernel 返回了完整的 markdown 格式回答，包含表格、代码块、层次结构

---

### 场景 3: 向 supervisor 多轮对话

- 目的: 测试 supervisor 的任务规划能力和上下文记忆
- 操作:
  1. 先问"系统里有哪些对象"
  2. 再问"如果我想让 sophia 和 kernel 协作完成一个设计审查任务，你会怎么安排？"
- 预期: supervisor 能结合第一轮的信息，在第二轮给出合理的协作安排
- 实际: 两个问题都得到了高质量回答，但两轮对话之间似乎没有上下文传递

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐ (4/5) — 两轮回答都很好，但第二轮没有引用第一轮的上下文
- 等待时间: 第一轮 ~60s，第二轮 ~60s
- 进度反馈: ❌ 无
- 交互自然度: ⭐⭐⭐ (3/5) — 第二轮回答本身很好，但没有体现"记得"第一轮对话
- 主观感受: "每个回答单独看都不错，但感觉不像在和一个'人'连续对话，更像两次独立咨询。"

**证据:**
- 第一轮回答了 9 个对象的概览
- 第二轮给出了三阶段协作流程（Sophia 先审 -> Kernel 后评 -> 综合决策），有组织思维
- 但 Flow API 返回的 messages 只包含最后一轮（没有累计历史）

---

### 场景 4: 暂停/恢复机制

- 目的: 测试 pause/resume 功能是否正常工作
- 操作:
  1. `POST /api/stones/iris/pause` — 暂停 iris
  2. 向 iris 发送消息
  3. `POST /api/stones/iris/resume` with flowId — 恢复
- 预期: 暂停后 iris 不处理消息；恢复后继续执行并给出回答
- 实际: 暂停成功，恢复后 flow 状态变为 **failed**，没有回复

**体验评估:**
- 任务完成: ❌ 未完成 — resume 导致 flow 失败
- 结果质量: N/A
- 等待时间: N/A
- 进度反馈: ❌ 无 — failed 状态没有错误原因说明
- 交互自然度: N/A
- 主观感受: "这像是基本功能坏了。暂停再恢复是最基本的控制操作，居然失败了。而且没有任何错误信息告诉我为什么失败。"

**关键发现:**
1. 暂停操作本身成功：`{"name":"iris","paused":true}`
2. 暂停期间消息保留在 inbox（status=unread），LLM 未被调用 — 这是正确行为
3. 恢复后 flow 直接变为 failed，0 个 actions 执行
4. Flow API 返回 `{"status":"failed","messages":[只有原始输入]}`
5. 没有调试文件（llm.input.txt / llm.output.txt）生成
6. 没有错误原因说明

**证据:**
```
Resume API 返回:
{
  "sessionId": "s_mnxk6k8y_rv9735",
  "status": "failed",
  "actions": [],
  "messages": [{"direction":"in","from":"human","to":"iris","content":"你觉得 OOC 的前端界面目前最需要改进什么？"}]
}
```

---

### 场景 5: 边界情况测试

#### 5a: 与不存在的对象对话

- 操作: `POST /api/talk/nonexistent -d '{"message":"hello"}'`
- 预期: 返回 404 或错误提示"对象不存在"
- 实际: 返回 `{"success":true,"data":{"sessionId":null,"status":"running"}}`

**评估:** 这是个严重的体验问题。系统对一个根本不存在的对象返回"成功"，用户会以为请求被接受了，实际上什么都不会发生。

#### 5b: 发送空消息

- 操作: `POST /api/talk/kernel -d '{"message":""}'`
- 预期: 返回错误提示
- 实际: `{"success":false,"error":"缺少 message 字段"}`

**评估:** 错误提示可以理解，但说"缺少 message 字段"不太准确——字段存在，只是为空。应该说"消息内容不能为空"。

#### 5c: 无 body

- 操作: `POST /api/talk/kernel`（无 body）
- 实际: `{"success":false,"error":"Unexpected end of JSON input"}`

**评估:** 暴露了内部实现细节（JSON 解析错误）。应该说"请求体格式错误"。

#### 5d: 暂停不存在的对象

- 操作: `POST /api/stones/nonexistent/pause`
- 实际: `{"success":false,"error":"对象 \"nonexistent\" 不存在"}`

**评估:** 很好，清晰的错误提示。

#### 5e: 恢复不存在的 flow

- 操作: `POST /api/stones/iris/resume -d '{"flowId":"nonexistent_flow"}'`
- 实际: `{"success":false,"error":"Flow \"nonexistent_flow\" 不存在。提示：flowId 应为主任务 ID（如 task_xxx），不是子 flow ID（如 sub_xxx）"}`

**评估:** 非常好的错误提示，包含了解决建议。

---

### 场景 6: 向 kernel 追问（引用前一轮回答）

- 目的: 测试对象能否理解对之前回答的引用
- 操作: 向 kernel 发送"你刚才说了线程树有 5 个解决的问题，我觉得第 3 个（隔离与容错）最有趣。能详细展开讲讲吗？"
- 预期: kernel 详细展开隔离与容错
- 实际: kernel 在内部生成了详细的回答，但 API 返回的是摘要而非实际内容

**体验评估:**
- 任务完成: ⚠️ 部分完成 — 内部有详细回答，但 API 只返回了摘要
- 结果质量: 内部 ⭐⭐⭐⭐⭐ (5/5)，API 返回 ⭐⭐ (2/5)
- 等待时间: 44 秒
- 进度反馈: ❌ 无
- 交互自然度: 内部 ⭐⭐⭐⭐⭐，API 返回 ⭐⭐
- 主观感受: "如果能看到内部那个详细回答，我会非常满意。但我只能看到'已向用户详细展开...'这种摘要，这让我觉得系统在敷衍我。"

**关键发现:**
1. 线程的 `message_out` action 包含了非常详细的回答（结构隔离、故障边界、部分降级、可观测的失败）
2. 但 `thread_return` 只包含一句话摘要
3. Flow API 返回给用户的是 `thread_return` 的内容，而非 `message_out`
4. 这是 message_out 和 thread_return 的优先级/显示逻辑问题

**证据:**
- thread.json 的 actions 中有 `type: "message_out"` 包含完整回答
- thread.json 的 actions 中有 `type: "thread_return"` 只包含摘要
- Flow API 返回的 out message 内容等于 thread_return

---

## 发现的问题

### Issue 1 (CRITICAL) — 对象无法回答已读取的知识问题

- 类型: 功能缺失
- 位置: 线程树架构 / ThinkLoop
- 描述: Sophia 成功读取了 gene.md 文件，但在后续思考轮次中"忘记"了用户的原始问题，最终返回了"我已加载，请提问"而不是回答问题。这暴露了上下文管理在长执行链（41 actions）中的记忆丢失问题。
- 影响: 用户等了 3.5 分钟但得不到答案，这是核心功能的失败
- 触发方式: 向 sophia 问需要读取外部文件才能回答的问题
- 证据: thread.json 显示 41 个 actions，inbox 中用户消息 status=marked，thread_return 未引用用户问题
- 状态: ❌ 待修复

### Issue 2 (CRITICAL) — 暂停/恢复导致 Flow 失败

- 类型: 技术 bug
- 位置: 暂停恢复机制
- 描述: 暂停对象后发送消息，再恢复执行，flow 直接变为 failed 状态，0 个 actions 执行，无错误信息
- 影响: 基本控制功能不可用，用户无法通过暂停/恢复来干预对象行为
- 触发方式: 暂停对象 -> 发消息 -> 恢复（带 flowId）
- 证据: resume API 返回 status=failed, actions=[]
- 状态: ❌ 待修复

### Issue 3 (HIGH) — talk API 立即返回但无后续获取结果的渠道

- 类型: 体验不佳
- 位置: HTTP API 设计
- 描述: POST /api/talk 返回 `{"status":"running","sessionId":null}`，sessionId 为 null 导致用户无法轮询结果。用户无法知道：1）任务何时完成；2）任务的 flowId 是什么；3）如何获取回复内容
- 影响: 用户发送消息后陷入"信息黑洞"，无法知道系统是否在处理、何时完成、结果在哪
- 触发方式: 任何 talk 请求
- 证据: 所有场景中 talk API 返回 sessionId=null
- 状态: ❌ 待修复

### Issue 4 (HIGH) — message_out 被忽略，thread_return 摘要作为最终输出

- 类型: 体验不佳
- 位置: Flow API 输出逻辑
- 描述: 对象在 message_out action 中生成了详细的回答内容，但 Flow API 只返回 thread_return 的摘要。用户看到的是"已向用户详细展开..."而不是实际内容
- 影响: 用户看到的是摘要而非真实回答，严重降低了信息价值
- 触发方式: 对象同时产生 message_out 和 thread_return 时
- 证据: 场景 6 中 kernel 的 thread.json
- 状态: ❌ 待修复

### Issue 5 (HIGH) — 多轮对话没有上下文累积

- 类型: 功能缺失
- 位置: Flow/Thread 上下文管理
- 描述: 使用 flowId 进行多轮对话时，Flow API 只返回最新一轮的 messages，之前的对话历史丢失。对象在新一轮对话中也无法看到之前轮次的内容
- 影响: 多轮对话退化为独立咨询，无法进行真正的连续对话
- 触发方式: 使用 flowId 参数发送第二轮消息
- 证据: supervisor 场景中第二轮只返回第二轮的 messages
- 状态: ❌ 待修复

### Issue 6 (MEDIUM) — 对象文件读取能力极度贫乏

- 类型: 质量不足
- 位置: program 执行沙箱
- 描述: 对象在 program 沙箱中只有 `readFile` 可用（且路径支持有限），`glob`、`listDir` 都不可用。导致对象在找不到文件时无法自行探索文件系统，只能反复尝试不同路径
- 影响: 对象花费大量轮次（sophia 用了 ~30 轮）在简单的文件查找上，严重影响效率
- 触发方式: 让对象读取不在默认路径的文件
- 证据: sophia 的 thread.json 中多个 program 尝试 glob/listDir 失败
- 状态: ❌ 待修复

### Issue 7 (MEDIUM) — 与不存在的对象对话返回 success

- 类型: 体验不佳
- 位置: POST /api/talk/:objectName
- 描述: 向不存在的对象发送消息返回 `{"success":true,"status":"running"}`，用户会误以为请求被接受
- 影响: 用户以为消息发出去了，实际上什么都不会发生
- 触发方式: `POST /api/talk/nonexistent -d '{"message":"hello"}'`
- 证据: API 返回 success=true
- 状态: ❌ 待修复

### Issue 8 (LOW) — 错误提示暴露实现细节

- 类型: 体验不佳
- 位置: HTTP API 错误处理
- 描述: 空消息说"缺少 message 字段"（实际是字段为空），无 body 时暴露"Unexpected end of JSON input"
- 影响: 用户困惑
- 触发方式: 发送空消息或不带 body
- 证据: 场景 5b、5c 的错误信息
- 状态: ❌ 待修复

---

## 总体评估

### 系统亮点

1. **kernel 的回答质量很高** — 结构清晰、内容准确、有深度，像在和资深工程师对话
2. **supervisor 有组织思维** — 能根据 1+3 组织模型规划协作流程，回答体现了对系统的深刻理解
3. **对象角色感明确** — kernel 像工程师，supervisor 像管理者，sophia 像哲学家，角色区分度好
4. **错误提示质量不均但有好有坏** — resume 的错误提示包含了解决建议（如 flowId 提示），这是一个亮点

### 核心问题

1. **异步模型但无反馈机制** — 这是最基本的体验问题。用户发消息后完全没有办法知道系统在做什么、什么时候完成。这不是"可以改进"的问题，而是"用不了"的问题。
2. **上下文管理脆弱** — sophia 的案例表明，在长执行链中对象会丢失对原始问题的记忆。41 个 actions 中大量是无效的重复尝试，说明系统的错误恢复能力不足。
3. **message_out vs thread_return 的优先级问题** — 好的回答生成了但用户看不到，只看到摘要。这是"做了好事但没得到认可"的典型场景。
4. **暂停/恢复是坏的** — 基本的控制功能不可用。

### 一句话总结

系统的"大脑"（kernel、supervisor）非常聪明，能给出高质量的回答；但"神经系统"（API 层、上下文管理、状态反馈）还不够发达，用户很难触达这些聪明的回答。目前的状态是"引擎优秀但驾驶舱简陋"——用户知道车很有力，但看不到仪表盘、踩不到油门。
