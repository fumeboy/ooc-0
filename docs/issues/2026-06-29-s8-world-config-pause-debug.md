---
title: S8 · world-config + runtime global-pause/debug
status: landed
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P2
---

# S8 · world-config + runtime global-pause/debug

## 背景

来自总目录 S8 项。桩点 **6 个**:G1(world-config) + G3-G6(global-pause/debug status/enable/disable) + I1(FeishuDoc world-config)。

这一组是 **MainLogo + 浏览器 chrome 级别开关**——影响 web 顶部状态显示,但不影响 thread/对话主流程。

## 设计权威锚

- **`app/self.md` ## runtime 编排**:pause/resume + debug 是进程内开关,HTTP 暴露
- **`knowledge/server-routes-and-worker.md`** 与 **`knowledge/startup-constraints.md`**:--world / OOC_WORLD_DIR 等 + world config 通过 `<baseDir>/.world.json`(本就有 `.ooc-world-meta/.world.json` 范例,内容 `{ "allowEscapeWorldFilePathLimit": true }`)

## 改动提案

### 1. world-config endpoint

新建 `app/server/modules/world-config/`:

`GET /api/world/config`:
- 读 `<baseDir>/.world.json` 内容
- response 含 `{ siteName?: string; lark?: { feishuPrefix?: string }; allowEscapeWorldFilePathLimit?: boolean }`
- 缺文件 → 返 default `{}`,不报错

`PUT /api/world/config` (留 follow-up,本 issue 仅实现 GET)

### 2. global-pause endpoints

新建 `app/server/modules/runtime-control/`(或加进现有 runtime module):

`GET /api/runtime/global-pause/status` → `{ enabled: boolean }`
`POST /api/runtime/global-pause/enable` → `{ enabled: true }`
`POST /api/runtime/global-pause/disable` → `{ enabled: false }`

进程内 boolean 单例(类似 S4 pauseStore,但全局而非 per-session)。worker.ts 入队闸:globalPause = true → enqueueScheduler 跳过。

### 3. debug endpoints

`GET /api/runtime/debug/status` → `{ enabled: boolean }`
`POST /api/runtime/debug/enable` → `{ enabled: true }`
`POST /api/runtime/debug/disable` → `{ enabled: false }`

debug 模式下:每条 thread 每轮 thinkloop 落盘 `flows/<sid>/objects/<oid>/threads/<tid>/debug/loop_NNNN.{input,output,meta}.json`,供 S9 loop debug viewer 读取。

### 4. test

`tests/world-config.test.ts` + `tests/runtime-pause-debug.test.ts`

## 落地 commit

1. `feat(server/world-config): GET /api/world/config 读 .world.json`
2. `feat(server/runtime-control): global-pause status/enable/disable`
3. `feat(server/runtime-control): debug status/enable/disable + loop debug 落盘`
4. `feat(web): 解桩 G1/G3-G6 + I1`
5. `test`

## 受影响设计元素

- `## app` server module 列表加 world-config + runtime-control
- `## observable`?(debug 模式落盘 thinkloop input/output 算 observable 数据;但 observable 是旁路、不改 agent 行为 — 符合)

## 风险

- global-pause 与 per-session pause(S4)并存 — 设计上 global = any session 都不调度,per-session = 单 session 不调度。worker 入口检查顺序:global → per-session → enqueue。

## 待裁决点

1. **debug 模式落盘格式?** 推荐 `loop_NNNN.{input,output,meta}.json` 三 JSON(ooc-6 web 假定这一格式)
2. **debug=on 默认开还是关?** 推荐**默认 off**(避免落盘膨胀),用户经控制面 enable

## review/裁决/验收 见总目录 workflow
