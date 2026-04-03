# Skill 在 OOC 体系下的表示方式

<!--
@ref docs/哲学文档/gene.md#G1 — references — 万物皆对象
@ref docs/哲学文档/gene.md#G3 — references — Trait 自我定义单元
@ref docs/哲学文档/gene.md#G8 — references — Effect 与消息传递
@ref docs/哲学文档/gene.md#G13 — references — 认知栈模型
-->

## 一、问题的本质

用户提出了一个精准的问题：Skill 不是对象的属性，而是通用工具，在 OOC 体系下应该怎么表示？

这个问题之所以重要，是因为它触及了 OOC 建模的一个边界：**不是所有能力都适合用 Trait 表达**。

---

## 二、Trait vs Skill 对比分析

### 2.1 本质差异

| 维度 | Trait | Skill |
|------|-------|-------|
| **归属** | 属于特定对象 | 不属于任何对象 |
| **语义** | "我是什么" / "我怎么想" | "我会用什么工具" |
| **生命周期** | 随对象存在，可成长（G12） | 独立存在，版本化更新 |
| **激活** | 对象自主决定（G3 自我立法） | 按需调用，无需激活 |
| **状态** | 可以影响对象的思维方式（bias） | 无状态，纯函数式 |
| **来源** | 经验沉淀 / 自我约束 / 外部注入 | 外部市场 / 社区共享 |
| **复用** | 同名 trait 在不同对象中可以不同 | 所有对象使用同一份 |

### 2.2 关键洞察

Trait 的四种角色（思考风格、自我约束、能力扩展、信息扩展）中，Skill 只对应**能力扩展**这一种。而且是最纯粹的能力扩展——没有 bias，没有思维影响，只有可调用的函数。

用类比说明：
- Trait 像一个人的**性格特质**——"我是一个谨慎的人"影响我做所有事
- Skill 像一个人**会用的工具**——"我会用 Excel"不改变我是谁，只扩展我能做什么

### 2.3 相同点

- 都通过 `readme.md` + `index.ts` 的目录结构表达
- 都通过 MethodRegistry 注册方法到沙箱
- 都可以有 `when` 条件控制可用性
- 都遵循 G7（目录即存在）

---

## 三、方案评估

### 方案 A：Skill 作为特殊的 Trait（when: always 的全局 Trait）

即 tool-integration.md 中的现有方案：把 Skill 放在 `kernel/traits/` 下，所有对象共享。

**优点**：零改动，完全复用现有机制。
**缺点**：语义模糊。web_search 放在 kernel/traits/ 下，和 computable、talkable 并列，但它们本质不同——computable 定义了对象"能思考"，web_search 只是"能搜索"。随着 Skill 数量增长（几十个），kernel/traits/ 会变成一个混杂的大杂烩，Trait 的"自我定义"语义被稀释。

**评价**：能用，但不优雅。短期可行，长期有语义债。

### 方案 B：Skill 作为独立的对象（Stone）

每个 Skill 是一个 Stone 对象，其他对象通过 `talk()` 调用它。

```
.ooc/objects/
├── researcher/          # 普通对象
├── deep-reading/        # Skill 对象
├── news-aggregator/     # Skill 对象
└── stock-analysis/      # Skill 对象
```

**优点**：完全符合 G1（万物皆对象），Skill 有自己的身份、数据、关系。
**缺点**：过度建模。一个"深度阅读分析"Skill 本质是一段 prompt 模板，把它建模为一个有 readme.md、data.json、talkable 的完整对象，是用大炮打蚊子。而且 talk() 是异步消息传递，用来调用一个同步工具函数，引入了不必要的复杂度（需要 Flow、ThinkLoop、调度器）。

**评价**：哲学上最纯粹，工程上最浪费。

### 方案 C：Skill 作为 World 级别的共享资源

在 `.ooc/` 下新建一个 `skills/` 目录，与 `objects/`、`kernel/` 平级。

```
.ooc/
├── objects/             # 对象
├── kernel/
│   └── traits/          # 系统基础 Trait（computable, talkable...）
└── skills/              # 共享 Skill
    ├── deep-reading/
    │   ├── readme.md
    │   └── index.ts
    └── news-aggregator/
        ├── readme.md
        └── index.ts
```

**优点**：
1. 语义清晰——Trait 是"我是什么"，Skill 是"我能用什么工具"
2. 物理隔离——kernel/traits/ 保持纯净（只有系统基础能力），skills/ 可以无限扩展
3. 最小改动——Skill 的目录结构和 Trait 完全一致（readme.md + index.ts），loadTrait() 可以直接复用
4. 符合 G7——目录即存在

