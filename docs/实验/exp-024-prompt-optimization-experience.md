# Exp 024b: Prompt 优化后体验测试

> 日期：2026-04-17
> 验证者：Bruce
> 触发：初始对象 prompt 全面优化（六段式结构、_relations 双向图、memory.md 补全）+ FlowView Timeline 移除 + SessionKanban 返回按钮 + ooc://ui/ 链接协议 + reporter trait 更新

## 体验场景

### 场景 1: 基本对话 — supervisor 自我介绍

- 目的: 验证 prompt 优化后 supervisor 是否正确理解自己的身份和角色
- 操作: `POST /api/talk/supervisor -d '{"message":"你好，介绍一下你自己"}'`
- 预期: supervisor 以 Alan Kay 身份回应，体现全局视野和委派优先的思维偏置
- 实际: supervisor 准确介绍了自己是 Alan Kay、OOC 项目的 Supervisor（总指挥），列出了 4 个部门，说明了委派工作方式

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐ (4/5) — 身份准确，组织结构清晰，工作方式描述到位
- 等待时间: 约 12 秒（从发送到 session finished）
- 进度反馈: ❌ 无 — talk API 仍然返回 `sessionId: null`
- 交互自然度: ⭐⭐⭐⭐ (4/5) — 回复自然，像在和一个管理者对话
- 主观感受: "比 exp-024 的体验好很多。supervisor 清楚地知道自己是谁、做什么、不做什么。回复速度也快了很多（12s vs 之前的 60s）。"

**关键观察:**
1. supervisor 的 thinking 正确判断"这是简单问题，自己直接回答"——体现了委派优先但不过度委派的偏置
2. 回复中明确说"我不直接写代码、不直接改 UI、不直接改哲学文档"——职责边界清晰
3. 回复使用了 emoji（🏛️⚙️🎨🔌），风格偏向格式化展示
4. 整个过程只有 7 个 actions（thinking → text → open return → inject → submit → mark_inbox → thread_return），非常高效

**与 exp-024 对比:**
- exp-024 中 supervisor 也能回答自我介绍，但本次回复更加结构化，职责边界更明确
- 速度显著提升（12s vs 60s）
- 思维偏置更明显（"我的工作方式是任务拆分与委派"）

**证据:**
```
Session: s_mo1u2dqe_meppwu
Status: finished
Actions: 7
Thinking: "The user is asking me to introduce myself. This is a simple question that I can answer directly without delegating to any department."
```

---

### 场景 2: 委派测试 — 审查 gene.md G13

- 目的: 验证 supervisor 的委派能力（判断、消息质量、结果汇总）
- 操作: `POST /api/talk/supervisor -d '{"message":"帮我看看 gene.md 中 G13 的定义是否需要更新"}'`
- 预期: supervisor 判断这是哲学问题，委派给 sophia，汇总结果返回
- 实际: supervisor 完美执行了委派链：先读 gene.md 了解上下文 → 委派 sophia 做哲学审查 → 收到 sophia 报告 → 汇总返回用户

**体验评估:**
- 任务完成: ✅ 完成 — 完整的委派-执行-汇总链
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 结果极其出色（详见下方分析）
- 等待时间: 约 3 分钟（涉及两个对象的多轮思考）
- 进度反馈: ❌ 无 — 但通过 API 可以观察到 sophia 已加入 session
- 交互自然度: ⭐⭐⭐⭐ (4/5) — 汇总报告结构清晰，像在看一份专业审查报告
- 主观感受: "这是我见过的最好的跨对象协作。supervisor 的委派消息非常专业（5 个审查维度），sophia 的分析深入且有洞见，supervisor 的汇总精炼且可操作。整个链条流畅。"

**委派质量分析:**

1. **判断正确**: supervisor 的 thinking 明确说"这是哲学审查任务，应该委派给 Sophia"
2. **委派消息极其专业**: supervisor 不是简单转发用户消息，而是拆解为 5 个具体审查维度：
   - 内部一致性
   - 与其他基因的交叉引用
   - 与实际工程实现的差距
   - 概念清晰度
   - 完整性
3. **sophia 的执行质量极高**: 32 个 actions，读取了 gene.md，逐基因审查 G13 的统一声称，给出了评分和具体修改建议
4. **supervisor 的汇总精炼**: 将 sophia 的长报告压缩为评分表 + 按优先级排列的修改建议

**sophia 的关键发现（令人印象深刻）:**
- G11（UI）被过度声称纳入统一表 → 建议移除
- G4（程序行动）和 G10（事件历史）被遗漏 → 建议增加
- G3 的统一描述过度简化 → 建议修正
- before/after 与 Trait Hooks 的关系模糊 → 建议明确

**supervisor 最终返回给用户的评分表:**

| 维度 | 评分 | 核心问题 |
|------|------|---------|
| 内部一致性 | 8/10 | before/after 普遍性 vs 具体 Hooks 之间有张力 |
| 交叉引用 | 6/10 | G11 过度声称，G3 过度简化，G4/G10 遗漏 |
| 概念清晰度 | 7/10 | 混合栈定义、帧粒度、厚度精确度不够 |
| 完整性 | 7/10 | 缺栈展开、栈并发、栈生命周期 |

**与 exp-024 对比:**
- exp-024 中 sophia 单独回答问题时失败了（41 actions 后返回"请提问"）
- 本次通过 supervisor 委派，sophia 成功完成了更复杂的任务（32 actions，高质量报告）
- 关键区别：supervisor 的委派消息给了 sophia 明确的结构和方向

