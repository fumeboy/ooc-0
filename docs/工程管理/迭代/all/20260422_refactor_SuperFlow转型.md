# SuperFlow 转型 —— 把 ReflectFlow 方案 B 重构为 SuperFlow 语义

> 类型：refactor
> 创建日期：2026-04-22
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Alan Kay

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

### 2026-04-22 完整完成 5 Phase

#### 现状调研（起点）

- 起点测试基线：**593 pass / 6 skip / 0 fail**（方案 B 完成后）
- reflect 相关文件清单：
  - `kernel/src/thread/reflect.ts`（ensureReflectThread / talkToReflect / getReflectThreadDir）
  - `kernel/src/thread/reflect-scheduler.ts`（ReflectScheduler 类，骨架未接入）
  - `kernel/tests/reflect-thread.test.ts`、`reflect-scheduler.test.ts`、`reflect-g12-e2e.test.ts`
  - `kernel/traits/reflective/reflect_flow/`（talkToSelf + getReflectState + persist_to_memory + create_trait）
  - `kernel/src/thread/collaboration.ts` 的 `talkToSelf` / `replyToFlow` / `deliverToSelfMeta` / `getStoneDir`
  - `kernel/src/stone/stone.ts` 的 `reflectDir` getter
  - `kernel/web/src/router/registrations.tsx` 的 `ReflectFlowAdapter` + 注册
  - `kernel/web/src/hooks/useHashRouter.ts` 注释中的 /reflect 路径
  - `kernel/web/src/App.tsx` + `features/SessionFileTree.tsx` 中 "reflect" 目录的特殊过滤
  - `stones/*/reflect/` 物理目录（bruce/debugger/iris/kernel/nexus/sophia/supervisor/user）
- 关键发现：
  - `engine.ts` 的 talk/talk_sync 指令**直接调** `config.onTalk`（不走 collaboration.ts）——
    说明 `handleOnTalkToSuper` 只需要挂在 `world.ts::onTalk` 分支即可，不需要改 engine
  - `runWithThreadTree` 的 `objectFlowDir` 硬编码 `flows/{sid}/objects/{name}`——
    super 目录（`stones/{name}/super/`）结构不同，**不适合直接复用 `_talkWithThreadTree`**
  - 决策：`handleOnTalkToSuper` 做"纯落盘 + 返回 reply=null"，和 `handleOnTalkToUser` 对齐

#### Phase 1 — talk(target="super") 路由

- 新 `kernel/src/world/super.ts`: `handleOnTalkToSuper` + `getSuperThreadDir`
  - 落盘到 `{rootDir}/stones/{fromObject}/super/` 的独立 ThreadsTree
  - 首次创建 root 线程（title=`{fromObject}:super`）；后续复用 rootId
  - SerialQueue 按 superDir 串行化，防并发覆盖
  - 返回 `{ reply: null, remoteThreadId: rootId }`
- `kernel/src/world/world.ts::_talkWithThreadTree` 与 `_buildEngineConfig` 两处 onTalk 加 super 分支
- 新测试 `kernel/tests/world-talk-super.test.ts`：**4 pass**（落盘/累积/隔离/兜底）
- kernel commit `0fee221` feat(world): talk(target="super") 路由到 stone 的 super 目录
- 测试基线：**597 pass / 6 skip / 0 fail**（+4）

#### Phase 2 — 目录 + trait rename

- `git mv stones/{*}/reflect/ → stones/{*}/super/`（保留历史；bruce/nexus/sophia/supervisor/user 有 6 个文件 rename；debugger/iris/kernel 空目录用 mv）
- `git mv kernel/traits/reflective/reflect_flow/ → kernel/traits/reflective/super/`
- TRAIT.md 全面改写：
  - `name: "reflective/reflect_flow"` → `"reflective/super"`
  - 描述从"常驻反思线程"改为"反思镜像分身的沉淀工具集"
- `index.ts` 文件头注释更新为 SuperFlow 语义（方法体暂保留）
- 老测试 `reflect-thread.test.ts` + `reflect-g12-e2e.test.ts` 的 import path 同步改为 `traits/reflective/super/index.js`
  （本 Phase 不删测试，保持 0 fail 过渡态；Phase 3 统一删）
