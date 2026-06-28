---
title: reflectable 核心 5 通路接通（thread reflectable methods + PR 闸 + reflect_request decl + author 回馈）
status: superseded
date: 2026-06-25
splits_from: 2026-06-25-merge-feat-branch-unification.md
follows: 2026-06-25-inheritance-via-source-import-spread.md
superseded_by: 2026-06-26-reflectable-redesign-as-flow-dispatcher.md
---

# reflectable 核心 5 通路接通

## 背景 / 动机

母 issue `2026-06-25-merge-feat-branch-unification` 三方 reviewer fan-out 时，**reflectable 元素 reviewer** 揭露重大真相：

**OOC 系统当前事实上没有 agent 自我迭代沉淀的真实闭环。** reflectable self.md 核心 5「stone 变更走 feat-branch PR」是承诺但未兑现——盘点 13 个环节里有 **8 处 gap**：

| 链路环节 | 设计权威 | 代码实现 |
|---|---|---|
| `talk(target="super")` 自指别名 | reflectable self.md 核 3 | ❓ 需查 collaborable 是否识别 "super" 别名 |
| super flow session 隔离 | reflectable self.md 核 2 | ❓ 需查 flow 调度器对 `sessionId="super"` 特殊路由 |
| **reflect_request 投影 class** | reflectable self.md 细 1 + index.md | **未实现**——`thread/readable/index.ts:97-108` window 数组缺第三个 decl |
| **`new_feat_branch` thread executable method** | super-flow.md 文档教 agent 调 | **未实现** |
| `createFeatBranchWorktree` 底层 | stone-feat-branch.ts | ✅ 已实现 |
| 普通 write_file 经 stonesBranch 绑定路由到 feat worktree | super-flow.md 文档约定 | ❓ 需查 resolveStoneIdentityRef 绑定覆盖路径 |
| **`create_pr_and_invite_reviewers` thread executable method** | super-flow.md 文档教 agent 调 | **未实现** |
| `commitFeatAndDiff` + `computeReviewerSet` 底层 | stone-feat-branch.ts | ✅ 已实现 |
| **`createPrIssue` / PR-Issue 持久化** | stone-feat-branch.ts:18 暗示在 pr builtin | **未实现** |
| pr.approve / reject / comment method | pr/index.ts | ⚠️ 半实现（只改 in-memory，不写 issue） |
| **`aggregatePrApproval`** | stone-feat-branch.ts:18 暗示在 pr builtin | **未实现** |
| **auto-merge finalizer 调 mergeFeatBranch** | reflectable × persistable | **未实现**——没人调那个 async 版 |
| async mergeFeatBranch 内的 invalidate 钩 | mergeFeatBranch async 版内嵌 | ✅ 已实现（但因上一项不调，等同未生效） |
| **author 回馈（reflect_request 通道）** | reflectable 派生 1 / self.md 派生 3 | **未实现** |

母 issue 已收窄到「双源统一」，本 issue 接管「reflectable 核心 5 整条通路接通」——这是 OOC 自举（dogfooding）的关键一环：agent 不能自我迭代的 OOC 是残的。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## reflectable`（B 区）—— 核心 5「stone 变更走 feat-branch PR 是唯一沉淀单元」
- `## reflectable × persistable`（D 区）—— 合入闸的设计契约
- `## reflectable` self.md 核心 6 —— **`prAutoMerge` world 配置闸**（默认要人确认）
- `## reflectable` self.md 派生 2 —— PR reject 后的回修 resume
- `## pr / reflect_request`（D 区）—— pr builtin = 真 class，reflect_request = 投影 class（非注册）
- `## collaborable`（B 区）—— talk(target="super") 自指入口
- `## thread`（E 区）—— thread executable 增 reflectable methods