**缺点**：
1. 引入了新的顶层概念（skills/），需要修改 loadAllTraits 的扫描路径
2. Skill 和 Trait 的边界需要人为判断（什么该放 traits/，什么该放 skills/）

**评价**：工程上最平衡。

### 方案 D：Skill 作为 Kernel 级别的基础设施

在 `kernel/` 下新建 `skills/` 子目录。

```
.ooc/kernel/
├── traits/              # 系统基础 Trait
└── skills/              # 共享 Skill
```

**优点**：不改变顶层结构，只在 kernel 内部分区。
**缺点**：语义上 Skill 不是"内核基础设施"。kernel 的含义是"系统运行必需的基础能力"，而 Skill 是"可选的扩展工具"。把可选的东西放在 kernel 下，违反了 kernel 的语义。

**评价**：比方案 A 好（有分区），但语义不够准确。

### 方案 E：Skill 作为对象可选择装备的共享能力包

结合方案 A 和 C 的优点：Skill 存储在共享位置，但对象通过声明来"装备"它们。

```
.ooc/
├── skills/                          # 共享 Skill 仓库
│   ├── deep-reading/
│   └── news-aggregator/
└── objects/
    └── researcher/
        └── readme.md                # frontmatter 中声明: skills: [deep-reading, news-aggregator]
```

**优点**：对象主动选择自己需要的 Skill（G3 自我立法），不是所有对象都能用所有 Skill。
**缺点**：增加了一层间接性（对象需要声明 skills 列表），且需要修改 Stone 的数据结构。

**评价**：最精细的控制，但复杂度较高。

---

## 四、推荐方案：C+E 混合

**核心思路**：Skill 存储在 `.ooc/skills/`，默认所有对象可用，对象可以通过声明来限制或扩展。

### 4.1 目录结构

```
.ooc/
├── kernel/
│   └── traits/          # 系统基础 Trait（不变）
├── skills/              # 共享 Skill 仓库（新增）
│   ├── deep-reading/
│   │   └── readme.md    # 纯 prompt 型：只有文档
│   ├── news-aggregator/
│   │   ├── readme.md
│   │   └── index.ts     # API 型：文档 + 代码
│   └── stock-analysis/
│       ├── readme.md
│       └── index.ts
└── objects/
    ├── researcher/
    │   └── traits/      # 对象自己的 Trait（不变）
    └── ...
```

### 4.2 Skill 的 readme.md 格式

与 Trait 完全一致，复用同一套 frontmatter 规范：

```markdown
---
when: 当需要深度分析一篇文章或文档时
source: openclaw://skill/deep-reading@1.0.0    # 可选：追溯来源
---

# 深度阅读分析

你可以使用以下方法对文章进行深度分析...

## 可用 API

### analyzeArticle(url)

分析指定 URL 的文章内容...
```

### 4.3 加载机制

修改 `loadAllTraits()` 的扫描顺序：

```
1. kernel/traits/    → 系统基础能力（computable, talkable...）
2. skills/           → 共享 Skill（deep-reading, news-aggregator...）
3. objects/{name}/traits/ → 对象自己的 Trait（覆盖同名）
```

三层合并，优先级从低到高。对象的 trait 可以覆盖同名 skill（就像现在可以覆盖 kernel trait 一样）。

**改动量**：只需修改 `loadAllTraits()` 函数，增加一个扫描路径。约 10 行代码。

### 4.4 Context 中的呈现

在 `buildContext()` 中，Skill 的 readme 内容归入 `knowledge`（而非 `instructions`）：

```
instructions: [computable, talkable, plannable...]     ← kernel traits
knowledge:    [deep-reading, user-trait-1, ...]         ← skills + user traits
```

这已经是现有行为——非 kernel trait 的 readme 自动归入 knowledge。无需改动。

### 4.5 为什么不需要对象声明 skills 列表

简化版不需要 E 方案的声明机制，原因：

1. **Skill 的 `when` 字段已经提供了控制**——`when: "当需要深度分析文章时"` 意味着 LLM 只在需要时才激活它
2. **方法注册是全量的但无害**——多注册几个函数不影响性能，LLM 不会无缘无故调用不需要的方法
3. **YAGNI**——等真正出现"某个对象不应该使用某个 Skill"的需求时，再加声明机制不迟

如果未来确实需要精细控制，可以在对象的 readme.md frontmatter 中加 `exclude_skills: [xxx]` 黑名单，比白名单更轻量。

---

## 五、Trait / Skill / Kernel Trait 的三层语义

| 层 | 位置 | 语义 | 示例 |
|----|------|------|------|
| **Kernel Trait** | `kernel/traits/` | 系统运行必需的基础能力 | computable, talkable, plannable |
| **Skill** | `skills/` | 可选的通用工具，所有对象共享 | deep-reading, news-aggregator, web-search |
| **Object Trait** | `objects/{name}/traits/` | 对象的自我定义（思维、约束、领域能力） | researcher 的 academic-writing |

