# relation self 指南

> 类型：feature
> 创建日期：2026-04-24
> 状态：finish
> 负责人：Codex

## 背景 / 问题描述

现有 relation 机制会在对象与 target 交互时展示当前对象视角下的 `relations/{target}.md`，用于记录“我和对方”的关系。但很多沟通注意事项应由接收方自己声明，例如 user 希望所有对象如何呈现信息。此类内容放在每个发送方的 relation 文件中会重复且难维护。

## 目标

- 允许对象在 `relations/self.md` 中声明“别人和我 talk 时需要注意的内容”。
- 当 A talk to B 时，除 A 侧的 `A/relations/B.md` 外，也自动展示 B 侧的 `B/relations/self.md` 摘要。
- `user` 也能作为 relation target 参与展示，使任意对象 talk user 时都看到 `stones/user/relations/self.md`。
- 将 `stones/supervisor/traits/reporter/TRAIT.md` 中面向 user 的呈现规范迁移到 `stones/user/relations/self.md`。

## 方案

扩展 relation 索引数据结构，引入 `kind=target_self` 条目。`buildThreadContext` 扫描当前线程涉及的 peers 后，同时读取当前对象的 `relations/{peer}.md` 和目标对象的 `relations/self.md`。Context 渲染仍放在 `<relations>` 下，用不同标签区分普通 peer relation 与 target self 指南。

## 影响范围

- 涉及代码：`kernel/src/thread/relation.ts`、`kernel/src/thread/context-builder.ts`、`kernel/src/thread/engine.ts`、`kernel/src/thread/peers.ts`
- 涉及数据：`stones/user/relations/self.md`、`stones/supervisor/traits/reporter/TRAIT.md`
- 涉及文档：本迭代文档
- 涉及基因/涌现：对象关系、对象自我呈现、人机交互

## 验证标准

- A 的 context 中 peer=B 时同时出现 A/relations/B 摘要与 B/relations/self 摘要。
- peer=user 不再被 relation 扫描过滤，能展示 `stones/user/relations/self.md`。
- relation 相关单测覆盖 `target_self` 条目和 XML 渲染。
- 原 reporter 内容已迁移到 user 的 self relation，避免 supervisor 专属 trait 垄断 user 呈现规范。

## 执行记录

- 2026-04-24：创建迭代项并进入 doing；已定位 relation 注入路径和 user 被 peer 扫描过滤的问题。
- 2026-04-24：已扩展 relation 读取结构，新增 `target_self` 条目：A 的 context 对 peer=B 会同时读取 A/relations/B.md 与 B/relations/self.md。
- 2026-04-24：已调整 peer 扫描，`user` 不再被过滤，任意对象 talk user 时可看到 `stones/user/relations/self.md`。
- 2026-04-24：已将 supervisor reporter 中面向 user 的呈现规范迁移为 `stones/user/relations/self.md`，并删除 supervisor 专属 reporter trait。
- 2026-04-24：验证通过：`bun test tests/relation.test.ts tests/three-phase-bruce-verification.test.ts`，共 34 pass。
