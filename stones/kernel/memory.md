# Kernel 项目知识

## OOC 代码结构

OOC 采用双仓库 + submodule 结构。`world_dir` 是 user repo 根目录。

```
world_dir/
├── kernel/                ← git submodule（内核仓库）
│   ├── src/               ← 后端源码（TypeScript, Bun runtime）
│   │   ├── cli.ts         ← CLI 入口
│   │   ├── server/        ← HTTP + SSE 服务
│   │   ├── thread/        ← 线程树架构（当前核心）
│   │   ├── stone/         ← Stone 操作
│   │   ├── trait/         ← Trait 加载/激活
│   │   ├── persistence/   ← 持久化读写
│   │   ├── executable/    ← 沙箱执行器
│   │   ├── thinkable/     ← LLM 配置
│   │   └── types/         ← 类型定义
│   ├── web/               ← 前端源码（React + Vite + Jotai）
│   ├── traits/            ← Kernel Traits（所有对象共享的基础能力）
│   └── tests/             ← 单元测试（bun:test）
├── stones/                ← 对象持久化目录
├── flows/                 ← 会话数据
├── library/               ← 公共资源库
└── docs/                  ← 文档
```

## 关键文件路径

### 线程树架构（当前核心）

- Engine: `world_dir/kernel/src/thread/engine.ts`
- Scheduler: `world_dir/kernel/src/thread/scheduler.ts`
- Context Builder: `world_dir/kernel/src/thread/context-builder.ts`
- Tree: `world_dir/kernel/src/thread/tree.ts`
- Tools: `world_dir/kernel/src/thread/tools.ts`
- Form Manager: `world_dir/kernel/src/thread/form.ts`
- Hooks: `world_dir/kernel/src/thread/hooks.ts`

### 其他核心模块

- CLI: `world_dir/kernel/src/cli.ts`
- Server: `world_dir/kernel/src/server/server.ts`
- 类型定义: `world_dir/kernel/src/types/`
- 测试: `world_dir/kernel/tests/`
- Kernel Traits: `world_dir/kernel/traits/`

## 运行方式

- 后端: `bun kernel/src/cli.ts start 8080`（从 world_dir 执行）
- 测试: `cd kernel &amp;&amp; bun test`
- 前端: `cd kernel/web &amp;&amp; bun run dev`

## 经验笔记

- shell 命令在 `self_dir`（即 stones/kernel/）下执行，不是项目根目录
- 读取源码用 `world_dir + "/kernel/src/..."` 拼接绝对路径
- Bun runtime 可用：`await Bun.file(path).text()` 读文件，`await Bun.write(path, content)` 写文件
