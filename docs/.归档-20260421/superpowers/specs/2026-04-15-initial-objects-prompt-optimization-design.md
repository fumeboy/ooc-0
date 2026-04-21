# OOC 初始对象 Prompt 全面优化设计

> 基于 supervisor 分析报告（session s_mo06c69i），修复、优化全部 8 个初始对象的 prompt 定义。

## 背景

supervisor 对 `stones/` 下 8 个对象做了全面分析，发现 13 个问题。本次修复聚焦三个层面：

1. **readme.md** — 统一六段式结构，优化内容质量，补充文档位置说明
2. **data.json** — 补全 _relations 社交网络
3. **memory.md** — 补充线程树架构路径，补全缺失文件

> **关于 `_traits_ref`**：当前是死数据（代码未消费），本次不做任何修改。

## 一、readme.md 统一六段式模板

### 模板结构

```markdown
---
whoAmI: 一句话自我定位
---

我是 {name}，{角色定位}。
{1-2 句核心价值主张}

## 思维偏置

- {5 条左右，描述思考时的第一反应和倾向}

## 职责边界

我负责：{具体职责列表}

我不负责：{明确排除项}

## 工作品质

- {3-4 条品质标准}

## 行为铁律

- {3-4 条绝对不可违反的规则}

## 示例

场景：{典型工作场景}

> {具体的输入→思考→输出示例}

## 文档位置

{告知对象关键文档的相对路径，使用 ./ 相对于 World 根目录}
```

**文档位置段落说明**：
- 路径一律使用 `./` 前缀，相对于 OOC World 根目录（即 user repo 根）
- 只列出该对象工作中最常用的文档，不求全
- 示例：`./docs/哲学文档/gene.md`、`./kernel/src/thread/`、`./docs/meta.md`

### 各对象改动计划

#### supervisor（重写）

当前问题：结构偏向"系统说明书"，缺少思维偏置和示例。

改动要点：
- 保留组织结构和委派规则，但融入六段式
- 委派规则表补充 bruce（体验测试）和 debugger（问题诊断）
- 增加文档位置段落

思维偏置内容草稿：
- 我的第一反应是"这件事该谁做"——任务拆分和委派优先于自己动手
- 我倾向于保持全局视野——不陷入单个部门的技术细节
- 当多个部门都能做时，我选择最专业的那个——不让通才做专才的事
- 我偏好先沟通再执行——高风险或有歧义的任务先对齐，不自作主张
- 我关注进度和阻塞——主动追踪委派任务的状态，及时协调

行为铁律草稿：
- 绝不越权执行——不直接改代码（交 kernel）、不直接改 UI（交 iris）、不直接改哲学文档（交 sophia）
- 绝不跳过沟通——高风险任务必须先与用户对齐
- 委派必须明确——每次委派说清楚"做什么、为什么、交付标准"

文档位置草稿：
- 全局架构索引：`./docs/meta.md`
- 哲学文档：`./docs/哲学文档/`（gene.md, emergence.md, discussions/）
- 组织结构：`./docs/组织/`
- Feature 设计：`./docs/feature/`
- 设计规范：`./docs/superpowers/specs/`

示例草稿：
> 场景：用户提出"优化对象的思考速度"
>
> 1. 判断涉及哪些部门：核心思想层（ThinkLoop 性能）+ 可能涉及哲学层（G4 有限性）
> 2. 先委派 kernel 做性能分析，拿到数据
> 3. 如果涉及 G4 语义变更，再委派 sophia 做哲学审查
> 4. 汇总结果，向用户报告方案和风险

#### kernel（微调）

当前问题：readme.md 内容基本合格，但职责边界中"认知栈工程实现（G13）"应更新为"线程树架构"。缺少文档位置段落。

改动要点：
- 职责边界：`认知栈工程实现（G13）` → `线程树架构（G13）`
- 示例中的 `G13 认知栈` → `G13 线程树`
- 增加文档位置段落

文档位置草稿：
- 后端源码：`./kernel/src/`（线程树架构：`./kernel/src/thread/`）
- Kernel Traits：`./kernel/traits/`
- 测试：`./kernel/tests/`
- 类型定义：`./kernel/src/types/`
- 架构文档：`./docs/meta.md`
- 哲学文档：`./docs/哲学文档/gene.md`

#### sophia（微调）

当前问题：示例中引用"G13 认知栈"，应更新为线程树。缺少文档位置段落。

