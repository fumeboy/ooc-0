---
name: iteration
description: 管理 OOC 项目的迭代（feature / bugfix）。当用户提出"新需求"、"新 feature"、"修复某 bug"、"/iteration" 时调用。在 docs/工程管理/迭代/all/ 下创建文档，用软链接流转 todo → doing → finish，并可 spawn sub agent 认领执行。
---

# iteration — OOC 项目迭代工作规范

## 触发条件

用户以以下形式表达需求时：

- 明确提到："/iteration"、"新 feature"、"新迭代"、"加个需求"
- 描述新功能需求（如"我要做 X 功能"）
- 报告需要修复的 bug（如"修复 Y 问题"）

## 参数解析

用户输入通常含三要素：

| 要素 | 含义 | 示例 |
|---|---|---|
| **类型** | feature 或 bugfix | "feature 线程树集成" |
| **标题** | 短标题（文件名用） | "线程树集成" |
| **描述** | 详细需求（文档内容基础） | "把 Flow 架构替换为线程树..." |

如果用户**没有明确提供**某要素，询问一次；否则用合理默认值（类型默认 feature）。

## 工作流程（强制按此执行）

以下 docs 目录位于当前工作目录的相对路径 `./user/docs`

### 步骤 0: 阅读 meta.md 了解项目背景

路径：`docs/meta.md`

### 步骤 1：在 all/ 下创建迭代文档

**路径**：`docs/工程管理/迭代/all/`

**文件名**：`<YYYYMMDD>_<类型>_<短标题>.md`

- `YYYYMMDD` 用今天日期（今天是 2026-04-21 就是 `20260421`）
- `<类型>` 是 `feature` 或 `bugfix`
- `<短标题>` 用中文或英文（保持短，< 20 字符）

**文档模板**（按此结构写入）：

```markdown
# <标题>

> 类型：<feature|bugfix>
> 创建日期：<YYYY-MM-DD>
> 状态：todo
> 负责人：<TBD 或具体对象名>

## 背景 / 问题描述

<基于用户描述填充>

## 目标

<做完后达到什么状态；如用户未明说，基于描述推断>

## 方案

<初步方案；如需调研才能确定，写 "待调研">

## 影响范围

- 涉及代码：<待调研或基于描述列出>
- 涉及文档：<同上>
- 涉及基因/涌现：<如有>

## 验证标准

<怎么判断"做完了"；如需人工验证，说明验证步骤>

## 执行记录

<初始为空，执行中由认领的 agent 或 supervisor 追加>
```

### 步骤 2：在 todo/ 创建软链接

**在 `docs/工程管理/迭代/todo/` 下创建指向 `all/<filename>` 的软链接**：

```bash
cd docs/工程管理/迭代/todo/
ln -s ../all/<filename>.md <filename>.md
```

**验证**：`ls -la todo/` 应看到 `filename.md -> ../all/filename.md`

### 步骤 3：spawn sub agent 认领（可选）

如果用户**明确要求**"去做这个"、"让 agent 认领"、"开始执行"，继续以下步骤：

spawn 一个 general-purpose agent，任务为：

```
你要认领并执行一个迭代项。

迭代文档路径：docs/工程管理/迭代/all/<filename>.md

执行步骤：
1. 认领：把软链接从 todo/ 移到 doing/：
   cd docs/工程管理/迭代/
   rm todo/<filename>.md
   ln -s ../all/<filename>.md doing/<filename>.md

2. 阅读迭代文档，理解目标、方案、影响范围

3. 按照 docs/工程管理/流程/工作节奏.md 的 9 步执行：
   思考 → 调研 → 设计 → 实现 → 自测 → 文档 → 提交 → 体验 → 反思

4. 执行过程中，每个关键节点（如"调研完成"、"实现完成"）在迭代文档的"执行记录"区块追加一段说明

5. 完成后：
   a. 在迭代文档中：
      - 状态字段改为 finish
      - 执行记录区块补全最终结果
   b. 把软链接从 doing/ 移到 finish/：
      cd docs/工程管理/迭代/
      rm doing/<filename>.md
      ln -s ../all/<filename>.md finish/<filename>.md

6. 如果执行中失败或放弃：
   - 在迭代文档中说明放弃原因
   - 把软链接从 doing/ 移回 todo/（保留待后续）或直接删除（永久放弃）
   - all/ 的文档保留

具体业务：<把迭代文档的内容摘要给 agent>
```

