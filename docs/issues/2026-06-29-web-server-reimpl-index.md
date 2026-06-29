---
title: web server 对接重新实现总目录 — 把 44 个 TODO 桩点对照最新 OOC 设计逐个 review
status: draft
date: 2026-06-29
follows: 2026-06-29-web-ooc6-restoration-mismatch.md
---

# web server 对接重新实现总目录

## 背景

2026-06-29 commit `cf2448d0` 落地 Path D 桩化:web 端 19 个文件、44 个桩点全部 TODO_async / TODO,UI 100% 保留。本 issue 是「然后再重新实现」阶段的**总目录**——把所有桩点对照**最新 OOC 系统设计**(对象树 `knowledge/index.md` §A-E + 各 self.md)分组,产出一组子 issue 供逐个 review。

**目标**:重新实现不是简单 unstub,而是按当前设计权威**重新设计 endpoint 契约**——某些桩点要的 endpoint 已退役、某些需要重新对齐 visible/server 等新模块。

## 桩点全清单(44 项,按 domain 分组)

来源:`grep TODO_async\\|TODO< packages/@ooc/web/src` + 间接经 requestJson 桩化的 4 个 .tsx。

### A · stones 桩点(5)— stones/query.ts + StoneFallback

| # | 函数 | 旧 endpoint(ooc-6) | 设计冲突? |
|---|---|---|---|
| A1 | `fetchStones()` | `GET /api/stones` | ✅ 兼容 — 仍是 list stone objects |
| A2 | `createStone(input)` | `POST /api/stones` | ✅ 兼容(走 versioning 进 main 经 A1 file-edit 原语等同) |
| A3 | `createKnowledgeDirectory({ objectId, path })` | `POST /api/pools/<id>/knowledge/directories` | ✅ knowledge 已迁 pool 层(对齐) |
| A4 | `createKnowledgeFile({ objectId, path, content })` | `POST /api/pools/<id>/knowledge/files` | ✅ 同上 |
| A5 | `updateKnowledgeFile({ objectId, path, content })` | `PUT /api/pools/<id>/knowledge/files` | ✅ 同上 |
| A6 (StoneFallback) | `GET /api/stones` list | 同 A1 | 复用 |
| A7 (StoneFallback) | `GET /api/stones/<id>/self` 文本 | 旧 self/readable endpoint | ⚠️ **退役**(`PUT /stones/:id/file?path=self.md` 单一原语;读 self 应走 file 通路或专用 read 端点) |

### B · flows + sessions 桩点(5)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| B1 | `fetchFlows()` | `GET /api/flows` | ✅ 兼容 — list sessions |
| B2 | `pauseFlowSession(sid)` | `POST /api/flows/<sid>/pause` | ⚠️ 当前生产 server **未实现** pause |
| B3 | `resumeFlowSession(sid)` | `POST /api/flows/<sid>/resume` | ⚠️ 同上 |
| B4 | `createSessionWithObject(input)` | `POST /api/sessions` | ⚠️ 复杂 — 涉及 user object + talk_window + initialMessage 派送 |
| B5 | `addUserTalkWindow(sid, input)` | `POST /api/flows/<sid>/talk-windows` | ⚠️ 同 B4 — user.root.talk_window 模型 |

### C · chat 桩点(6)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| C1 | `fetchThread(sid, oid, tid)` | `GET /api/flows/<sid>/<oid>/threads/<tid>` | ⚠️ 当前 server 仅 `GET /api/runtime/threads/<sid>` list, 缺 单 thread 详情 |
| C2 | `continueThread(sid, text, target)` | `POST /api/flows/<sid>/continue` | ⚠️ 涉及 user.root.talk_window 模型 |
| C3 | `fetchJob(jobId)` | `GET /api/runtime/jobs/<id>` | ⚠️ **job-manager 当前未实现** |
| C4 | `fetchSessionThreads(sid)` | `GET /api/flows/<sid>/threads` | ⚠️ 同 C1 — 应实现 |
| C5 | `decideChatPermission(args)` | `POST /api/runtime/flows/<...>/permission` | ⚠️ **permission_ask 当前未实现**;新设计无此机制 |
| C6 | `fetchSessionThreadsFull(sid)` | 同 C4 扩展 shape | 同 C4 |

### D · files + tree 桩点(3)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| D1 | `fetchTree(scope, path?)` | `GET /api/tree?scope=&path=` | ⚠️ 当前 server 未实现 tree;设计权威说应走 `/api/file/read`(LLM 视角)+ stone/pool/flow 各自列表 |
| D2 | `fetchFile(path)` | `GET /api/tree/file?path=` | ⚠️ 同 D1 |
| D3 | `fetchAnyFile(path, maxBytes?)` | `GET /api/file/read?path=&maxBytes=` | ⚠️ 设计权威说应有,但当前 server 未实现 |

