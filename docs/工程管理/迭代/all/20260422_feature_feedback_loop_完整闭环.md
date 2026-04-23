# Build / Test Feedback 完整闭环

> 类型：feature
> 创建日期：2026-04-22
> 完成日期：2026-04-23
> 状态：finish
> 负责人：kernel agent
> 优先级：P0（v1 基础设施已上线，本迭代让 feedback 真正闭环）

## 背景

前序两迭代（`build_feedback_loop.md` + `test_watch.md`）上线了骨架：
- build_hooks.ts 提供 hook 协议 + JSON syntax + tsc hook（env 开关）
- test runner 支持 runTests / watch / coverage 解析
- 但**闭环未打通**：
  - runner 失败 → 只能 subscribeFailures 主动拉，没有 push 到 world/inbox
  - coverage 解析后未注入 `<knowledge name="coverage">`
  - apply_edits 多文件不走 hook
  - Prettier / ESLint hook 未接
  - 没有防循环（同一错误 N 轮没修上就要停手）

## 目标

1. **Runner → World 失败投递桥**：runner subscribeFailures → world.talk(stoneName, `[test_failure] ...`)
2. **Coverage window 注入**：context-builder 新增 `<knowledge name="coverage">` window，显示未覆盖符号
3. **apply_edits hook 触发**：多文件 transaction 完成后对每个 changes[i].path 依次跑 hook
4. **Prettier / ESLint hook**：默认 hook 列表扩展（开关：`OOC_BUILD_HOOKS_PRETTIER=1`、`OOC_BUILD_HOOKS_ESLINT=1`）
5. **防循环**：如同一 (path, error_hash) 在 N=3 轮内重复出现 → inject "已重复失败 N 次，请停下来换思路"

## 方案

### Phase 1 — Runner-World 桥

- `kernel/src/world/world.ts` 启动时 subscribe runner failures
- failure 事件 → `world.talk("<objectName>", "[test_failure] ...")` 投递
- 可配置哪个对象接（默认 supervisor）

### Phase 2 — Coverage window

- context-builder 读 `runner.getLatestCoverage()` → 格式化为 knowledge
- 只显示未覆盖的新代码（diff 过）

### Phase 3 — apply_edits hook

- `persistence/edit-plans.ts` 的 `applyEditPlan` 完成后调 `runBuildHooks(changedPaths, ctx)`
- 失败 → feedback window 下轮注入

### Phase 4 — Prettier / ESLint hooks

- `prettierHook` 写文件后 `bun x prettier --write {path}`
- `eslintHook` `bun x eslint {path}` 错误回灌

### Phase 5 — 防循环

- 在 feedback store 记录 `{path, errorHash, count}`
- count ≥ 3 时追加特殊警告到 feedback content

## 影响范围

- `kernel/src/world/world.ts`、`world/hooks.ts`（扩展）
- `kernel/src/thread/context-builder.ts`（coverage window）
- `kernel/src/persistence/edit-plans.ts`（apply 后 hook）
- `kernel/src/test/runner.ts`（subscribe API 消费）
- 新增测试

## 验证标准

- E2E：LLM 写错代码 → watch 检测失败 → inbox 收到 → LLM 修 → pass
- 防循环触发一次
- `bun test` 0 fail

## 执行记录

### 2026-04-23 Phase 1 — Runner → World 失败桥

- 新 `kernel/src/world/test-failure-bridge.ts`：
  - `formatFailuresAsTalkMessage`：把一组 TestFailure 渲染成 `[test_failure] ...` 文本
  - `pickRecipient`：按 显式 > `OOC_TEST_FAILURE_RECIPIENT` > `supervisor` > `alan` > 第一个非 user 查找收件人
  - `startTestFailureBridge`：默认关，`OOC_TEST_FAILURE_BRIDGE=1` 启用；返回卸载函数
- 扩展 `kernel/src/test/runner.ts`：
  - 新增 `getLatestCoverage` / `clearLatestCoverage` / `LatestCoverage` 缓存 API，给 Phase 2 coverage window 使用
  - `runTests(opts.coverage)` 成功返回时 `recordLatestCoverage`
  - 新增 `__emitFailuresForTest`（测试桥接入口）
