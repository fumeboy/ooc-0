---
activates_on: {"window::root": "show_content"}
---

# World / Core 接口契约与热更三档

自写方法的热更（写 `executable/index.ts` 即生效，见 self-written-method-hot-reload）是「程序运行起来后单个文件怎么换」。这一片往上一层：**整个 World 与 Core 的关系**，以及热更在更大范围里如何按修改内容分级。设计权威 `packages/@ooc/meta/world-core-interface-and-hot-reload.md`（2026-06-02）。

## Core 是 JVM，World 是项目目录

| 角色 | OOC 对应 |
|------|---------|
| JVM / runtime | `@ooc/core` —— 运行时内核（类型、调度、HTTP 控制面） |
| JDK 标准库 | `@ooc/builtins/*` —— 随 Core 发布的内置 Object（supervisor / file / plan…） |
| 项目目录 | 一个 World（用户工作目录） |
| workspace 子包 | World 内 `stones/<id>/` —— 用户态 Object，结构与 builtin 同构 |
| `node_modules/` | World 内 `node_modules/`，存 `@ooc/*` 与第三方依赖 |

builtin 包与 stone 包**结构完全同构**（都有 self.md / readable / executable / visible / knowledge + 带 `ooc.objectId` 的 package.json）。区别只在三点：所有权（builtin 归 Core，stone 归用户/Agent）、发现方式（builtin 经 `node_modules/@ooc/builtins/<id>/`，stone 经 World `stones/<id>/`）、以及「定义是 builtin，状态是 world」——builtin Object 的 pool/flow 仍落在用户 World。

## World 目录 = Bun workspace monorepo

一个最小 World 本身就是标准 Bun workspace：根 `package.json`（`workspaces: ["stones/*"]` + 对 `@ooc/*` 的依赖）+ `.world.json`（端口 / worker / llm 默认 / hotReload watchPaths）+ `.env`（密钥不进 git）。三层持久化对应三个目录：`stones/`（Object 定义，进 git）/ `pools/`（跨 session 沉淀，不进 git）/ `flows/`（运行时实例，不进 git）。

stone 包 `package.json` 的 `ooc` 段声明身份：`objectId / kind:"stone" / type / prototype / mixins / register`（可选，不写按约定路径查）。stone 的 `@ooc/core` 用 **peerDependencies** 强制与 World 根同版本，避免 workspace 解析出多副本。

> 注意：以上是 npm-publish 终态的目标布局。当前 ooc-2 仓同时是 Core 源码仓 + dogfooding World，用 `workspace:*` 把 `.ooc-world` 链到本地 `packages/@ooc/*`，改源码即生效，不走 publish→install。

## Core↔Stone 契约

Core 对外工厂 `createWorldRuntime({ worldPath, config })` → `WorldRuntime`（`httpHandler` / `stoneRegistry` / `startWorker` / `dispose`）。stone 反向约束：根必有 `package.json`（含 `ooc.objectId` / `ooc.kind`）+ `self.md`，readable/executable/visible/knowledge 至少一个；`executable/index.ts` 导出方法表。**stone 之间只能经 `exec(objectId, method, args)` 协作，禁止直接 import 另一个 stone 的源码**（直接 import 会绕过权限、破坏热更、阻碍独立打包 —— 见三陷阱）。

`@ooc/cli` 是用户与 Core 的唯一入口：`ooc init`（脚手架）/ `ooc dev`（后端 fs watch 热更 + 前端 Vite HMR，统一端口免 CORS）/ `ooc build`（编译 stones 到 `.ooc-dist/`）/ `ooc start`（用预构建 bundle，关 HMR）。

## 热更三档（按修改内容分级）

统一事件入口 `StoneRegistry` 的 `stone:changed`。实现里 `StoneChangedEvent` 有 4 个 kind（`packages/@ooc/core/runtime/stone-registry.ts:33`），由 `classifyChange(files)`(:51) 按路径判：`/visible/`→`view`、`/knowledge/` 或 `readable.md`→`knowledge`、`self.md` 或 `package.json`→`identity`、其余→`code`（注意 children 子目录的变更被跳过）。

- **第一档（即时热替换）**：`executable/**` / `visible/**` / `readable.(md|ts)` / `knowledge/**`——纯函数或只读数据，不持有实例状态。服务端经 mtime reimport（见 self-written-method-hot-reload），新调用走新 module、在途调用继续旧 module；前端经 Vite HMR 局部刷新不丢 React state。单轮 thinkloop 内 pin 一个版本快照，避免同轮 readable 与 executable 看到不同版本。
- **第二档（先标记 + 懒迁移）**：`self.md` 的 type/prototype/mixins、method 增删/可见性升级、state.json schema 变化。不立即替换，而在实例 `state.json._meta` 打 `stone_version_mismatch`，下次被 thread 引用时触发迁移钩子（`executable/migrate.ts`，失败转人工审查）；prototype 链变化重算受影响 objectId 的 vtable。哲学是「先标记，再懒迁移」，不在保存时做全局同步迁移。
- **第三档（重启）**：`@ooc/core` / `@ooc/web` / `@ooc/builtins/*` 版本升级——JVM 自身升级不在热更范围，semver pin + `bun install && ooc dev` 重启。

> 实现现状：tier 1 已落（`HotReloadWatcher` fs.watch → `invalidateStone`，见 self-written-method-hot-reload）。tier 2 的懒迁移 / vtable 重算、tier 3 的 builtin 走第二档（`OOC_DEV=true` dogfooding），仍是设计阶段未落地。设计文档列了 5 个 kind（含 `schema`），实现收敛为 4 个（`schema` 未单列）——信代码。

## 三个架构陷阱

1. **禁止 stone 互相 import 源码**：强制经 `exec` 协作；bun import resolver 拦截跨 stone import 抛 `StoneCrossImportError`。
2. **stone 的 `@ooc/core` 用 peerDependencies**：否则 workspace 解析出多副本、类型不兼容；`ooc dev` 启动做版本校验。
3. **前端 bundle 不得泄露 executable**：Vite `server.fs.allow` 只放 `visible/`，`executable/` 一律解析失败；`self.md`/`knowledge/` 按需白名单。

概念权威：`packages/@ooc/meta/object.doc.ts:3739` 节点 `programmable`（loader.patches.watcher_driven_invalidation 等）。
