# 文档-代码交叉引用规范

本规范定义 OOC 项目中文档与代码之间的显式引用关系维护规则。
灵感来自 Obsidian 的双向链接，但适配了代码项目的特殊需求。

---

## 核心原则

1. **显式优于隐式** — 所有概念引用必须用 `@ref` 标签声明，不依赖"读者自己去找"
2. **双向绑定** — 前向引用（我引用谁）和反向引用（谁引用我）都要维护
3. **语义关系** — 不只是"提到了"，而是明确"什么关系"
4. **可 grep** — 所有标签格式统一，`grep @ref` 即可搜索全部引用关系
5. **轻量维护** — 标签写在文件头部，不侵入正文逻辑

---

## 引用标签语法

### 前向引用 `@ref`

声明"我引用了谁"：

```
@ref <target> — <relation> [— <补充说明>]
```

- `target`：被引用的文件路径或文档锚点（相对于项目根目录）
- `relation`：语义关系（见下方关系类型表）
- `补充说明`：可选，简述引用的具体内容

### 反向引用 `@referenced-by`

声明"谁引用了我"：

```
@referenced-by <source> — <relation>
```

- `source`：引用方的文件路径
- `relation`：与前向引用对称的关系

### 关系类型

| 关系 | 含义 | 反向关系 | 典型场景 |
|------|------|---------|---------|
| `implements` | 实现了某个概念/设计 | `implemented-by` | 代码 → 哲学文档 |
| `references` | 引用了某个概念（非实现） | `referenced-by` | 文档 → 文档 |
| `validates` | 验证了某个涌现能力 | `validated-by` | 实验 → emergence |
| `extends` | 扩展了某个概念 | `extended-by` | 新文档 → 旧文档 |
| `renders` | 渲染/展示了某个概念 | `rendered-by` | 前端组件 → 类型/概念 |
| `tests` | 测试了某个实现 | `tested-by` | 测试文件 → 源码 |
| `designs` | 设计了某个功能 | `designed-by` | 设计文档 → 哲学文档 |

---

## 代码文件中的引用格式

在文件头部的 JSDoc 注释块中声明：

```typescript
/**
 * Flow —— 动态执行对象
 *
 * Flow 是 Stone 在执行任务时的动态派生。
 *
 * @ref .ooc/docs/哲学文档/gene.md#G2 — implements — Stone vs Flow 的动态形态
 * @ref .ooc/docs/哲学文档/gene.md#G4 — implements — ThinkLoop 思考-执行循环
 * @ref .ooc/docs/哲学文档/gene.md#G8 — implements — Effect 三种影响方向
 * @ref .ooc/docs/哲学文档/gene.md#G10 — implements — 不可变事件历史（actions）
 * @ref src/process/tree.ts — references — 行为树操作（focus, actions）
 */
```

### 规则

1. `@ref` 写在 JSDoc 块的末尾，与正文描述之间空一行
2. 路径相对于项目根目录（`docs/`、`src/`、`.ooc/web/src/`）
3. 文档锚点用 `#` 分隔（如 `gene.md#G2`）
4. 每个 `@ref` 独占一行
5. 纯导出文件（`index.ts` 只做 re-export）不需要引用声明

---

## 文档文件中的引用格式

在文档头部（标题之后、正文之前）用 HTML 注释声明：

```markdown
# 行为树设计

<!--
@ref .ooc/docs/哲学文档/gene.md#G9 — extends — 行为树的详细设计
@ref .ooc/docs/哲学文档/gene.md#G5 — references — 结构化遗忘机制
@referenced-by src/process/tree.ts — implemented-by
@referenced-by src/flow/thinkloop.ts — implemented-by
-->

正文内容...
```

### 规则

1. 引用块紧跟一级标题，用 `<!-- -->` 包裹
2. 前向引用（`@ref`）和反向引用（`@referenced-by`）写在同一个注释块中
3. 文档正文中的 markdown 链接（`[gene.md](../gene.md)`）是导航用途，不替代 `@ref` 声明
4. `@ref` 是语义声明（"我和它是什么关系"），markdown 链接是阅读导航（"点击跳转"）

---

## 前端代码的引用格式

前端组件引用它所渲染的概念：

```tsx
/**
 * ProcessView —— 行为树可视化组件
 *
 * @ref .ooc/docs/哲学文档/gene.md#G9 — renders — 行为树结构与 focus 状态
 * @ref .ooc/docs/哲学文档/gene.md#G10 — renders — 节点上的 action 历史
 * @ref src/types/process.ts — references — ProcessNode, Process 类型定义
 */
```

---

