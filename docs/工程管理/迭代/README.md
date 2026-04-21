# 迭代 — Feature 与 Bugfix 的生命周期管理

> 用 **all + 三状态目录 + 软链接** 的方式，让迭代项既有**完整档案**又有**状态视图**。

## 目录结构

```
迭代/
├── README.md          ← 本文件
├── all/               ← 完整迭代文档（唯一真相源）
│   ├── 20260421_feature_线程树集成.md
│   ├── 20260418_bugfix_inbox并发竞态.md
│   └── ...
├── todo/              ← 待办：软链接 → all/
├── doing/             ← 进行中：软链接 → all/
└── finish/            ← 已完成：软链接 → all/
```

## 核心原则

### 1. all/ 是唯一真相源

所有迭代文档的**物理文件**都在 `all/` 下。

### 2. 三状态目录只存软链接

`todo/` `doing/` `finish/` 下**只存软链接**，指向 `all/` 中的文件。

优点：
- 一份内容，多处索引
- 改内容不需要多处同步
- 状态变更 = 移动软链接，极快
- 按状态浏览 = `ls` 对应目录

### 3. 文件命名约定

```
<日期>_<类型>_<短标题>.md

日期：YYYYMMDD（8 位，便于排序）
类型：feature | bugfix
短标题：中文或英文，连字符/下划线分隔
```

示例：
- `20260421_feature_线程树集成.md`
- `20260418_bugfix_inbox并发竞态.md`
- `20260415_feature_defer_command_hook.md`

## 状态流转

```
  (创建) → todo → doing → finish
                    ↓
                (放弃) → 删除软链接（all/ 保留）
```

### 状态含义

| 状态 | 含义 |
|---|---|
| **todo** | 已描述，待认领执行 |
| **doing** | 正在执行中 |
| **finish** | 已完成（含验证） |
| （无软链接） | 已放弃或归档（但 all/ 文件仍在） |

### 状态变更 = 移动软链接

```bash
# todo → doing（认领）
rm 迭代/todo/<name>
ln -s ../all/<name> 迭代/doing/<name>

# doing → finish（完成）
rm 迭代/doing/<name>
ln -s ../all/<name> 迭代/finish/<name>
```

## 迭代文档模板（all/ 下的 md）

```markdown
# <标题>

> 类型：feature / bugfix
> 创建日期：YYYY-MM-DD
> 状态：todo / doing / finish
> 负责人：supervisor / 具体对象名

## 背景 / 问题描述

（为什么做这件事）

## 目标

（做完后达到什么状态）

## 方案

（怎么做）

## 影响范围

- 涉及代码：<文件路径>
- 涉及文档：<文件路径>
- 涉及基因/涌现：<引用>

## 验证标准

（怎么判断"做完了"）

## 执行记录

（可选：执行过程中的关键决策、遇到的问题、最终结果）
```

## 与其他工程管理概念的关系

| 概念 | 粒度 | 位置 | 用途 |
|---|---|---|---|
| **迭代** | 一个 feature / bugfix | `工程管理/迭代/` | 持久的设计档案 |
| **当前迭代** | 本周/月快照 | `工程管理/目标/当前迭代.md` | 汇总当前 P0/P1/P2 |
| **Issue（看板）** | Session 级讨论 | `flows/{sid}/issues/` | 某次会话的讨论单元 |
| **Task（看板）** | Session 级执行 | `flows/{sid}/tasks/` | 某次会话的执行单元 |
| **实验** | 探索性验证 | `工程管理/验证/实验/` | 回答未知问题 |
| **用例** | 端到端场景 | `工程管理/验证/用例/` | checklist 式验证 |

**粒度图**：

```
愿景（年级）
  ↓
当前迭代（月/周级，汇总）
  ↓
迭代文档（事件级，持久）         ← 本目录
  ↓
Issue/Task（Session 级，过程）
```

## 调用方式

通过 `iteration` skill 触发：

```
/iteration feature 线程树集成 "把线程树替换掉旧 Flow..."
/iteration bugfix  inbox并发 "发现并发写入时..."
```

详见 `user/.claude/skills/iteration/SKILL.md`。
