# Exp 025: 深度自由体验测试

> 日期：2026-04-17
> 验证者：Bruce
> 触发：线程树架构集成后的全面体验测试

## 体验场景

### 场景 1: 基础对话 — 向 supervisor 提问 OOC 核心哲学

- 目的: 测试基本对话能力和回答质量
- 操作: `POST /api/talk/supervisor` — "OOC 的核心哲学是什么？请简要概括。"
- 预期: 准确、有深度的哲学概括
- 实际: supervisor 主动读取 gene.md 后给出了三层哲学概括（本体论/认识论/进化论）+ 统一模型（认知栈），最后一句话总结。质量极高。

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 结构清晰，三层递进，引用具体基因编号，一句话总结精炼
- 等待时间: 首次响应 ~20s（LLM 调用），总完成 ~70s（3 轮 ThinkLoop：读文件→思考→返回）
- 进度反馈: ⚠️ HTTP API 异步返回，无法通过 API 感知进度（需要轮询 process 端点）
- 交互自然度: ⭐⭐⭐⭐ (4/5) — 回答像一个有深度的专家，但 talk API 返回 sessionId: null 让人困惑
- 主观感受: "回答质量让我惊喜，但不知道任务什么时候完成，需要反复轮询"

**证据:**
- sessionId: `s_mo2aple1_0bi8q4`
- talk API 返回 `sessionId: null`（未预创建 session 时）
- 最终 summary 包含完整的三层哲学分析 + G13 统一模型

**发现的问题:**
- Issue 1 (MEDIUM): talk API 未预创建 session 时返回 `sessionId: null`，用户无法追踪任务
- Issue 5 (MEDIUM): GET /api/flows/:sessionId 在任务运行中返回 404（race condition）

---

### 场景 2: 跨对象协作 — supervisor 委派 sophia 分析基因

- 目的: 测试跨对象消息传递和协作完成度
- 操作: 预创建 session → `POST /api/talk/supervisor` — "请委派 sophia 分析一下：OOC 的 13 条基因中，哪 3 条最核心？为什么？"
- 预期: supervisor 委派 sophia，sophia 完成分析后结果回传给 supervisor
- 实际: 完整的跨对象协作链成功完成。supervisor 创建 kanban issue → 委派 sophia → sophia 读取 gene.md 并分析 → 返回结果 → supervisor 汇总并返回用户。

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — sophia 选出 G1/G3/G4 并给出哲学三元组论证（存在→本质→行动），论证严密
- 等待时间: 总完成 ~4 分钟（supervisor 准备 + sophia 读文件分析 + supervisor 汇总）
- 进度反馈: ⚠️ 可通过 process API 看到进度，但需要主动轮询两个对象
- 交互自然度: ⭐⭐⭐⭐⭐ (5/5) — supervisor 的委派消息结构清晰（任务+交付标准），sophia 的分析像哲学论文
- 主观感受: "跨对象协作真的能工作，而且质量很高。但等待 4 分钟有点长，过程中不知道进展到哪了"

**证据:**
- sessionId: `s_mo2arh80_hgvp8c`
- supervisor 创建了 kanban issue-001
- sophia 的分析：G1（存在论基础）、G3（身份与自主性）、G4（行动机制）
- supervisor 汇总了 sophia 的结果并返回

---

### 场景 3: 复杂任务 — 线程树架构分析（含子线程）

- 目的: 测试复杂任务的子线程创建和并行执行
- 操作: `POST /api/talk/supervisor` — "请详细分析 OOC 的线程树架构设计..."
- 预期: supervisor 拆分任务为子线程，并行执行后汇总
- 实际: supervisor 创建了 2 个子线程（Sophia 哲学分析 + Kernel 工程分析），然后调用 await_all 等待。但子线程始终 0 actions，从未开始执行。supervisor 陷入反复 await_all 的循环，最终进入 waiting 状态。

**体验评估:**
- 任务完成: ❌ 未完成
- 结果质量: N/A — 任务卡住
- 等待时间: 超过 5 分钟后仍未完成，最终进入 waiting 状态
- 进度反馈: ⚠️ 可以看到 supervisor 在创建子线程和 await，但子线程无进展
- 交互自然度: N/A
- 主观感受: "supervisor 的任务拆分思路很好（哲学+工程两个维度），但子线程机制似乎有 bug，创建后不执行"

