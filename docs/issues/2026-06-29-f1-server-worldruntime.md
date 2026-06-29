---
title: F1 · 生产 server 集成 WorldRuntime（lifecycle on_reload 闭环落地）
status: landed
date: 2026-06-29
follows: 2026-06-29-runtime-server-web-roadmap.md
follows_issue: 2026-06-28-lifecycle-module-and-reload.md
---

# F1 · 生产 server 集成 WorldRuntime

## 背景 / 动机

来自 roadmap `2026-06-29-runtime-server-web-roadmap.md` F1 项。

lifecycle issue（2026-06-28）落地后留下 follow-up：**生产 server 当前不构造 `WorldRuntime`** → `reloadTable` 不被构造 → 即使用户改了 class 源文件、hot-reload watcher 把 invalidate 信号送进 stoneRegistry，**`lifecycle.on_reload` 钩永远不会派发**（缺 reloadTable 透传）。

测试场景下 6 case 全绿（lifecycle-on-reload.test.ts），生产则空炮——这是设计与实现的最尖锐脱节。

## 现状

**当前 server 启动**（`packages/@ooc/core/app/server/index.ts`）：

```ts
export function buildServer(config: BuildServerConfig) {
  return new Elysia()
    .decorate("baseDir", config.baseDir)
    .use(healthModule)
    .use(buildRuntimeModule(config));
}
```

`buildRuntimeModule(config)` 内部仅有 `baseDir` 一个 worldDir 概念；没经过 `createWorldRuntime()`、不持 `stoneRegistry` / `serverLoader` / `reloadTable` 引用。worker.ts `enqueueScheduler` 闭包内构造 `wakeSession` 信号，但**不知道 reloadTable**。

**lifecycle 链路当前状态**（worktree merge 后 main 上）：
- ✅ `createWorldRuntime` 内 `stone:changed` listener 写 `reloadTable.registerInvalidation(classId, files)`
- ✅ `ThinkableDeps.reloadTable?: unknown` 槽位完整
- ✅ `runScheduler(opts.reloadTable)` → `thinkable.think(deps.reloadTable)` → `ThreadRuntime.fromThread({ reloadTable })`
- ✅ `ThreadRuntime.maybeDispatchOnReload` 实现完整、cursor 推进、`on_reload before active` 顺序契约
- ❌ **WorldRuntime 在生产 server 内未被构造，整条链路前端空**

## 改动提案

### 核心改动（5 处）

**1. `app/server/index.ts:buildServer` 经 `createWorldRuntime` 启动**

```ts
import { createWorldRuntime, type WorldRuntime } from "@ooc/core/runtime/world-runtime.js";

export function buildServer(config: BuildServerConfig) {
  const worldRuntime = createWorldRuntime({
    worldPath: config.baseDir,
    dev: config.dev ?? true,  // server 默认 dev 模式开 hot-reload
  });
  return new Elysia()
    .decorate("baseDir", config.baseDir)
    .decorate("worldRuntime", worldRuntime)
    .use(healthModule)
    .use(buildRuntimeModule({ ...config, worldRuntime }));
}
```

`RuntimeModuleConfig` 加 `worldRuntime?: WorldRuntime` 字段。

**2. `worker.ts:enqueueScheduler` 拿 reloadTable**

```ts
export async function enqueueScheduler(
  sessionId: string,
  llm: LlmClient,
  baseDir: string,
  reloadTable?: ReloadTable,   // 新增 opt
): Promise<void> {
  // ...
  let w = workers.get(sessionId);
  if (!w) {
    w = { sessionId, llm, baseDir, reloadTable, busy: false, pending: false };
    workers.set(sessionId, w);
  }
  // ...
}

async function runOnce(w: WorkerState): Promise<void> {
  // ...
  await runScheduler(w.sessionId, w.llm, {
    maxTicks: 15,
    worldDir: w.baseDir,
    reloadTable: w.reloadTable,  // 透传给 scheduler
    onDataEdit: async () => { ... },
    wakeSession: (sid: string) => {
      void enqueueScheduler(sid, w.llm, w.baseDir, w.reloadTable);  // 透传保持
    },
  });
}
```

**3. `modules/runtime/index.ts:maybeEnqueue` 传 reloadTable**

```ts
async function maybeEnqueue(sessionId: string): Promise<void> {
  if (!autoEnqueue) return;
  try {
    await enqueueScheduler(sessionId, getLlm(), baseDir, config.worldRuntime?.reloadTable);
  } catch (err) {
    // ...
  }
}
```

**4. dispose 路径**

server 关停时（`app.stop()`）调 `worldRuntime.dispose()` → 停 hot-reload watcher + clear server-loader cache + reloadTable.clear。

**5. 生产 server 默认 dev 模式开 hot-reload**

