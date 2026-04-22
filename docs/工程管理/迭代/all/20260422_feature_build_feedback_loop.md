# Build Feedback 回环 — 写完文件自动 tsc/lint/build → 错误投递 LLM

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P0

## 背景 / 问题描述

CodeAgent 的 killer feature：
- LLM 写代码 → **自动**跑 type check / lint / build
- 错误**直接回灌**到下一轮 Context（inbox 或 knowledge window）
- LLM 看到错误后自动修 → 再跑 → 直到绿

OOC 目前：
- `file_ops.writeFile` 完就结束，没有后续动作
- Bruce 要手动 `bun test`
- LLM 不知道自己写的代码能不能编译

## 目标

1. 新增 `build_hooks` 机制：某些路径的 write 触发自动 post-processing
2. 可配置每个对象 / stone 层面的 hooks：
   - `.ts/.tsx` 写完 → auto tsc `--noEmit` 范围检查 → 错误 inject
   - `.ts/.tsx/.md/.json` → auto prettier format
   - `package.json` / `bun.lockb` 变化 → auto `bun install`
3. 错误回传：下一次 Context 构建注入 `<knowledge name="build_feedback">` 窗口，含最近一次 build/tsc/lint 的错误摘要
4. 避免循环：hook 触发的修改不递归触发

## 方案

### Phase 1 — Hook 协议

- `BuildHook = { match: (path) => bool, run: (path, ctx) => Promise<HookResult> }`
- 注册在 world init 时；对象可 override
- `HookResult = { success: bool; output: string; errors?: string[] }`

### Phase 2 — 默认 hooks

- TypeScript checker（`tsc --noEmit --incremental`，用 watch server 加速）
- Prettier formatter
- ESLint

### Phase 3 — Feedback 注入

- `context-builder.ts` 的 knowledge 段新增 `build_feedback` 窗口
- 只注入最近失败的 hook 结果（成功时为空）
- 过期机制：超过 5 分钟或被同路径下一次 write 清除

### Phase 4 — E2E

- LLM 写 `let x: number = "hello"` → hook 跑 tsc → 错误自动回灌 → LLM 下轮看到后改为 `"hello" as string` 或修 type

## 影响范围

- `kernel/src/thread/engine.ts`（hook 触发时机）
- `kernel/src/world/hooks.ts`（新）
- `kernel/src/thread/context-builder.ts`（feedback 窗口）
- 默认 hooks 作为 library traits

## 验证标准

- bun test 0 fail
- E2E：LLM 写错代码后 2 轮内自动修正

## 执行记录

### 2026-04-22 P0-CodeAgent 落地

- 新 `kernel/src/world/hooks.ts`：
  - `BuildHook { name, match, run }` 协议
  - `runBuildHooks(paths, ctx)`：按匹配执行，结果按 threadId 聚合
  - `getBuildFeedback(threadId)`：过滤未过期 + 失败条目（TTL 5 分钟）
  - `formatFeedbackForContext`：markdown 渲染供 knowledge 注入
  - 默认 hook：`jsonSyntaxHook`（总启用）；`tscCheckHook`（`OOC_BUILD_HOOKS_TSC=1` 启用）
  - 开关：`OOC_BUILD_HOOKS=0` 全局关闭
- 扩展 `kernel/src/thread/context-builder.ts`：新增 `build_feedback` knowledge 窗口（失败 feedback 注入下一轮）
- 扩展 `kernel/src/thread/engine.ts`：
  - 顶层新增 `extractWrittenPaths` + `triggerBuildHooksAfterCall` 两个 helper
  - 两条 call_function 执行路径（run + resume）分别在 inject 结果后调用 triggerBuildHooksAfterCall，失败时追加第二个 inject 提示
  - 仅识别 file_ops:writeFile / file_ops:editFile 两个写动作，避免误触
- 扩展 `kernel/src/world/world.ts`：init 时 `registerDefaultHooks()`
- 测试：`tests/build-hooks.test.ts` 14 tests pass
- 全量基线：704 → 750 pass / 6 skip / 0 fail（含 sibling 带入的 memory-curation 测试）

### 未完成 / backlog

- E2E 测试：真跑 LLM 写错代码 → 自动修正循环，留给 Bruce 验收
- `apply_edits` 也是写动作，但多文件，需要 hook 对每个 plan.changes[i].path 触发（MVP 未接；待后续扩展）
- Prettier / ESLint hook（目前只接 JSON + tsc）
- 防循环检测：如果 LLM 在 build_feedback 失败后再次写同文件仍失败 N 轮，应主动提示"请停下来重新思考"（目前依赖 LLM 自觉）