涉及文件：
- `packages/@ooc/core/persistable/stone-feat-branch.ts:18,197,249,317`（注释引用 aggregatePrApproval / commitAndOpenPr / approval-flow，全部承诺未实施）
- `packages/@ooc/builtins/agent/children/pr/index.ts:1-87`（pr class 当前 surface）
- `packages/@ooc/builtins/agent/children/pr/types.ts`（PR data 状态机）
- `packages/@ooc/builtins/agent/children/thread/executable/index.ts`（thread executable，当前 method 列表只 sayMethod / replyMethod / endMethod / todoMethod）
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts:97-108`（thread readable window 数组）
- `packages/@ooc/builtins/agent/knowledge/super-flow.md`（agent knowledge，教 agent 调那些 method）

## 改动提案

### 改动 1：reflect_request 投影 class decl 落地（reflectable 维度 / readable 维度）

- 在 `thread/readable/index.ts:97-108` 的 `window` 数组**加第三个 decl**：`reflect_request`
- 在 `computeProjectionClass`（同文件）补 **super flow POV 路由**：若当前 thread 在 super flow（如何判定？经 sessionId 前缀 / thread.metadata.isSuperFlow）→ 投影 class = `reflect_request`
- reflect_request decl 内 `object_methods` 含 reflectable 沉淀 method 引用（`new_feat_branch` / `create_pr_and_invite_reviewers`，本 issue 改动 2 一起加）
- reflect_request decl 内 `window_methods` 与 talk 同形（say / reply / 等）——复用 talk decl 的方法集

### 改动 2：thread executable 加 reflectable methods

在 `thread/executable/index.ts` 加两个 method（标 `for_reflectable`，仅 reflect_request decl surface）：

#### `new_feat_branch(intent: string): { branch: string; worktreePath: string }`

- 调底层 `createFeatBranchWorktree(stonesBaseDir, intent)` 拿 branch + worktree path
- 写到 thread persistence: `self.persistence.stonesBranch = branch`（让普通 write_file 经 `resolveStoneIdentityRef` 自动绑定到 feat worktree）
- **fail-loud 约束**: `assert branch.startsWith("feat/")`——守 reflectable × persistable 铁律（不允许 session worktree 路径混入）

#### `create_pr_and_invite_reviewers(diff?: string, title?: string): { prId: string; reviewers: string[] }`

- 调底层 `commitFeatAndDiff` commit 当前 feat 工作树
- 调 `computeReviewerSet` 算 reviewer 集
- 调 `createPrIssue(record)` 写 PR-Issue 持久化（改动 3）
- 创建评审 thread / 入队 reviewer 调度（改动 5）
- 返回 prId（agent 后续经 reflect_request 回馈窗看进度）

### 改动 3：PR-Issue 持久化 + builtin pr class 补全

- 新建 `packages/@ooc/builtins/agent/children/pr/pr-issue.ts`：
  - `createPrIssue(record): PrIssueId` 写持久化
  - `loadPrIssue(id): PrRecord` 读
  - `updatePrIssue(id, patch)` 增量更新（approve/reject/comment 改动落账）
- 改 `pr/index.ts` 的 approve / reject / comment method：
  - 写持久化（不只是 in-memory data）
  - approve / reject 后触发 finalizer（改动 4）

### 改动 4：approval-flow.ts 编排 + auto-merge finalizer

新建 `packages/@ooc/builtins/agent/children/pr/approval-flow.ts`：

```ts
// 纯函数判定（按 mergeFeatBranch issue D5 接口边界）：放 core/persistable/pr-issue.ts
// aggregatePrApproval(prRecord): { approved: boolean, missingReviewers: string[], rejected: boolean }

// 触发 finalizer 钩子：放本文件
async function onReviewerAction(prId, action: "approve" | "reject" | "comment"): Promise<void> {
  const record = await loadPrIssue(prId);
  const agg = aggregatePrApproval(record);
  
  if (agg.rejected) {
    // 一票否决路径
    await rejectFinalizer(prId, record);
    return;
  }
  
  if (agg.approved) {
    // 检查 prAutoMerge world 配置（reflectable self.md 核 6）
    const autoMerge = ctx.world.config.prAutoMerge ?? false;
    if (autoMerge) {
      await mergeFinalizer(prId, record);
    } else {
      // 默认人类 checkpoint：打 ready-to-merge 标签等人确认
      await updatePrIssue(prId, { status: "ready-to-merge" });
    }
  }
  // 还有 missingReviewers，等他们继续
}

async function mergeFinalizer(prId, record): Promise<void> {
  // 必须在 enqueueSessionWrite 内（runtime reviewer D5 queue 注意）
  await enqueueSessionWrite(record.baseDir, async () => {
    // paths 从 record.paths 透传（mergeFeatBranch issue D4 paths 透传契约）
    await mergeFeatBranch(record.baseDir, record.branch, record.paths, `pr-${prId}`);
    await updatePrIssue(prId, { status: "merged" });
    await notifyAuthor(record.authorThreadId, { type: "merged", prId });
  });
}

