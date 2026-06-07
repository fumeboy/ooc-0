---
title: 可观测三件套 —— 日志去重限流 + activity 快照 + 超时快照
description: 把「盲等到超时再 tail」变成「随时一读即诊断」的系统级运行时观测
activates_on: {"window::root": "show_content"}
---

# 可观测三件套

**动机**：三维度 harness 跑某体验官超时时，服务端日志 370/370 行全是同一条 `[readThread] references missing object ... skipping`——无界重复把真信号淹没；超时只标 TIMEOUT 黑盒，只能事后 tail 才能诊断。典型 observability 反模式：同类警告无聚合/限流，长跑卡住无随时可读的系统快照。

## 1. 日志去重 + 限流（log-aggregator）

`packages/@ooc/core/observable/log-aggregator.ts:72-108` 提供**单一受控 console 收口**：

- **去重计数**：按 caller 给的稳定 `key` 累计同类事件次数（变量部分不进 key，否则失去去重意义）。
- **限流输出**：首 3 条直出（`EMIT_FIRST`）、之后每 100 条采样一次（`EMIT_EVERY`，带 `(×count)` 总数后缀）。370× 收口为 ~6 行 + 总数可见。
- **滚动 tally**：`logPatternSnapshot(topK)` 按次数降序返回 top 模式。

接口：`observeLog(level, key, message, now?)` / `observeWarn(key, message)` / `logPatternSnapshot()`。复位钩子 `__resetLogAggregator()`。
落地点：`packages/@ooc/core/persistable/thread-json.ts` 中 readThread 6 处刷屏警告路由经 `observeWarn`。

## 2. 系统活动快照（/api/runtime/activity）

`packages/@ooc/core/app/server/modules/runtime/service.ts:178-186` 的 `getActivity` 一次读出服务端此刻全貌：running/queued job + 每个 running 的 `ageMs` + `runningCount` + 主导日志模式（`logPatterns`）。端点 `packages/@ooc/core/app/server/modules/runtime/api.activity.ts`，response schema 显式校验，route-audit.e2e 验证真路由已注册。

## 3. harness 超时快照

`packages/@ooc/tests/harness/orchestrate.ts` 体验官超时时 `captureActivitySnapshot(port)`（curl --noproxy best-effort，失败返回 null 不阻断收尾），写 `<dim>.timeout-snapshot.json` + dashboard 备注列展示 running 数 + 主导日志模式。超时前 server 仍存活时抓快照写进报告。

## 边界

阈值（首 3 / 每 100）为经验常量，未做按 level / 场景可配——这是待办。三件套只产数据与诊断信号，不画 UI。
