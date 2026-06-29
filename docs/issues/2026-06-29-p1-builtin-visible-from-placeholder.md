---
title: P1 · builtin visible 真 UI 实装(Phase 1:静态注册表去 Placeholder)
status: landed
date: 2026-06-29
follows: 2026-06-29-s2-visible-server-call-method.md
priority: P1
landed_at: 2026-06-29
landed_commit: 3288a04d
---

# P1 · builtin visible 真 UI — 从 Placeholder 到真组件

## 背景 / 动机

C1 Phase 3 dogfood e2e 落地后(2026-06-29),OOC 自我迭代机制层已闭合,**OOC 哲学层最关键的兑现**完成。下一阶段的瓶颈是 **web 端的可用性**:

- 控制面跑得起来(A 系列已让 `packages/@ooc/web/` 真 build),但 8 个核心 builtin window type **(file / knowledge / todo / search / skill_index / plan / program / root)** 在
  `BUILTIN_VISIBLE` 注册表里都是 `PlaceholderWindowDetail` — 渲染时只输出 JSON。
- 人类用户进入控制面看 thread / loop snapshot,绝大多数 window 是空壳,体验远远落后于设计承诺。
- visible 维度 self.md 早已写明 "Object 持有并演化自身 UI",但 builtin 这一面长期没真 UI 实装。

## 现状

### 渲染解析路径(锚 `web/src/domains/files/components/visible/`)

`resolveWindowVisible.tsx` 把 window 渲染分两路:
1. `BUILTIN_VISIBLE[window.class]` 直命中 → static builtin 组件
2. 否则走 dynamic(`clientSourceUrl` → `/@fs` dynamic import) → user-defined object 自写 `visible/index.tsx`

`BUILTIN_VISIBLE` 当前(`builtin-visible-registry.tsx:44-58`):
- ✅ 已实装(4 项):`method_exec`(MethodExecWindowDetail) / `feishu_chat` / `feishu_doc` / `talk`
- ⏳ Placeholder(8 项):`file` / `knowledge` / `todo` / `search` / `skill_index` / `plan` / `program` / `root`
- 已退役:`do`(合并入 `talk`,见 issue B)

Placeholder 体只渲染 `window.type` + JSON 前 800 char,完全跟随设计承诺的"为人类设计的 UI"远远脱节。

### builtin 自带 visible/index.tsx 路径状态

visible/self.md 的最终设计是 **builtin 自己在 `<ObjectDir>/visible/index.tsx` 写组件**,经
`client-source-url` endpoint + 前端动态加载渲染(完全替代静态注册表)。但:
- `client-source-url` endpoint **当前 main 仓 core 没实装**(仅旧 worktree 有);
- 旧 worktree `.worktree/builtins-visible-impl` 已有 `todo/visible/index.tsx + visible/server` 草稿
  (含 UI + 4 个 for-ui method,但未 commit、未接通)。

完整闭合 builtin 自带 tsx 路径需要:① core 实装 client-source-url endpoint ② 8 个 builtin 各写 visible/index.tsx
③ web 端切到 dynamic 路径 ④ 删 Placeholder。这是 **Phase 2**,工作量大。

## 改动提案(Phase 1)

**优先用最小代价让 web 控制面立刻可用** — 把 8 个 Placeholder 在静态注册表中替换为真 builtin 组件,
位置仍在 `web/src/domains/files/components/visible/`,签名仍 `({ window }: { window: ContextWindow })`,
与已实装的 4 个组件保持一致。

### 新建组件

每个 builtin 一个文件,与 ContextWindow union 中的对应 variant 对齐:

| Component | window.class | 主要展示字段 | 备注 |
|---|---|---|---|
| `FileWindowDetail.tsx` | file | path + lines/columns 视口指示 | 简洁;真正文件内容已经由 FileWindowContentView 承载 |
| `KnowledgeWindowDetail.tsx` | knowledge | path + source + presentation + body(markdown) | source=protocol/activator/explicit/relation 4 种 badge |
| `TodoWindowDetail.tsx` | todo | content + status + activatesOn + createdAt | status 三色 badge(open/in_progress/done)|
| `SearchWindowDetail.tsx` | search | kind/query/matches[].path + line + snippet | truncated 提示 + 列表 |
| `SkillIndexWindowDetail.tsx` | skill_index | skills[].name / description / scope | scope badge(branch/object/external)|
| `PlanWindowDetail.tsx` | plan | description + steps[].text + step.status + sub-plan 链接 | status 4 色;sub-plan/parent-plan 链接展示 |
| `ProgramWindowDetail.tsx` | program | history[].language/code/output/ok | exec 列表;按 startedAt 升序 |
| `RootWindowDetail.tsx` | root | title + 元信息(id / class / status / createdAt) | 极简;root 是 anchor、几乎没业务字段 |

### 注册表更新

`builtin-visible-registry.tsx`:
- 删 `PlaceholderWindowDetail`(保留向后兼容路径,后续 Phase 2 切到 dynamic 后整体删)
- 8 个槽位指向上面 8 个真组件
- 头注释更新:Phase 1 落地说明 + Phase 2 path

### 测试覆盖

- `__tests__/builtin-visible-registry.test.ts`(已存在):无需改 — 13 个 type 仍都已注册,只是组件换成真的
- 新加 `__tests__/builtin-visible-render.test.tsx`:对 8 个新组件各跑一次 `renderToString` 烟雾测试,确认不抛、含关键字段
  - 注:web 包测试以 vitest/bun:test + happy-dom 跑;若 happy-dom 未装,跑 `renderToStaticMarkup` 即可

