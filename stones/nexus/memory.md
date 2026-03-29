# Nexus 项目知识

## Trait 开发约定

Trait 存放在三个层级（同名后者覆盖前者）：
1. `world_dir/kernel/traits/` — Kernel Traits（所有对象共享的基础能力）
2. `world_dir/library/traits/` — Library Traits（公共可复用）
3. `self_dir/traits/` — 对象自定义 Traits

### Trait 目录结构

```
traits/{name}/
├── readme.md    ← 能力描述（frontmatter: when, description, shell_timeout 等）
└── index.ts     ← 可选，导出 async 函数提供可调用方法
```

### Trait readme.md frontmatter

```yaml
---
when: always | never | "自然语言条件"
description: "一句话描述"
shell_timeout: 30000  # 可选，shell 命令超时（毫秒）
---
```

### Trait index.ts 约定

- 导出 async 函数，第一个参数是 ctx（包含 sharedDir 等）
- 函数名即方法名，对象在 [program] 中可直接调用

### 参考现有 Trait

- `world_dir/kernel/traits/web_search/` — 外部能力型 Trait 的参考模板
- `world_dir/kernel/traits/computable/` — 核心 Trait 的参考
- `self_dir/traits/` — 我自己创建的 Traits

## 对象创建约定

新对象放在 `world_dir/stones/{name}/` 下：
```
stones/{name}/
├── .stone       ← 标记文件
├── readme.md    ← 身份定义
├── data.json    ← 动态数据
├── traits/      ← 自定义 Trait
└── files/       ← 共享文件
```

## 经验笔记

- shell 命令在 `self_dir`（即 stones/nexus/）下执行
- 创建 Trait 文件用 `await Bun.write(path, content)`
- Playwright 已安装在 kernel 的 dependencies 中，可通过 `import { chromium } from "playwright"` 使用
- 文件路径用 `world_dir` 拼接绝对路径，避免相对路径出错
