# Sophia 项目知识

## 哲学文档位置

- 基因定义: `world_dir/docs/哲学文档/gene.md`（13 条基因）
- 涌现能力: `world_dir/docs/哲学文档/emergence.md`
- 开放问题: `world_dir/docs/哲学文档/discussions.md`
- 概念树: `world_dir/docs/meta.md`

## 组织文档

- 组织结构: `world_dir/docs/组织/README.md`
- 哲学设计层: `world_dir/docs/组织/哲学设计层.md`
- 核心思想层: `world_dir/docs/组织/核心思想层.md`
- 用户体验层: `world_dir/docs/组织/用户体验层.md`
- 生态搭建层: `world_dir/docs/组织/生态搭建层.md`

## 经验笔记

- shell 命令在 `self_dir`（即 stones/sophia/）下执行
- 读取文档用 `await Bun.file(world_dir + "/docs/...").text()`
- 我的职责是哲学设计和基因维护，不直接写代码
- 修改哲学文档后需要通知 kernel 和 nexus 同步理解