**证据:**
- sessionId: `s_mo2b3qx0_mxeydm`
- supervisor 创建子线程 th_mo2b80ia_xz3yoe（Sophia）和 th_mo2b8nkj_h8e62v（Kernel）
- 两个子线程 actions=0，status=doing
- supervisor 反复调用 await_all，最终 session status=waiting
- 注意：这里的子线程是 supervisor 内部的子线程，不是跨对象委派

---

### 场景 4: 对象浏览 — 查看对象身份、数据、traits、关系

- 目的: 测试对象信息的可读性和完整性
- 操作: GET /api/stones, GET /api/stones/:name, GET /api/stones/:name/readme, GET /api/stones/:name/traits
- 预期: 清晰展示对象的各个维度
- 实际: 所有 API 正常工作，数据丰富且结构清晰。

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 对象信息非常丰富：whoAmI、思维偏置、职责边界、行为铁律、示例、文档位置
- 交互自然度: ⭐⭐⭐⭐ (4/5) — API 返回结构清晰，但 traits 列表很长（kernel traits 全部列出）
- 主观感受: "对象的自我描述写得非常好，像在看一个人的简历。supervisor 的 readme 尤其出色"

**证据:**
- supervisor: 完整的 whoAmI（含思维偏置、职责边界、委派规则、示例）+ memory + 6 个 relations
- bruce: 有历史实验数据（experiments_completed=3, issues_found=9）+ memory
- kernel traits: 10 个 kernel-level traits，每个都有详细的 readme

---

### 场景 5: 错误处理 — 边界情况测试

- 目的: 测试系统对异常输入的处理
- 操作:
  1. 发送空字符串消息
  2. 向不存在的对象发消息
  3. 发送缺少 message 字段的请求
- 预期: 清晰的错误提示
- 实际:
  1. ✅ 空字符串 → "缺少 message 字段"（正确拒绝）
  2. ❌ 不存在的对象 → `success: true, status: "running"`（应该返回错误）
  3. ✅ 缺少字段 → "缺少 message 字段"（正确拒绝）

**体验评估:**
- 任务完成: ⚠️ 部分通过
- 结果质量: ⭐⭐⭐ (3/5) — 基本验证通过，但不存在对象的处理有问题
- 主观感受: "向不存在的对象发消息居然返回成功，这会让用户困惑"

**证据:**
- `POST /api/talk/nonexistent_object` → `{"success":true,"data":{"sessionId":null,"status":"running"}}`
- 实际上异步执行失败了（没有创建 session），但 API 层面返回了成功

---

### 场景 6: 暂停与恢复

- 目的: 测试 pause/resume 机制
- 操作:
  1. 暂停 kernel
  2. 向 kernel 发消息
  3. 检查 flow 状态（应该是 paused/0 actions）
  4. 恢复 kernel
  5. 检查任务完成
- 预期: 暂停后消息排队，恢复后正常执行
- 实际: 暂停和恢复都工作了。kernel 被暂停后收到消息，flow 创建但 0 actions。恢复后 kernel 正常完成任务。

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐ (4/5) — 机制工作正常
- 主观感受: "暂停/恢复基本可用，但有两个问题"

**发现的问题:**
- Issue 3 (HIGH): 恢复后 flow 最终状态是 "failed" 而非 "finished"，即使任务成功完成
- Issue 7 (LOW): resume API 的错误提示 "flowId 应为主任务 ID" 在对象刚暂停还没有 flow 时容易困惑

**证据:**
- sessionId: `s_mo2az7pr_0c3sy5`
- pause → 0 actions → resume → 7 actions（完整的自我介绍）→ status: "failed"
- kernel 的回复内容完整且质量高，但 status 标记为 failed

---

### 场景 7: Session 管理

- 目的: 测试 session 列表、标题更新
- 操作: GET /api/flows, PATCH /api/sessions/:id
- 预期: 能看到所有 session 并管理
- 实际: session 列表正常，标题更新正常。

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐ (3/5) — 基本功能可用，但有体验问题
- 主观感受: "能看到 session 列表，但很多 session 没有标题，不知道是什么任务"