## 受影响设计元素

对照 `knowledge/index.md`:

- `## visible`(§B 维度):builtin 第一次让 web 端**渲染出真 UI**,而不是 JSON 兜底 — visible 承诺兑现的关键一步
- `## visible × app` 交叉:控制面真正可用,人类经浏览器观察 thread context 时不再"全是 JSON"
- `## file / knowledge / todo / search / skill_index / plan / program / root` 等 builtin 各自(§D 内置对象):
  各 builtin 第一次有面向人的视觉表达

未触动:
- `## visible/server`(S2 已落,本次不动 visible/server,仅 visible UI;todo/plan 的 visible/server 留 Phase 2)
- `## persistable` / `## executable` / `## thinkable`:不变
- `## readable`:不变;visible 与 readable 在本 issue 仍 各自独立

## 风险与权衡

- **风险 1:Phase 1 仍走静态注册表 — 是否违反 visible/self.md "Object 持有并演化自身 UI"?**
  - 不违反。self.md 的设计目标是**最终**走 builtin 自带 tsx,但 Phase 1 是已实装 4 个组件(method_exec/feishu_*/talk)的同结构续作 —
    位置都在 `web/src/domains/files/components/visible/`。承诺逐步兑现,Phase 1 让 web 立刻可用,Phase 2 再迁。
- **风险 2:Placeholder 删除时机** — 本次保留 PlaceholderWindowDetail 函数(其它实验 / 暂未实装 builtin 仍可用,且 web 测试中也用作 fallback assertion),
  仅替换 8 个槽位指针。下次 Phase 2 整体走 dynamic 时再清。
- **权衡:不在本 issue 实装 visible/server** — 同步实装 todo/plan 的 visible/server(可编辑)收益大,但工作量也大;本次只做 read-only 视觉,
  保证小步快跑。todo/plan 的 visible/server 由 Phase 2 / 独立 issue 推进。

## 落地 commit 切分

1. `feat(web/visible): 实装 8 个 builtin window detail 组件(FileWindowDetail / KnowledgeWindowDetail / ...)`
2. `feat(web/visible): builtin-visible-registry 切到真组件,头注释更新`
3. `test(web/visible): builtin-visible-render 烟雾测试(8 组件 × renderToStaticMarkup)`
4. `docs(meta): visible self.md / index.md §B 更新 — Phase 1 现状叙述`

## 工作流

按系统设计调整工作流(`design-workflow.md`):
- 本 issue 触动设计元素 `## visible`(+ 多个 builtin) → 必走 issue
- 涉及源代码修改 → 在 `.worktree/builtins-visible-impl`(已存在,作 Phase 1 起点)继续开发
- 落地后 supervisor 写 review fan-out 子任务,再合入主仓

## 裁决

- 走 Phase 1(只填静态注册表)而非直接 Phase 2(builtin 自带 tsx + dynamic 接通);
- 不在本 issue 动 visible/server;
- 已存在的 `todo/visible/*` 草稿暂保留在 worktree,Phase 2 启动时再决定如何并入;
- 用已被使用的 worktree `.worktree/builtins-visible-impl` 作落地分支,issue 完成后合入 main。

## 落地记录(2026-06-29)

- worktree: `.worktree/builtins-visible-impl`,branch `feat/p1-builtin-visible-real`
- 落地 commit: `e972c82c`(feature),`3288a04d`(merge to main,11 files + 889 insertions)
- 实装文件(8 个新组件 + 1 个新测试 + 2 个改造):
  - `packages/@ooc/web/src/domains/files/components/visible/FileWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/KnowledgeWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/TodoWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/SearchWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/SkillIndexWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/PlanWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/ProgramWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/RootWindowDetail.tsx`
  - `packages/@ooc/web/src/domains/files/components/visible/__tests__/builtin-visible-render.test.ts`(新)
  - `packages/@ooc/web/src/domains/files/components/visible/builtin-visible-registry.tsx`(改:8 槽位指向真组件 + PlaceholderWindowDetail 改 named export)
  - `packages/@ooc/web/src/domains/files/components/visible/__tests__/builtin-visible-registry.test.ts`(改:移除已退役 "do",新增 "P1 类型不再指向 Placeholder" 不变式)

- 验收:
  - `bun test packages/@ooc/web/src/domains/files/components/visible/__tests__/` → 19 pass / 0 fail
  - `OOC_WORLD_DIR=... bun run build` → 2047 modules / dist/main 937KB / built in 8.78s
  - typecheck 干净(无新错误)

- 协作:Supervisor + 4 个并发 sub agent(各负责 2 个组件),最后 Supervisor 自己切注册表 + 加测试 + commit + 合入。

## 后续与未决(Phase 2 候选)

1. `client-source-url` endpoint 实装(目前 main 仓 core 没有,仅旧 worktree 留草稿);
2. 各 builtin 写自带 `<ObjectDir>/visible/index.tsx`,经 endpoint dynamic 加载;
3. todo / plan / file 等可编辑 builtin 实装 `visible/server`(本 issue 范围外,Phase 2 独立 issue);
4. 切到 dynamic 路径后,删 BUILTIN_VISIBLE 静态注册表(连带 PlaceholderWindowDetail)。

未决:`.gitignore:23` 的 `web/` 通配规则误伤 `packages/@ooc/web/.../visible/`,新增 .tsx 需 `git add -f`。
可独立小 issue 修(`web/` → `/web/` 顶层锚定),非本 issue 阻塞项。
