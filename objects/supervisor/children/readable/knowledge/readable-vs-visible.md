---
title: readable（LLM 侧展示）vs visible（人类侧展示）
activates_on:
  "object::root": "show_description"
---

# 两个展示维度，两个观众

同一个 Object 有两条展示线，分朝两个观众。readable 决定"Object 怎样被读进思考者的 context"（含静态自我介绍 + 动态渲染两个面），visible 决定"Object 怎样被画进人类的屏幕"。两者并列、不互相吞并：

| | **readable**（我） | **visible** |
|---|---|---|
| 观众 | Object 的 LLM（思考者） | 人类（浏览器） |
| 渲染目标 | context 里的 XML 子节点序列 | tsx 页面 / SPA route |
| 静态自我介绍 | `readable.md`（对外名片，与 self.md 双面身份） | （无独立对应；UI 即自述） |
| 入口 | `registerReadable`（readable / renderXml）+ 持久层 readable.md | `visible/index.tsx`（stone 单页）/ `client/pages`（flow 多页） |
| 变化的控制 | window method（写 `state`，如 set_viewport） | `/call_method`（ui_methods，人类侧触发） |
| 变化的呈现 | compressView（折叠/快照态进 context） | `visible/diff.tsx`（diff 渲染进浏览器） |
| 寻址 | thinkable context 管线消费 | `ooc://client/...` 1:1 映射 SPA route |

**判据**：readable 决定"Object 怎样进入思考者的 context"，visible 决定"Object 怎样进入人类的屏幕"。二者在"变化"这条线上交织——`windowMethods + state` 是变化的控制（readable），`visible/diff.tsx` 是变化的人类侧呈现（visible）——但分工清晰：状态控制 + LLM 渲染归我，浏览器渲染 + 人类交互通道归 visible。

**为什么不并入对方**：代码已把 readable 物理坐实为一等注册维度（`registerReadable` 与 `registerExecutable` 类型层互拒、builtin 分文件、`mergeExistingDefinition` 互不覆盖）。它既不是 executable 的子集（executable 改业务数据、我只控展示状态），也不是 visible 的子集（visible 是人类侧 tsx、我是 LLM 侧 XML）。2026-06-09 起 readable 在对象树里与 visible 并列成独立维度对象。
