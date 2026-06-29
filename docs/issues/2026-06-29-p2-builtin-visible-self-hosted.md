---
title: P2 · builtin visible Phase 2 — 自带 visible/index.tsx + endpoint + 切 dynamic 路径
status: in-review
date: 2026-06-29
follows: 2026-06-29-p1-builtin-visible-from-placeholder.md
priority: P2
---

# P2 · builtin visible Phase 2 — 让 builtin 真正"持有并演化自己的 UI"

## 背景

P1(`2026-06-29-p1-builtin-visible-from-placeholder.md`,verified)落地了 8 个 builtin 的真 UI 组件,
但它们物理上仍在 `web/src/domains/files/components/visible/`,经 `BUILTIN_VISIBLE` 静态注册表渲染。

`visible/self.md` ## 核心设计的最终承诺:**Object 持有并演化自身 UI** — UI 应在 builtin 的对象目录
`<ObjectDir>/visible/index.tsx`,经 `client-source-url` endpoint + 前端 dynamic import 加载;
完全替代静态注册表。`thread` builtin 是这条路径的范例(visible/server 已落 S2),P1 期间因为
`client-source-url` endpoint 未实装,builtin 自带 tsx 路径走不通,只能先用静态表。

Phase 2 把这条路径打通,兑现 self.md 的完整设计承诺。

## 现状

### 已就绪的部分

- `resolveWindowVisible.tsx` dynamic 路径**前端代码完整**(`kind: "dynamic"` 分支:`clientSourceUrl → requestJson → import(fsUrl)`);
  user-defined object 已经在跑这条路径(无 builtin 覆盖时会 fallback 到 readable / JSON)。
- 前端 endpoints map 已声明 `clientSourceUrl: (scope, objectId, opts) => ...`(`transport/endpoints.ts:29`)。
- `persistable/stone-client.ts` 的 `visibleIndexFile / visibleDir / readVisibleSource / writeVisibleSource` 薄壳已就位。
- worktree `builtins-visible-impl` 有 `todo/visible/index.tsx + visible/server` 草稿(Phase 1 期间产生,未并入)。

### 缺的关键件

1. **`client-source-url` endpoint 在 main 仓 core 未实装**(grep:仅旧 worktree `.claude/worktrees/agent-a3e41fea90e564410/...` 有过实装)
   - 路径应是 `GET /api/objects/:scope/:objectId/client-source-url`
   - 应注册在 `packages/@ooc/core/app/server/modules/ui/`(目录待建,或挂在 stones / flows 现有 module)
   - 返回 `{ absPath, fsUrl: /@fs${absPath} }`,stone scope 带 `?sessionId` 时路由到 session worktree 预览
2. **8 个 builtin 没有自带 `<ObjectDir>/visible/index.tsx`**(thread 已有 visible/server,但还没 index.tsx 渲身份名片)
3. **`resolveWindowVisible.tsx:48` 仍把 builtin 名命中静态表优先**:`if (BUILTIN_VISIBLE[window.class]) return { kind: "static", ... };`
   切到 dynamic 时这条短路要换成"先试 dynamic,失败再回 static fallback / 删 static"

## 改动提案

### Phase 2a:实装 endpoint(独立小 commit,先打通通路)

1. 在 `packages/@ooc/core/app/server/modules/` 新建 `ui/` 子 module(或挂在合适现有 module),注册 `GET /api/objects/:scope/:objectId/client-source-url`
2. flow scope:解析到 `flows/<sid>/objects/<oid>/client/pages/<page>.tsx`(默认 page=index)
3. stone scope 无 sessionId:解析到 `stones/main/objects/<oid>/visible/index.tsx`(canonical) → 不存在回 `stones/main/objects/<oid>/client/index.tsx`(legacy)→ 仍不存在 404 + `{ code: "NOT_FOUND" }`
4. stone scope 带 `?sessionId`:解析到 session worktree 的同路径(visible/index.tsx 在 session 改后这里能拿到预览)
5. 返回 `{ absPath, fsUrl: /@fs${absPath} }`(`fsUrl` 由 Vite `/@fs` 暴露)
6. 测试覆盖:
   - 单文件烟雾:有 visible/index.tsx → 返回 200 + fsUrl;缺失 → 404
   - legacy `client/index.tsx` fallback 命中
   - `?sessionId` worktree 路由
   - `?file=diff` 白名单解析 `visible/diff.tsx`

### Phase 2b:8 个 builtin 写自带 visible/index.tsx

