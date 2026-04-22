# Test Watch + 失败自动投递

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P0

## 背景 / 问题描述

OOC 当前测试闭环靠人手：
- Bruce 手动 `bun test`
- 发现失败 → 写进执行记录 → agent 手动看
- 没有"写完代码立刻知道测试挂了"的即时反馈

对标现代 TDD agent：watch mode + 失败即推送到 LLM。

## 目标

1. **TestRunner**：`kernel/src/test/runner.ts`（或 trait `computable/testable` 扩展）
   - 支持 watch 模式启动 `bun test --watch`
   - 解析输出，提取失败的 test 名 + file:line + stack
2. **失败 inbox 投递**：
   - 对应文件的修改线程收到 inbox 消息 `{source: "test_failure", content: "X test failed: ..."}`
   - LLM 下一轮 Context 直接看到
3. **覆盖率追踪**：
   - 运行 `bun test --coverage`
   - 标识哪些新代码没被测试覆盖
   - inject `<knowledge name="coverage">` 列出未覆盖函数

## 方案

### Phase 1 — Runner 封装

- `computable/testable` trait 新方法：
  - `run_tests({filter?, coverage?})` — 一次性跑
  - `watch_tests({patterns?})` — 启动 watch server，返回 watch_id
  - `stop_watch(watch_id)`

### Phase 2 — 失败推送

- watch server 失败时调 world.talk(stoneName, "[test_failure] ...") 把失败投递给对应对象

### Phase 3 — Coverage

- 解析 istanbul 输出
- context 新增 coverage window

### Phase 4 — E2E

- LLM 写一个函数 + 一个不完整的测试 → watch 跑 → 发现挂了 → LLM 看到后完善测试

## 影响范围

- `kernel/traits/computable/testable/` 扩展
- `kernel/src/test/runner.ts`（新）
- `kernel/src/thread/context-builder.ts`（coverage 窗口）

## 验证标准

- E2E：改一个测试文件让它挂 → 2 秒内对应对象 inbox 收到失败消息

## 执行记录

### 2026-04-22 P0-CodeAgent 落地

- 新建 `kernel/src/test/runner.ts`：runTests / startWatch / stopWatch / subscribeFailures / parseSummary / parseFailures / parseCoverage / summarizeCoverage
- 新建 `kernel/traits/computable/testable/index.ts`：5 个 llm_methods — run_tests / watch_tests / stop_watch / list_watches / test_coverage
- TRAIT.md 补充方法文档
- 测试：`tests/test-runner.test.ts` + `tests/trait-testable.test.ts`，19 tests pass
- 全量基线：668 → 704 pass / 6 skip / 0 fail

### 未完成 / backlog

- 失败自动投递 inbox：需要 runner-to-world 的桥接层（subscribeFailures 已开放，待 world 侧接入）
- coverage window 注入 `<knowledge name="coverage">`：需要 context-builder 侧改造
- watch 的 stdout 增量解析目前较粗糙（触发条件是看到 N fail 字样），高并发下可能漏