async function rejectFinalizer(prId, record): Promise<void> {
  await updatePrIssue(prId, { status: "rejected" });
  // 回修 resume（reflectable self.md 派生 2）
  await notifyAuthor(record.authorThreadId, {
    type: "rejected",
    prId,
    rejectReason: record.comments.filter(c => c.action === "reject"),
  });
}
```

`notifyAuthor` 经 reflect_request 通道的 say-style 回投 author thread（改动 6 author 回馈）。

### 改动 5：reviewer 评审 thread 入队 / 调度可达性

- `computeReviewerSet(record)` 算出 reviewer 后，**每个 reviewer 创建一个评审 thread 实例**，target 指向该 reviewer agent
- 评审 thread 入队 worker scheduler，让 reviewer agent 拿到 job
- reviewer thread context 含 pr window（投影该 PR-Issue 的 reflect_request 视角）+ diff 内容
- reviewer 在评审 thread 内可调 `pr.approve` / `pr.reject` / `pr.comment`——触发改动 4 finalizer

### 改动 6：reflect_request 通道 author 回馈

- author thread 在 super flow 内有一个 reflect_request 窗（指向其开的 PR）
- finalizer (`notifyAuthor`) 经该窗的 say-style 通道写消息到 author thread inbox
- author thread 下一轮 thinkloop 看到 PR 状态变化（merged / rejected）+ 决定下一步：
  - merged → 继续下一沉淀任务
  - rejected → 按 reflectable self.md 派生 2 「回修 resume」：重投 super(foo) author thread + 同 intent 幂等重绑

### 改动 7：`prAutoMerge` world 配置闸落地

- world config 加 `prAutoMerge: boolean`（默认 **false**）
- approval-flow 编排尊重它（见改动 4）
- 默认 false 时：aggregate satisfied 仅打 `ready-to-merge` 标签；人类经控制面（app HTTP endpoint）点击 confirm → 触发 `mergeFinalizer`
- 控制面 endpoint：`POST /api/pr/:prId/confirm-merge`（app 维度，由人类经浏览器调；标 `for_user`）

### 改动 8（验证）：偷渡测试 fail-loud

按母 issue D7 / reflectable reviewer 漏项 2：

- agent 经 filesystem.write_file 在 session worktree (`flows/<sid>/`) 下试图直写 stones/main 内的文件 → **fail-loud**
- 检查 `core/executable/tools/filesystem.write_file.ts` 是否已有该校验；没有则补
- 加端到端测试：合规路径 OK，偷渡路径 fail

### 改动 9：reject 回修通道

按 reflectable self.md 派生 2 落地（已在改动 4 + 6 涉及）：
- PR reject 后 author thread 的 reflect_request 窗收 system 消息
- author thread 决定是否 resume——重投 `super(foo)` 时按 intent 幂等重绑到同一 reflect_request 窗
- intent 重绑机制由 reflectable persistance 实现（具体待裁决 1）

### 改动 10：talk(target="super") 入口校验

- collaborable 通道在投递 `target="super"` 时经 trim + lowercase 归一
- 路由到 super flow session（特殊 sessionId 或 metadata 标记）
- 这条入口当前实现状态不明，本 issue 落地必须先核——可能已实现、可能也是 gap

### 改动 11：super-flow.md agent knowledge 对齐

落地后 `builtins/agent/knowledge/super-flow.md`：
- new_feat_branch / create_pr_and_invite_reviewers method 签名与改动 2 对齐
- prAutoMerge 默认行为说明
- reject 回修流程说明

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

A 区
- `## OOC` —— 元编程主张三：当前未真兑现；本 issue 是「兑现自我迭代闭环」

B 区
- `## reflectable` —— 核心 5 整条通路首次端到端落地；核心 6 prAutoMerge 闸落地；派生 2 reject 回修通道落地
- `## collaborable` —— talk(target="super") 自指入口（改动 10）
- `## executable` —— thread executable 加 2 reflectable methods（改动 2）；filesystem.write_file 守卫加强（改动 8）
- `## readable` —— thread readable window 数组加 reflect_request decl（改动 1）+ super flow POV 路由
- `## visible` —— `POST /api/pr/:prId/confirm-merge` 控制面 endpoint（改动 7）

C 区
- `## builtins` —— pr class 补全（改动 3）

D 区
- `## reflectable × persistable` —— 整条通路实现，铁律由改动 8 fail-loud 守
- `## readable × thinkable` —— reflect_request 窗进 super flow thread context
- `## collaborable × thinkable` —— talk(super) 自指入口