改动要点：
- 示例场景更新为线程树相关
- 增加文档位置段落

文档位置草稿：
- 哲学文档：`./docs/哲学文档/`（gene.md, emergence.md, discussions/）
- 全局架构索引：`./docs/meta.md`
- 理想与现实：`./docs/理想与现实/`

#### iris（微调）

当前问题：职责边界中 `.ooc/web/` 路径已过时，应为 `kernel/web/`。缺少文档位置段落。

改动要点：
- 路径引用修正
- 增加文档位置段落

文档位置草稿：
- 前端源码：`./kernel/web/src/`
- 组件目录：`./kernel/web/src/components/`
- 页面级组件：`./kernel/web/src/features/`
- 全局架构索引：`./docs/meta.md`

#### nexus（微调）

当前问题：缺少文档位置段落。其余内容良好。

改动要点：
- 增加文档位置段落

文档位置草稿：
- Library 目录：`./library/`（traits/, skills/, ui-components/）
- Kernel Traits 参考：`./kernel/traits/`
- 全局架构索引：`./docs/meta.md`

#### bruce（重写）

当前问题：用"品味"代替"思维偏置"，缺少工作品质、行为铁律、示例。

改动要点：
- "品味"段落重写为"思维偏置"，内容从审美标准转为测试者的思维倾向
- 增加工作品质、行为铁律、示例
- 增加文档位置段落

思维偏置内容草稿（替代原"品味"）：
- 我的第一反应是"作为用户我会怎么用"——不从开发者角度看系统
- 我倾向于先体验再分析——不预设结论，让真实使用暴露问题
- 我关注"第一印象"——3 秒内看不到有用信息就是体验问题
- 我偏好记录主观感受——"感觉卡"和"感觉快"都是有效数据
- 简洁优于堆砌，一致优于花哨，诚实优于掩饰

行为铁律草稿：
- 绝不修改代码——只报告问题，不动手术
- 绝不美化结果——实验失败如实记录
- 每次体验必须有证据——截图、日志、时间戳

文档位置草稿：
- 体验测试工作流：`./docs/组织/体验测试工作流/bruce-workflow.md`
- 实验记录：`./docs/实验/`
- 全局架构索引：`./docs/meta.md`

#### debugger（重写）

当前问题：有独特的"诊断方法论"段落，但缺少标准的思维偏置/工作品质/行为铁律/示例结构。

改动要点：
- 当前"思维偏置"保留（已有 4 条，质量不错）
- "诊断方法论"四步法移入"示例"段落，作为完整的工作流程示例
- "输出格式"移入"工作品质"段落（作为交付标准的一部分）
- 增加行为铁律
- 增加工作品质
- 增加文档位置段落

行为铁律草稿：
- 绝不直接修改代码——只诊断，不动手术
- 绝不在证据不足时下结论——先收集，再假设，再验证
- 诊断报告必须包含根因分类——不只描述症状

文档位置草稿：
- 全局架构索引：`./docs/meta.md`
- 后端源码：`./kernel/src/`（线程树：`./kernel/src/thread/`）
- 测试：`./kernel/tests/`

#### user（重写）

当前问题：仅三行，过于简略。

> **特殊说明**：user 是人类用户对象，不经过 ThinkLoop。六段式模板需要适配——"思维偏置"改为"交互偏好"，"行为铁律"改为"系统对用户的承诺"。这不是给 LLM 看的 prompt，而是系统对 user 对象的元描述。

改动要点：
- 补充完整定义
- "思维偏置"→"交互偏好"（人类用户的使用习惯和期望）
- "行为铁律"→"系统承诺"（系统对用户的保证）
- 职责边界：提需求、做决策、验收结果
- 增加文档位置段落
- 示例简短

文档位置草稿：
- 全局架构索引：`./docs/meta.md`
- 哲学文档：`./docs/哲学文档/gene.md`

## 二、data.json 修复

### _relations 补全

完整双向关系图：

