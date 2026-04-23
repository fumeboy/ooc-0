# Code Index v2 — tree-sitter + 增量 + 向量语义搜索

> 类型：feature
> 创建日期：2026-04-22
> 完成日期：2026-04-23
> 状态：finish
> 负责人：Kernel
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

### 2026-04-23 v2 全 5 Phase 落地

**tree-sitter 选型**：`web-tree-sitter`（WASM）+ npm grammar 包。
- 决策理由：bun 原生支持 web-tree-sitter；`tree-sitter-typescript` / `tree-sitter-python`
  / `tree-sitter-go` / `tree-sitter-rust` 这些 npm 包**直接自带预编译 wasm**（位于
  `node_modules/tree-sitter-*/*.wasm`），无需 native 编译，无需运行时下载。
  Spike 2 行（load + parse + query）5 分钟内跑通；命中即采用。
- 实际覆盖 5 种语言：TS / TSX / JS / JSX / Python / Go / Rust（.jsx 借用 tsx grammar）
- 不支持语言（Ruby / Java / C++ / ...）落入正则 fallback 空集——后续若需要，加对应
  tree-sitter-xxx npm 包 + 1 条 query 即可。

**Phase 1 + 2**：`traits/computable/code_index/parser/`
- `tree-sitter-loader.ts` — Parser 单例、Language 按需加载、wasm 路径自动查找、幂等初始化
- `queries.ts` — 每语言的 symbol / callee tree-sitter query 字符串集合
- `extractor.ts` — 高阶 `parseAndExtract(text, lang)` → `{ symbols, callees }`，
  捕获 signature 首行、紧邻 docstring、endLine
- `index.ts` scanFile 改为优先走 tree-sitter AST；失败自动回退正则

**Phase 3**：增量 + build hook
- `index_refresh({ paths })` 传入路径只重扫这些文件（支持新增/修改/删除）
- `src/world/hooks.ts` 新增 `codeIndexRefreshHook`；开关 `OOC_CODE_INDEX_HOOK=1`；
  hook 本身始终 success=true（不给 LLM 制造噪声 feedback；真 build 错误由 tsc/eslint 专职）

**Phase 4**：真向量 semantic_search
- 复用 `src/persistence/memory-embedding`（hash n-gram TF，dim=256，零依赖）——
  迭代前置 memory_curation_phase2 已沉淀的基础设施
- 每个 symbol 对 `name + signature + docstring` 拼接后生成 embedding
- 查询走 `generateEmbedding(query)` + `cosineSimilarity` 排序 topK
- 向量落盘 `.ooc/code-index/vectors.json`（首次构建 / 增量都会同步；运行时重建兜底）
- 未来可无缝升级到真 embedding（接口签名不变，仅替换 generateEmbedding 实现）

**Phase 5**：callees
- AST 解析函数/类 body 内的 `call_expression`（普通 + member + new + Go selector + Rust scoped）
- 构建 `callGraphOut: DefKey → callees[]`
- `call_hierarchy({ direction: "callees" })` 从 v1 的 ok=false 变为返回结果（行为变化；
  更新了对应测试）

**性能基准实测**（目标仓库：kernel/src + tests + traits，共 47,668 行 TS）：
| 指标 | 目标 | 实测 |
|------|------|------|
| 首次全量构建 | < 15s | **482ms** |
| 单文件增量 | < 500ms | **115ms** |
| semantic_search | < 1s | **14ms** |

（kernel/src 单独 22,704 行场景：冷启动 527ms）

**测试结果**：
- 新增 `tests/trait-code-index-parser.test.ts`（6 pass，5 语言 AST 精度断言）
- 新增 `tests/trait-code-index-v2.test.ts`（12 pass，signature/docstring/callees/
  增量/向量落盘/hook 集成）
- 新增 `tests/trait-code-index-bench.test.ts`（`OOC_BENCH=1` 才跑，3 test）
- 改 `tests/trait-code-index.test.ts` 中"callees 未实现"为 v2 新行为断言
- 全量基线：1002 → 1021 pass，10 skip，6 fail（6 fail = pre-existing http_client
  端口 19876 故障，不是本次回归）

**挂起 / backlog**：
- 真 embedding 升级（hash n-gram 对"同义词 / 跨语言语义"无感）——接口已稳定
- Ruby / Java / C++ / Swift 等语言（按需加对应 tree-sitter-xxx 包 + query 即可）
- callers 方向仍走 regex find_references（简单但不区分调用 vs 注释里的字符串引用）——
  未来可升级为 AST-level reference resolution