这三层的关系：
- Kernel Trait 定义"对象能存在"（没有 computable 就不能思考）
- Skill 定义"对象能用什么工具"（没有 web-search 也能存在，只是不能搜索）
- Object Trait 定义"对象是谁"（researcher 的学术写作风格）

### 迁移建议

现有的 `kernel/traits/web_search` 应该迁移到 `skills/web_search`。它不是系统基础能力，而是一个可选工具。

---

## 六、一个 Skill 的完整生命周期

以"深度阅读分析"为例：

### 阶段 1：安装

```
来源：OpenClaw 市场下载 / 手动创建 / 对象经验沉淀后提取

安装到：.ooc/skills/deep-reading/
├── readme.md    # 从 skill.md 转换，添加 frontmatter
└── (无 index.ts — 纯 prompt 型)
```

### 阶段 2：加载

```
系统启动 → loadAllTraits() 扫描三个目录
→ skills/deep-reading/ 被加载为 TraitDefinition
→ when: "当需要深度分析文章时" → 条件型
→ methods: [] → 无可执行方法（纯 prompt）
→ MethodRegistry 无新方法注册
```

### 阶段 3：使用

```
researcher 对象收到任务："分析这篇论文的核心论点"

ThinkLoop 第 1 轮：
  buildContext() → directory 中列出条件 trait 摘要
  → "deep-reading: 当需要深度分析文章时"
  LLM 看到摘要，决定激活 → activateTrait("deep-reading")

ThinkLoop 第 2 轮：
  deep-reading 的 readme.md 完整内容注入 knowledge
  LLM 按照 readme 中的分析框架输出 [thought]
  → 结构化的深度分析结果
```

### 阶段 4：进化（可选）

```
researcher 反复使用 deep-reading 后，发现需要定制：
→ 在自己的 traits/ 下创建同名 trait：objects/researcher/traits/deep-reading/
→ 覆盖 skills/ 中的通用版本
→ 添加自己的 bias："分析学术论文时，优先关注方法论的创新性"

这就是 G12 经验沉淀：通用 Skill → 个性化 Trait
```

### 阶段 5：更新

```
OpenClaw 市场发布了 deep-reading v2.0
→ adapter 下载新版本，更新 skills/deep-reading/readme.md
→ researcher 的个性化覆盖不受影响（对象 trait 优先级更高）
```

---

## 七、实现路径

### 第一步（5 分钟）

修改 `src/trait/loader.ts` 的 `loadAllTraits()`，增加 `skillsDir` 参数：

```typescript
export async function loadAllTraits(
  objectTraitsDir: string,
  kernelTraitsDir: string,
  skillsDir?: string,        // 新增
): Promise<TraitDefinition[]> {
  const traitMap = new Map<string, TraitDefinition>();

  // 1. kernel traits（最低优先级）
  // ... 现有代码不变 ...

  // 2. skills（中间优先级）— 新增
  if (skillsDir && existsSync(skillsDir)) {
    const skillNames = readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);
    for (const name of skillNames) {
      const trait = await loadTrait(join(skillsDir, name), name);
      if (trait) traitMap.set(name, trait);
    }
  }

  // 3. object traits（最高优先级，覆盖同名）
  // ... 现有代码不变 ...
}
```

### 第二步（5 分钟）

创建 `.ooc/skills/` 目录，将 `kernel/traits/web_search` 迁移过去。

### 第三步（5 分钟）

修改 `buildContext()` 中的 `KERNEL_TRAIT_NAMES`，确保 skills 的 readme 归入 knowledge 而非 instructions。

### 第四步（验证）

手动创建一个纯 prompt 型 Skill（如 deep-reading），验证对象能正确发现和使用它。

---

## 八、总结

**Skill 在 OOC 中的表示方式：与 Trait 同构但语义独立。**

- 同构：目录结构一样（readme.md + index.ts），加载机制一样（loadTrait），注册机制一样（MethodRegistry）
- 独立：存储位置不同（skills/ vs traits/），语义不同（工具 vs 自我定义），优先级不同（可被对象覆盖）

这个设计遵循了 OOC 的核心原则：
- **G1**：不发明新机制，复用现有的 Trait 目录结构
- **G3**：Trait 的"自我定义"语义不被稀释，Skill 有自己的位置
- **G7**：目录即存在——skills/ 目录存在，Skill 就存在
- **G12**：通用 Skill 可以通过对象覆盖进化为个性化 Trait（沉淀路径）
- **最小改动**：约 15 行代码改动，零新抽象
