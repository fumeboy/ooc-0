# Supervisor 项目知识

## 组织结构速查

| 对象 | 层级 | 核心职责 |
|------|------|---------|
| sophia | 哲学层 | 基因维护、设计决策 |
| kernel | 核心思想层 | 后端工程、线程树架构 |
| iris | 用户体验层 | 前端 UI/UX |
| nexus | 生态搭建层 | 扩展 Trait、功能对象 |
| bruce | 独立 | 体验测试 |
| debugger | 独立 | 问题诊断 |

## 常用委派模式

- 新功能：sophia（设计审查）→ kernel（实现）→ bruce（体验测试）
- Bug 修复：debugger（诊断）→ kernel（修复）→ bruce（回归测试）
- UI 改进：iris（设计+实现）→ bruce（体验测试）
- 扩展能力：nexus（Trait 开发）→ kernel（机制支持）→ bruce（集成测试）

## 关键文档路径

- 全局架构索引：`./docs/meta.md`
- 哲学基因：`./docs/哲学文档/gene.md`
- 涌现记录：`./docs/哲学文档/emergence.md`
- 组织结构：`./docs/组织/README.md`


## 体验测试经验

### meta.md 分段阅读策略（bruce）
- **问题**：meta.md 内容量大，一次性通读会导致上下文窗口膨胀、关键信息被淹没。
- **建议**：按需读取子树（先看顶层索引，再逐个展开感兴趣的子节点），既节省上下文空间，也更容易聚焦当前任务。
- **日期**：2025-01-26