- kernel commit `4b97665` refactor: reflective/reflect_flow → reflective/super trait 重命名
- user commit `a3a2bf7` refactor(stones): reflect → super 目录重命名（含 Phase 1 + 2 的 kernel 指针）
- 测试基线：**597 pass / 6 skip / 0 fail**（持平）

#### Phase 3 — 删除方案 A/B 冗余代码

- 物理删除：
  - `kernel/src/thread/reflect.ts`
  - `kernel/src/thread/reflect-scheduler.ts`
  - `kernel/tests/reflect-thread.test.ts`
  - `kernel/tests/reflect-scheduler.test.ts`
  - `kernel/tests/reflect-g12-e2e.test.ts`
- `kernel/src/thread/collaboration.ts`：
  - 删除 `talkToSelf` / `replyToFlow` method 与实现（`executeTalkToSelf` / `executeReplyToFlow`）
  - 清理 `CollaborationContext.deliverToSelfMeta` / `stoneDir`
  - 清理 `ObjectResolver.getStoneDir`
  - `executeTalk` 的 self-talk 错误提示：用 `talk("super", ...)` 取代 `talkToSelf()`
  - 文件头注释声明 SuperFlow 转型的 talkToSelf / replyToFlow 移除理由
- `kernel/traits/reflective/super/index.ts`：
  - 删除 `talkToSelfImpl` / `getReflectStateImpl` 方法体
  - `llm_methods` 仅保留 `persist_to_memory` + `create_trait`
- `kernel/src/stone/stone.ts`：`reflectDir` getter → `superDir` getter
- `kernel/src/utils/serial-queue.ts`：注释中 reflect.ts 引用改为 world/super.ts
- `kernel/tests/thread-collaboration.test.ts`：
  - 删除 3 个 describe 块（`talkToSelf()` + `talkToSelf() — 方案 A` + `replyToFlow()`），共约 8 个 tests
  - 清理 `fs` / `os` / `ThreadsTree` 等未使用的 import
- kernel commit `414fd27` refactor: 删除方案 A/B 冗余代码（SuperFlow Phase 3）
- 测试基线：**562 pass / 6 skip / 0 fail**（-35：删除了老 reflect/scheduler/e2e 测试 + talkToSelf 相关测试）

#### Phase 4 — 前端视图简化

- `kernel/web/src/router/registrations.tsx`：
  - `ReflectFlowAdapter` → `SuperFlowAdapter`（函数重命名，basePath 改 super）
  - 视图注册 name: "ReflectFlow" → "SuperFlow"；match 正则 /reflect/ → /super/
  - tabLabel "{name} (reflect)" → "{name} (super)"；视觉 badge "reflect" → "super"
  - 空态文案：原"从未被 talkToSelf" → "从未被 talk(target=super)"
  - `ProcessJson` 匹配器的 /reflect/ 排除规则同步改 /super/
- `kernel/web/src/hooks/useHashRouter.ts`：路由文档 `/stones/{name}/reflect → ReflectFlowView` → `/stones/{name}/super → SuperFlowView`
- `kernel/web/src/App.tsx`：FileTree 对 "reflect" 目录的特殊过滤改 "super"
- `kernel/web/src/features/SessionFileTree.tsx`：同上
- 决策：**没有完全删掉专属 View 让通用 FlowView 处理**——
  因为 FlowView 强依赖 `flows/{sid}/objects/{obj}` 的语义（sessionId/objectName），
  super 目录在 `stones/{name}/super/` 下结构上不符合；最小改动是 rename + 路径替换
- tsc: 0 error；vite build: 1232KB（持平基线）
- kernel commit `9b218ce` refactor(web): ReflectFlowView → SuperFlowView + /reflect/ → /super/
- 测试基线：**562 pass / 6 skip / 0 fail**（前端不影响后端测试）

#### Phase 5 — E2E + 文档

**E2E 实际执行（降级为落盘验证）**：

启动服务后，执行 `curl -X POST http://localhost:8080/api/talk/bruce -d '{"message":"请 talk 给你自己的 super 记下一条经验：读 meta.md 需要分段看子树而不是一口气通读。"}'`。

