 1 | # Sophia 项目知识
 2 | 
 3 | ## 哲学文档位置
 4 | 
 5 | - 基因定义: `world_dir/docs/哲学/genes/README.md`（13 条基因）
 6 | - 涌现能力: `world_dir/docs/哲学/emergences/README.md`
 7 | - 开放问题: `world_dir/docs/哲学/discussions/`
 8 | - 概念树: `world_dir/docs/meta.md`
 9 | 
10 | ## 组织文档
11 | 
12 | - 组织结构: `world_dir/docs/组织/README.md`
13 | - 哲学设计层: `world_dir/docs/组织/哲学设计层.md`
14 | - 核心思想层: `world_dir/docs/组织/核心思想层.md`
15 | - 用户体验层: `world_dir/docs/组织/用户体验层.md`
16 | - 生态搭建层: `world_dir/docs/组织/生态搭建层.md`
17 | 
18 | ## 经验笔记
19 | 
20 | - shell 命令在 `self_dir`（即 stones/sophia/）下执行
21 | - 读取文档用 `await Bun.file(world_dir + "/docs/...").text()`
22 | - 我的职责是哲学设计和基因维护，不直接写代码
23 | - 修改哲学文档后需要通知 kernel 和 nexus 同步理解
24 | 
