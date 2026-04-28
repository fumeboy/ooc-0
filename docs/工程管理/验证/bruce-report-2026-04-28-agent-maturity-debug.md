# Bruce 体验测试报告 · 2026-04-28（成熟 Agent 系统复杂任务）

> 测试者：Bruce
> 触发方式：spawn sub agent，以成熟智能 Agent 系统的标准处理复杂需求
> 观察方式：OOC Server debug mode，检查 LLM input/output/thinking/meta 与会话状态
> 后端：`localhost:8080`
> 前端：`localhost:5173`
> 主要测试 session：`s_mohj7tas_c83nce`
> 主要 debug 目录：`flows/s_mohj7tas_c83nce/objects/supervisor/threads/th_mohj7tfy_9nhvba/debug/`

## 任务设定

把 OOC 当作一个成熟的智能 Agent 系统，让 supervisor 处理复杂需求：

- 需要理解需求、规划工作、跨对象协作。
- 需要自然使用可用工具和 trait method 完成任务。
- 开启 debug mode，观察输入、输出、思考过程和协议执行状态。
- 发现明确问题后立即修复，不等待人工确认。

## 体验结论

本轮验证说明：OOC 已经具备可用的复杂任务处理链路，supervisor 会进行规划、协作和工具调用；但在成熟 Agent 标准下，协议鲁棒性仍是核心短板。Bruce 观察到多轮循环里模型会偶发输出空参数工具调用，例如 `open({})`、`refine({})`、`submit({})`、`close({})`。这些行为本身可能来自模型，但系统侧必须把它们变成可恢复、可纠错、可观测的协议事件，而不是静默空转或误报成功。

## 已确认问题

### P1：`submit({})` 偶发导致 Form undefined

- 现象：当当前线程只有一个 active form 时，模型偶发直接调用 `submit({})`。旧逻辑按空 `form_id` 提交，导致 `Form undefined`。
- 判断：如果只有唯一 active form，空 `submit({})` 可以安全解释为提交该 form。
- 修复：`submit` 在缺少 `form_id` 且只有一个 active form 时自动使用该 form。
- 覆盖：新增 `tests/submit-empty-fallback.test.ts`。

### P1：协作对象同步回复后，父线程仍可能保持 running/waiting 异常

- 现象：`talk(wait=true)` 发送给非 user 对象时，如果对方同步回复，父线程唤醒顺序不稳定，可能出现协作完成后仍处于异常运行状态。
- 判断：等待状态必须先落盘，再调用 `onTalk`，否则同步回复可能早于等待状态注册。
- 修复：`executeTalkCommand` 在调用 `onTalk` 前先设置 `waiting/talk_sync`。
- 覆盖：扩展 `tests/thread-talk-sync-user.test.ts`，验证同步回复后父线程会被唤醒并继续完成。

### P1：`refine({})` 被误判为成功累积

- 现象：Bruce 在 `s_mohj7tas_c83nce` 中观察到空 `refine({})` 被处理为成功累积参数，但实际上没有改变任何参数。
- 判断：空 refine 没有推进任务，应作为协议错误反馈给 LLM。
- 修复：当 `refine` 缺少非空 `args` 时注入明确错误，不再写入 `[refine] Form ... 已累积参数` 成功消息。
- 覆盖：新增 `refine({}) 不应被当作成功累积` 测试。

### P1：连续 `open({})` 错误反馈不够强

- 现象：`open({})` 已经收到参数错误后，模型仍可能继续重复空 open。
- 判断：第一次错误要解释必填字段；重复错误要升级为连续协议错误，明确提示下一步不要继续调用 `open({})`。
- 修复：新增 `protocol-guards.ts`，集中生成 invalid open 反馈；重复出现时注入连续协议错误。
- 覆盖：新增连续 `open({})` escalation 测试。

### P1：`close({})` 对唯一 active form 缺少兜底

- 现象：模型在只有一个 active form 时调用 `close({})`，旧逻辑按空 `form_id` 关闭失败。
- 判断：与 `submit({})` 一致，唯一 active form 场景可以安全兜底。
- 修复：`close` 缺少 `form_id` 且只有一个 active form 时自动关闭该 form；没有唯一 active form 时给出明确错误。
- 覆盖：新增 `close({})` fallback 测试。

## 剩余观察

### P2：长任务用户可见进度不足

Bruce 观察到复杂任务超过 2 分钟时，用户侧可见中间结果仍偏弱。debug 里能看到 loop 输入输出，但 UI/会话消息里缺少足够稳定的阶段性进展表达。这不是协议正确性问题，但会影响成熟 Agent 的信任感。

### P3：debug meta 信息还可增强

debug 目录已经能记录 `input.txt`、`output.txt`、`thinking.txt`、`meta.json`。后续可以继续增强 `meta.json` 中的上下文统计、工具调用摘要和模型配置，让体验测试更容易定位问题。

## 本轮修复文件

- `kernel/src/executable/commands/talk.ts`
- `kernel/src/thinkable/engine/engine.ts`
- `kernel/src/thinkable/engine/protocol-guards.ts`
- `kernel/tests/thread-talk-sync-user.test.ts`
- `kernel/tests/submit-empty-fallback.test.ts`

## 验证

已通过：

```bash
bun test tests/submit-empty-fallback.test.ts tests/command-execution-split.test.ts
bun run typecheck
bun test
```

全量测试结果：`1059 pass, 4 skip, 0 fail`。
