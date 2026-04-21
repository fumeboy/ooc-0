# Trait 体系重构与 Context 格式统一（TOML）

<!--
@ref docs/meta.md — extends — Trait 体系与 Context 格式
@referenced-by kernel/src/trait/loader.ts — implemented-by — namespace/name 支持
@referenced-by kernel/src/trait/activator.ts — implemented-by — traitId() 函数
@referenced-by kernel/src/toml/renderer.ts — implemented-by — Context → TOML 渲染
@referenced-by kernel/src/toml/parser.ts — implemented-by — TOML → 结构化对象解析
@referenced-by kernel/src/flow/parser.ts — implemented-by — 双格式并行解析
@referenced-by kernel/src/context/formatter.ts — implemented-by — Input 格式切换为 TOML
-->

## 变更概述

**日期**: 2026-04-01

**变更类型**: 架构重构 + 格式统一

**影响范围**:
- Trait 体系支持 `namespace/name` 两段式标识
- Trait 三分类：`how_to_use_tool` / `how_to_think` / `how_to_interact`
- Context Input/Output 格式统一为 TOML
- 独立的 `[traits]` 段落，不再混在 `[knowledge]` 中
- 双格式并行解析（TOML + 旧标记格式）

---

## 背景与动机

### 问题 1: `[program]` 与 `[cognize_stack_frame_push]` 标记规则不一致

**旧格式的混乱：**

```
# 不同的标记规则导致 Agent 混淆

[program]
代码内容...
[/program]

[cognize_stack_frame_push.title]
标题
[/cognize_stack_frame_push.title]
```

**问题：**
- `[program]` 是简单的开始/结束标记
- `[cognize_stack_frame_push.title]` 是嵌套的属性标记
- 不一致导致 Agent 学习成本高

### 问题 2: lark-wiki 等 trait 只有一行描述

**原问题：**
```
在 === KNOWLEDGE === 部分只有一行 description
缺少具体命令格式、参数说明、示例
导致 Agent 多次试错才能学会正确用法
```

**示例 vs 规则：**
> "给 LLM 看具体例子比抽象描述有效 10 倍"

### 问题 3: Traits 混在 `[knowledge]` 段落中

**旧结构：**
```
=== KNOWLEDGE ===
[_trait_catalog]
## Available Traits
...

[lark/wiki]
...
```

**问题：**
- Traits 是 LLM 执行任务的关键工具
- 不应该混在 `[knowledge]` 或其他段落中
- 需要独立的 `[traits]` 段落

### 问题 4: Context 信息过载

**原问题：**
- `=== INSTRUCTIONS ===` 部分超过 1800 行
- 很多信息对当前任务是冗余的
- 关键信息被淹没

### 解决方案

1. **Trait 体系重构**
   - 支持 `namespace/name` 两段式标识
   - 三分类：`how_to_use_tool` / `how_to_think` / `how_to_interact`
   - 独立的 `TRAIT.md` 格式

2. **统一 TOML 格式**
   - Input/Output 统一为 TOML 格式
   - 独立的 `[traits]` 段落
   - 每个 tool trait 包含完整示例和常见错误对比

3. **双格式并行**
   - 保持旧格式解析支持
   - 逐步过渡到 TOML

---

## 具体变更

### 1. Trait 体系重构

#### 1.1 Namespace + Name 两段式标识

**新 frontmatter 字段：**

```yaml
---
namespace: "lark"           # 新增：命名空间
name: "wiki"                # 新增：名称
type: "how_to_use_tool"     # 新增：类型
version: "1.0.0"
when: "never"
description: "飞书知识库操作"
deps: ["lark/shared"]
---
```

**访问方式：**

```typescript
// 通过 namespace/name 访问
activateTrait("lark/wiki")

// 旧的扁平名称不再支持
// activateTrait("lark-wiki")  // ❌ 不再支持
```

#### 1.2 Trait 三分类

| 类型 | 说明 | 示例 |
|------|------|------|
| `how_to_use_tool` | 工具使用类 trait | lark/wiki, lark/doc, git/ops |
| `how_to_think` | 思维模式类 trait | computable, verifiable, debuggable |
| `how_to_interact` | 交互协作类 trait | talkable, object_creation |

**分类价值：**
- Context 组装时可以按类型筛选
- 前端可以按类型展示
- 更清晰的职责划分

#### 1.3 目录嵌套结构

**新结构：**

```
kernel/traits/
├── kernel/                    # namespace: kernel
│   ├── computable/            # name: computable
│   │   └── TRAIT.md
│   ├── talkable/              # name: talkable
│   │   └── TRAIT.md
│   └── verifiable/            # name: verifiable
│       └── TRAIT.md

library/traits/
├── lark/                      # namespace: lark
│   ├── shared/                # name: shared
│   │   └── TRAIT.md
│   ├── wiki/                  # name: wiki
│   │   ├── TRAIT.md
│   │   └── index.ts
│   └── doc/                   # name: doc
│       └── TRAIT.md
├── git/                       # namespace: git
│   └── ops/                   # name: ops
│       └── index.ts
└── http/                      # namespace: http
    └── client/                # name: client
        └── index.ts
```