**发现的问题:**
- Issue 6 (MEDIUM): 预创建 session 后发消息，session title 为空（只有直接 talk 不带 sessionId 时才自动设置 title）

---

### 场景 8: 多轮对话 / 上下文记忆

- 目的: 测试同一 session 内的多轮对话记忆
- 操作:
  1. 第一轮: "我叫 Bruce，我是 OOC 的体验测试者。请记住我的名字。"
  2. 第二轮: "你还记得我叫什么名字吗？我是做什么的？"
- 预期: 第二轮能回忆第一轮的内容
- 实际: 第一轮正常完成。第二轮消息被投递到 inbox，但线程已经 done，消息未被处理。

**体验评估:**
- 任务完成: ❌ 第二轮消息未被处理
- 结果质量: ⭐⭐ (2/5) — 第一轮质量好，但多轮对话不工作
- 主观感受: "这是最让我失望的地方。多轮对话是最基本的需求，但第二条消息石沉大海"

**证据:**
- sessionId: `s_mo2aze62_ya6ffo`
- thread.json 中 inbox 有两条消息，第一条 marked ack，第二条 unmarked
- 只有一个 thread（th_mo2b0mc8_a4yhtm），status=done
- 第二条消息到达时线程已完成，没有机制重新激活线程或创建新线程

---

### 场景 9: 取消运行中的任务

- 目的: 测试 DELETE /api/flows/:sessionId 取消机制
- 操作: 发送复杂任务 → 5 秒后 DELETE
- 预期: 任务被取消，状态变为 failed
- 实际: DELETE 返回 `cancelled: 0`，任务继续运行

**体验评估:**
- 任务完成: ❌ 取消失败
- 结果质量: N/A
- 主观感受: "无法取消一个正在运行的任务，这让人感到失控"

**证据:**
- sessionId: `s_mo2b3qx0_mxeydm`
- `DELETE /api/flows/s_mo2b3qx0_mxeydm` → `{"success":true,"data":{"sessionId":"s_mo2b3qx0_mxeydm","cancelled":0}}`
- 任务继续运行（62 actions 后仍在 doing）
- 原因：DELETE 逻辑查找 data.json 中的 status，但线程树架构不使用 data.json

---

## 发现的问题

### Issue 1 (HIGH) — 向不存在的对象发消息返回 success

- 类型: 技术 bug
- 位置: `kernel/src/server/server.ts` — talk 路由
- 描述: `POST /api/talk/nonexistent_object` 返回 `success: true`，但实际异步执行失败
- 影响: 用户以为消息发送成功，实际上什么都没发生。没有任何反馈告知对象不存在
- 触发方式: `curl -X POST http://localhost:8080/api/talk/nonexistent_object -d '{"message":"hello"}'`
- 证据: 返回 `{"success":true,"data":{"sessionId":null,"status":"running"}}`
- 建议: talk 路由应在异步执行前检查对象是否存在，不存在则返回 404
- 状态: ❌ 待修复

### Issue 2 (CRITICAL) — 多轮对话第二条消息不被处理

- 类型: 功能缺失
- 位置: 线程树架构 — 消息投递与线程生命周期
- 描述: 同一 session 内发送第二条消息时，消息被投递到 inbox，但线程已 done，无人处理
- 影响: 多轮对话完全不可用。这是最基本的用户需求
- 触发方式: 在同一 sessionId 下连续发送两条消息（第一条处理完后发第二条）
- 证据: thread.json inbox 中有两条消息，第二条 unmarked，线程 status=done
- 建议: 线程 done 后收到新消息时，应创建新线程或重新激活线程
- 状态: ❌ 待修复

### Issue 3 (HIGH) — 暂停恢复后 flow 状态为 failed

- 类型: 技术 bug
- 位置: resume 流程
- 描述: kernel 被暂停后恢复，任务成功完成（有完整回复），但 flow 最终状态是 "failed"
- 影响: 用户看到 "failed" 会以为任务失败了，实际上任务成功了
- 触发方式: pause → talk → resume
- 证据: sessionId `s_mo2az7pr_0c3sy5`，status=failed，但 messages 中有完整的成功回复
- 状态: ❌ 待修复

