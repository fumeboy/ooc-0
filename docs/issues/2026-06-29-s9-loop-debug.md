---
title: S9 · loop debug(debug=on 后落盘 + endpoint 暴露)
status: draft
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P3
depends: 2026-06-29-s8-world-config-pause-debug.md
---

# S9 · loop debug

## 背景

来自总目录 S9 项。桩点 **3 个**:H2(runtimeListLoops)+ H3(runtimeGetLoopDebug)+ H5(runtimeDebugEnable,与 S8 重叠)。

这是 LoopTimeline UI 的核心数据源——每条 thread 每轮 thinkloop 的 LLM input/output/meta 三 JSON,让 web 端"时光机"展示 thread 推理过程。

## 设计权威锚

- **`## observable`**(index.md §B):observable 三件套 — log-aggregator / `/api/runtime/activity` / harness snapshot;debug 落盘是 observable 范畴的一部分
- **铁律**:observable **不改变 agent 行为**——纯旁路记录

## 改动提案

### 前置依赖

依赖 **S8 已实现 debug enable/disable**。S9 内 debug=on 时:thinkloop 内每轮调 LLM 前后,把 input/output/meta 落盘到 `flows/<sid>/objects/<oid>/threads/<tid>/debug/loop_NNNN.{input,output,meta}.json`。

### endpoint 设计

`GET /api/runtime/flows/<sid>/<oid>/threads/<tid>/debug/loops`:
- 列该 thread 下所有 loop_NNNN(按 N 升序)
- response: `{ loops: Array<{ loopIndex: number; createdAt: number; meta: <small subset> }> }`
- **不**携带 input/output 全文(可能 huge),前端 lazy 展开时再走单条 endpoint

`GET /api/runtime/flows/<sid>/<oid>/threads/<tid>/debug/loops/<loopIndex>`:
- response: `{ input, output, meta }` 完整三元组

### 实现位置

- thinkloop.ts 内 think() 入口加落盘 hook(debug=on 时才执行)
- `app/server/modules/runtime-debug/`(或加进 S8 runtime-control)实现两 endpoint

### test

`tests/loop-debug-files.test.ts`:debug=on → 跑 thinkloop → 看 loop_0000.{input,output,meta}.json 出现;GET endpoint 返正确内容

## 落地 commit

1. `feat(server/thinkloop): debug=on 时落盘 loop_NNNN.{input,output,meta}.json`
2. `feat(server/runtime-debug): list loops + get loop endpoints`
3. `feat(web/sessions): 解桩 H2/H3/H5(LoopTimeline / LoopDiffView 自然接通)`
4. `test`

## 受影响设计元素

- `## observable`(index.md §B):debug 落盘是 observable 的具体落地形态之一,文档可补一段说明

## 风险

- 落盘膨胀:每条 thread 每轮 thinkloop = 3 个 JSON,长 session 可能产几百个文件。**缓解**:
  1. debug 默认 off(S8 裁决)
  2. 提供 cleanup mechanism(future issue 加 sweep)
  3. flows/ 是非 versioned,清理无成本

## 待裁决点

1. **input/output 序列化是否截断?** — LLM input/output 可能含大段 context,完整保留 vs 截断超过 N KB?推荐**完整保留**(debug 用)

## review/裁决/验收 见总目录 workflow
