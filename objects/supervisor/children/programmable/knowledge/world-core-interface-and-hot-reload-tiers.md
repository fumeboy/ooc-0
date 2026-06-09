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

`@ooc/cli` 是用户与 Core 的唯一入口：`ooc init`（脚手架）/ `ooc dev`（后端 fs watch 热更 + 前端 Vite HMR，统一端口免 CORS）/ `ooc build`（编译 stones 到 `.ooc-dist/`）/ `ooc start`（用预构建 bundle，关 HMR）。这四条命令**已落地**（`packages/@ooc/cli/src/index.ts` 薄 dispatcher + `commands/{init,dev,build,start}.ts`），CLI lifecycle 细节见本片末「World 目录布局 / package.json 模板 / CLI lifecycle」一节。

## World 目录布局 / package.json 模板 / CLI lifecycle

> 这一节是 npm-publish 终态的完整布局（设计权威 §2/§4/§5/§9）。其中**已落地**部分我用 `packages/@ooc/...` 行号锚定；**设计阶段未落地**部分明确标注。

### 完整 World 目录树（设计终态）

一个最小 World 本身就是标准 **Bun workspace monorepo**：

```
my-ooc-world/                    ← 用户工作目录，一个 World = 一个 Bun 项目
├── package.json                 ← 声明对 @ooc/* 的依赖 + dev/start/build scripts
├── bun.lock                     ← 锁定依赖版本（不同 World 可跑不同版本 Core）
├── tsconfig.json                ← extends @ooc/tsconfig
├── .world.json                  ← OOC 运行时配置（端口 / worker / llm 默认 / hotReload）
├── .env                         ← 密钥（API keys），不进 git
├── .gitignore
│
├── stones/                      ← Stone 层：用户 Object 定义（进 git）
│   └── <objectId>/              ← 一个 Stone Object = 一个本地 workspace 包
│       ├── package.json         ← name + ooc.objectId（可声明独立 npm 依赖）
│       ├── self.md
│       ├── readable.md          ← 或 readable.ts（动态渲染）
│       ├── executable/index.ts  ← 方法表导出
│       ├── visible/index.tsx    ← React 组件导出
│       └── knowledge/*.md
│
├── node_modules/
│   ├── @ooc/{core,web,cli,tsconfig,meta}   ← 来自 npm 的 Core 套件
│   ├── @ooc/builtins/{supervisor,file,plan…} ← 一组独立包，按需引入
│   └── @<world>/                ← workspace 软链，指向 stones/*
│
├── pools/                       ← Pool 层：跨 session 沉淀（不进 git）
│   └── <objectId>/{data,knowledge,files}/
└── flows/                       ← Flow 层：运行时实例（不进 git）
    └── <sessionId>/<objectId>/{state.json,threads/}
```

### package.json 模板（已落地）

`ooc init` 实际生成的 World 根 `package.json`（`packages/@ooc/cli/src/commands/init.ts:104`）：`workspaces:["stones/*"]` + scripts `{dev,start,build}` → `ooc <cmd>` + `dependencies` 声明 `@ooc/core` / `@ooc/web` / 一组 `@ooc/builtins/<id>`（supervisor/user/root/file/plan/todo/search/knowledge/program/skill_index）+ `devDependencies` `@ooc/cli` / `@ooc/tsconfig` / typescript。同时生成 `tsconfig.json`（inline 编译选项，等价 `@ooc/tsconfig`，自包含免 node_modules 解析；:145）、`.world.json`（`{port:3000, worker, hotReload, stones.autoDiscover}`；:166）、`.env.example`（:174）、示例 stone 五件套。

stone 包 `package.json` 的 `ooc` 段声明身份：`objectId / kind:"stone" / type / prototype / mixins / register`（可选，不写按约定路径查）。stone 的 `@ooc/core` 用 **peerDependencies** 强制与 World 根同版本（见三陷阱 #2）。

`@ooc/tsconfig` 包**已落地**：`tsconfig.stone.json`（stone 用 base，`noEmit/jsx:react-jsx/moduleResolution:Bundler`）+ `tsconfig.world.json`。

### npm 包拆分（设计 §4）

