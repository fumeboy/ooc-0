---
title: root — 一切 Object 的继承链终点基类（最小 Object）
description: builtin root 家族的单一权威定义——kind=class / parentClass=null（继承链终点）/ 单例基类无 construct；空 data；唯一 misc method example；投影成空 root 窗作 thread 顶层信封锚点；携带全 Object 共享的 root 级协议 knowledge
activates_on:
  "object::root": "show_description"
---

# root

> root 是 OOC 里**一切 Object 继承链的终点基类**——任何 class 的 parentClass 链最终回退到它。对象模型本身（class/object、单例·非单例、construct、IS-A 继承、children）见 class/knowledge/object-model.md，本文不复述。

## 一、是什么（核心职责）

- **id `_builtin/root`，`ooc.kind=class`**。
- **继承链终点**：`parentClass=null`（显式不继承）。所有其它 class 的继承链最终止于它，自身未定义的方法/知识沿链回退到此为底。
- **单例基类，无 construct**：root 不被实例化为具体业务对象，而是作为每个 thread 隐含的顶层投影锚点与方法/知识的回退终点。
- **角色**：最小 Object 基类——既非 agent（agency 在 `_builtin/agent`），也非 tool-object（文件/进程工具在 filesystem/interpreter/terminal）。它只承载所有 Object 继承自它的最低公共契约：readable 投影 + 沿链回退的方法表 + root 级协议 knowledge。

一句话职责：**做继承链终点的最小 Object 基类，承载 thread 顶层窗信封与全 Object 共享的 root 级协议知识。**

## 二、data 结构

`Data {}`——**空 data**，root 自身无业务字段。每个 thread 隐含一个 root 投影窗（id 恒为 `"root"`），其标题即 thread 标题，信封由 runtime 管理。

## 三、能力

### object method

仅一个边缘 misc method：

- **`example`** —— 教学样板：委托 example class 的 construct 造一个 example 子对象、返回提示文本（runtime 不可用时 fail-soft）。非 `for_ui_access`、非 public。

### window method

**无自定义 window method**——root 窗无投影态。

### 投影

恒投影成 `class:"root"`、`content:[]`（空 children）：root 窗不显式渲染内容，外层信封 + 调度器 commands 块已足够表达 root 上可调命令。window 项声明该窗展示 root 类的 `object_methods:["example"]`。

> root 窗是 thread 顶层窗：`parentObjectId` 缺省或 `="root"` 的窗都挂在它名下；protocol knowledge / skill_index / activator 窗均以 root 窗为 parent 悬挂。

### visible

无 UI 详情面（`WindowDetail` 返回 null，与空投影一致）。

### persistable

无自定义，走系统默认。

### construct

**单例基类，无 construct**——root 不按需造实例；其唯一「实例」是每个 thread 隐含的 root 顶层窗，信封由 runtime 管理。

### root 级协议 knowledge（随框架包发布，全 Object 共享）

root 是基类，故其 `knowledge/` 各篇经各自 `activates_on` 注入时是**全 Object 的共享协议切片**：

- **`pr-review.md`** —— 看到 pr_window 时如何评审 feat-branch PR（approve/reject/request_changes）；`activates_on: object::pr`。评审机制权威归 reflectable。
- **`search.md`** —— search_window 上 open_match / set_results_window / close 的用法；`activates_on: object::search`。窗本身是 `_builtin/filesystem/search`。
- **`self-evolution.md`** —— 自我演化协议：改 self.md/readable/executable/visible、记忆走 pool write-through、身份/身体改动走 super flow feat 分支 PR；`activates_on: object::root` + `method::filesystem::write_file`。机制权威归 reflectable / persistable（stone-feat-branch + evolve_self）。

## 四、children

root **无 children**——它是 parent of nothing，仅作继承终点。