`ServerConfig` 加 `dev?: boolean`（默认 `true`——dev 启动时开 fs.watch；`--no-dev` 关）。

### 验证策略

**单元 test**：`tests/lifecycle-on-reload.test.ts` 已 6 case 覆盖派发逻辑，本 issue 重点验证**生产 server 真的拿到 reloadTable 并透传**。

加 1 个新 test `tests/server-lifecycle-integration.test.ts`：
- 起 `buildServer({ baseDir, dev: true })` → 拿 worldRuntime → 模拟一次 stoneRegistry.invalidate → 看 reloadTable 内有标记 → 调 `enqueueScheduler` 间接触发 → 看 thread 创建 + on_reload 派发

实际生产**手动验证**（不进 CI、写到 issue 落地段）：
- 起 server `bun run packages/@ooc/core/app/server/index.ts --world ./.ooc-world --port 3099`
- 改 `.ooc-world/stones/main/objects/<id>/executable/index.ts` 一个 method
- 看 `[hot-reload]` 日志 + 看 stone:changed event + 调一次该 class 的 method → log 显示 on_reload 派发

### 落地 commit 切分

1. `feat(server): buildServer 经 createWorldRuntime 启动 + decorate worldRuntime`
2. `feat(worker): enqueueScheduler 加 reloadTable opt + 透传给 scheduler`
3. `feat(runtime-module): RuntimeModuleConfig 加 worldRuntime 字段 + maybeEnqueue 透传`
4. `feat(server): app.stop 调 worldRuntime.dispose 释放 hot-reload watcher`
5. `feat(config): ServerConfig.dev?: boolean 默认 true + --no-dev 关 flag`
6. `test(server): server-lifecycle-integration.test.ts 验证生产路径 reloadTable 透传`
7. `docs: app self.md / app knowledge/server-routes-and-worker.md 补 reloadTable 透传链`

## 受影响设计元素

对照 `knowledge/index.md`：

**A · 顶层**
- 不动哲学根。

**B · 维度核心**
- `## lifecycle` —— **派发架构段补一条**：「生产 server 经 `createWorldRuntime` 启动获取 reloadTable，透 worker → scheduler → thinkloop → ThreadRuntime。」
- `## app` —— **server 启动段补**：buildServer 经 createWorldRuntime；ServerConfig.dev flag。

**C/D/E** —— 无影响。

## 风险与权衡

### 真实风险

1. **dev/prod 模式分流**：生产 server 默认 `dev: true`（开 hot-reload）可能让线上跑 fs.watch（资源开销）。缓解：保留 `--no-dev` flag 让运维关；默认 dev 是因当前阶段全是开发，可未来改默认 false。
2. **worker 长寿 vs reloadTable 引用**：worker map 永续，reloadTable 改了引用后旧 worker 仍持旧表。缓解：worker map 注册时**捕获 reloadTable 引用**，server 不重启则 reloadTable 不换；server 重启则 worker map clear（`clearWorkers()`）。
3. **`createWorldRuntime` 内 `stoneRegistry` autoDiscover async**：startServer 时若 server 立刻 listen 但 stoneRegistry 还在初始扫描，第一个 request 可能拿到空 registry。缓解：buildServer 后 `await worldRuntime.stoneRegistry.rescan()` 完再 listen（如 server runner 选择）。

### 权衡选择

- **passing reloadTable 经 opt vs 经 module-level singleton**：经 opt 更显式、测试隔离；module-level 用着方便但污染全局。**选 opt**。
- **dev 默认 on vs off**：dev on 让 hot-reload 自动生效（agent 改源码 → 下次思考拿新）；off 安全但 lifecycle.on_reload 不会跑。**选默认 dev=true**（开发期对 lifecycle 维度兑现优先）。

## 待裁决点

按用户授权 "独自完成 issue 流程"，**Supervisor 自裁决**：

1. **dev 默认 true / 加 `--no-dev` flag** ✅
2. **reloadTable 透传经 opt** ✅
3. **worker 内捕获 reloadTable 引用，server 不重启则不换** ✅
4. **stoneRegistry 初始扫描不阻塞 listen，依靠 lazy hydrate** ✅（rescan 是后台异步，不阻塞）
5. **本 issue 涉及 core runtime 改动 → worktree 隔离** ✅，建 `.worktree/f1-server-worldruntime`

## review 记录

按用户授权独立推进；自审：受影响 element 极少（lifecycle / app），无跨维度连锁；纯改集成层。

## 裁决

按改动提案 5 处 + 7 个 commit 切分推进。worktree 隔离开发。

## 落地验收

（landed 后启动验收 review：（1）buildServer 真经 createWorldRuntime；（2）worker 真传 reloadTable；（3）生产手动验证 hot-reload + on_reload 派发链路；（4）verify 全绿；（5）lifecycle self.md / app self.md 文档回流）