E 区
- `## pr / reflect_request` —— pr 真 class 补全 + reflect_request 投影 class 落地
- `## thread` —— thread executable methods 增 2 + readable window decl 增 1

未受影响：
- A 区 `## OOC Class/Object Model`（不动对象模型）
- B 区 `## thinkable / observable / app（核心契约）`
- E 区 `## runtime` (sessionRegistries 不在本 issue 改; 见 session-level-invalidate issue)

## 风险与权衡

1. **scope 大**：13 处 gap 一次落地，工期评估至少 5-8 天。可考虑再拆，但拆得过细会让中间状态不可用（如 reflect_request decl 落地但 method 没补则窗存在但点不响应）——倾向**保持单 issue、内部分阶段**。
2. **接口边界**：`aggregatePrApproval` 纯函数 vs finalizer 钩子分层（母 issue D5）严格遵守——前者放 `core/persistable/pr-issue.ts`，后者放 `builtins/agent/children/pr/approval-flow.ts`。
3. **prAutoMerge 默认 false**：意味着第一版 PR auto-merge **实际还是人类 checkpoint**——但 mergeFeatBranch 钩生效路径打通后，下一步开 `prAutoMerge: true` 即可全自动。这是渐进设计的合理一步。
4. **reviewer 调度可达性**：改动 5 涉及 worker scheduler——需核当前 reviewer thread 入队 API 是否齐全
5. **测试覆盖**：scope 大 → 测试需匹配。建议至少 4 个 e2e 场景：happy path / partial approve / reject + 回修 / 偷渡 fail-loud
6. **依赖 母 issue 落地**：本 issue 的改动 4 `mergeFinalizer` 调 async mergeFeatBranch——必须等母 issue (D6 P1) 完成 sync 版删除、tests 切到 async 后才能开始

## 待裁决点

1. **intent 幂等重绑机制**（改动 9）：当前 reflectable persistance 是否已有 intent 索引？若没有，需要新加；待落地前 review 现状
2. **改动 5 reviewer 调度**：当前 worker scheduler 是否接受异 session 的 thread 入队？需 review
3. **改动 10 talk(super)**：当前实现状态——已实现/半实现/未实现？落地前实测
4. **改动 8 偷渡 fail-loud 位置**：守卫加在 `filesystem.write_file` 还是 `stone-worktree.ts:resolveStoneIdentityRef`？后者更靠近防御点
5. **改动 7 控制面 endpoint** 是否需要权限校验？默认 admin only 还是 owner only？

## review 记录

按 design-workflow 步骤 2，3 维度 reviewer + 1 完整性批评官 fan-out。结论：方向正确、scope 准确，**13 处真问题 8 处属实**；但有 **4 类必须先修的事实/边界偏差**才能进入裁决：

### B · reflectable —— 同意但有严重担忧（11 改动需补 9 处）

**核心结论**：方向正确，但 issue **低估 reflectable × 其它维度的耦合度**。

**重大修正**：
1. **改动 3 `pr-issue.ts` 物理位置错误**——reflectable self.md 细 1 明确「**存储层（PR-Issue 记录、reviewer 冒泡纯函数）归 persistable**——窗只是脸」。issue 把 `pr-issue.ts` 放 `builtins/agent/children/pr/` 违反 self.md 细 1。**正解**：存储底座（createPrIssue/loadPrIssue/updatePrIssue）放 `core/persistable/pr-issue.ts`，builtin pr 只持 finalizer 钩子。
2. **改动 9 派生 3「同 intent 幂等重绑」需要补索引**——实测 `stone-feat-branch.ts:182` 已实现 `WORKTREE_EXISTS 幂等`（branch 侧 OK），**但 author thread 侧 intent → prId 索引完全不存在**——必须新增 `thread.persistence.activeReflectIntent: { intent → prId }`，否则派生 3 落空。
3. **改动 1 reflect_request 互斥契约缺测试**——reflectable self.md 细 1「reflect_request 与 pr 永不共存于同一 thread」需要 `computeProjectionClass` 测试守卫。
4. **改动 4 `notifyAuthor` 实现路径未锚定**——应明示「经 collaborable transport 向 author thread 投 say-style 消息，target=authorThreadId.reflectRequestWindowId」，受影响元素**补 `## collaborable`**。