### 步骤 4：向用户汇报

```
已创建迭代项：
- 文档：docs/工程管理/迭代/all/<filename>.md
- 状态：todo

<如果 spawn 了 agent>
已派发 sub agent 认领执行，它会：
1. 移软链接到 doing/
2. 按工作节奏执行
3. 完成后移到 finish/

<如果没 spawn>
下一步：你可以让我 spawn agent 认领执行，或手动处理。
```

## 命名细节

### 短标题

- 保持 < 20 字符
- 避免空格（用下划线或连字符）
- 中文或英文都可，选更能传达意图的
- 去除"的"、"了"等虚词

例：
- ✓ `线程树集成`
- ✓ `thread-tree-integration`
- ✗ `把线程树架构集成进来替换掉旧 Flow 架构`（太长）

### 日期

**总是用今天的日期**（不是用户描述中可能提到的其他日期）。

### 重复处理

如果 `all/` 下已有同名文件（同一天同标题）：

- 追加序号：`20260421_feature_线程树集成_2.md`
- 或询问用户要更新原文档还是新建

## 软链接的关键原则

### 相对路径

软链接**必须**用相对路径：

```bash
# ✓ 正确
ln -s ../all/20260421_feature_X.md todo/20260421_feature_X.md

# ✗ 错误（绝对路径破坏可移植性）
ln -s /Users/xxx/.../all/... todo/...
```

### 验证存在

创建软链接后**立即验证**：

```bash
ls -la todo/<filename>.md
# 应输出：lrwxr-xr-x ... <filename>.md -> ../all/<filename>.md

cat todo/<filename>.md  # 应能读到 all/ 下的内容
```

如果验证失败，排查路径问题。

### 状态转移的原子性

状态变更（如 todo → doing）的三步：

```bash
# 正确：先删再建
rm todo/<filename>.md
ln -s ../all/<filename>.md doing/<filename>.md

# 或用 mv（原子）：
mv todo/<filename>.md doing/<filename>.md
```

> 注：`mv` 对软链接有效，直接移动链接本身，不影响目标。

## 例外处理

### 用户只给了模糊需求

如果用户说"随便做点 X"没给足细节：

- 询问关键信息（至少：类型、标题）
- 文档中标注"待调研"的字段让 agent 自己补

### 用户已有详细设计文档

如果用户把方案文本贴给你：

- 把他的原文作为"方案"部分的主体
- 不要自己改写他的设计

### 用户反复提同一件事

如果 `all/` 已有类似主题的文档：

- 询问是更新现有还是新建
- 更新时在原文档追加新一轮（用 `## YYYY-MM-DD 更新` 分段）

## 与其他机制的关系

- **看板（Session 级 Issue/Task）**：看板是**某次会话**的过程记录；迭代是**持久档案**。两者可并行——一个 feature 可能在多个 Session 中被讨论，但只对应一份迭代文档。
- **当前迭代快照**（`docs/工程管理/目标/当前迭代.md`）：汇总**进行中**的迭代（ls doing/）和近期计划（挑选 todo/ 的几个）。
- **验证/用例**：finish 的迭代如果涉及新场景，需要在 `验证/用例/` 加对应用例。

## 禁止事项

- ❌ 直接在 todo/ doing/ finish/ 创建物理文件（必须软链接）
- ❌ 跳过 todo 直接建 doing（状态流转必须从 todo 开始）
- ❌ all/ 文档被删除（软链接会悬空，历史丢失）
- ❌ 修改软链接指向（指向关系必须稳定）

## 源码锚点

- 规范文档：`docs/工程管理/迭代/README.md`
- 目录位置：`docs/工程管理/迭代/{all,todo,doing,finish}/`
