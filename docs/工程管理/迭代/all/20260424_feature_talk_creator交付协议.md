# talk creator 交付协议

> 类型：feature
> 创建日期：2026-04-24
> 状态：finish
> 负责人：Codex

## 背景 / 问题描述

原协议使用 `return` 表示向创建者结束并返回结果，但它与 `talk` 的通信语义重叠，并且会诱导线程在第一次回复后直接结束，无法继续执行后续经验沉淀、验证补充或反思环节。

## 目标

- 使用 `talk(target="this_thread_creator")` 表达“向当前线程创建者交付/回复”。
- `talk(this_thread_creator)` 不默认结束当前线程。
- 禁止 `this_thread_creator` 使用 `fork` 模式。
- `talk` / `think` 的 submit 支持 `wait=true`，提交后主动进入 waiting。
- command tree 增加 `talk.this_thread_creator` 分支，原绑定在 `return` 上的 trait 改绑到新分支。
- 清理 prompt、trait 和 tool schema 中对旧 `return` command 的引导。

## 方案

在 command tree 增加 `talk.this_thread_creator` 虚拟分支；engine 在 submit talk 时解析 `this_thread_creator` 到 user、父线程或跨对象创建者线程，并保留线程继续执行能力。工具 schema 移除 `return` command，增加 `wait` 参数。将 reflective/verifiable 等完成前门禁改绑到 `talk.this_thread_creator`。

## 影响范围

- 涉及代码：`kernel/src/thread/command-tree.ts`、`kernel/src/thread/engine.ts`、`kernel/src/thread/tools.ts`
- 涉及文档：`kernel/traits/*/TRAIT.md`、本迭代文档
- 涉及基因/涌现：通信协议与经验沉淀流程

## 验证标准

- `deriveCommandPath("talk", { target: "this_thread_creator" })` 得到 `talk.this_thread_creator`。
- 顶层 command tree 不再暴露 `return`。
- `talk(this_thread_creator, wait=true)` 解析为创建者并进入 waiting。
- `return` 相关 trait 绑定不再作为完成门禁出现。

## 执行记录

- 2026-04-24：已实现 `talk.this_thread_creator` 命令分支，移除 tool schema 的 `return` command。
- 2026-04-24：已在 run/resume 两条 engine 路径中解析 `this_thread_creator`，禁止 fork，支持本对象父线程、跨对象创建者与 root→user 的路由。
- 2026-04-24：已给 `talk` / `think` submit 增加 `wait=true` 语义：提交后将当前线程切到 waiting；`talk(this_thread_creator)` 本身不自动结束线程。
- 2026-04-24：已将 reflective/verifiable 从 `return` 改绑到 `talk.this_thread_creator`，并更新 base/talkable/plannable/reviewable 相关描述。
- 2026-04-24：验证通过：`bun test tests/command-tree.test.ts tests/thread-hooks.test.ts`，`bun test tests/thread-engine.test.ts -t this_thread_creator`；生产 trait/tool/engine 路径未再检出 `[return]`、`on:return`、`"return"` command 暴露。
