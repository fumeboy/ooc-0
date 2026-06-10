---
activates_on: {"object::root": "show_description"}
---

# class 维度的测试规格

验证我的 class 能力的规格。两层：Tier A 控制面确定性（零真 LLM、进 CI gate）、Tier B agent-native（真 LLM、env-gated）。
代码在 `packages/@ooc/storybook/`，我只在这里收编自己的规格归属。

## Tier A —— 控制面确定性

故事 `stories/class.story.ts` 的 `runControlPlane()`，被 `stories/_control-plane.test.ts` 收为 `bun:test`，应 0 FAIL。
单元目录另在 `stories/L9_class.stories.ts`（见末尾索引）。

- **TC-CLASS-01**：`instantiate_with_new_world` 幂等实例化 supervisor class → `objects/` object —— 拷贝 self.md（含「总管」身份）+ 写 `ooc.class="_builtin/supervisor"`；不误实例化 user。
- **TC-CLASS-02**：实例化幂等 —— 二次 bootstrap 跳过已存在 instance，保住用户对实例 self.md 的改动。
- **TC-CLASS-03**：instance 经 class 链继承框架 class 的 seed knowledge（`nine-dimensions` / `world-vocabulary`）。
- **TC-CLASS-04**：class 不可交互 —— seedSession 拒绝 `_builtin/` class 作对话目标（HTTP 400，错误体含 `class`）。

## Tier B —— agent-native（真 LLM，env-gated）

`stories/class.story.ts` 的 `runAgentNative()`：startApp + 实例化 supervisor，派任务证明我自动加载 self.md 设计身份 + 继承知识（不靠 LLM 即兴演角色）。

rubric（原样）：
- **Good**：回复复现 self.md 设计身份 + 引用继承的 seed knowledge（9 维度 / 治理操作）。
- **OK**：身份对但未引用知识。
- **Bad**：即兴演角色 / 身份缺失。

## 单元 story 索引（`stories/L9_class.stories.ts`，layer=class）

- **L9-INSTANTIATE** —— instantiate 把 supervisor class 实例化为 `objects/supervisor`（拷 self.md + `ooc.class`）。
- **L9-INSTANTIATE-IDEMPOTENT** —— 二次 bootstrap 跳过已存在 instance、保用户改动。
- **L9-CLASS-NOT-USER** —— user 是被动对象，不被实例化为可交互 instance。
- **L9-CLASS-NONINTERACTIVE** —— seedSession 拒绝 `_builtin/` class 作对话目标（400）。

规格已就地收编进本 tests.md（单一来源）；story 代码在 `packages/@ooc/storybook/stories/`。概念见 sibling `class-vs-object` / `builtin-addressing-and-instantiate` / `class-chain-knowledge-inheritance`。
