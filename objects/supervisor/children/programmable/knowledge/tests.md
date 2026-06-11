---
activates_on: {"object::root": "show_description"}
---

# 我这一维的测试规格

验证我 programmable 能力的测试规格。规格已就地收编进本 tests.md；story 代码在 `packages/@ooc/storybook/stories/`。两档：Tier A 控制面确定性（零真 LLM、进 CI gate），Tier B agent-native（真 LLM、env-gated）。改我的 executable 行为或自写方法链路后，先回本篇更新判据，再核对 story 代码。

## 维度定位

我持有并演化自身的自定义 ContextWindow + 方法表（`window.methods`），写 `executable/index.ts` 即热更。

## Tier A —— 控制面确定性

零真 LLM，story 直调 `app.handle` + 写 stone 文件核验产物。代码：`stories/programmable.story.ts` 的 `runControlPlane()`，收录于 `stories/_control-plane.test.ts`（`bun run test:storybook`，应 0 FAIL）。单元 catalog 形态另见 `stories/L7_programmable.stories.ts`（L7-* stories）。

| TC | 断言 |
|----|------|
| TC-PROG-01 | 定义 `ui_methods` 经 HTTP `call_method` 返回正确值。注：`ui_methods` 调用语义归 **visible**；此 TC 测的是 `ui_methods` 的写入/加载/热更路径（与 `window.methods` 同住 `executable/index.ts`、共用 loader），这一面 programmable 与 visible 共担。 |
| TC-PROG-02 | 方法拿到 `ctx.self.dir`（自己的 stone 路径）且目录真实存在。 |
| TC-PROG-03 | `window.methods` 经 `loadObjectWindow` 可加载（LLM 路径 object method）。 |
| TC-PROG-04 | 热更新 —— 改 `executable` 后已有方法变更、新增方法立即生效。 |

> 热更 fs.watch 有 debounce：改 `executable` 源码后等 ~350ms 再调用才反映新版本。

## Tier B —— agent-native（真 LLM，env-gated）

我（supervisor）在业务 session 内 `write_file` 写 `objects/<newId>/...` 建对象并写自定义 object method，经 super flow feat-branch PR（`new_feat_branch` → feat 分支编辑 → `evolve_self` finalizer 开 PR → reviewer 审批 → 合入）进 main；`customWindowInvocations` + `functionOutputFor` 实证 method 真执行。代码：`stories/programmable.story.ts` 的 `runAgentNative()`。

rubric（已就地收编，对应 e2e `backend-programmable-self-command`）：

- **Good**：method 写出、注册、被 LLM 成功调用、返回正确。
- **OK**：写出但调用绕行 / 重试。
- **Bad**：method 未注册 / 调用失败。

> LLM 端点 infra 抖动（超时 / socket）= 非能力问题 → SKIP（rollupTier→OK），不计能力 Bad。
> 新模型下 `create_object` 先落 session worktree；`evolve_self` 合入 main 是单独的合入能力——只落 worktree 也算建对象能力达成。

## Story 索引

代码均在 `packages/@ooc/storybook/stories/`。

| Story id | expectation |
|----------|-------------|
| AN-PROG-01 | supervisor 经 write_file + evolve_self 亲手创建带身份 + 知识的对象（agent-native）。 |
| L7-EXEC-HOTRELOAD | 改写 `executable/index.ts` 后 `loadObjectWindow` 加载到新 method。 |
| L7-UI-METHOD-HOTRELOAD | 改 `ui_methods` 后 `/call_method` 反映新逻辑。 |
| L7-SERVER-SOURCE-RW | PUT 再 GET `/api/stones/:id/server-source` 读写一致。 |