- 把 P1 落的 8 个 `web/.../visible/{Xxx}WindowDetail.tsx` 内容 **逐个搬到对应 builtin 的 `<ObjectDir>/visible/index.tsx`**:
  - `_builtin/filesystem/file` ← FileWindowDetail.tsx
  - `_builtin/knowledge_base/knowledge` ← KnowledgeWindowDetail.tsx
  - `_builtin/agent/children/todo` ← TodoWindowDetail.tsx(注:worktree 已有草稿,合并草稿和 P1 完成态)
  - `_builtin/filesystem/search` ← SearchWindowDetail.tsx
  - `_builtin/agent/children/skill_index` ← SkillIndexWindowDetail.tsx
  - `_builtin/agent/children/plan` ← PlanWindowDetail.tsx
  - `_builtin/interpreter/interpreter_process` ← ProgramWindowDetail.tsx(注:class id 是 interpreter_process,window class 是 program,需校对)
  - **root window 不搬**(已裁决 2026-06-29:root 不作为 ooc class 存在);RootWindowDetail.tsx 保留在 `web/.../visible/`,作 web 内部组件
- 注意 import 路径:
  - tsx 在 `<ObjectDir>/` 下,要 import `ContextWindow` type 需要从 worker 路径(或经 props 收 plain object,不强类型)
  - import `react` 是必然的;打包/解析由 web 端 Vite `/@fs` + dynamic import 负责
  - 不要 import `@ooc/web/...`(builtin 不依赖 web 包,反过来才对)
- 给每个 builtin 加 `visible/server/index.ts`,**按可编辑性分两档**(裁决 2026-06-29:visible 完整承诺需 UI + visible/server 同时落地,不分两次):
  - **有可编辑 data 的 builtin → 实装真 method**:
    - `_builtin/agent/children/todo`:采纳 worktree 草稿(markInProgress / markDone / reopen / updateContent 4 method)
    - `_builtin/agent/children/plan`:实装 add_step / remove_step / update_step_status / update_step_text(借鉴 thread visible/server 模式)
  - **read-only / 派生 builtin → 空 module 留位**(5 个):file / knowledge / search / skill_index / program
    ```ts
    import type { VisibleServerModule } from "@ooc/core/types/visible-server.js";
    const visibleServer: VisibleServerModule = { methods: [] };
    export default visibleServer;
    ```
  然后在 `<ObjectDir>/index.ts` 装配 `visible: visibleServer`。读 / 派生类 builtin 的 visible/server 留位是为未来 method 扩展;LLM 端的 executable 路径不受影响。
- Phase 2b 实际是 **7 个 builtin** 实装(root 不搬),所以并发 sub agent 分组可以是 4 组(2/2/2/1)或 3 组(2/2/3 — knowledge/root 二人组合并;但 root 已不动,所以是 knowledge 单飞 / interpreter 单飞 / 各家两两并对)。todo 因有 worktree 草稿,**优先**作为 visible/server 完整范例(UI + 4 method)由 supervisor 亲自校验合入。

### Phase 2c:切换路径 + 清退静态表

- `resolveWindowVisible.tsx:48`:不再优先静态表,**直接走 dynamic 加载**(`kind: "dynamic", objectId: window.class, scope: "stone"`)
- **root window 显式特例分支**(已裁决 2026-06-29:root 不作为 ooc class 存在):
  `resolveWindowVisible` 在路由前先判 `if (window.class === "root") return <RootWindowDetail />;`,
  不走 dynamic(否则 endpoint 必 404)。
- dynamic 加载失败时(notFound)仍能 fallback 到 builtin static — 保留过渡期兼容(否则 endpoint 一挂、UI 就全死);具体做法:静态注册表降级为 "dynamic fallback" 而非 "primary path"
- 当 7 个 builtin(除 root 外)都自带 visible/index.tsx + endpoint 稳定后,**正式删除 `BUILTIN_VISIBLE` 静态注册表 + 7 个 `web/.../visible/{Xxx}WindowDetail.tsx`**(保留 `RootWindowDetail.tsx`,因 root 永远是 web 内部组件)

### Phase 2d:测试与文档回流

- e2e 烟雾:启动 app + web,访问某 thread snapshot 页面,确认 8 个 builtin window 的 UI 来自 builtin 自带 tsx(不是 static)
- visible/self.md / index.md §B 更新现状:从"P1 静态注册表"切到"Phase 2 builtin 自带 + dynamic"
- 删 P1 落地的 `web/.../visible/{Xxx}WindowDetail.tsx` 8 个文件 + 注册表清退

## 受影响设计元素

对照 `knowledge/index.md`:

- `## visible`(§B 维度):**自带 tsx 路径**第一次端到端兑现 — Object 持有并演化自身 UI 从设计承诺变机制层既成事实
- `## visible × app` 交叉:**client-source-url endpoint 实装**(P1 不动这个,P2 是关键改动点)
- `## visible × persistable` 交叉:复用 `persistable/stone-client.ts` 的 `visibleIndexFile / visibleDir` 薄壳(已就位,只需 endpoint 调用)
- `## file / knowledge / todo / search / skill_index / plan / program(interpreter_process)`(§D 内置对象):各 builtin 第一次有 **自带的 UI** 而非 web 包代渲
- `## thread` builtin:补 visible/index.tsx(身份名片);S2 已落的 visible/server 不动
- `## persistable`:不变(读写薄壳已就位)
- `## readable`:不变(visible 与 readable 仍各自独立)

