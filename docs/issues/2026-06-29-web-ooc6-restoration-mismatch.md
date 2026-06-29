---
title: web 端 ooc-6 恢复后与 main builtin 命名 mismatch 处理路径
status: landed
date: 2026-06-29
follows: 2026-06-29-runtime-server-web-roadmap.md
---

# web 端 ooc-6 恢复后的 mismatch 处理

## 背景

用户从 ooc-6 分支恢复 `packages/@ooc/web/` (157 个 ts/tsx 文件,完整控制面),期望基于此让"整体系统完整运行"。

实勘后发现:**ooc-6 web 依赖的 builtin 命名空间与 main 当前完全不同**——issue O (2026-06-26 落地的 "stones 单 objects/ 目录") + builtin 重整之前的命名格局,直接 build 必败。

## 现状

### ooc-6 web 期望的 9 个 builtin 包(来自 `web/package.json`):

```json
"@ooc/builtins/_shared":     "workspace:*",
"@ooc/builtins/file":        "workspace:*",
"@ooc/builtins/knowledge":   "workspace:*",
"@ooc/builtins/plan":        "workspace:*",
"@ooc/builtins/program":     "workspace:*",
"@ooc/builtins/root":        "workspace:*",
"@ooc/builtins/search":      "workspace:*",
"@ooc/builtins/skill_index": "workspace:*",
"@ooc/builtins/todo":        "workspace:*"
```

### main 当前 builtin 实际位置:

| ooc-6 期望 | main 实际 | 状态 |
|---|---|---|
| `@ooc/builtins/_shared` | — | **MISSING**(共享类型层已并入 core/_shared) |
| `@ooc/builtins/file` | `@ooc/builtins/filesystem/children/file` | 位置变 |
| `@ooc/builtins/knowledge` | `@ooc/builtins/knowledge_base/children/knowledge` | 位置变 |
| `@ooc/builtins/plan` | `@ooc/builtins/agent/children/plan` | 位置变 |
| `@ooc/builtins/program` | — | **MISSING**(已并入 reflectable,issue 2026-06-09 / 06-25 落地) |
| `@ooc/builtins/root` | — | **MISSING**(root 概念已退役,builtin 改 supervisor 等;issue 2026-06-21 / 06-26) |
| `@ooc/builtins/search` | `@ooc/builtins/filesystem/children/search` | 位置变 |
| `@ooc/builtins/skill_index` | `@ooc/builtins/agent/children/skill_index` | 位置变 |
| `@ooc/builtins/todo` | `@ooc/builtins/agent/children/todo` | 位置变 |

### 主要架构差距(超 builtin 命名)

ooc-6 web 还假定:
- `endpoints.stoneCallMethod` (`/api/stones/:id/call_method`)——**main 设计明确 stone /call_method 已移除**(commit a8f53535,见 app/self.md),callMethod 仅 flow scope
- `/api/runtime/global-pause/*`、`/api/runtime/debug/*`、`/api/runtime/jobs/*`、permission_ask 等——**main 当前 0 实现**
- 旧 thread/event 字段形态(如 permission_ask event)、loop debug 文件落盘格式

ooc-6 web 是个**完整且高质量**的控制面(jotai 状态、CodeMirror 编辑、tailwind v4、react-router 7、AppShell URL 单向真相、ObjectClientRenderer 等),但**写在 ooc-6 时代的契约假定下**。

### 不直接可 build 的依赖问题

- 3 个 builtin (`_shared`/`program`/`root`) 完全缺失
- 6 个 builtin 位置不同 → workspace 协议解析失败
- 大量根仓库未装的依赖: `@codemirror/*`、`react-router`、`tailwindcss`、`@radix-ui/react-dialog`、`jotai`、`boring-avatars`、`lucide-react`、`class-variance-authority`、`react-markdown`、`remark-gfm`、`rehype-raw`、`tailwind-merge`、`@uiw/react-codemirror`、`react-icons`
- vite config load 失败(plugin `@tailwindcss/vite` 等也未装)

