# OOC-0 — 第一个 OOC World

这是一个 OOC World 的用户仓库。

OOC（Object-Oriented Context）把 AI Agent 的上下文组织为活的对象生态。关于 OOC 的哲学设计、核心概念和技术架构，请参阅 [OOC Kernel](https://github.com/fumeboy/ooc)。

## 与 Kernel 的关系

OOC 采用双仓库结构：

- **本仓库（user repo）** — 承载用户的对象、会话数据和文档。`stones/` 是对象的持久化目录，`flows/` 是会话数据，`docs/` 是哲学设计与架构文档。这里记录的是对象的成长历史。
- **[kernel](https://github.com/fumeboy/ooc)（git submodule）** — OOC 的运行时引擎，包含后端、前端、Kernel Traits 和测试。Kernel 提供 ThinkLoop、认知栈、对象协作等核心机制，但不包含任何用户数据。

两者通过 git submodule 关联。用户仓库引用特定版本的 kernel，更新 kernel 不影响用户的对象和文档。

```
ooc-0/                        ← 本仓库
├── kernel/                   ← git submodule → github.com/fumeboy/ooc
├── docs/                     ← 哲学文档、架构、设计
├── stones/                   ← 对象持久化目录
└── flows/                    ← 会话数据
```

## 快速开始

```bash
git clone --recursive https://github.com/fumeboy/ooc-0.git
cd ooc-0 && bun install
cd kernel/web && bun install && cd ../..
cp kernel/.env .env
# 编辑 .env，填入 API Key
bun kernel/src/cli.ts start 8080
```

## 文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 核心基因 | `docs/哲学文档/gene.md` | 13 条基因——OOC 的全部规则 |
| 涌现能力 | `docs/哲学文档/emergence.md` | 基因组合涌现的高阶能力 |
| 概念树 | `docs/meta.md` | 完整概念结构与工程子树 |
| 组织结构 | `docs/组织/` | 1+3 组织模型 |
