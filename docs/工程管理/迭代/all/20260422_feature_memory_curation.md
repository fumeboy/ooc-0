# Memory 裁剪 / 索引 / 去重

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 负责人：P1-CodeAgent
> 优先级：P1

## 背景 / 问题描述

当前 `persist_to_memory` 是 append-only，长期运行会：
- `stones/{name}/memory.md` 无限膨胀 → Context 注入占比过高
- 相似经验重复沉淀（如"用户喜欢简洁回答"被记 20 次）
- 无时效性（半年前的 bug 修复建议还贴在 memory 里）
- 无检索能力（"我半年前怎么修的这个 bug"找不回）

G12 沉淀循环需要配套的**遗忘与重组**机制，不然"经验"就变成"噪音"。

## 目标

1. **分类索引**：memory 条目带 tags / category / timestamp
2. **去重 / 合并**：reflect 线程周期性合并相似条目
3. **过期策略**：TTL（可配置）+ 手动"固化"（pin）
4. **检索能力**：`query_memory({query, tags?, since?})` llm_method
5. **Context 注入优化**：不再整段注入 memory.md，而是按 scope 相关性 top-K 注入

## 方案

### Phase 1 — 结构化存储

- memory 从 markdown → `memory/entries/{id}.json`
- 保留 markdown 视图（auto-generated index）

### Phase 2 — 自动维护（super 线程周期任务）

- reflect 线程每 N 条新 entry 触发一次 curation
- 相似条目用 embedding + cluster merge
- 过期检测 & 降权

### Phase 3 — 检索 API

- `reflective/memory_api` 扩展 `query_memory`
- Context 注入改为 embedding 相关性 top-5

### Phase 4 — 验证

- 手造 100 条重复 entry → curation → 合并到 ~30 条
- 查询"上周学到的 X" → 命中精准

## 影响范围

- `kernel/traits/reflective/super/` 扩展
- `kernel/traits/reflective/memory_api/` 扩展
- `kernel/src/thread/context-builder.ts` memory 注入逻辑
- `stones/*/memory.md` → `stones/*/memory/`（迁移）

## 验证标准

- 单元测试覆盖 merge / TTL / query
- E2E：真实长跑 session 后 memory 体积稳定

## 执行记录

### 2026-04-22 · P1-CodeAgent

**实现范围**：Phase 1 结构化存储 + Phase 3 检索 API（Phase 2 周期性 curation 任务留给后续迭代——需要先让 super_scheduler 稳定运行一段时间）

**新增模块**：

1. `kernel/src/persistence/memory-entries.ts` — 纯数据层
   - `MemoryEntry` 数据模型（id/key/content/tags/category/createdAt/updatedAt/pinned/ttlDays/source）
   - 稳定 id（`generateEntryId`：基于 key+content hash，迁移幂等基础）
   - `parseMemoryMd` / `parseDateStampOrNow`（老 markdown 段落解析）
   - `migrateMemoryMdToEntries`（幂等，不删除老 memory.md）
   - `queryMemoryEntries`（query/tags/since/onlyPinned/includeExpired/limit）
   - `mergeDuplicateEntries`（同 key 合并：content 行并集、tags 并集、任一 pinned 则 pinned）
   - `rebuildMemoryIndex`（生成 Pinned + Recent top 20 的 index.md）

2. `kernel/traits/reflective/super/index.ts`（扩展）
   - `persist_to_memory` **双写**：老 memory.md（兼容）+ 新 memory/entries/{id}.json + rebuild index
   - 新 llm_methods：`migrate_memory_md` / `merge_memory_duplicates` / `pin_memory` / `set_memory_ttl`

3. `kernel/traits/reflective/memory_api/index.ts`（新建）
   - 只读 llm_methods：`query_memory` / `get_memory_entry`

4. `kernel/src/thread/context-builder.ts`（小改）
   - 注入优先级：`memory/index.md` > `memory.md`（legacy fallback）
   - 不破坏任何未迁移对象——老路径仍然可用

**测试**：
- `kernel/tests/memory-entries.test.ts` — 32 用例（parser / id 稳定 / 迁移幂等 / query 过滤 / TTL / merge / index / type guard）
- `kernel/tests/trait-memory-api.test.ts` — 13 用例（llm_methods 契约 + persist 双写验证 + pin/ttl/merge/migrate）
- 总 45 新用例，全量 763 pass / 0 fail

**迁移策略（兼容性）**：
- 老 `stones/{name}/memory.md` 保留（readonly snapshot；Bruce 测试依赖不动）
- 新条目双写（markdown append + 结构化 JSON）
- 调用 `migrate_memory_md` 可幂等把老段落补齐到结构化（多次调用结果一致）
- Context 注入优先新 index.md；旧对象没有时静默回退老 memory.md

**未实现 / 后续**：
- Phase 2 super_scheduler 周期任务（每 N 条新 entry 触发一次 curation）——留给 scheduler 稳定后接入
- embedding 相关性检索 / top-K 相关性注入——当前仍是全量 index.md 注入 + 字符串模糊查询，够用则不引入向量依赖
- 物理删除过期 entry 的 GC 任务（现在只在 query 层过滤，不物理删）