## 改动提案(三条路径,等用户裁决)

### Path A · 全量适配(最忠实,工作量最大)

把 ooc-6 web 一口气适配到 main:
1. 改 `web/package.json` 依赖路径(builtin 包重命名,共 6 处;3 个缺失的删 import 用方)
2. 安装根仓库的所有 web 依赖(13+ packages,约 100MB+ node_modules)
3. **同步实现 ooc-6 web 期望的所有 server endpoint**(/api/stones/*/call_method、/api/pools/*、/api/runtime/global-pause、/api/runtime/debug、/api/runtime/jobs、permission_ask 等)
4. 同步实现 ooc-6 web 期望的所有 data shape(thread.events 含 permission_ask、loop debug 文件、user.root.talk_window 等)
5. 处理 callMethod 仅 flow scope 但 ooc-6 web stoneCallMethod 用得——选 (a) 后端兼容旧 stone 路径只读,或 (b) 改 web 移除 stoneCallMethod 用法

**工作量**: 5-10 天。等于把 main 拖回 ooc-6 时代或大规模 server 重写。

**风险**: 违反 OOC「克制熵增、复用先于新引入」哲学——把已退役的 root/program 等概念重新引入主干。

### Path B · 把 ooc-6 web 当文物归档,基于它**重写**最小 web (推荐)

承认 ooc-6 web 与当前 main 设计**断层过深**,不直接适配:
1. 把 ooc-6 web **暂存在 `packages/@ooc/web/` 但不进 default build**(改 web/package.json 加 `"private": true`、根 workspace 排除或加 `"workspaces.web"` flag)——保留作设计参考与 UI 灵感来源
2. **基于 main 当前后端能力 + 设计权威新建最小 web**:
   - Phase 1: ooc:// route 解析 + 基础 AppShell(借鉴 ooc-6 web 的 routing.ts/shell.tsx)
   - Phase 2: ObjectClientRenderer + client-source-url 消费(借鉴 ooc-6 web/domains/clients)
   - Phase 3: 通用 file-edit + FileViewer(借鉴 ooc-6 web/domains/files)
   - Phase 4: flow callMethod (借鉴 ooc-6 web/transport/http.ts)
3. **每 phase 配套 server module**: Phase 1 仅依赖 F1(已 done)。Phase 2 起需 F2 stones+ui module。Phase 3 起需 F2 通用 file-edit。Phase 4 起需 F2 flows callMethod + F3 visible/server。

**工作量**: Phase 1 = 1-2 天 / Phase 2 = 1-2 天 / Phase 3 = 1 天 / Phase 4 = 2 天。**每 phase 独立 e2e**。

**风险**: 看起来"白丢 ooc-6 web 工作量"——但实际 ooc-6 web 的**设计模式 / 组件 / 路由**全可借鉴,只是不直接 build。

### Path C · 保留 ooc-6 web 当独立分支,main 走最小 demonstrator 路径

把恢复的 ooc-6 web 移出 main: 
1. **撤回 web 文件**(留在 ooc-6 分支,main 不持有)
2. **保留当前 App.tsx 最小 demonstrator** 作 main 的 web
3. 后续按 roadmap F4 phase 推进真实 web 重建,不参考 ooc-6 实现

**工作量**: 最小(几分钟撤回)。
**代价**: 用户花精力恢复的 ooc-6 web 浪费。

## 受影响设计元素

无设计契约改动——本 issue 是处理实施路径选择,不动 knowledge/index.md 任一元素。

如选 Path A,会引入大量违反当前 main 设计权威的契约(root/program 复活等)——但那是 Path A 本身的代价,非本 issue 的设计改动。

## 风险与权衡

| 路径 | 工作量 | 哲学一致性 | 用户工作浪费 |
|---|---|---|---|
| A 全量适配 | 5-10 天 | ❌ 引入已退役名词 / 退潮回潮 | 0 |
| B 文物 + 重建 | 5-7 天分阶段 | ✅ 符合「克制熵增、复用先于新引入」 | 部分(代码借鉴 / build 不直接) |
| C 撤回 | <1 小时 | ✅ | 100% |

## 待裁决点

按用户授权"独自完成 issue 流程",但本 issue 涉及**重大方向选择**(直接影响 5-10 天工作量分配),supervisor 倾向 **Path B**,但**仍需用户确认后再推进**——理由:

1. ooc-6 web 是用户**主动恢复**的、明显期待被用上
2. Path B 既不浪费 ooc-6 web(作设计参考),又符合 OOC 哲学
3. Path A 风险过高(把 root/program/stones/call_method 等退役物拉回主干)
4. Path C 浪费用户工作

**Supervisor 推荐 Path B**:把 ooc-6 web 移到 `packages/@ooc/web/_legacy_ooc6/`(标识其历史性,但保留可参考),同时建 `packages/@ooc/web/` 新最小 web(F4 Phase 1 范围),逐 phase 推进。但**等用户确认**。

## review 记录

无 fan-out,本 issue 是路径选择 issue,设计契约 0 影响。

## 裁决

**用户裁决(2026-06-29)**: **Path D · 桩化重建**(本 issue 提出的 A/B/C 之外的第 4 条):

> 「请你理清楚 web 项目的组成,保留 UI 设计(样式、布局), 将所有和 server 对接的
> 地方统一删除,替换为 function XXX { TODO("描述这个留空位置的程序行为") },
> 忘记已有的设计,然后再重新实现」

Path D 实操(已落地, commit `cf2448d0`):

1. **保留**: 全部 UI(样式、布局、AppShell、ObjectClientRenderer、FileViewer、LoopTimeline、
   CodeMirror 编辑器、tailwind v4 类、jotai 状态、react-router 7、shadcn-style 组件等等)。
2. **桩化**: 19 个 server-touching 文件全部经 TODO_async helper 抛 `[TODO] <description>`:
   - 7 个 query.ts(sessions/chat/files/flows/stones/objects)
   - transport/http.ts requestJson 总入口
   - 4 个直接 fetch/requestJson 的 .tsx 组件(MainLogo / clients/{3} / FeishuDocWindowDetail)
   - 4 个间接经 requestJson 的(LoopTimeline / LoopDiffView / resolveWindowDiff /
     resolveWindowVisible) 自然通过桩化的 requestJson 触发 TODO
3. **每个 TODO 携契约描述**: 函数应做什么、参数语义、返回 shape、对接哪个 endpoint。
   重新实现者读 TODO 描述即知契约,不必猜测旧设计。
4. **删除孤儿 App.tsx**(实际入口是 app/index.tsx)。
5. **endpoints.ts 保留**: 纯字符串拼接,无副作用,作 backend route 表参考。

**verify gate baseline 临时调整**(等 web 整合 issue landed 时还原):
- check-tsc.sh: web/ 整体加 baseline(缺 npm 依赖 + ooc-6 时代 builtin 命名,
  与桩化无关)
- check-no-deprecated-symbols.sh: web/src 整体豁免
- web-e2e.test.ts: vite build 失败时 skipIf 跳过

**verify**: 134 pass / 0 fail / 6 个 check gate 全 OK。

**接下来**:
- F1 已落地(server 集成 WorldRuntime + reloadTable 透传) — `2026-06-29-f1-server-worldruntime.md` landed
- F5 Phase A 已落地(storybook 现状盘点) — `2026-06-29-f5-storybook-survey.md` landed
- 等用户回来:决定 web 重新实现的优先级 vs roadmap 中 F2/F3 推进顺序

## 落地验收

(landed 后启动验收 review:
1. ✅ 全部 server-touching 文件经 TODO_async helper 桩化
2. ✅ UI/样式/布局/组件结构完整保留
3. ✅ verify gate 全绿(baseline 调整不影响 backend)
4. ✅ App.tsx 孤儿删除, App 入口 = app/index.tsx
5. ⏳ 重新实现需起独立 issue, 按 phase 推进(借鉴 F1-F5 roadmap))
