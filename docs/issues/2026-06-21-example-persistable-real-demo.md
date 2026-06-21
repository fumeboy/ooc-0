---
title: example 自定义 persistable 给一个有真实差异的示范（落人类可读 example.md）
status: landed
date: 2026-06-21
---

# example 自定义 persistable 给一个有真实差异的示范

## 背景 / 动机

[[2026-06-21-persistable-unify-object-data-json]] 把默认持久化统一为「裸 data → `data.json`」。副作用：`_builtin/example` 的自定义 `persistable.save/load`（原本也写裸 JSON 到 `ctx.dir/data.json`）与默认**逐字节同效**——样板示范退化为「自定义 = 没区别」，反教学。上个 issue 已用 prose 止血（example.md 注明「同效」），本 issue 给一个**有真实差异**的示范，正式收口该 follow-up。

## 现状

- `packages/@ooc/builtins/example/persistable/index.ts`：save/load 写裸 JSON 到 `ctx.dir/data.json`（= 默认同效）。
- 对象树 `children/object/knowledge/builtins/example.md` self × persistable 一节：已注明「与默认同效、演示接入点本身、真实自定义会改格式/目标」。

## 改动提案（裁决：方案 A，用户已定）

example 的自定义 persistable 改为**落人类可读的 `ctx.dir/example.md`**（而非默认 JSON `data.json`）：save 写 `bumpCount` header + message 正文的可读文本，load 自己 parse 回来。

- **为什么 A**：差异一眼可辨（盘上是可读 `example.md` 非 JSON `data.json`），save/load 对称安全，且**同构真实 builtin `agent`**（把 `data.self` 写成可读的 `self.md`）——一个样板同时教「怎么接线 + 为什么要接管序列化」。parse 成本即「掌控格式的代价」，本身是诚实教学点。
- 兼带一个真实考量教学点：自定义文件名（`example.md`）不在默认 gitignore 黑名单（`objects/**/data.json`）内——若自定义文件落进 stone 且不该版本化，作者需在 world `.gitignore` 补上。

兼清理：`scripts/migrate-state-context-split.ts:30-31` 陈旧注释「Server bootstrap calls runMigration at startup」（core 实无此 wiring，上个 issue 退潮验收旁注发现）——改为「一次性 CLI 工具、未接入 bootstrap」。此为纯注释订正、非设计变更。

## 受影响设计元素

- `_builtin/example`（builtins/example.md）—— 唯一受影响设计元素；self × persistable 一节 + 骨架代码 + 头注 description 改为「落人类可读 example.md」。
- `## persistable` 维度核心**不变**（默认契约不动；本 issue 只改样板的自定义示范内容）。

## 风险与权衡

- 自定义文件逃逸 gitignore 黑名单——已转为教学点显式点破，非缺陷。
- multi-line `message` 的 parse——save/load 格式须兼容（header 行 + 正文体）。
- example.test.ts 当前不测 persistable 落点——补一个 round-trip 测试守新格式。

## 待裁决点

无（方案 A 用户已定）。

## 裁决

方案 A。worktree 分支 `feat/example-persistable-demo`。

## 落地

**源码**（worktree `feat/example-persistable-demo` → merge main `3a7d809b`，3 文件）：
- `packages/@ooc/builtins/example/persistable/index.ts`：save/load 改落人类可读 `ctx.dir/example.md`（`bumpCount: N` header + 空行 + message 正文，兼容多行），不再写 JSON `data.json`；头注点明「同构 agent→self.md」+ gitignore 教学点。
- `packages/@ooc/builtins/example/__tests__/example.test.ts`：补 round-trip 测试（save→读 example.md 断言可读非 JSON→load 等值，含多行 message）。
- `scripts/migrate-state-context-split.ts:30,252`：陈旧注释「server bootstrap 调 runMigration」订正为「一次性 CLI 工具、未接入 bootstrap」。

**对象树回流**：`children/object/knowledge/builtins/example.md`——self × persistable 一节（改「落人类可读 example.md、有真实差异、同构 agent、gitignore 教学点」）+ 骨架代码块（line 184 区，save/load 改新格式）+ 文件布局注释（line 68）+ 头注 description。

主仓 `bun run verify` = 710 test 0 fail + 全 gate 绿；example 测试 5 pass。

## 落地验收

（landed 后填）