### E · objects 桩点(2)— displayName + peer readable

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| E1 | `fetchSelfFirstLine(objectId)` 读 self.md 派生 displayName | `GET /api/stones/<id>/self` 文本 | ⚠️ 同 A7 — 旧专用 self read 端点退役;应走 file-edit 原语的对称 read(`GET /stones/:id/file?path=self.md`) 或新 typed endpoint |
| E2 | `usePeerReadable(objectId)` 读 readable.md | `GET /api/stones/<id>/readable` 文本 | ⚠️ 同 E1 — readable.md 通过 file 通路读 |

### F · clients(ObjectClientRenderer 系)桩点(3 个直接 + 2 个间接)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| F1 | `resolveClientSource(target)` (ObjectClientRenderer) | `GET /api/objects/:scope/:objectId/client-source-url` | ✅ 设计权威说应有(`app/self.md` client-source-url 章节) |
| F2 | `callMethodFor(target)` (ObjectClientRenderer) | stone: `POST /api/stones/<id>/call_method` / flow: `POST /api/flows/<sid>/<oid>/call_method` | ⚠️ **stone /call_method 已移除**(app/self.md 说 stone client 只读);callMethod 仅 flow scope |
| F3 | `fetchClientSource(target)` (ClientWithSourceToggle) | 同 F1 + fetchAnyFile 读源 tsx | 同 F1 |
| F4 (间接) | `resolveWindowDiff` 读 `<scope>/<objectId>?file=diff` | `GET /api/objects/stone/<id>/client-source-url?file=diff` | ✅ 设计权威说支持 `?file=diff` 查询 |
| F5 (间接) | `resolveWindowVisible` | `GET /api/objects/stone/<id>/client-source-url` | 同 F1 |

### G · MainLogo / world-config / pause / debug 桩点(6)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| G1 | world-config | `GET /api/world/config` | ⚠️ 当前未实现 |
| G2 | health probe | `GET /api/health` | ✅ 已实现 |
| G3 | `runtimeGlobalPauseStatus/Enable/Disable` | `GET/POST /api/runtime/global-pause/*` | ⚠️ 当前未实现 |
| G4-G6 | `runtimeDebugStatus/Enable/Disable` | `GET/POST /api/runtime/debug/*` | ⚠️ 当前未实现 |

### H · LoopTimeline / LoopDiffView 桩点(间接经 requestJson)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| H1 | `decideChatPermission` (LoopTimeline) | 同 C5 permission_ask | 同 C5 退役? |
| H2 | `runtimeListLoops` | `GET /api/runtime/.../debug/loops` | ⚠️ loop debug 文件落盘需 debug=on(G3-G6 联动) |
| H3 | `runtimeGetLoopDebug` | `GET /api/runtime/.../debug/loops/<n>` | 同 H2 |
| H4 | `endpoints.thread` 在 LoopTimeline 用 | 同 C1 | 同 C1 |
| H5 | `runtimeDebugEnable` 在 LoopTimeline 用 | 同 G6 | 同 G6 |

### I · FeishuDocWindowDetail(1)

| # | 函数 | 旧 endpoint | 设计冲突? |
|---|---|---|---|
| I1 | world-config 读 feishuPrefix | `GET /api/world/config` | 同 G1 |

### 桩点 → 设计冲突摘要

- **完全兼容**(5 项):A1/A2/A3/A4/A5 — stones list/create + pool knowledge
- **设计已退役需重设计**(8 项):
  - A7/E1/E2(读 self/readable 旧 endpoint;应走 file 通路)
  - F2(stone /call_method 已移除;callMethod 仅 flow)
  - C5/H1(permission_ask 机制未在新设计权威中,unclear 命运)
- **当前 server 未实现需新建**(31 项):pause/resume/jobs/world-config/global-pause/debug/loop-debug/tree/file/sessions 多面接口、user.root.talk_window 模型完整实现等

## 子 issue 矩阵

按设计元素分组,每条 issue 一组桩点 + 一段设计权威 + 提案 endpoint 重设计:

| Sub-Issue | 范围 | 桩点数 | 设计权威锚 | 优先级 |
|---|---|---:|---|---|
| **S1** · 通用 file-edit + file-read 原语(A1 通路 + read 对称) | A7, E1, E2, F1, F3, F4, F5, D1, D2, D3 | 10 | app/self.md L16 / index.md §B ## visible | **P0**(基础) |
| **S2** · visible/server callMethod(A2 通路 + 仅 flow scope) | F2 | 1 | visible/self.md ## 核心设计 | **P0**(基础) |
| **S3** · stones / pools 基础(list/create + sediment knowledge) | A1, A2, A3, A4, A5, A6 | 6 | index.md §B ## persistable + ## reflectable | P1 |
| **S4** · flows 基础(list + paused/resumed semantics) | B1, B2, B3 | 3 | app/self.md ## runtime job 编排 | P1 |
| **S5** · sessions + user.root.talk_window 模型(seed + addTalk) | B4, B5, C2 | 3 | collaborable/self.md / builtins/user | **P2**(复杂 — 涉及 user object 模型) |
| **S6** · thread 详情 + thread list(per session) | C1, C4, C6 | 3 | index.md §E ## thread | P1 |
| **S7** · runtime job-manager + jobs endpoint | C3 | 1 | app/self.md ## runtime job 语义 | P2(复杂 — 需建 job-manager) |
| **S8** · world-config + runtime global-pause/debug | G1, G3, G4, G5, G6, I1 | 6 | app/self.md ## runtime debug / pause-resume | P2 |
| **S9** · loop debug(debug=on 后落盘 loop_NNNN JSON + read) | H2, H3, H5 | 3 | app/self.md ## loop-debug | P3(可选) |
| **S10** · permission_ask: 重新评估 / 退役 / 替换 | C5, H1 | 2 | **设计权威未提** — 需 supervisor 裁决 | **P0**(裁决先于实现) |
| **S11** · health(G2)已实现 | G2 | 0 | F1 已落地 | ✅ done |

