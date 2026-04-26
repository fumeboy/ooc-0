# Refine 工具 + Knowledge Activator 统一

> 类型：feature
> 完成日期：2026-04-27
> 状态：finish
> Spec：docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md
> Plan：docs/superpowers/plans/2026-04-26-refine-tool-and-knowledge-activator.md

## 完成的事

- 新增 `refine` 工具——参数累积/修改通道
- `open(action, args?)` 接受可选 args = 等价 `open + refine`
- `submit` 收敛到 `{title, form_id, mark}`，旧 `submit(partial=true)` 彻底铲除
- `kernel/src/trait/activator.ts` → `kernel/src/knowledge/activator.ts`
- 引入 `KnowledgeRef` 统一类型（trait/view/relation）+ 反向索引 + `computeKnowledgeRefs`
- 命令树节点增加 `paths` 字段；trait 文件 frontmatter `command_binding` → `activates_on.paths`（11 个文件迁移完成）
- `ThreadsTreeNodeMeta.waitingType` 区分 await_children / talk_sync / explicit_wait
- `FlowData.failureReason` 在失败路径填充，GET /api/flows 透出

## 验证

- 单元测试 1098 pass / 10 skip / 0 fail（`trait-http-client` 6 个网络测试 flake 与本工作无关）
- Bruce 体验验证一轮通过

## 提交记录

kernel commits 68d35fc..36b287f（25 个），user commit fec0e68（文档标注）。