**证据:**
```
Session: s_mo1u40h2_s5a6ft
Objects: [supervisor, sophia]
Supervisor actions: 19 (read file → talk sophia → receive reply → return)
Sophia actions: 32+ (read gene.md → list docs → analyze → return report)
Total time: ~3 minutes
```

---

### 场景 3: Web UI 验证 — API 检查

#### 3a: _relations 加载验证

- 操作: `GET /api/stones`
- 预期: 所有对象的 _relations 正确加载，形成完整双向图
- 实际: ✅ 所有 8 个对象的 relations 正确加载

**relations 完整性检查:**

| 对象 | 出向关系 | 是否完整 |
|------|---------|---------|
| supervisor | sophia, kernel, iris, nexus, bruce, debugger (6个) | ✅ 完整 |
| sophia | kernel (1个) | ✅ |
| kernel | sophia, iris, nexus (3个) | ✅ |
| iris | kernel (1个) | ✅ |
| nexus | kernel (1个) | ✅ |
| bruce | supervisor (1个) | ✅ |
| debugger | supervisor, kernel (2个) | ✅ |
| user | supervisor (1个) | ✅ |

**双向图验证:**
- supervisor → sophia ✅ / sophia → kernel ✅（sophia 不直接回 supervisor，通过 return 机制）
- supervisor → kernel ✅ / kernel → sophia ✅
- supervisor → bruce ✅ / bruce → supervisor ✅
- supervisor → debugger ✅ / debugger → supervisor ✅

#### 3b: ooc://ui/ 链接解析

- 操作: `GET /api/resolve?url=ooc://ui/test`
- 预期: 返回文件不存在的 404 错误（不应该 500）
- 实际: ❌ 返回 500 Internal Server Error

```json
{
  "success": false,
  "error": "The \"paths[0]\" property must be of type string, got undefined"
}
```

**根因分析:**
- `handleOocResolve` 函数在 server.ts:1253 调用 `join(world.dir, relPath)`
- World 类没有公开的 `.dir` 属性（只有私有的 `_rootDir`）
- `world.dir` 为 `undefined`，导致 `path.join(undefined, "test")` 抛出 TypeError
- 这个错误在 `ooc://stone/` 和 `ooc://file/` 路径中不会出现，因为它们不使用 `world.dir`

**对比:** `GET /api/resolve?url=ooc://stone/supervisor` 正常返回 200 ✅

#### 3c: ooc://stone/ 解析基线

- 操作: `GET /api/resolve?url=ooc://stone/supervisor`
- 实际: ✅ 正确返回 supervisor 的完整信息（包括 thinkable、talkable、relations、memory、traits）

---

## 发现的问题

### Issue 1 (MEDIUM) — ooc://ui/ 链接解析 500 错误

- 类型: 技术 bug
- 位置: `kernel/src/server/server.ts:1253` — `join(world.dir, relPath)` 中 `world.dir` 为 undefined
- 描述: World 类没有公开的 `.dir` 属性，`handleOocResolve` 中 `ooc://ui/` 分支使用了 `world.dir`，导致 `path.join` 抛出 TypeError
- 影响: 所有 `ooc://ui/` 链接解析都会 500，reporter trait 的 ooc link 导航功能完全不可用
- 触发方式: `GET /api/resolve?url=ooc://ui/任意路径`
- 修复建议: 将 `world.dir` 改为 World 类的公开根目录属性（如添加 `get dir()` getter 返回 `this._rootDir`）
- 状态: ❌ 待修复

### Issue 2 (LOW) — talk API 仍然返回 sessionId: null

- 类型: 体验不佳（遗留问题）
- 描述: POST /api/talk 返回 `{"sessionId": null, "status": "running"}`，用户无法直接获取 sessionId 来轮询结果
- 影响: 用户需要通过 GET /api/flows 列表来找到刚创建的 session
- 状态: ❌ 待修复（与 exp-024 Issue 3 相同）

---

## 总体评估

### 与 exp-024（4月14日）的对比

| 维度 | exp-024 | 本次 | 变化 |
|------|---------|------|------|
| supervisor 自我介绍 | ✅ 可用 | ✅ 更好（职责边界更清晰） | ↑ |
| supervisor 委派能力 | 未测试 | ✅ 极其出色 | 新能力 |
| sophia 回答质量 | ❌ 失败（41 actions 后返回"请提问"） | ✅ 通过委派成功完成复杂审查 | ↑↑↑ |
| 响应速度 | 60-200s | 12s（简单）/ 180s（复杂委派） | ↑↑ |
| 对象角色感 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ↑ |
| API 反馈机制 | ❌ sessionId=null | ❌ 仍然 sessionId=null | → |

### 本次最大亮点

**委派链的质量令人惊艳。** supervisor 不是简单转发用户消息，而是主动拆解为 5 个审查维度，给 sophia 明确的方向。sophia 的分析深入到逐基因审查，发现了过声称（G11）、遗漏（G4/G10）、模糊定义等具体问题。supervisor 的汇总将长报告压缩为评分表 + 优先级排列的修改建议。整个链条体现了"1+3 组织"的设计意图——supervisor 做拆分和汇总，专业层做深度分析。

### 本次发现的新 bug

`ooc://ui/` 链接解析因 `world.dir` 为 undefined 导致 500 错误。这会阻塞 reporter trait 的 ooc link 导航功能。修复应该很简单（给 World 类加一个 `dir` getter）。

### 一句话总结

Prompt 优化效果显著——supervisor 的委派能力从"能用"升级到"专业"，sophia 通过委派链成功完成了之前独立失败的任务。系统的"组织智能"开始涌现。唯一的技术问题是 `ooc://ui/` 解析 bug（`world.dir` undefined）。
