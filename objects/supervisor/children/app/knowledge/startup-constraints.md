---
activates_on: {"object::root": "show_description"}
---

# app — 启动约束（--world / 端口 / 前端 dev）

## 后端 app server

```bash
bun --env-file=.env packages/@ooc/core/app/server/index.ts --world ./.ooc-world
```

- **world 根目录必须显式传 `--world`**。解析顺序在 `packages/@ooc/core/app/server/bootstrap/config.ts:48`：`--world (--world-dir / --base-dir) → OOC_WORLD_DIR → OOC_BASE_DIR → process.cwd()`。
  - ⚠️ 不带 `--world` 时回退到 `process.cwd()`，把**源码目录当 world**，会在代码树写出 flows/ stones/ —— 严禁。本仓库根仅放代码与 meta，约定 world 为 `./.ooc-world`（已 gitignore）。
  - `--world` 会被归一为绝对路径：相对路径若不归一，前端 `/@fs${absPath}` 会产出坏的 `/@fs.ooc-world/...` 让浏览器 import client page 失败（config.ts:45-46 注释）。
- **端口环境变量是 `OOC_APP_PORT`，不是 `OOC_PORT`**（`config.ts:52`：`OOC_APP_PORT ?? 3000`；`--port` flag 优先）。切端口后服务仍起在 3000，先查环境变量名是否写对。
- `listen` 绑 `0.0.0.0`（`index.ts:342`），避免 macOS bun 只绑 IPv6 导致 `lsof` 看到 `*:3000` 但连不上。

## 前端 Web dev server

```bash
cd packages/@ooc/web
bun install
OOC_WORLD_DIR=../../../.ooc-world bun run dev
```

- **必须显式传 `OOC_WORLD_DIR`，与 backend 的 `--world` 指同一目录**。`web/vite.config.ts` 启动期读不到 `OOC_WORLD_DIR` 会直接 `throw`（fail-loud；防止 ObjectClientRenderer 静默指错目录成头号 debug 黑洞），不回退任何默认值。
- worldRoot 会被 `server.fs.allow` 加入白名单，让 `/@fs/` 协议能访问 world；并作为 `__OOC_WORLD_ROOT__` 注入 client。
- vite dev 把 `/api` 代理到 `http://127.0.0.1:3000`，所以本地开发需**先启动后端**。
- 构建静态产物：`bun run build`。

## 进程卫生

控制面 API "部分 404、部分正常" 多半不是代码缺失，而是**旧 server 进程残留**占端口，收到请求的是路由表过时的旧实例。排查：`lsof -nP -iTCP:3000 -sTCP:LISTEN`，发现多个监听就先清旧再起新，且直接探测新增路由本身（别只看 /health）。原则：先确认"你打到的是不是你以为的那个进程"。

## 测试卫生（runtime 单例）

`modules/runtime/index.ts` 与 `modules/flows/index.ts` 顶层声明了 `default*` 单例（pauseStore / jobManager）作未注入 fallback。多次 `buildServer` 不显式注入会**复用同一份 module-level 单例**，测试间串状态（pause 未清、job 残留）。集成 / e2e 测试请显式构造并注入各 store。