### Issue 4 (CRITICAL) — DELETE 取消无法终止线程树架构的任务

- 类型: 功能缺失
- 位置: `kernel/src/server/server.ts` — DELETE /api/flows/:sessionId
- 描述: DELETE 逻辑查找 data.json 中的 running 状态，但线程树架构使用 threads.json，导致 cancelled=0
- 影响: 用户无法取消卡住或不需要的任务，失去对系统的控制
- 触发方式: 发送任务 → DELETE /api/flows/:sessionId → cancelled: 0
- 证据: `{"success":true,"data":{"sessionId":"s_mo2b3qx0_mxeydm","cancelled":0}}`
- 建议: DELETE 逻辑需要适配线程树架构，读取 threads.json 并终止运行中的线程
- 状态: ❌ 待修复

### Issue 5 (HIGH) — 子线程创建后不执行

- 类型: 技术 bug
- 位置: 线程树调度器
- 描述: supervisor 通过 create_sub_thread 创建的子线程始终 0 actions，从未开始执行
- 影响: 依赖子线程的复杂任务无法完成，supervisor 陷入 await_all 死循环
- 触发方式: 给 supervisor 一个需要拆分为子线程的复杂任务
- 证据: sessionId `s_mo2b3qx0_mxeydm`，两个子线程 actions=0，supervisor 反复 await_all
- 状态: ❌ 待修复

### Issue 6 (MEDIUM) — talk API 未预创建 session 时返回 sessionId: null

- 类型: 体验不佳
- 位置: `kernel/src/server/server.ts` — talk 路由
- 描述: 不带 sessionId 调用 talk 时，返回 `sessionId: null`，用户无法追踪任务
- 影响: 用户需要去 flows 列表里找刚创建的 session，体验不流畅
- 触发方式: `curl -X POST /api/talk/supervisor -d '{"message":"hello"}'`（不带 sessionId）
- 建议: talk 路由应自动创建 session 并返回 sessionId
- 状态: ❌ 待修复

### Issue 7 (MEDIUM) — 预创建 session 的 title 为空

- 类型: 体验不佳
- 位置: session 创建流程
- 描述: 通过 sessions/create 预创建 session 后发消息，session title 始终为空
- 影响: session 列表中很多无标题条目，难以区分
- 触发方式: POST /api/sessions/create → POST /api/talk/:name with sessionId
- 证据: flows 列表中多个 session title 为空
- 建议: 第一条消息到达时自动设置 title（取消息前 N 个字符）
- 状态: ❌ 待修复

### Issue 8 (LOW) — GET /api/flows/:sessionId 运行中返回 404（race condition）

- 类型: 技术 bug
- 位置: `kernel/src/server/server.ts` — flow detail 路由
- 描述: 任务运行中时，GET /api/flows/:sessionId 可能返回 "Flow 不存在"
- 影响: 用户在任务运行中无法通过此 API 查看状态（需要用 process API 替代）
- 触发方式: 发送消息后立即查询 flow detail
- 证据: s_mo2aple1_0bi8q4 运行中返回 404，完成后返回正常
- 建议: flow detail 路由应支持从 threads.json 读取运行中的状态
- 状态: ❌ 待修复

---

## 总体评估

OOC 系统在**单轮对话**和**跨对象协作**方面表现出色。supervisor 的回答质量极高，sophia 的哲学分析令人印象深刻，跨对象委派链（supervisor → sophia → 返回）完整可靠。对象的自我描述（whoAmI、思维偏置、职责边界）设计得非常好，让每个对象都有鲜明的个性。

但系统在**多轮对话**和**任务控制**方面存在严重缺陷。多轮对话第二条消息不被处理（Issue 2）是最关键的问题——这是用户最基本的需求。任务无法取消（Issue 4）和子线程不执行（Issue 5）也严重影响了复杂任务的可用性。

线程树架构的引入带来了结构化的好处（可以看到清晰的线程树、子线程、await 关系），但与旧的 API 层（flow detail、cancel）存在兼容性问题，需要尽快适配。

**一句话总结**：单轮对话质量 5 星，但多轮对话和任务控制是当前最大的短板。