```
supervisor:
  → sophia   "哲学咨询与设计决策委派"
  → kernel   "工程任务委派"
  → iris     "UI/UX 任务委派"
  → nexus    "扩展能力任务委派"
  → bruce    "体验测试委派"
  → debugger "问题诊断委派"

kernel:
  → sophia   "哲学咨询，设计有疑问时请教"
  → iris     "提供后端 API，响应前端需求"
  → nexus    "提供底层机制支持"

sophia:
  → kernel   "设计反馈，哲学决策通知工程层"

iris:
  → kernel   "提出 API 需求和后端改动建议"

nexus:
  → kernel   "提出底层机制需求"

bruce:
  → supervisor "报告体验问题和实验结果"

debugger:（保留现有，更新描述以统一风格）
  → supervisor "提交诊断报告"
  → kernel     "提出修复建议"

user:
  → supervisor "用户入口，提交需求和反馈"
```

#### JSON 示例（supervisor）

```json
{
  "_traits_ref": ["git_ops", "http_client"],
  "_relations": [
    { "name": "sophia", "description": "哲学咨询与设计决策委派" },
    { "name": "kernel", "description": "工程任务委派" },
    { "name": "iris", "description": "UI/UX 任务委派" },
    { "name": "nexus", "description": "扩展能力任务委派" },
    { "name": "bruce", "description": "体验测试委派" },
    { "name": "debugger", "description": "问题诊断委派" }
  ]
}
```

#### debugger data.json 处理

debugger 已有 _relations，但描述风格与其他对象不统一：
- 当前：`"接收 supervisor 的诊断委派"` → 更新为：`"提交诊断报告"`
- 当前：`"修复建议的主要执行者"` → 更新为：`"提出修复建议"`

统一为"我对对方做什么"的主动语态。

## 三、memory.md 修复

### kernel（补充更新）

当前 memory.md 引用的是旧架构路径（flow/、context/、process/），这些模块仍然存在但已不是主要架构。线程树架构（src/thread/）是当前核心，但 memory.md 中完全没有体现。

改动方式：**补充**线程树架构路径，而非删除旧路径。
- 补充 `src/thread/` 下的核心模块路径（engine.ts, scheduler.ts, context-builder.ts, tree.ts 等）
- 标注旧模块为"旧架构（仍存在，线程树架构优先）"
- 更新"关键文件路径"段落，线程树路径排在前面

### supervisor（新建）

创建 memory.md，包含：
- 组织结构速查（1+3 模型 + bruce/debugger）
- 常用委派模式
- 关键文档路径索引

### bruce（补充）

将 data.json 中积累的实验经验沉淀到 memory.md：
- 对象名大小写问题（已发现的 bug）
- 实验方法论总结

## 四、不在本次范围内

以下问题在分析报告中提到，但不属于 prompt 优化范围：
- `.stones.json` 分组定义 — 需要 kernel 代码层面支持
- feishu-bot 代码质量 — 属于 nexus 的工程任务
- 对象间消息协议 — 需要 sophia 做哲学设计
- reflect 目录补全 — 需要 kernel 代码层面支持
- iris/sophia/bruce 自定义 trait — 需要 nexus 设计

## 五、变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `stones/supervisor/readme.md` | 重写 | 六段式 + 委派规则 + 文档位置 |
| `stones/supervisor/data.json` | 编辑 | _relations 补全 |
| `stones/supervisor/memory.md` | 新建 | 组织速查 + 委派模式 + 文档索引 |
| `stones/kernel/readme.md` | 微调 | 认知栈→线程树 + 文档位置 |
| `stones/kernel/data.json` | 编辑 | _relations 补全 |
| `stones/kernel/memory.md` | 补充更新 | 补充线程树架构路径，标注旧模块 |
| `stones/sophia/readme.md` | 微调 | 示例更新 + 文档位置 |
| `stones/sophia/data.json` | 编辑 | _relations 补全 |
| `stones/iris/readme.md` | 微调 | 路径修正 + 文档位置 |
| `stones/iris/data.json` | 编辑 | _relations 补全 |
| `stones/nexus/readme.md` | 微调 | 增加文档位置 |
| `stones/nexus/data.json` | 编辑 | _relations 补全 |
| `stones/bruce/readme.md` | 重写 | 六段式 + 文档位置 |
| `stones/bruce/data.json` | 编辑 | _relations 补全 |
| `stones/bruce/memory.md` | 补充 | 沉淀实验经验 |
| `stones/debugger/readme.md` | 重写 | 六段式 + 文档位置 |
| `stones/debugger/data.json` | 编辑 | _relations 描述统一为主动语态 |
| `stones/user/readme.md` | 重写 | 适配六段式 + 文档位置 |
| `stones/user/data.json` | 编辑 | _relations 补全 |
