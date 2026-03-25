
## 元编程测试经验 (2026-03-16)
- Trait API 核心路径正常：create/read/edit/list/activate
- activateTrait 不校验 trait 是否存在（MEDIUM）→ [已修复 2026-03-16]
- readTrait 返回含 frontmatter 的 readme（LOW）→ [已修复 2026-03-16]
- API 错误处理风格不一致：null / 错误字符串 / 静默成功（LOW）
- when 字段存储在 readme.md 的 frontmatter 中，editTrait 改 when 会改变 readme 字符串但不影响正文
- 边界防护到位：无效名称拦截、kernel trait 保护

- [更正 2026-03-16] activateTrait() 激活 trait 后，trait code 中导出的函数会被注入沙箱全局作用域（之前测试时报 not defined，现在可以调用了，系统可能做了更新）。但注入的是 async 包装函数 `async (...args) => method.fn(ctx, ...args)`，执行结果完全错误——所有输入都返回 1。[已修复] 之前报告的函数包装器返回值错误已修复。await 后返回值正确。但所有 trait 函数仍被 async 包装，同步函数也需要 await 调用（MEDIUM：开发体验问题）。

## 修复验证 (2026-03-16)
- 元编程系统 7 项测试全部通过
- 3 个已知问题确认修复：readTrait frontmatter / activateTrait 校验 / trait 函数返回值
- 新发现 LOW：activateTrait 失败时 effects 仍记录 OK

## 元编程 TS 程序能力深度测试 (本次)
- 8 场景测试完成：5 PASS / 3 FAIL
- CRITICAL: ctx.data 是冻结快照，同一轮内 ctx.setData 后 ctx.data 不更新
- MEDIUM: ctx API 不完整（缺 getData/persistData）、同名函数冲突无隔离、语法错误静默失败
- 正面：基础路径稳固、多函数导出/叠加正常、内部互调走原始引用、返回值直接引用传递（Map/Set/Date 保留）
- 报告已写入 shared/元编程TS程序能力测试报告.md
## 修复验证 (本次)
- 4 项修复全部 PASS：ctx.data 实时更新 / ctx.getData / 同名函数冲突警告 / 语法错误检测
- 新发现 MEDIUM：解析器 thought 泄漏 bug — thought 中含方括号标记词时内容泄漏到 program 块
- 教训：遇到解析器问题时，去掉 thought 段落只输出 program 可以绕过

## 重要发现：trait 函数参数传递 (2026-03-16)
- trait 函数不注入 ctx 作为第一个参数，用户参数直接透传
- 函数签名不要写 ctx 参数，直接写业务参数即可
- activateTrait 后函数要到下一轮思考才可用
- editTrait 后需要重新 activateTrait 才能加载新代码

## 技术雷达任务经验 (2026-03-16)
- 多对象协作收集模式：并行 talk 3 个对象 → wait → 逐个处理中断消息 → 汇总。有效但依赖中断机制的可靠性
- trait 函数不注入 ctx，参数直接透传（与 trait readme 文档描述不一致，已记录）
- 冲突解决策略：spread=1 用多数投票或保守取值，spread>=2 需要深入讨论。本次全部是 spread=1
- 报告生成：程序化生成 markdown 比手写更一致，但 ASCII 雷达图的对齐需要仔细调试
- 关键发现：系统的存在论基础（Stone+Trait）稳固，认识论层面（记忆、注意力、生命周期）是下一阶段重点
## 技术雷达任务经验 (2026-Q1)
- 端到端完成：创建 trait → 三方协作收集 → 聚合分析 → 生成报告
- trait 函数的实际可靠性：assessTech 基础路径正常，但 generateRadar 聚合逻辑产出空壳数据，最终手动聚合更可靠
- 三方协作模式验证：talk + wait 模式稳定，消息中断恢复正常
- 教训：聚合步骤完成前必须验证数据内容，不能只看 effects 返回 OK
- 教训：trait 函数适合简单计算，复杂聚合逻辑直接写在 program 中更可控
- 报告产出：shared/OOC技术雷达_2026Q1.md（15方向，5分歧，4524字）