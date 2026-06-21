---
title: 建立 index.md 设计总览 + 系统设计调整工作流
status: landed
date: 2026-06-21
---

# 建立 index.md 设计总览 + 系统设计调整工作流

> 本 issue 是 docs/issues 的首篇，记录工作流自身的建立，并 dogfood 这套流程。

## 背景 / 动机

OOC 多次大型重构后，设计/文档/代码易积累废弃信息（涨潮不退潮）。缺一个「一处看全 OOC 怎么设计」的总览，也缺一条强制 review + 一致性回流的设计变更流程。

## 改动提案

1. 新建 `knowledge/index.md`：面向设计的全量核心设计总览——顶层（OOC / 对象模型）、7 维度核心 + 非维度（observable/app）、builtins、维度×维度交叉、内置对象×维度交叉。各 self.md 仍是面向实施的单一权威，index 只综述核心契约 + 交叉、链回 self.md。
2. 新建 `knowledge/design-workflow.md`：issue → review fan-out（受影响元素各派 reviewer + 一个完整性批评官）→ 汇总裁决 + 一致性回流。
3. 新建 `docs/issues/`：issue 目录 + 模板。
4. 确立 index.md A–E 区每个 `##` 元素 = **设计元素注册表**，驱动 review fan-out。

## 受影响设计元素

本次是**新增总览**，不改任何维度核心契约，故不触动各设计元素的契约本身；index.md 各节均忠实综述对应 self.md，未引入 source 外断言。

## review 记录

完整性批评官（dogfood 步骤 2 的角色）审 index.md，结论「需小修后发布」，必修项已落地：

1. **[高] 会话窗投影口径统一** —— index 内 `## collaborable` / `## thread` / `## builtins` 对会话窗用了「两类(caller/callee)」与「三类(thread/talk/reflect_request)」两套措辞。已在 `## collaborable` 点破两轴正交：**window class 轴**（thread / talk / reflect_request）与**消息方向轴**（caller / callee），以 thinkable/readable/builtins 的三-window-class 为权威轴。
2. **[中] 补 observable 交叉** —— 已在 `## observable` 折入两条关键交叉：× thinkable（thinkloop 观测点 / pause 在 tool call 前介入）、× visible（observable 产 windowsSnapshot+ContextSnapshot、visible 渲 loop_timeline+window diff）。

## 裁决

- index.md / design-workflow.md / docs/issues 已落地，相对链接校验通过。
- **一致性回流**：
  - bootstrap 本身（新增总览）不改 self.md 契约。
  - 完整性批评官发现的 collaborable 会话窗命名漂移（见下「已解决」），用户拍板**直接订正**——已改 `collaborable/self.md` 核心 4（"自己作 caller 对 callee" 的窗由 *thread window* 改正为 *talk window*），并与 index `## collaborable` / `## thread` 的三-window-class 权威口径对齐。
- **index.md 格式订正**（用户 review）：区升 h1、设计元素降 h2（注册表 = A–E 区 `##` 元素，避免 `# 说明` 污染 h1 注册表）、删冗余分隔线；design-workflow.md / README / 本 issue 的 `#`→`##` 口径同步。

## 已解决（用户拍板直接订正，免独立 issue）

- **collaborable self.md 核心 4 会话窗命名漂移** —— 它原把「自己作 caller 对 callee」的窗也称 *thread window*，与权威口径（thinkable 核心 4 / readable / builtins：自己视角=thread 窗、与 peer/sub 会话=talk 窗）冲突。已直接订正 `collaborable/self.md` 核心 4 + index 对齐。涉及元素 `## collaborable` / `## thread` / `## collaborable × thinkable` 经核已自洽。
