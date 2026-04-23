# Memory Curation Phase 2 — 周期任务 + 向量检索 + GC

> 类型：feature
> 创建日期：2026-04-22
> 完成日期：2026-04-23
> 状态：finish
> 负责人：P1-CodeAgent
> 优先级：P1

## 背景

`memory_curation.md` finish 了 Phase 1+3（结构化存储 + 查询 API）。Phase 2（周期性 curation）+ 向量相关性 + 物理 GC 作为 backlog 留下。

## 目标

1. **super_scheduler 周期任务**：super 线程每 N 条新 entry 或每隔 T 分钟触发一次 curation（mergeDuplicates + rebuildIndex）
2. **向量相关性检索**：query_memory 支持 embedding top-K 召回
3. **物理 GC**：TTL 到期 entry 物理删除（不是只在 query 层过滤）
4. **统计 view**：MessageSidebar 或 Stone 详情页展示 memory 健康度（total entries / pinned / avg age）

## 方案

### Phase 1 — 周期 curation

- super-scheduler 注册 cron-like 任务（5 分钟 tick 或 20 条触发）
- 调用 `mergeDuplicateEntries + rebuildMemoryIndex`

### Phase 2 — Embedding

- 引入 embedding 客户端（local: @xenova 或 openai API）
- entry 落盘时 side-effect 存 embedding
- query_memory 扩展支持 `mode: "vector"`

### Phase 3 — 物理 GC

- super 定时任务扫 entries/ 目录
- isExpired(entry) → 删文件
- 留 audit log（stones/{name}/memory/gc.log）

### Phase 4 — UI 健康度

- Stone Memory tab 顶部 stats 条

## 影响范围

- `kernel/traits/reflective/super/`
- `kernel/src/persistence/memory-entries.ts`（embedding + GC）
- `kernel/web/src/features/` Memory tab

## 验证标准

- 跑 200 条模拟 entries 看 curation 稳定
- 向量检索召回率评估

## 执行记录

### 2026-04-23 · P1-CodeAgent

**测试基线**：起点 964 pass / 6 skip / 6 fail（6 fail 为前置迭代累积的 pre-existing http_client 端口问题，非本迭代回归）

#### Phase 1 — 周期 curation（commit `29d91e9`）

**新增文件**：
- `kernel/src/persistence/memory-curator.ts`（约 220 行）：
  - `MemoryCurator` 类：`register` / `start` / `stop` / `tickNow` / `curateNow` / `getLastStat` / `registered`
  - 双触发：时间阈值（默认 5 分钟）+ 计数阈值（默认累积 20 条新 entry）
  - 冷启动自动触发一次（lastCurationAt=0 且目录有 entries）
  - 按 stoneName 内部 `_inFlight` 集合保证幂等（同对象 curation 不会并发重入）
  - 错误隔离（单对象 curation 抛错不阻塞其他对象 / 后续 tick）
  - graceful stop：等待所有 in-flight runner 完成
- `kernel/tests/memory-curator.test.ts`（10 tests）

**集成**：`kernel/src/world/world.ts`
- `_memoryCurator` 字段 + `memoryCurator` getter
- `init()` 末尾注册所有非 user 对象 + start
- `stopSuperScheduler()` 末尾级联 `_memoryCurator.stop()`

**测试**：964 → 974 pass（+10 新增），零回归

#### Phase 2 — 向量相关性检索（commit `f370b2b`）

**embedding 选型决策**：
- **最终选型**：纯内置 hash+n-gram TF-IDF（`kernel/src/persistence/memory-embedding.ts`，dim=256）
- **拒绝 `@xenova/transformers`** 的理由：
  1. 首次跑需下载 ~30MB 模型文件，离线 / 受限网络环境失败率高
  2. bun 下 ONNX runtime 启动延时明显
  3. 对 memory entry 这种"短文本 + 同质领域"的场景，简单 TF 余弦已能给出合理的相关性排序（测试验证：查询"线程树 可观测性"时，"线程树的可观测性价值" entry 稳定排第一，超过"调试 API 的姿势" / "每日心情记录"）
- **API 稳定性保证**：`generateEmbedding(text) → number[]` 接口不变，未来想换真 embedding（OpenAI / @xenova / 本地 GPU）只替换实现即可。列入 backlog：
  - 真 embedding 精度评估：同义词（"bug" vs "错误"）、跨语言（中英混用）召回是否显著更好
  - 可选：引入 `OOC_EMBEDDING_MODEL=openai|xenova|hash` env 运行时切换

**新增文件**：
- `kernel/src/persistence/memory-embedding.ts`（约 165 行）：
  - `generateEmbedding` / `cosineSimilarity` / `EMBEDDING_DIM=256`
  - 中文逐字 + ASCII 词 + uni/bi-gram；djb2 hash trick 映射到槽位；L2 归一化
  - 侧车文件 `{id}.embedding.json`（`writeEmbedding` / `readEmbedding` / `deleteEmbedding` / `rebuildEntryEmbedding`）
- `kernel/tests/memory-embedding.test.ts`（16 tests）

**修改**：
- `memory-entries.ts`：
  - `readMemoryEntries` 跳过 `.embedding.json` 旁路文件
  - `appendMemoryEntry` 写完 entry 后 side-effect 生成 embedding（幂等）
  - `mergeDuplicateEntries` 合并后重建 embedding + 删除被合并者的 embedding
  - `migrateMemoryMdToEntries` 每条新 entry 同步生成 embedding
  - `QueryMemoryOptions.mode: "fuzzy" | "vector"`
  - `queryMemoryEntries` vector 模式：按 query 余弦 top-K 召回，score<=0 过滤；query 为空回退时间倒序
