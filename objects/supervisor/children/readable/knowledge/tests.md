---
title: readable 测试规格与归属
description: 验证「Object 怎样被读由自己控制」的判据 + 索引验证它的 storybook stories；readable 是 2026-06-09 新维度，暂无独立 Tier B agent-native rubric
activates_on: {"object::root": "show_description"}
---

# 我（readable）这一维怎么被验证

readable 验的是：**Object 把 Data 投影成 window；window method 只动投影态 win、与 object method 分维；经 `export const Class` + `register` 装配**。
我是 2026-06-09 才独立成维的 readable（与 visible 并列的外观维度），**还没有独立的 capability spec 与 Tier B agent-native rubric**——
当前由 executable 单元 catalog（L3）里属我的几条 + builtin file 的 window-method 测试覆盖。测试代码在
`packages/@ooc/storybook/`（runner / `test:storybook` CI gate 可跑）。

## Tier A —— 控制面确定性（单元 catalog，归我的条目）

来自 `packages/@ooc/storybook/stories/L3_executable.stories.ts`（文件 layer 标 executable，但下列条目验的是 readable）：

- **L3-REG-READABLE** —— 同一 `OocClass` 的 `readable.window[].window_methods` 与 `executable.methods` 各自解析、互不覆盖（`resolveWindowMethod` / `resolveObjectMethod` 分别命中）。
- **L3-FILE-WINDOWMETHOD** —— builtin file 的 set_viewport 是 window method（在 `readable.window[].window_methods`），不在 object methods 表。
- **L3-METHOD-COLLISION**（与 executable 共担）—— 同一 class 上 object method 与 window method 同名 → register 期 fail-loud。

补充：`packages/@ooc/builtins/filesystem/children/file/__tests__/file-window-method.test.ts` 验 file 的 set_viewport 是
window method + readable 投影读 win（bun:test 单测，非 storybook，但属我这维的覆盖）。

## Tier B —— agent-native（待补）

readable 尚无独立 `stories/readable.story.ts` 的 `runAgentNative`，也无 Good/OK/Bad rubric。
**演化方向**：补一条 agent-native story——让 agent 自写一个对象的 readable（控制其在 context 里的投影）
或调 window method 改 viewport，确定性核验实例 win 的变化。归 reflectable 协作（"改身体"含 readable）。

## 边界

- readable 的展示**质量**（投影得好不好、压缩得当不当）本质需真 LLM，归 Tier B。
- `resolveWindowMethod` / `resolveReadable` / `resolveWindowClass` 本类直查、不沿链（issue `inheritance-spread` D4 退役了曾经的沿父类回退）；子 class 经源码 spread 继承父投影，无运行时 chain（详见 self.md「模拟推演」）。
