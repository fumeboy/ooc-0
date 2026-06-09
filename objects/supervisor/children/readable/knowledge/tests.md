---
title: readable 测试规格与归属
description: 验证「Object 在 LLM 上下文里的展示由自己控制」的判据 + 索引验证它的 storybook stories；readable 是 2026-06-09 新维度，暂无独立 Tier B agent-native rubric
activates_on: {"object::root": "show_description"}
---

# 我（readable）这一维怎么被验证

readable 验的是：**window method 只控展示状态、与 object method 物理分维、经 registerReadable 注册**。
我是 2026-06-09 才独立成维的 readable（与 visible 并列的外观维度），**还没有独立的 capability spec 与 Tier B agent-native rubric**——
当前由 executable 单元 catalog（L3）里属我的几条 + builtin file 的 window-method 测试覆盖。测试代码在
`packages/@ooc/storybook/`（runner / `test:storybook` CI gate 可跑）。

## Tier A —— 控制面确定性（单元 catalog，归我的条目）

来自 `packages/@ooc/storybook/stories/L3_executable.stories.ts`（文件 layer 标 executable，但下列条目验的是 readable）：

- **L3-REG-READABLE** —— registerReadable 注册 windowMethods/readable，与 executable 维度互不覆盖。
- **L3-FILE-WINDOWMETHOD** —— builtin file 的 set_viewport 是 windowMethod，不在 object methods 表。
- **L3-METHOD-COLLISION**（与 executable 共担）—— 同一 type 上 object method 与 window method 同名 → 注册期 fail-loud。

补充：`packages/@ooc/builtins/file/__tests__/file-window-method.test.ts` 验 file 的 set_viewport/set_range 是
windowMethod + readable 读 window.state（bun:test 单测，非 storybook，但属我这维的覆盖）。

## Tier B —— agent-native（待补）

readable 尚无独立 `stories/readable.story.ts` 的 `runAgentNative`，也无 Good/OK/Bad rubric。
**演化方向**：补一条 agent-native story——让 agent 自写一个对象的 readable.ts（控制其在 context 里的渲染）
或调 window method 改 viewport，确定性核验 thread-context.json 的 window.state 变化。归 reflectable/programmable 协作。

## 边界

- readable 的展示**质量**（渲染得好不好、压缩得当不当）本质需真 LLM，归 Tier B。
- 沿 class 链回退（resolveWindowMethod）尚无自定义对象行使，故无对应 story（详见 self.md「已知问题」）。
