# Build / Test Feedback 完整闭环

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
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

（初始为空）