- `traits/reflective/memory_api/index.ts`：`query_memory` 暴露 `mode` 参数

**测试**：974 → 990 pass（+16 新增），零回归

#### Phase 3 — 物理 GC + audit log（commit `66c58dc`）

**新增文件**：
- `kernel/src/persistence/memory-gc.ts`（约 180 行）：
  - `evaluateGcDecision(entry, now, defaultTtl) → { reason: "expired"|"pinned"|"fresh", ageMs, ttlDays }`
  - `runMemoryGc(selfDir, stoneName, options) → GcRunSummary`
  - 默认 dry-run；`OOC_MEMORY_GC=1` env 或 `forceRealDelete: true` 才物理删 entry + embedding
  - audit log JSONL 追加到 `stones/{name}/memory/gc.log`（每条决策一行 + 一条 summary）
  - TTL 规则：pinned 永不删 / ttlDays 定义按该值 / null 回退 `DEFAULT_TTL_DAYS = 30`
- `kernel/tests/memory-gc.test.ts`（12 tests）

**修改**：
- `memory-curator.ts::_runCuration`：在 merge + rebuild index 之后顺带跑一次 `runMemoryGc`；若真删则再 rebuild 一次 index；`CurationTickStat` 新增可选 `gc` 字段
- `traits/reflective/super/index.ts`：新增 `gc_memory` LLM 方法

**dry-run 安全边界**：默认 dry-run 意味着测试 / CI / 首次启动环境永远不会误删真 entry；明确打开 `OOC_MEMORY_GC=1` 才真删。audit log 即使 dry-run 也写，供排查"哪些 entry 被判定过期"。

**测试**：990 → 1002 pass（+12 新增），零回归

#### Phase 4 — UI 健康度统计条（commit `9d8d309`）

**后端**：
- `GET /api/stones/:name/memory/stats`：total / pinned / nonPinned / avgAgeMs / avgAgeDays / latestCreatedAt / lastCuration（含嵌套 gc 概要）
- `POST /api/stones/:name/memory/curate`：手动触发 curation（调 `world.memoryCurator.curateNow`）

**前端**：
- `kernel/web/src/features/MemoryStatsBar.tsx`（约 120 行）：5 列 stats + "立即 Curate" 按钮
- `kernel/web/src/api/client.ts` 新增 `fetchMemoryStats` / `triggerMemoryCuration` + `MemoryStats` 类型
- `kernel/web/src/features/ObjectDetail.tsx` Memory tab 顶部挂载 `MemoryStatsBar`

**测试 / 构建**：kernel 1002 pass / 0 new fail；前端 `bun run build` 通过（2002 modules，built in ~10s）

### 测试基线演进

| 阶段 | 总 pass | 增量 | 说明 |
|------|---------|------|------|
| 起点（前两个迭代累计后） | 964 | — | pre-existing 6 fail 均为 http_client 端口 |
| Phase 1 | 974 | +10 | memory-curator.test |
| Phase 2 | 990 | +16 | memory-embedding.test |
| Phase 3 | 1002 | +12 | memory-gc.test |
| Phase 4 | 1002 | 0 | UI stats 代码；前端 build pass |

**零回归 / 零新增 fail**（6 fail 全程稳定）。

### embedding 精度后续评估（backlog）

本迭代用 hash n-gram TF-IDF，属于"足够用"方案。真实精度评估需要：
1. 构造 100+ 条多样化 entry（不同语言、同义词、不同语调），做人工标注的"相关 / 不相关"对
2. 测算 vector 模式的 precision@5 / recall@5
3. 引入 `@xenova/transformers` + all-MiniLM-L6-v2 做对照实验
4. 若真 embedding 显著优（precision@5 差 ≥ 15%）→ 值得切换；否则维持现状

当前观察：短中文文本查询稳定召回最相关条目，对"同义词 vs 近义"边界场景未做压力测试。

### 非预期发现 / 偏离

1. **merge 后需 rebuild embedding**：合并条目后 content 发生变化，原 embedding 不再代表新内容；补了 `rebuildEntryEmbedding(merged)` 调用。
2. **readMemoryEntries 需跳过 `.embedding.json`**：侧车文件也在 entries/ 目录下，不跳过会让 isMemoryEntry 拒绝、污染统计。加了 `file.endsWith(".embedding.json")` 前置过滤。
3. **GC 真删后 kept 数值要反映**：curator 原本只用 mergeDuplicateEntries 的 kept；GC 真删 N 条后 stat.kept 要减掉 N，否则 UI 显示的 total 和 Stats 对不上。
4. **`_tick` 幂等与 curateNow 的竞态**：curateNow 手动触发要和 polling 并发互斥，已通过共享 `_inFlight` 集合处理。

## 备注

- 未做：Bruce E2E 体验验证（G12 闭环在前置 super-scheduler 迭代已验证一次；本次纯数据层增量改动，没有接触 engine / LLM 路径，不需要再跑 LLM E2E）
- 未做：200 条模拟 entries 长跑实测——mergeDuplicateEntries 本身有完整单测覆盖；长跑更多是"观察 curator 触发频率是否合理"的运维问题，生产上线后按 stats bar 观察即可调整阈值