发布时 `packages/@ooc/*` 拆成：`@ooc/core`（运行时内核，导 `createWorldRuntime` + 所有 runtime 类型）/ `@ooc/web`（dev 提供 Vite 工厂、prod 提供 SPA bundle）/ `@ooc/cli`（init/dev/build/start）/ `@ooc/tsconfig`（stone base）/ `@ooc/builtins/<id>`（每个 builtin 独立 semver、结构同 stone，World 按需声明）/ `@ooc/meta`（纯文档，运行时不加载）。builtin 拆成独立包的理由：用户选择权、独立 semver、与 stone 同构加载。**现状**：以上包目录都已在 `packages/@ooc/` 下存在并以 `workspace:*` 互链；真正 `npm publish`（changesets）属 M5 未落地。

### CLI lifecycle（已落地，四命令均为真实实现）

- **`ooc init [path]`**（`commands/init.ts`，268 行）：脚手架——非空目录报错（除非 `--force`）、写上述模板文件 + 示例 stone、默认 `bun install`（`--no-install` 跳过）。
- **`ooc dev`**（`commands/dev.ts`）：开发模式——后端 bun 运行时（fs watch 热更，对应 `createWorldRuntime({dev:true})`）+ 前端 Vite dev server（HMR），统一端口（免 CORS、dev/prod 行为一致、心智简单）。设计流程：读 World 根 package.json/.world.json/.env → 扫 workspace stones/* 与 `node_modules/@ooc/builtins/*` → `createWorldRuntime` → Vite（`server.fs.allow` 含 visible/、虚拟模块映射 stone visible 入口、`@stone/*` alias）→ fs watch → `stoneRegistry.invalidate` → 三档分发。
- **`ooc build`**（`commands/build.ts`，342 行）：预构建——编译每个 stone 的 `executable/index.ts` → `.ooc-dist/stones/<id>/executable/index.js`，拷静态身份文件（self.md/readable/knowledge/package.json），产出 `.ooc-dist/stones/index.json` 确定性注册表供 `ooc start` 免扫描。**未落地**：per-stone visible(React) bundling + `@ooc/web` SPA bundle 拷贝（dev 仍靠 Vite HMR，标 follow-up）。
- **`ooc start`**（`commands/start.ts`）：生产模式——校验 `.ooc-dist/` 存在否则提示先 build；`createWorldRuntime({dev:false})` 从 `.ooc-dist/` 加载预编译 stones、不做 fs watch；Elysia serve `/api/*`→httpHandler、`/`→`@ooc/web/dist`、`/stones/<id>/*`→`.ooc-dist/<id>/visible`，关 HMR。

### 落地路线 M0–M5（设计 §9）与现状

| 阶段 | 内容 | 现状 |
|------|------|------|
| **M0** | `@ooc/cli` 骨架：`ooc dev` 启动当前 app.server + vite | **已落地**（`packages/@ooc/cli`） |
| **M1** | Core 重构：导出 `createWorldRuntime` 工厂，消灭 module-level singleton（pauseStore/jobManager 等迁入 WorldRuntime）——最大重构、地基 | **已落地**（`packages/@ooc/core/runtime/world-runtime.ts:76`，聚合 objects/observable/serialQueue/serverLoader/stoneRegistry） |
| **M2** | World/Stone 契约：StoneRegistry 扫 `stones/*/package.json` 的 `ooc.objectId`，builtin 走同一 loader；packages 目录重命名为 stones | **已落地**（`runtime/stone-registry.ts`，`createStoneRegistry(worldPath,{autoDiscover})`） |
| **M3** | 热更：fs watch + bun reimport（executable/readable）+ Vite 动态注入 stone visible | **tier 1 已落地**（`runtime/hot-reload.ts` → `serverLoader.invalidateStone`） |
| **M4** | `ooc init/build/start`；self.md/prototype 变更打标记 + 懒迁移 | **CLI 已落地**；懒迁移 / vtable 重算（tier 2）仍**未落地** |
| **M5** | npm publish 配置（changesets），验证 `ooc init && bun dev` 端到端 | **未落地**（仍 monorepo `workspace:*`，未对外发布） |

**关键判断**（设计原话）：M1（抽 WorldRuntime、灭 module-level singleton）是所有后续工作的地基——此判断已被现状印证，M1 落地后 M0/M2/M3-tier1/M4-CLI 接连落成。剩余真正未落地的是 tier 2 懒迁移、build 的 visible bundling、M5 npm publish。

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
