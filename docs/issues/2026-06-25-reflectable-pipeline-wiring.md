---
title: reflectable 核心 5 通路接通（thread reflectable methods + PR 闸 + reflect_request decl + author 回馈）
status: draft
date: 2026-06-25
splits_from: 2026-06-25-merge-feat-branch-unification.md
follows: 2026-06-25-inheritance-via-source-import-spread.md
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

（待 fan-out）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