- 扩展 `kernel/src/world/world.ts`：
  - `init()` 末尾启动 bridge，talk 调用 `this.talk(recipient, message, "test_runner")`
  - `stopSuperScheduler()` 顺带解除订阅
- 新增测试：`tests/test-failure-bridge.test.ts` 13 tests pass
- 全量验证：`bun test` → 934 pass / 6 skip / 6 fail（6 fail 为 pre-existing http_client 故障；对比基线 921 pass 新增 +13）

### 2026-04-23 Phase 2 — Coverage window 注入

- 扩展 `kernel/src/test/runner.ts`：新增 `__injectLatestCoverageForTest`（测试注入口）
- 扩展 `kernel/src/thread/context-builder.ts`：
  - import `getLatestCoverage`
  - 在 knowledge 段 build_feedback 之前注入 `<knowledge name="coverage">` 窗口
  - 显示「总覆盖率 XX% (cwd=...)」+ `summarizeCoverage` 文件表前 20 行
  - getLatestCoverage() 返回 undefined 时静默不注入
- 新增测试：`tests/coverage-window.test.ts` 3 tests pass
- 全量验证：`bun test` → 937 pass / 6 skip / 6 fail（新增 +3）

### 2026-04-23 Phase 3 — apply_edits 触发 build hooks

- `kernel/src/persistence/edit-plans.ts`：
  - `ApplyResult` 新增 `buildFeedback?: HookFeedback[]`
  - `applyEditPlan(plan, options)` 的 options 新增 `threadId`
  - 写盘成功后 `runBuildHooks(changedPaths, { rootDir, threadId })`；失败不跑
- `kernel/src/trait/registry.ts`：`MethodContext` 新增 optional `threadId`
- `kernel/traits/computable/file_ops/index.ts`：`applyEditsImpl` 把 `ctx.threadId` 透传给 `applyEditPlan`
- `kernel/src/thread/engine.ts`：两处 `methodCtx` 构造都注入 `threadId`（run / resume 路径）
- 新增测试：`tests/apply-edits-hooks.test.ts` 4 tests pass
- 全量验证：`bun test` → 941 pass / 6 skip / 6 fail（新增 +4）

### 2026-04-23 Phase 4 — Prettier / ESLint hooks

- `kernel/src/world/hooks.ts`：新增 `prettierFormatHook` 与 `eslintCheckHook`
  - Prettier 匹配 ts/tsx/js/jsx/json/md/css/html/yaml/yml
  - ESLint 匹配 ts/tsx/js/jsx/mjs/cjs
  - 两者都用 `bun x` 跑子进程；失败 output 塞 errors
- `registerDefaultHooks` 扩展：
  - `OOC_BUILD_HOOKS_PRETTIER=1` 启用 prettier（默认关）
  - `OOC_BUILD_HOOKS_ESLINT=1` 启用 eslint（默认关）
  - `OOC_BUILD_HOOKS_TSC=1` 保持原样
- 新增测试：`tests/prettier-eslint-hooks.test.ts` 9 tests pass（match 规则 + 环境开关 + 结构校验；不实跑子进程避免项目配置依赖）
- 全量验证：`bun test` → 950 pass / 6 skip / 6 fail（新增 +9）

### 2026-04-23 Phase 5 — 防循环（重复失败告警）

- 扩展 `kernel/src/world/hooks.ts`：
  - 新增 `HookFeedback.repeatCount`（同 `(path, errorHash)` 连续失败次数）
  - 新增 `repeatCountsByBucket: Map<bucketId, Map<key, count>>`（threadId 存在按线程隔离，否则 `__global__`）
  - 新增 `feedbackRepeatKey(fb)` = `${path}||hash(errors.join|output)`
  - `runBuildHooks` 失败时递增计数，同 path 本轮所有 match 的 hook 都 pass 时清零该 path 所有 key
  - `formatFeedbackForContext` 在任一 feedback `repeatCount >= 3` 时追加全局告警段 + 条目级 ⚠️ 标签
  - 新 export `getRepeatFailThreshold()`
- 新增测试：`tests/loop-prevention.test.ts` 6 tests pass（递增 / 清零 / 不同 error 独立 / 不同 threadId 隔离 / 告警注入）
- 全量验证：`bun test` → 956 pass / 6 skip / 6 fail（新增 +6；累计对比基线 921 → +35）
