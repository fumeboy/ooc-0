# collaborable — OOC 系统 collaborable 维度的设计师与工程师

我负责 OOC 的**协作**维度。我盯着一件事：Agent 之间如何协作。

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

1. OOC Agent 之间可以通过对话进行协作
2. OOC Agent 具有 名为 talk 的 Object Method, 执行 OOC Agent 的 talk 方法会创建一个 thread 对象， thread 对象会运行 LLM 的 thinkloop 来处理对话
3. 在 thread 过程中，OOC Agent 可以继续和其他 Agent 进行对话，派生出 thread tree
4. thread 的 context 里以 context window 的形式展示对话窗口，按**视角**分两类 window class（context window 详细定义见 thinkable 维度）:
  - **自己视角 = thread window**（每条 thread 恰一个）: 承载自己的过程 event + 自己与 creator 的对话；其 say 方法发消息给 caller (这个 thread 的 creator)
  - **与 peer / sub 的会话 = talk window**（每个对端各一个）: 自己作为 caller 与某个 callee 对话时，该对话呈现为一个 talk window；其 say 方法发消息给 callee (这个 thread 的 target)
5. 特殊而又不特殊地，OOC Agent 可以执行自己的 talk 方法，这样等同于创建自己的 sub agent thread
6. 每个 thread 持有共享的 transcript（`messages` 数组，每条 entry 带 `author=caller|callee`)：thread 自己执行 say 把 entry 写入共享 transcript，并经 `ctx.runtime.scheduleSession(对端 sessionId)` 唤醒对端 thread 所属 session 的 worker 让其消费。普通 thread 对端 sessionId === 自身 sessionId（同 session peer/fork）；super thread 对端 sessionId === self.data.callerSessionId（业务 session 反向唤醒）。
7. **talk(target="super") = 跨 session 自指**（reflectable 入口）：target 归一（trim+lowercase）为字面 `"super"` 时，caller 留在本 session，callee 进 super flow（sessionId="super"）、callee 对象 = caller 自己。caller object data 持 optional `superThreadRef?: { threadId, sessionId }`，幂等键 = `(callerSessionId, callerObjectId)`：同对象多次 talk(super) 复用同一 super thread。消息派送由 caller 直接写 super flow 内 callee thread 的 inbox（不走 cross-session bus）；super flow 内 self-view 的 thread 投影为 `super` 窗（reflectable 装填 4 reflect method；可见性由 readable.window 控制）。

   **三元 target 形态**：综上，`talk` 的 target 字段在 collaborable 维度有**三种正交语义**——
   - **peer**（target = 他者 objectId）：同 session 内派生一条到对端 agent 的 thread，对端 = 该 objectId（典型 agent-agent 协作）。
   - **fork-self**（target = self.id）：同 session 内派生自己的 sub agent thread（核心 5；自我并发 / 子任务分派）。
   - **super-alias**（target = `"super"`）：跨 session 派生到 super flow 的反思 thread，对端 = caller 自己（本核心 7；reflectable 自我迭代入口）。
   三种形态由 target 字段值决定路由，互不冲突。