**前置 spike 建议（不在主路径阻塞）**：
- 改动 5 reviewer 调度可达性：worker scheduler 是否接受异 session 的 thread 入队？现状未明，需先 spike
- 改动 10 talk(target="super")：`core/types/constants.ts:15` 已有 `SUPER_TARGET_ALIAS` 常量 + knowledge 已用，但 collaborable 投递层是否消费该 alias 未实测——先 spike

**关键源码锚点**（供裁决用）：
- `thread/readable/index.ts:86-108` —— `computeProjectionClass` 现有 binary 判定（this_thread / talk），改动 1 需扩 reflect_request 第三档
- `thread/executable/index.ts:14-21` —— 当前仅 4 methods，改动 2 需 +2 with visibility marker
- `pr/index.ts:40-87` —— pr.comment/approve/reject 只改 in-memory，未写持久化
- `stone-feat-branch.ts:109-182` —— slugFromIntent + 幂等 WORKTREE_EXISTS 已实现，改动 9 branch 幂等已满足、缺 author 侧索引
- `stone-worktree.ts:169-197` —— `resolveStoneIdentityRef` 已支持 stonesBranch 优先路由，改动 8 fail-loud 闸落此最佳
- `core/types/constants.ts:15` —— `SUPER_TARGET_ALIAS` 常量已定义

**P0/P1 分批建议**：
- **P0（与母 issue 并行）**= 改动 1 / 2 / 3 / 5 / 7 / 8 / 10 / 11
- **P1（等母 issue 完成 sync 版删除）**= 改动 4 / 6 / 9

### B · executable —— 条件通过（P1 必修 2 处）

**P1 阻塞**：

1. **`for_reflectable` design ↔ contract drift**——reflectable self.md line 64 把 `for_reflectable` 当 ObjectMethod 字段写了，但 `core/types/executable.ts:82-96` 真正 contract 里**没有这个字段**。issue 改动 2 用 `for_reflectable` 触及这条 drift，**必须先解决**：
   - **(a) 补进 contract** + runtime 侧「在 super flow 才 surface」过滤逻辑
   - **(b) 走 readable decl 白名单**——reflect_request decl 白名单列出 method names，executable 协议不感知 flow type（**推荐**——visibility 是 readable surface 控制权，让 method 自带 flow 政治标签是越界）

2. **改动 8 filesystem.write_file 守卫越界 executable 协议层**——路径权限属 **runtime 入口拦截**（method 之外、tool 原语 exec 之前）；放 method 体内会把"权限模型"耦合进 builtin 实现。**推到 persistable 维度**：守卫加在 `core/persistable/stone-worktree.ts:resolveStoneIdentityRef`（所有写 stones 文件经它路径解析，一处守卫覆盖全 builtin）。executable self.md 不动。

**P2 建议**：
- 改动 4 onReviewerAction 文件级 doc comment 明确「这是 pr method 内部 helper、不是新 lifecycle hook 类型」——防后人模仿增设伪 hook
- 改动 2 给 method 加 `route + intents` 提升 knowledge 激活精度（不强制）

**接口边界一问回答**：executable 协议管「机制层」（dispatch + 副作用通道 + 唯一性），实现管「政治层」（method 怎么写、谁调谁、什么时候 surface）。**改动 8 + `for_reflectable`** 是把"政治层"偷渡进"机制层"，需要回退。

### B · readable —— 通过但表述需细化（3 处需裁决）

**结论**：readable 协议层（多视角投影 + window method vs object method 分维 + projection class 解析）**未被改动**——issue 改动 1 是 thread builtin readable 实现内的 decl 增量，符合多视角投影协议。

**3 处裁决项**：

1. **改动 1 字段级清单**：`reflect_request` decl 的 `window_methods` / `object_methods` 完整列表 + 与 talk decl 的关系（独占？共享？）。建议:
   - `reflect_request.object_methods = ["say", "new_feat_branch", "create_pr_and_invite_reviewers"]`
   - `talk.object_methods` 不含 reflectable 系
   - 跨 class 同名 method（say/reply 在 talk + reflect_request）合法（不同 window class、命名空间分离）

2. **POV 判定机制**：选 A（sessionId 前缀 / SUPER_SESSION_ID）vs B（thread.metadata.isSuperFlow）。**强烈推荐 A**——readable 维度零感知 super flow 这一 reflectable 领域概念；source 已有 `SUPER_SESSION_ID="super"` 常量（`core/types/constants.ts:13`），判定直用此常量 `sessionId === SUPER_SESSION_ID`，无需新字段。

