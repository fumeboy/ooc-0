# Exp 016: 可观测性框架 + Skill 系统体验测试

> 日期：2026-04-12
> 验证者：Bruce（由 Alan Kay spawn）
> 触发：Skill 系统实现 + 可观测性框架实现

## 体验场景

### 场景 1: 通过 debug 模式观察 OOC 处理复杂请求

- 目的: 让 bruce 对象回顾 meta.md，梳理 OOC 对象的人机交互能力
- 操作:
  1. `POST /api/debug/enable` 开启 debug 模式
  2. `POST /api/talk/bruce` 发送请求
  3. 分析 debug 目录下的 loop 数据
- 预期: bruce 读取 meta.md 全文，产出结构化的人机交互能力梳理报告
- 实际: 9 轮 ThinkLoop，仅 4 个有效 actions（2 thought + 2 program），任务未完成

**体验评估:**
- 任务完成: ❌ 未完成 — 只读了 meta.md 前 500 行就停了，没有产出最终报告
- 结果质量: ⭐⭐ (2/5) — 成功读取了部分文件，但没有分析和总结
- 等待时间: 首次响应 ~5s，总耗时 ~80s（9 轮 LLM 调用）
- 进度反馈: ⚠️ debug 文件记录完整，但 SSE 事件未验证
- 交互自然度: ⭐⭐ (2/5) — 对象反复尝试相同操作，像卡在循环里
- 主观感受: "等了 80 秒，对象只读了半个文件就停了。debug 数据很有价值，帮我快速定位了问题。"

### 场景 2: Debug 模式可观测性验证

- 目的: 验证 debug 模式是否正确记录每轮 ThinkLoop 数据
- 预期: 每轮生成 input.txt + output.txt + meta.json（+ thinking.txt 如有）
- 实际: ✅ 完美工作

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 9 轮全部记录，meta.json 结构完整
- 主观感受: "debug 数据非常有价值，能清楚看到每轮的 context 大小、LLM 延迟、token 消耗、解析出的指令"

## 发现的问题

### Issue 1 (CRITICAL) — LLM 输出格式不稳定，大量轮次被浪费

- 类型: 技术 bug / 质量不足
- 位置: LLM 输出层 + parser 容错
- 描述: 9 轮中有 5 轮 LLM 输出格式不正确，parser 无法解析：
  - Loop 1: 纯文本（"我收到任务了..."），无 TOML 格式
  - Loop 2: `` ```toml `` 代码块包裹，parser 可能未正确处理
  - Loop 3: 使用了 `[top_thought]` 而非 `[thought]`（幻觉标签）
  - Loop 5-7: `` ```toml `` 代码块包裹
  - Loop 8: 混合纯文本 + 多个 `[program]` 段（只有第一个被执行）
  - Loop 9: 纯英文文本
- 影响: 56% 的 LLM 调用被浪费（5/9 轮无效），token 和时间双重浪费
- 触发方式: 向 bruce 发送需要多轮思考的复杂任务
- 证据:
  ```
  Loop 1 directives: []  (纯文本)
  Loop 2 directives: []  (```toml 包裹)
  Loop 3 directives: []  ([top_thought] 幻觉)
  Loop 4 directives: ['thought', 'program']  ✅
  Loop 5 directives: []  (```toml 包裹)
  Loop 6 directives: []  (```toml 包裹)
  Loop 7 directives: []  (```toml 包裹)
  Loop 8 directives: []  (混合格式)
  Loop 9 directives: []  (纯文本)
  ```
- 状态: ❌ 待修复
- 建议:
  1. parser 应支持 `` ```toml `` 代码块包裹的 TOML（当前 safeParseToml 已有此逻辑，需排查为何未生效）
  2. 当 LLM 输出纯文本时，应自动包装为 `[thought]` 而非丢弃
  3. 在 computable trait 中强化输出格式要求（更多示例）

### Issue 2 (HIGH) — 任务未完成就终止

- 类型: 功能缺失
- 位置: engine 层 / 迭代控制
- 描述: bruce 只读了 meta.md 的前 500 行就停止了，没有继续读取剩余部分，也没有产出最终的梳理报告
- 影响: 用户的核心需求未被满足
- 证据: thread.json 只有 4 个 actions，最后一个是读取 offset=200 的 program，之后就没有更多有效输出
- 状态: ❌ 待修复（可能与 Issue 1 相关——后续轮次的输出格式错误导致无法继续推进）

### Issue 3 (MEDIUM) — activeTraits 始终为空

- 类型: 技术 bug
- 位置: debug.ts / engine.ts 集成
- 描述: 所有 9 轮的 meta.json 中 `activeTraits` 都是空数组 `[]`，但 bruce 对象应该有 kernel traits 激活
- 影响: debug 数据不完整，无法通过 meta.json 判断 trait 激活状态
- 证据: `"activeTraits": []`（所有 9 轮）
- 状态: ❌ 待修复
- 建议: 检查 `context.scopeChain` 是否正确传递到 debug 记录

### Issue 4 (LOW) — context 统计中 parentExpectation 始终为 0

- 类型: 观察
- 描述: root 线程没有 parentExpectation 是正常的，但 debug 数据中应该能区分"没有"和"为空"
- 状态: ⚠️ 低优先级

## Debug 模式体验评估

### 正面发现

1. **文件结构清晰**: `loop_NNN.{input,output,thinking,meta}.{txt,json}` 命名直观
2. **meta.json 信息丰富**: latency、tokens、context sections 一目了然
3. **API 开关便捷**: `POST /api/debug/enable` 即时生效
4. **thinking.txt 有价值**: 能看到 LLM 的内部推理过程

### 关键数据洞察

| 指标 | 值 | 评价 |
|------|-----|------|
| 总轮次 | 9 | 过多（有效只有 2 轮） |
| 有效轮次 | 2/9 (22%) | 严重浪费 |
| 平均延迟 | 8.8s/轮 | 可接受 |
| Context 大小 | 31K→39K chars | 合理增长 |
| instructions 占比 | 53% | 偏高，可优化 |
| whoAmI 占比 | 24% | bruce 的 readme 较长 |
| Token 消耗 | ~135K total | 有效利用率低 |

## 总体评估

Debug 模式本身工作出色——9 轮完整记录，meta.json 结构清晰，帮助我在 2 分钟内定位了 LLM 输出格式不稳定的核心问题。但被观测的系统本身表现不佳：LLM 输出格式不稳定导致大量轮次浪费，任务最终未完成。最紧迫的问题是 parser 对非标准格式的容错能力。