## 双向绑定维护规则

### 何时更新

1. **新建文件时**：写好前向引用 `@ref`，同时去被引用文件补 `@referenced-by`
2. **修改文件时**：如果引用关系变了（新增/删除了对某概念的依赖），同步更新双向
3. **删除文件时**：去所有引用方清理 `@referenced-by`
4. **commit 前检查**：确认改动涉及的文件的引用关系是否需要更新

### 维护优先级

不要求一次性补全所有文件。按以下优先级逐步完善：

1. **P0 — 哲学文档**：gene.md 的每个 G# 节（G1-G13）需要 `@referenced-by` 列表（这是引用网络的枢纽）
2. **P1 — 核心源码**：`src/` 下的核心模块补全 `@ref`
3. **P2 — 前端组件**：`.ooc/web/src/` 下的组件补 `@ref`
4. **P3 — 架构/设计文档**：`docs/架构/`、`docs/设计/` 补双向引用
5. **P4 — 实验文档**：`docs/实验/` 补 `@ref`（validates 关系）

### 粒度指南

- **代码文件**：引用到 gene.md 的具体 G# 级别（如 `gene.md#G9`）
- **文档文件**：引用到文件级别即可（如 `src/process/tree.ts`），除非需要指向特定函数
- **实验文档**：引用到 emergence.md 的具体 E# 级别（如 `emergence.md#E5`）

---

## 搜索与验证

### 常用 grep 命令

```bash
# 查找所有前向引用
grep -rn "@ref " src/ docs/ .ooc/web/src/

# 查找所有反向引用
grep -rn "@referenced-by" src/ docs/ .ooc/web/src/

# 查找引用了 G9 的所有文件
grep -rn "@ref.*gene.md#G9" src/ docs/ .ooc/web/src/

# 查找某个文件被谁引用
grep -rn "@ref.*process/tree.ts" src/ docs/ .ooc/web/src/

# 检查孤立文件（没有任何 @ref 的源码文件）
for f in $(find src/ -name "*.ts" ! -name "index.ts"); do
  grep -q "@ref" "$f" || echo "无引用: $f"
done
```

### 一致性检查

定期运行：对于每个 `@ref A → B`，检查 B 中是否有对应的 `@referenced-by B ← A`。
这可以用脚本自动化，但项目当前规模下手动 grep 即可。

---

## 示例：完整的双向引用

### gene.md 中 G9 节的反向引用

```markdown
## G9: 行为树是 Flow 的结构化计划与执行机制

<!--
@referenced-by src/process/tree.ts — implemented-by
@referenced-by src/process/focus.ts — implemented-by
@referenced-by src/process/render.ts — implemented-by
@referenced-by src/flow/thinkloop.ts — implemented-by — 行为树 API 注入
@referenced-by .ooc/web/src/features/ProcessView.tsx — rendered-by
@referenced-by docs/设计/async-messaging.md — extended-by
-->
```

### src/process/tree.ts 的前向引用

```typescript
/**
 * 行为树核心操作 —— 节点增删改查 + focus 管理
 *
 * @ref .ooc/docs/哲学文档/gene.md#G9 — implements — 行为树结构与 focus 光标
 * @ref .ooc/docs/哲学文档/gene.md#G10 — implements — actions 挂载到节点
 * @ref src/types/process.ts — references — ProcessNode, Process 类型
 */
```

### .ooc/web/src/features/ProcessView.tsx 的前向引用

```tsx
/**
 * ProcessView —— 行为树可视化
 *
 * @ref .ooc/docs/哲学文档/gene.md#G9 — renders — 行为树节点状态与 focus
 * @ref .ooc/docs/哲学文档/gene.md#G11 — implements — UI 作为对象的面孔
 * @ref src/types/process.ts — references — ProcessNode 数据结构
 */
```

---

## 与现有实践的兼容

当前后端文件头部已有 `(G#)` 标注（如 `Flow —— 动态执行对象 (G2, G4, G8)`）。
迁移策略：

1. 保留标题行的 `(G#)` 简写作为快速识别
2. 在 JSDoc 块末尾补充完整的 `@ref` 声明
3. 两者共存，`(G#)` 是摘要，`@ref` 是完整声明

---

## 不做什么

- **不做自动化工具**：项目规模（~50 源码文件 + ~30 文档）不需要，grep 足够
- **不做 ID 系统**：不给每个文件分配唯一 ID，路径本身就是 ID
- **不做图谱可视化**：当前阶段 grep 搜索比图谱更实用
- **不强制测试文件引用**：测试文件通过文件名约定（`xxx.test.ts`）已隐含引用关系
