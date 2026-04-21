# SuperFlow 转型 —— 把 ReflectFlow 方案 B 重构为 SuperFlow 语义

> 类型：refactor
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD

## 背景 / 问题描述

前序迭代 `20260421_feature_ReflectFlow方案B.md`（partial-finish）按**旧 ReflectFlow 方案 B** 设计完成了 5 Phase：
- `kernel/src/thread/reflect.ts` + `reflect-scheduler.ts`（新）
- `kernel/traits/reflective/reflect_flow/` 扩展 `persist_to_memory` / `create_trait`
- `kernel/src/thread/context-builder.ts` 注入 memory.md
- 前端新 Inbox / Memory Tab
- G12 E2E 测试

但在执行过程中，迭代 5 的文档被重写为 **SuperFlow 方案**——根本性设计变更。Agent 选择不回滚，已实现代码留在 `stones/*/reflect/` + `callMethod("reflective/reflect_flow", "talkToSelf", ...)` 路径上。

本迭代把已实现的代码按 SuperFlow 语义重构，把"反思版本"表达为"对象的镜像分身"而不是"方法调用区"。

## SuperFlow 设计（与已实现的核心差异）

| 维度 | 当前（ReflectFlow 方案 B） | 目标（SuperFlow） |
|---|---|---|
| 目录 | `stones/{name}/reflect/` | `stones/{name}/super/` |
| 投递机制 | `callMethod("reflective/reflect_flow", "talkToSelf", {message})` | `talk(target="super", message)` |
| 专用代码 | `reflect.ts` + `reflect-scheduler.ts` | **删除**，复用 world.talk / flow 机制 |
| Trait 命名 | `reflective/reflect_flow` | `reflective/super` |
| Trait 方法 | `talkToSelf` + 沉淀工具 | 只保留沉淀工具（`persist_to_memory` / `create_trait`） |
| 前端视图 | 新 Inbox/Memory Tab | **删除**，复用通用 FlowView |

**保留不变**：
- `persist_to_memory` / `create_trait` 的方法体（语义完全一致，只是 trait 归属改名）
- `context-builder.ts` 的 memory.md 注入逻辑（对所有对象生效）
- `docs/哲学/genes/g12-经验沉淀.md` 的 G12 工程映射章节

## 目标

1. **物理目录 rename**：`stones/*/reflect/` → `stones/*/super/`（所有 stone 同步）
2. **删除 reflect.ts / reflect-scheduler.ts**：走 super → world.talk → flow 机制
3. **`talk(target="super")` 特殊路由**：
   - `world.ts` 的 `onTalk` 新增分支：`target === "super"` → 以 `stones/{fromObject}/super/` 作为 flow object dir，走标准 `_talkWithThreadTree` 路径
   - 不是注册到 Registry 的顶级对象——只有 talk 路由特判
   - super 跨 session 常驻（放 `stones/{name}/super/` 而非 `flows/{sid}/`）
4. **Trait 重命名**：`kernel/traits/reflective/reflect_flow/` → `kernel/traits/reflective/super/`
   - TRAIT.md frontmatter name：`reflective/reflect_flow` → `reflective/super`
   - 删除 `talkToSelf` method（已被 talk 替代）
   - 保留 `persist_to_memory` / `create_trait` methods
5. **前端视图简化**：
   - 删除 `ReflectFlowView` 或专属 Inbox/Memory tab
   - ViewRegistry 路径 `stones/{name}/reflect/` → `stones/{name}/super/`，复用通用 FlowView
   - `kernel/web/src/**` 硬编码 `/reflect/` 字符串全替换
6. **方案 A 代码清理**：方案 A 的 `ensureReflectThread` / `talkToReflect` / `collaboration.ts` 的 `talkToSelf` 清理（若还在）
7. **E2E 复验**：bruce talk(super, "X") → super 跑 ThinkLoop → persist_to_memory → 下次 bruce Context 含新 memory 条目

## 方案（Phase 拆分）

### Phase 1 — talk(target="super") 路由

- `kernel/src/world/world.ts` 新增 `handleOnTalkToSuper(fromObject, message, messageId, sessionId)` helper
- `onTalk` 分支识别 `target === "super"`，路由到 `stones/{fromObject}/super/` 作为 flow object dir
- 复用 `_talkWithThreadTree`（flowsDir 参数改为 super 目录）
- 单元测试：talk(super) 落盘到 stone 的 super 目录
- commit：`feat(world): talk(target="super") 路由到 stone 的 super 目录`

### Phase 2 — 目录 rename + trait rename