## 风险与权衡

1. **endpoint 实装边界**:endpoint 需暴露文件系统路径给前端,要确保 `?path=` 类参数不接受任意路径(防穿越);本 issue 的方案只解析按 `(scope, objectId)` 推导的 canonical 路径,不接外部 path,安全
2. **builtin import 复杂度**:`<ObjectDir>/visible/index.tsx` 要 import ContextWindow type — 但 builtin 包是后端代码,引入 web 类型会污染;**裁决**:builtin tsx 用 ad-hoc 局部 type(就是 `{ window: any } / 自定义 props interface`),不依赖 `@ooc/web/...`;ContextWindow 类型约束在 web 端 wrapping
3. **Phase 2 工作量**:涉及 endpoint + 8 个 builtin + web 路径切换 + 测试 e2e,**至少 3-4 个 commit**;建议拆 2a/2b/2c/2d 4 个子 issue 串行或并行落地,而不是一锅炖
4. **过渡期兼容**:Phase 2c 切换 dynamic 前不要删静态表,以防 endpoint 不稳;**裁决**:静态表降级为 "endpoint notFound 时 fallback",dynamic 是 primary;稳定 1-2 周后再清退
5. **root window**:root 是 anchor、不属任何 builtin — 需特殊保留 web 内部 RootInternal 组件,resolveWindowVisible 显式分支识别

## 落地 commit 切分

按 4 个子 issue 串行(每个子 issue 独立 review + landed + verified):

1. **Phase 2a**(本 issue 起):endpoint 实装 + test 覆盖
2. **Phase 2b**:8 个 builtin 写 visible/index.tsx + visible/server 框架(可并发 sub agent 各负责 2 个,Phase 1 模式延续)
3. **Phase 2c**:resolveWindowVisible 切 dynamic 路径,静态表降级 fallback
4. **Phase 2d**:e2e 验收 + 删静态表/web 镜像 tsx 8 个 + 文档回流

## 待裁决点(全部已裁决 2026-06-29)

- ~~root window 是保留 web 内部组件,还是为 root 单独建一个 `_builtin/root` ooc class?~~
  **已裁决:root window 不作为 ooc class 存在。**root 是 thread context 的 anchor、非
  ooc object,Phase 2 保留 `RootWindowDetail.tsx` 在 `web/.../visible/` 作 web 内部组件;
  `resolveWindowVisible.tsx` 显式特例分支识别 `window.class === "root"` 走内部组件、不走 dynamic
  endpoint(否则 endpoint 必返 404)。Phase 2d 退潮时**保留 RootWindowDetail.tsx**,删其余 7 个。

- ~~worktree `builtins-visible-impl` 的 todo/visible/* 草稿是否直接采纳(已有 UI + visible/server 4 method)?~~
  **已裁决:采纳。**Supervisor top-view 推理:Phase 2 只搬 read-only 再起 Phase 3 加交互是同一改造做
  两遍 — 违反"克制熵增"。visible 完整承诺需 UI + visible/server 同时落地。Phase 2b 据此调整:
  **有可编辑 data 的 builtin(todo / plan)同步实装 visible/server method**;其余 5 个
  (file / knowledge / search / skill_index / program)维持空 module 留位。

- ~~Phase 2 整体在新 worktree 落地,还是续用 `builtins-visible-impl`?~~
  **已裁决:续用 `.worktree/builtins-visible-impl`,新建 git branch `feat/p2-builtin-visible-self-hosted`。**
  worktree 是工作目录、feature 单元是 git branch — 没必要每个 feature 新建 worktree。Phase 2 完工
  合入主仓后才删 worktree。

- ~~Phase 2a 的 endpoint 是新建 `modules/ui/` 还是挂在 `modules/stones/` / `modules/objects/`?~~
  **已裁决:新建 `modules/ui/`。**理由:URL `/api/objects/:scope/:objectId/client-source-url`
  跨 stone / flow 两个 scope,挂在任一 scope module 都重复或语义错位。按 OOP 单一职责原则,
  `modules/ui/` = "为人类 UI 服务的所有 endpoint" 是清晰 domain(区别于 stones/flows 的"对象操作"
  domain 和 LLM 侧的 thread 通道)。client-source-url 是首个住户,未来 visible HMR / UI route 等
  visible 维度的控制面 endpoint 也归此 module。

## 不在本 issue 范围

- visible/server for-ui method 的具体实装(各 builtin 按业务需求扩,P2b 只放空 module);
- agent-native parity 缺口闭合(self.md ## 已知问题 "最大债",P3+);
- loop_timeline server-method 化(同上,后续 phase);
- visible HMR(浏览器端不刷新即看 UI 变更,independent feature)。