**加载逻辑：**
- 只要目录中存在 `TRAIT.md` / `SKILL.md`，就视为 trait 目录
- 从 traits/ 目录下的第一级子目录名推断 namespace
- namespace 下的子目录名作为 name

#### 1.4 TRAIT.md 格式

**新格式优先级：**
1. TRAIT.md（新格式，推荐）
2. SKILL.md（兼容 superpowers skill 体系）
3. readme.md（旧格式，**不兼容**）

**TRAIT.md 完整示例：**

```yaml
---
namespace: "lark"
name: "wiki"
type: "how_to_use_tool"
version: "1.0.0"
when: "never"
description: "飞书知识库操作"
deps: ["lark/shared"]
examples:
  - title: "查询 wiki 节点信息"
    shell_script: |
      lark-cli wiki spaces get_node --params '{"token":"wikcnxxxx"}'
common_mistakes:
  - title: "直接使用 wiki_token"
    correct: |
      lark-cli wiki spaces get_node --params '{"token":"wikcnxxxx"}'
      # 然后用返回的 obj_token
    wrong: |
      # 错误：直接用 wiki_token 调用文档 API
      lark-cli docs +fetch --token wikcnxxxx
---
# Lark Wiki Trait

## 快速开始
...
```

### 2. 统一 TOML 格式

#### 2.1 为什么选择 TOML

| 格式 | 优点 | 缺点 |
|------|------|------|
| **TOML** | 人类可读、结构清晰、支持嵌套、注释友好、`[section]` 结构与现有 `=== SECTION ===` 对应 | 需要额外解析库 |
| JSON | 机器友好、无歧义 | 人类可读性差、无注释、引号繁琐 |
| YAML | 人类可读、缩进敏感 | 缩进问题、解析复杂 |

**选择理由：**
1. Context 是给 LLM 看的，人类可读性优先
2. TOML 支持注释，可以在关键位置添加说明
3. TOML 的 `[section]` 结构与现有的 `=== SECTION ===` 结构完美对应
4. 流式输出时，TOML 可以逐段解析

#### 2.2 Input 格式（TOML）

**旧格式：**

```
=== WHO AM I ===
名称: supervisor
你是 Alan Kay...

=== INSTRUCTIONS ===
# computable trait
...

=== KNOWLEDGE ===
[_trait_catalog]
## Available Traits
...
```

**新格式（TOML）：**

```toml
# OOC Context
# 版本: 2.0
# 生成时间: 2026-04-01T10:30:00Z

[identity]
name = "supervisor"
who_am_i = """
你是 Alan Kay，OOC 项目的 Supervisor...
"""

[instructions.kernel.computable]
content = """
认知栈思维模式...
"""

[traits.active.lark.wiki]
content = """
飞书知识库操作...
"""

[trait_catalog]
content = """
## Available Traits
- kernel/computable: 认知栈思维模式
- lark/wiki: 飞书知识库操作 (activateTrait to use)
"""

[directory]

[[directory.objects]]
name = "sophia"
who_am_i = "哲学设计层"

[status]
value = "running"
```

#### 2.3 Output 格式（TOML）

**旧格式：**

```
[thought]
用户需要分析飞书文档...

[program]
const x = 1;

[finish]
```

**新格式（TOML）：**

```toml
[thought]
content = """
用户需要分析飞书文档链接。
这是一个 wiki 格式的链接，需要：
1. 激活 lark/wiki trait
2. 获取节点信息
3. 激活 lark/doc trait
4. 获取文档内容
"""

[cognize_stack_frame_push]
title = "获取并分析飞书文档"
traits = ["lark/wiki", "lark/doc"]
description = """
...
"""

[program]
lang = "javascript"
code = """
const result = await exec(`lark-cli wiki spaces get_node --params '{"token": "xxx"}'`);
print(result);
"""

[talk]
target = "user"
message = """
## 飞书文档分析结果

### 文档基本信息
- 标题：【因子需求】商家_具备的行业资质名称
- 类型：docx
"""

[finish]
```

#### 2.4 独立的 `[traits]` 段落

**关键改进：**

| 项目 | 旧格式 | 新格式 |
|------|--------|--------|
| 位置 | 混在 `=== KNOWLEDGE ===` 中 | 独立的 `[traits]` 段落 |
| 组织方式 | 扁平列表 | 按 namespace 分组 |
| 示例 | 无或很少 | 每个 tool trait 包含完整示例 |
| 常见错误 | 无 | 正确 vs 错误对比 |

**新格式示例：**

```toml
[traits.active.lark.wiki]
description = "飞书知识库操作"
version = "1.0.0"

# 完整的使用示例
[traits.active.lark.wiki.examples]
shell_script = '''
lark-cli wiki spaces get_node --params '{"token":"wikcnxxxx"}'
'''

# 常见错误对比
[traits.active.lark.wiki.common_mistakes]
params_format = '''
# 正确
--params '{"token":"wikcnxxxx"}'

# 错误（不要这样做）
--params token=wikcnxxxx
'''
```