3. **改动 6 `notifyAuthor` 措辞模糊**——「经 reflect_request 窗 say-style 通道」字面解为 readable window method 跨 thread 调用会越界（window 绑定在被投影 thread 的 visible 表面，不应跨实例）。**正确措辞**：「走 collaborable inbox 投递通道，消息体格式与 reflect_request.say 同形」——把 readable（视角形态）与 collaborable（投递通道）解耦清晰。

**新增担忧**：reflect_request decl 是否进 readable knowledge `.ooc-world-meta/.../children/readable/knowledge/`？建议改动 11 显式补一节描述 POV 触发条件 + 暴露的 method 集，否则 decl 只活在 builtin 源码里、未来漂移风险高。

### 完整性批评官 —— 4 处事实偏差 + 3 处漏列受影响元素

**事实偏差**：

1. **`prAutoMerge` 已实现**——实测 `world-config.ts:84` 已有完整配置加载链 + 默认 false；改动 7「world config 加 prAutoMerge」**属虚报**，只需「**对接**已有 prAutoMerge 闸到 approval-flow」即可。
2. **PR 控制面 endpoint 路径冲突**——issue 改动 7 提 `POST /api/pr/:prId/confirm-merge`，但 source/super-flow.md:96 + world-config.ts:81 **已规划** `POST /api/runtime/pr-issues/:id/resolve {decision:"merge"|"reject"|"request-changes"}`。**冲突由 issue 显式裁决**：沿用已规划路径还是改新路径？
3. **`aggregatePrApproval` 物理位置自相矛盾**——`stone-feat-branch.ts:18` 注释明示 builtin/pr，issue 改动 4 注释拉回 core/persistable——必须统一（与 reflectable reviewer 的 P1 修正 1 一致：建议存储底座 core/persistable，finalizer 钩子 builtin pr）。
4. **mergeFeatBranch 双源**——本 issue 改动 4 须显式锚定 `import { mergeFeatBranch } from "@ooc/core/persistable/stone-versioning.js"`（不是 feat-branch.ts:146 那份待删的 sync 版）。

**漏列受影响元素**：

1. **`## app`** ⚠️——改动 7 endpoint 是控制面契约，应列受影响（且与 visible 维度分立）
2. **`## persistable` 独立 B 区** ⚠️——改动 3 PR-Issue 持久化的位置归属之争必须 persistable reviewer 参与（与 reflectable reviewer P1 修正 1 一致）
3. **`## runtime`** ⚠️——改动 5 reviewer 投递触动 runtime 派单可达性（待裁决 2 已点出）

**术语漂移**：
- `authorSessionId` 与 source 已有 `authorThreadId`（stone-feat-branch.ts:216）的关系——建议统一用 `authorThreadId`，删冗余 `authorSessionId`
- `approval-flow.ts` / `mergeFinalizer` / `rejectFinalizer` / `notifyAuthor` 需先在 reflectable / `## pr` 节定义签名再 source 化

**设计-实施越界**：
- 改动 4 一整段伪代码应移到 reflectable self.md / `## pr / reflect_request` self.md，issue 留契约层（接口边界 + 状态机 + 触发条件 + 错误语义）
- 改动 1 POV 判定两选项并列、不裁——issue 作者应自己拍板（建议选 A，见 readable reviewer）
- 改动 8 守卫位置未拍板——issue 待裁决 4 应自决（建议加在 `resolveStoneIdentityRef`，见 executable reviewer）

## 裁决

**superseded by `2026-06-26-reflectable-redesign-as-flow-dispatcher.md`（issue D）**——issue D 完整重设计 reflectable 维度，覆盖本 issue 的全部 13 处 gap：
- talk(target="super") 自指 → issue D 改动 1 / collaborable 核心 7 落地
- super flow session 隔离 → issue D 改动 2
- reflect_request 投影 class → issue D 改动 3（后于 issue E 改名 `super`）
- 4 reflect method（一步到位、取代本 issue 提议的 new_feat_branch + create_pr_and_invite_reviewers 二段式）→ issue D 改动 3
- PR-Issue 持久化 + approval-flow + finalizer → issue D 改动 4-6
- mergeFeatBranch 双源统一 → issue F（`2026-06-26-stitch-issue-cd-tail.md`）落地
- super flow scheduler 调度 + author 回馈 → issue G（`2026-06-26-thread-cross-session-scheduling.md`）落地

本 issue 裁决阶段未完成，issue D 在 issue 设计与落地上完全替代之。保留作设计探索历史参考。

## 落地验收

（待 landed 后填）
