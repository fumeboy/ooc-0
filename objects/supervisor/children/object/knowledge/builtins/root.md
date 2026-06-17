---
title: root — 一切 Object 的继承链终点基类（最小 Object）
description: builtin root 家族的单一权威——以 self × 各维度透视：空 data 的 self、readable 投影成空 root 信封窗、executable 仅一个 misc method example、persistable=全 Object 缺省持久化与 CreateObject 默认归属逻辑的归属基类、无 visible 详情、单例基类无 construct；并随基类发布全 Object 共享的 root 级协议 knowledge
activates_on:
  "object::root": "show_description"
---

# root

> root 是 OOC 里**一切 Object 继承链的终点基类**——任何 class 的 parentClass 链最终回退到它。对象模型本身（class/object、单例·非单例、construct、IS-A 继承、children）见 class/knowledge/object-model.md，本文不复述；本文只从 **self × 各维度**透视这个最小 self 的核心设计。

## 一、self（身份 / data）

- **id `_builtin/root`，`ooc.kind=class`**。
- **继承链终点**：`parentClass=null`（显式不继承）。所有其它 class 的链最终止于它，自身未定义的方法/知识沿链回退到此为底。
- **角色**：最小 Object 基类

持有的数据字段:
```json
{
  "id": "foo", // or "foo/childBar"
  "created"
}
```

## 二、self × 各维度

### self × readable —— 投影成 context window

投影为 Object Data JSON 文本

### self × executable —— object method

不具有 object method

### self × persistable —— 序列化（系统缺省的**归属基类**）

持久化文件路径: `objects/<object_path>/data.json`
- `object_path` 可能直接是 object id，也可能由 id 映射为含 `/children/` 段的多级路径（id `parent/child` → path `parent/children/child`）

### self × visible —— UI

展示为 Object Data JSON 文本

### self × construct —— 实例化