- `stones/*/reflect/` → `stones/*/super/`（git mv，保留 git 历史）
- `kernel/traits/reflective/reflect_flow/` → `kernel/traits/reflective/super/`
- TRAIT.md frontmatter name 同步改
- Loader 路径硬编码更新（如有）
- commit：`refactor: reflect → super 目录与 trait 重命名`

### Phase 3 — 删除方案 A/B 的冗余代码

- 删 `kernel/src/thread/reflect.ts`（整个文件 + 相关 import）
- 删 `kernel/src/thread/reflect-scheduler.ts`（整个文件 + 相关 import + world.ts / cli.ts 启动逻辑）
- 删 `kernel/src/thread/collaboration.ts` 的 `talkToSelf` / `replyToFlow`（若还在）
- 删 `reflective/super/index.ts` 的 `talkToSelf` method（保留 `persist_to_memory` / `create_trait`）
- 删方案 A 测试 `kernel/tests/reflect-thread.test.ts`、方案 B reflect-scheduler 相关测试
- commit：`refactor: 删除方案 A/B 冗余代码（reflect.ts / reflect-scheduler / talkToSelf）`

### Phase 4 — 前端视图简化

- ViewRegistry 路径更新：`stones/{name}/reflect/` → `stones/{name}/super/`
- 删除或简化 ReflectFlowView（专属 Inbox/Memory tab）—— 让通用 FlowView 处理 super 目录
- `kernel/web/src/**` grep `/reflect/` 全替换 `/super/`
- tsc + build 0 error
- commit：`refactor(web): ReflectFlowView 简化为通用 FlowView + /reflect/ → /super/`

### Phase 5 — E2E + 文档

- E2E 复验：
  1. 启动 `bun kernel/src/cli.ts start 8080`
  2. 触发 bruce `talk(super, "记一个经验：X")`
  3. super 跑 ThinkLoop，调 `persist_to_memory`
  4. `stones/bruce/memory.md` 落盘新条目
  5. 新 session 触发 bruce → Context knowledge 段含该条目
  6. 线程 id / action id / 文件 diff 写入执行记录
  7. 服务 kill
- 文档：
  - `docs/meta.md`：反思机制段改写为 SuperFlow（replace ReflectFlow 描述）
  - `docs/哲学/genes/g12-经验沉淀.md`：工程映射章节的命名 reflect → super 同步
  - `docs/哲学/discussions/2026-04-22-SuperFlow反思即对话.md`（新）
  - `docs/哲学/discussions/2026-04-22-ReflectFlow方案B-G12完整闭环.md`：追加"已转型为 SuperFlow，此文档仅保留历史语境"标注
- commit：`docs+E2E: SuperFlow 转型验证 + 文档同步`

## 影响范围

- **后端**：
  - `kernel/src/thread/reflect.ts`（**删除**）
  - `kernel/src/thread/reflect-scheduler.ts`（**删除**）
  - `kernel/src/thread/collaboration.ts`（清理 talkToSelf / replyToFlow 残留）
  - `kernel/src/world/world.ts`（新 onTalk super 分支 + 删 reflect-scheduler 启动）
  - `kernel/src/cli.ts`（如果有 scheduler 启动逻辑）
  - `kernel/traits/reflective/reflect_flow/` → `kernel/traits/reflective/super/`（rename + 删 talkToSelf）
  - `stones/*/reflect/` → `stones/*/super/`（物理 rename，git mv）
  - 相关测试删除 / 重命名
- **前端**：
  - ViewRegistry 路径更新
  - `kernel/web/src/**` 中 `/reflect/` 引用替换
  - `ReflectFlowView` 简化或删除
- **文档**：
  - `docs/meta.md`
  - `docs/哲学/genes/g12-经验沉淀.md`（术语同步）
  - 新 `discussions.md` 一条 + 旧 discussion 追加标注

## 关键约束

- **保留 `persist_to_memory` / `create_trait` 方法体**（语义一致，只改 trait 归属命名）
- **保留 `context-builder.ts` memory 注入逻辑**（对所有对象生效）
- **git mv 保留目录历史**（别用 rm + mkdir）
- **每 Phase 独立 commit**，不 amend
- **不 git stash**（历史教训）
- 严格 TDD：先写 Phase 对应测试再改实现

## 验证标准

1. Phase 1-5 各自测试绿
2. 全量 `bun test` 保持 0 fail（起点 593 pass / 6 skip）
3. 前端 tsc 0 error、build pass
4. Phase 5 E2E 落盘完整追溯
5. `grep -r ReflectFlow` / `grep -r reflect_flow` / `grep -r /reflect/` 无残留（除历史 finish/ 迭代文档和 discussions/20260422-ReflectFlow方案B-G12完整闭环.md）
6. `docs/meta.md` 同步更新

## 执行记录

（初始为空）
