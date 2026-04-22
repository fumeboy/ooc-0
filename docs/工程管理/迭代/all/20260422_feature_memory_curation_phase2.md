# Memory Curation Phase 2 — 周期任务 + 向量检索 + GC

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
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

（初始为空）
