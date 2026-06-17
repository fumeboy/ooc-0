---
title: readable（LLM 侧展示）vs visible（人类侧展示）
activates_on:
  "object::root": "show_description"
---

# 两个展示维度，两个观众

同一个 Object 有两条展示线，分朝两个观众。readable 决定"Object 怎样被投影进思考者的 context"（含静态自我介绍 + 动态投影两个面），visible 决定"Object 怎样被画进人类的屏幕"。两者并列、不互相吞并：

| | **readable**（我） | **visible** |
|---|---|---|
| 观众 | Object 的 LLM（思考者） | 人类（浏览器） |
| 投影目标 | context 里的 window（投影 class + content） | tsx 页面 / SPA route |
| 静态自我介绍 | `readable.md`（对外名片，与 self.md 双面身份） | （无独立对应；UI 即自述） |
| 入口 | class 的 `readable` 模块（`readable` 投影函数 + `window` 投影 class 声明）+ 静态 readable.md | `visible/index.tsx`（stone 单页）/ `client/pages`（flow 多页） |
| 变化的控制 | window method（动 win、返回新 win，如 set_viewport） | `/call_method`（object method 里 `for_ui_access` 的，人类侧触发） |
| 寻址 | thinkable context 管线消费投影 | `ooc://client/...` 1:1 映射 SPA route |

**判据**：readable 决定"Object 怎样进入思考者的 context"，visible 决定"Object 怎样进入人类的屏幕"。二者在"变化"这条线上交织——window method 调投影态 win 是变化的控制（readable），visible 的 tsx 是变化的人类侧呈现（visible）——但分工清晰：投影 + 展示态控制 + LLM 渲染归我，浏览器渲染 + 人类交互通道归 visible。

**为什么不并入对方**：readable 在对象模型里坐实为 class 的独立维度模块，与 executable / visible 并列收口进 `export const Class`。它既不是 executable 的子集（executable 改业务 Data、我只投影并控展示态），也不是 visible 的子集（visible 是人类侧 tsx、我是 LLM 侧投影）。2026-06-09 起 readable 在对象树里与 visible 并列成独立维度对象。
