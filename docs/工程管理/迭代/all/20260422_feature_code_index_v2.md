# Code Index v2 — tree-sitter + 增量 + 向量语义搜索

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P1（v1 MVP 已上线，v2 提精度）

## 背景

`20260422_feature_code_index_trait.md` finish 了正则式 MVP：
- 正则识别 TS/JS 的 5 类符号（function/class/interface/type/const）
- 全量构建（无增量）
- semantic_search 退化为 token 相似度
- call_hierarchy 只支持 callers 方向

生产级 CodeAgent 需要精度更高的 AST + 真向量 + 增量。

## 目标

1. **tree-sitter 接入**：替换正则为 AST 解析，覆盖 TS/JS/Go/Python/Rust
2. **增量索引**：`file_ops.writeFile` 写后触发单文件 reindex（不全量）
3. **真向量 semantic_search**：集成轻量 embedding（candidates：`@xenova/transformers` 本地、或外部 OpenAI embedding）
4. **call_hierarchy callees**：AST 级作用域分析找调用

## 方案

### Phase 1 — tree-sitter 基建

- `library/traits/code_index/parser/` 目录封装 tree-sitter grammar 加载
- 每语言一个 grammar 包，按需加载

### Phase 2 — 符号提取器重写

- 替换 v1 正则为 tree-sitter query
- 输出精度大增（区分 public/private、泛型、装饰器）

### Phase 3 — 增量索引

- 注册到 `world/hooks.ts`：file_ops 写入 → 触发 `index_refresh({paths: [writtenPath]})`
- 避免全量重建

### Phase 4 — 真向量 semantic_search

- 引入 embedding 客户端
- 符号级 embedding（name + signature + docstring → vector）
- 索引落盘 `.ooc/code-index/vectors.json`

### Phase 5 — callees

- AST 解析函数体内所有 call expression
- 构建双向 call graph

## 影响范围

- `kernel/traits/computable/code_index/`（扩展）
- 可能新建 `library/traits/code_index/parser/`
- `kernel/src/world/hooks.ts`（增量触发）
- 新增测试

## 验证标准

- 大仓库（~5 万行）首次全量 < 15s
- 单文件增量 < 500ms
- semantic_search 在"写一个 XXX 的函数"query 下召回率显著 > token 相似度基线

## 执行记录

（初始为空）