合计 11 个子 issue,涵盖 38 个桩点(其余 6 个间接桩点经 S1/S2 连带恢复)。

## 推进顺序(依赖图)

```
S10 permission 裁决(P0,设计先行)
  ↓
S1 file-edit/read 原语(P0)        S2 visible/server callMethod(P0)
  ↓                                  ↓
S3 stones+pools(P1)               S6 thread 详情/list(P1)
  ↓                                  ↓
S4 flows(P1)                       S5 sessions+talk_window(P2)
  ↓
S7 job-manager(P2)                 S8 world-config + pause/debug(P2)
                                     ↓
                                  S9 loop debug(P3)
```

## 各子 issue 应做什么(review fan-out 要点)

每个子 issue 单独创建文档,review 时重点 fan-out:

1. **对照设计权威是否准确**(找 supervisor self.md / index.md / 维度 self.md 锚点)
2. **endpoint 契约是否合理**(URL / method / body / response 是否对齐 OOC 协议)
3. **与已有 server module 是否冲突**(F1 已实装的 `/api/runtime/threads/*`、`/api/runtime/observation`、`/api/runtime/pr-issues/:id/resolve` 不应冲突)
4. **桩点 TODO 描述是否需更新**(若设计权威说该桩点的契约不同,先改 TODO 描述、再 unstub)
5. **测试覆盖 plan**(每个 endpoint 应配 tests/<x>.test.ts 加进 storybook 覆盖矩阵 dashboard.md)

## 受影响设计元素

本总目录 issue **不动设计契约**——它是规划文件。每个子 issue 单独提案具体设计实现路径。

但需注意:**S10(permission_ask)裁决**可能触动核心设计——是否在 OOC 设计权威中加入 HITL permission 机制,或者明确退役这条 ooc-6 时代的 UI 通路。

## 风险与权衡

### 真实风险

1. **设计权威与实现严重脱节**:web 假定了一套基本完整的 endpoint,但 server 仅实现 6 个 endpoint。S1-S10 全做完估计 5-10 个工作日。
2. **OOC 设计本身可能滞后**:app/self.md 描述的 7 个 module 模型(stones/pools/ui/flows/world-config/runtime/health)是设计权威,但近期 issue(F1/lifecycle/issue O/P)演化后这套架构是否仍准确,需要 review 时验证。
3. **permission_ask(S10) 命运未定**:ooc-6 web 大量代码假定该机制存在,但新设计权威 reflectable section 没提。需先裁决再说有无实现意义。

### 权衡选择

- **逐个推进 vs 一次性大动**:逐个推进每个子 issue 独立 verify,断点容易;一次性大动易死在一半。**选逐个**(本 issue 即此选择的体现)。
- **是否先 review 后实现**:S1-S9 涉及 server module 新建 / 退役 endpoint。**强烈推荐** 各子 issue draft → review → decided → landed 走完整 workflow,不擅自实现。
- **S10 优先级**:permission_ask 在 ooc-6 是关键 HITL 概念,如设计权威退役它,F2 callMethod 等其他模块也受影响(部分 method 调用是经过 permission_ask gating 的)。故 S10 **必须先裁决**。

## 待裁决点(本总目录)

1. **是否同意 11 个子 issue 拆分?**(推荐:是)
2. **是否同意推进顺序 S10 → S1/S2 → S3/S4/S6 → S5/S7/S8 → S9?**(推荐:是)
3. **每个子 issue 是否走完整 issue workflow(draft → review → decided → landed)?**(推荐:是 — 涉及 server 端契约设计)
4. **是否每个子 issue 单独建 worktree?**(推荐:**S2/S5/S7 建 worktree**(大改动),其余可在 main 直推)
5. **本总目录何时标 landed?**(推荐:S1+S10 落地后即标 landed,后续 S3-S9 独立 follow-up)

## review 记录

(等用户回来 fan-out 确认子 issue 矩阵 + 推进顺序)

## 裁决

(等用户裁决)

## 落地验收

(landed = 11 个子 issue 至少 P0 全部 draft 后)