### 3. 双格式并行解析

**策略：**
- Output 解析器同时支持 TOML 和旧标记格式
- 先尝试 TOML 解析，如果成功且有有效内容则使用
- 否则回退到旧格式解析

**实现位置：** `kernel/src/flow/parser.ts`

**检测逻辑：**
```typescript
// 1. 检测是否是 TOML 格式（有 key = value 模式）
// 2. 尝试用 toml/parser.ts 解析
// 3. 如果成功，转换为 flow/parser.ts 的 ParsedOutput 格式
// 4. 否则回退到旧格式解析
```

---

## 文件变更清单

### 新增文件

| 路径 | 说明 |
|------|------|
| `kernel/src/toml/renderer.ts` | Context 对象转 TOML |
| `kernel/src/toml/parser.ts` | TOML 输出解析（含流式解析） |

### 修改文件

| 路径 | 说明 |
|------|------|
| `kernel/src/types/trait.ts` | 新增 namespace, type, version, examples, common_mistakes 字段 |
| `kernel/src/trait/loader.ts` | 支持 namespace/name、三分类、TRAIT.md |
| `kernel/src/trait/activator.ts` | traitId() 函数：`${namespace}/${name}` |
| `kernel/src/trait/registry.ts` | 只支持 `namespace/name.methodName()` 调用 |
| `kernel/src/flow/parser.ts` | 双格式并行解析（TOML + 旧格式） |
| `kernel/src/context/formatter.ts` | Input 格式切换为 TOML |

### 更新的 TRAIT.md

| 路径 | 说明 |
|------|------|
| `kernel/traits/kernel/computable/TRAIT.md` | TOML 格式说明、新旧对比、常见错误 |
| `kernel/traits/kernel/plannable/TRAIT.md` | TOML 格式示例 |
| `kernel/traits/kernel/talkable/TRAIT.md` | TOML 格式示例 |
| `library/traits/lark/wiki/TRAIT.md` | 使用示例、常见错误对比 |
| `library/traits/lark/doc/TRAIT.md` | 使用示例、常见错误对比 |

### 新增依赖

| 包名 | 版本 | 说明 |
|------|------|------|
| `smol-toml` | 1.6.1 | TOML 解析和序列化 |

---

## 新旧格式对比

### Output 格式对比

| 功能 | 旧格式 | 新 TOML 格式 |
|------|--------|-------------|
| 思考 | `[thought]` 内容 `[/thought]` | `[thought]` + `content = """..."""` |
| 代码 | `[program]` 代码 `[/program]` | `[program]` + `lang = "..."` + `code = """..."""` |
| 消息 | `[talk/user]` 内容 `[/talk]` | `[talk]` + `target = "user"` + `message = """..."""` |
| 子栈帧 | `[cognize_stack_frame_push.title]` 标题 `[/...]` | `[cognize_stack_frame_push]` + `title = "..."` |
| 完成 | `[finish]` | `[finish]` |

### 常见错误对比

**错误：使用旧格式的 `[talk/user]`**

```toml
# ❌ 错误：旧格式
[talk/user]
你好！
[/talk]

# ✅ 正确：TOML 格式
[talk]
target = "user"
message = """
你好！
"""
```

**错误：子栈帧使用嵌套段格式**

```toml
# ❌ 错误：旧的嵌套段格式
[cognize_stack_frame_push.title]
获取文档
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.traits]
lark/wiki
[/cognize_stack_frame_push.traits]

[/cognize_stack_frame_push]

# ✅ 正确：TOML 表格式
[cognize_stack_frame_push]
title = "获取文档"
traits = ["lark/wiki"]
```

---

## 测试验证

### 运行测试

```bash
cd kernel
bun test
```

### 测试覆盖

| 测试文件 | 覆盖内容 |
|----------|----------|
| `tests/trait.test.ts` | Trait 加载、激活、namespace/name 支持 |
| `tests/parser.test.ts` | Output 解析（双格式） |
| `tests/context.test.ts` | Context 构建和格式化（TOML 格式） |

---

## 风险评估与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 向后兼容问题 | 高 | 高 | 保持旧格式解析支持，双格式并行一段时间 |
| LLM 学习新格式成本 | 中 | 中 | 提供清晰的示例和常见错误对比 |
| 重构范围过大 | 高 | 高 | 分阶段实施，每阶段独立验证 |

---

## 后续优化

1. **Context 按需注入**
   - 根据任务类型只注入相关的 trait 内容
   - 详细 trait 说明通过 window 按需加载

2. **Kernel Trait 拆分**
   - `computable` 等 kernel trait 信息量过大
   - 可拆分为多个子 trait（program_format, thought_format 等）

---

## 相关文档

- `docs/哲学文档/gene.md` - G5 Context 格式化设计
- `docs/meta.md` - 全局架构索引
