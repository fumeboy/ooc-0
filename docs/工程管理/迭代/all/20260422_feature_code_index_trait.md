# Code Index Trait — 代码语义索引（LSP / AST / RAG）

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P0（CodeAgent 能力补齐最关键一环）

## 背景 / 问题描述

OOC 作为 CodeAgent，目前代码理解只靠 `file_ops.grep/glob` 纯文本搜索，导致：
- 改一个函数不知道调用方（无 find_references）
- "跳转到定义"要靠 LLM 盲目扫文件
- 大仓库下 token 消耗巨大，一次任务常读几十个文件
- 跨文件重构没有依赖图感知，容易漏改

对标 Claude Code / Cursor / LSP：缺的是**代码的结构化索引层**。

## 目标

新建 `kernel/traits/computable/code_index/`（或 library/code-index），提供以下 llm_methods：

1. **`symbol_lookup({query, lang?, scope?})`** — 找符号定义
2. **`find_references({symbol, lang?})`** — 找符号引用
3. **`list_symbols({path, kinds?})`** — 枚举文件/目录内符号（class/function/variable）
4. **`call_hierarchy({symbol, direction: "callers"|"callees"})`** — 调用链
5. **`semantic_search({query, topK?})`** — 向量/语义搜索（RAG）
6. **`index_refresh({paths?})`** — 触发/增量索引

## 方案

### Phase 1 — 调研 + 技术选型

- tree-sitter-grammar：覆盖 TS / JS / Go / Python / Rust
- 轻量索引：SQLite FTS5 / DuckDB / 简单 JSON
- 向量：可选 simple-embeddings（纯本地）或外部 OpenAI embedding

### Phase 2 — MVP（TS/JS only）

- tree-sitter 解析 `kernel/src/**` 构建 symbol 索引（function/class/interface）
- `symbol_lookup` + `find_references` + `list_symbols` 三个 API 落地
- 索引存 `.ooc/code-index/` 目录
- 增量更新（watch file_ops.writeFile hook）

### Phase 3 — 多语言 & 语义搜索

- 扩展 tree-sitter grammar
- 集成向量索引（semantic_search）

### Phase 4 — 体验验证

- bruce 用 `symbol_lookup("handleOnTalkToUser")` 直接拿到文件+行号，而不是 grep 扫 10 文件

## 影响范围

- 新增 `kernel/traits/computable/code_index/` + index.ts + TRAIT.md
- `kernel/src/` 可选辅助索引构建脚本
- `docs/meta.md` 子树 5（computable 分支）新增说明

## 验证标准

- LLM 通过 `callMethod("computable/code_index", "symbol_lookup", {...})` 能找到精确位置
- 索引构建时间在中型仓库（~5 万行）< 10 秒
- `bun test` 0 fail

## 执行记录

### 2026-04-22 P0-CodeAgent MVP 落地

- 新建 `kernel/traits/computable/code_index/{TRAIT.md,index.ts}`
- 实现基于正则的 TS/JS 符号索引（function/class/interface/type/const 5 类）
- llm_methods：symbol_lookup / find_references / list_symbols / call_hierarchy / semantic_search / index_refresh
- 内存 cache 按 rootDir 维度；首次调用触发构建；index_refresh 清空重建
- 测试：`tests/trait-code-index.test.ts`，18 tests all pass
- 全量测试基线：606 pass → 624 pass / 6 skip / 0 fail

### 未完成 / backlog

- tree-sitter 接入（多语言 + 高精度 AST）
- 增量索引（监听 file_ops.writeFile hook）
- 向量语义搜索（semantic_search MVP 退化为 token 相似度）
- call_hierarchy callees 方向（需要符号内作用域分析）
