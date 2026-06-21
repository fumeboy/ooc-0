---
title: window method 与投影态 win
activates_on:
  "object::root": "show_description"
---

# window method 与投影态 win

一个 Object 在 LLM context 里呈现为 context window：readable 把它的业务 **Data** 投影成展示内容。但「展示成什么程度/范围」是另一回事——这归 **window method**，它管的是**展示**不是业务数据。

## win：与 Data 分离的投影态

window 的展示态是 `win`，与业务 `Data` 物理分离：runtime 实例 `OocObjectInstance` 把 `data`（业务）与 `win`（投影态）显式分作两个字段（`packages/@ooc/core/runtime/ooc-class.ts:75`）。`win` 只放展示参数——viewport（file/knowledge 的行列视口）、transcript 区间（会话窗）等——**不放业务数据**（file path、knowledge body 这些归 Data）。win 随实例持久化，readable 渲染期连同 Data 一起读：`readable(ctx, self, win)`，用 Data 算内容、用 win 算展示范围。

## window method：只动 win、返回新 win

window method 与 object method 并列，但签名与归属不同（`WindowMethod`，`packages/@ooc/core/readable/contract.ts:51`）：

- 由 readable 维度声明在 `readable.window[].window_methods` 里（`contract.ts:74`），不在 executable 的 object method 表。
- exec 签名 `(ctx, self, before_win, args)`：`self` 是只读 Data（据业务数据算合法范围，如行数上限），`before_win` 是当前投影态，`args` 是调用参数。
- **返回新的 win**（不可变）：runtime 把返回值写回实例的 `win`，不原地 mutate。出错直接 **throw**（不是返回 `{ok,error}`）。
- 它**不碰 Data、不产副作用**——这是它与 object method（改 Data、可副作用）的根本分界。

典型 window method：

- file / knowledge `set_viewport`（调行列视口）。
- 会话窗（thread 投影成 thread/talk/reflect_request）`set_transcript_window`（调 transcript 渲染区间）。

viewport 类 window method 不再走集中执行体——各 class 的 readable 自装 set_viewport + 自带 viewport 纯 helper `mergeViewport` / `applyViewport`：读 `before_win.viewport`、校验合并、返回 `{ viewport: 合并后 }` 作为新 win。helper 原收在 `core/_shared/utils/viewport.ts` 共享，现已拆解进各 class 内部（file/knowledge/example 的 `readable/viewport.ts` 二维行列；thread/search/process 的 `transcript-viewport.ts` tail/range），各自闭环、容忍重复。

## 与 object method 的边界

同一个 class 上，同名方法不能既是 object method 又是 window method——LLM 经统一的 exec-by-name 入口 dispatch，重名会有优先级歧义。注册期 `assertNoMethodNameCollision` 直接 fail-loud（`packages/@ooc/core/runtime/object-registry.ts:53`）。