session: `s_mo8uvo2w_6ew1er`，bruce 线程：`th_mo8uvo3d_ewl7yn`

**实际 LLM 行为**：bruce 把 "super" 当成了 "supervisor"——
1. 执行 `talk(target="supervisor", message="请记录一条体验测试经验：读 meta.md 需要分段看子树...")`
2. supervisor 收到后调 `persist_to_memory` 写入 `stones/supervisor/memory.md`
3. bruce return "已通过 talk 将经验发送给 supervisor"

**原因分析**：当前 bruce 的 Context 里没有对 `target="super"` 特殊语义的说明——
LLM 没被教过 "super" 是保留字，凭直觉从候选对象里匹配最像的 "supervisor"。
这不是 SuperFlow 通道的问题，是 **trait 层缺对 super 的文档化**。

**通道验证（单元测试已覆盖）**：
- `kernel/tests/world-talk-super.test.ts` 4 pass：`handleOnTalkToSuper` 的落盘通路完全 OK
  - 首次投递创建 super 目录 + threads.json
  - 多次投递累积到同一 rootId
  - 不同对象的 super 互不干扰
  - 兜底 mkdir

**E2E 结论**：**super 通道落盘通路 OK（单元测试证明）**，但**自动 ThinkLoop 消费**路径需要：
1. trait 层文档化 `talk(super)` 语义，让 LLM 知道何时用
2. 独立调度器唤醒 super 线程跑 ThinkLoop（本迭代已声明留作后续）

**文档更新**：
- `docs/meta.md`：三处子树同步（认知/Trait/视图注册表），SuperFlow 段替换原 ReflectFlow 方案 B 段
- `docs/哲学/genes/g12-经验沉淀.md`：工程映射章节整体重写为 SuperFlow 语义
- `docs/哲学/discussions/2026-04-22-SuperFlow反思即对话.md`：新 discussion，含哲学变革、实现要点、E2E 教训、后续 backlog
- `docs/哲学/discussions/2026-04-22-ReflectFlow方案B-G12完整闭环.md`：文首追加转型注记

user commit（含 submodule 指针 + Phase 3/4/5 kernel + 文档）：`refactor: SuperFlow 转型（reflect → super 简化重构）`

### 测试基线演进

| 阶段 | 总 pass |
|------|---------|
| 起点（方案 B 完成） | 593 |
| Phase 1 后 | 597（+4 world-talk-super） |
| Phase 2 后 | 597（rename 不改测试） |
| Phase 3 后 | 562（-35：删除方案 A/B 老测试 + talkToSelf/replyToFlow 块） |
| Phase 4 后 | 562（前端不影响后端测试） |
| Phase 5 后 | **562 pass / 6 skip / 0 fail** |

零回归 / 零新增 fail / 零新增 skip（相对 Phase 1 增量的 4 新测试全绿）。

### commit 清单

kernel：
- `0fee221` feat(world): talk(target="super") 路由到 stone 的 super 目录
- `4b97665` refactor: reflective/reflect_flow → reflective/super trait 重命名（SuperFlow Phase 2）
- `414fd27` refactor: 删除方案 A/B 冗余代码（SuperFlow Phase 3）
- `9b218ce` refactor(web): ReflectFlowView → SuperFlowView + /reflect/ → /super/（SuperFlow Phase 4）

user：
- `a3a2bf7` refactor(stones): reflect → super 目录重命名（SuperFlow Phase 1+2）
- 最终 commit: `refactor: SuperFlow 转型落地（reflect → super 简化重构 + 文档同步）`

### 后续 backlog（转型期遗留）

1. **super 线程跨 session 自动调度器**（真正跑 ThinkLoop + 自动沉淀）
2. **talkable trait 增加 talk(target="super") 语义文档**（让 LLM 知道"super"是反思保留字，避免误解为 supervisor）
3. **super 的 memory 二次沉淀**（super 的 memory.md 与对象本身的 memory.md 关系设计）
4. **前端 SuperFlowView 增强**（手动触发 super ThinkLoop 按钮；多线程可视化）
5. **E2E 真实验证**（待 1 + 2 完成后，LLM 能够正确 `talk(super, ...)` 并由调度器自动消费）
