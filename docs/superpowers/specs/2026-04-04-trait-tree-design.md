# Trait 树形结构与 Progressive Disclosure

> 日期: 2026-04-04
> 状态: 草案

## 问题

当前 OOC 系统的 `llm.input`（每次 ThinkLoop 发送给 LLM 的完整 Context）过于庞大。 在一个简单的 "hi" 对话场景中，Context 已达 ~84KB / 2208 行，且主要原因是 kernel trait 的 always-on 注入量过大——5 个 always-on kernel trait 合计 ~100KB，每轮全量注入，无论任务复杂度。

### 现状分析

以下是 supervisor 对象在一个简单 "hi" 对话中 llm.input.txt 的组成（Context 渲染后大小，非 TRAIT.md 原始文件大小）：

**5 个大型 always-on kernel trait（拆分目标，合计 ~68KB 渲染大小）**：

| Trait | TRAIT.md 原始大小 | Context 渲染大小 |
|-------|-------------------|-----------------|
| `kernel/cognitive-style` | ~18KB | ~30KB |
| `kernel/output_format` | ~9KB | ~28KB |
| `kernel/talkable` | ~10KB | ~18KB |
| `kernel/computable` | ~8KB | ~14KB |
| `kernel/reflective` | ~7KB | ~10KB |

**其他 always-on kernel trait（保持不变，合计 ~14KB 原始大小）**：

| Trait | 原始大小 | 说明 |
|-------|---------|------|
| `kernel/verifiable` | ~2KB | 已经足够精简 |
| `kernel/file_ops` | ~2.8KB | 文件操作 |
| `kernel/file_search` | ~2KB | 文件搜索 |
| `kernel/shell_exec` | ~2.3KB | Shell 执行 |
| `kernel/library_index` | ~5.3KB | Library 索引 |
| `kernel/web_search` | ~1.2KB | 网络搜索 |
| `kernel/issue-discussion` | ~0.7KB | Issue 讨论 |

**其他 Context 内容（合计 ~20KB）**：
- `[identity]` who_am_i: ~20KB
- `[traits.active..reporter]`: ~7.5KB
- catalog, directory, process, messages, paths, status: ~8KB

**总计**：~84KB（5 大 trait ~68KB + 其他 always-on ~14KB + 非注入内容 ~20KB）

核心问题：
1. **内容重复**：TOML 格式说明在 cognitive-style、output_format、computable 三个 trait 里重复出现
2. **全量注入**：5 个大型 always-on trait 把完整 API 文档、示例、反模式全部塞入 Context
3. **信息过载**：LLM 每轮要"阅读" ~68KB 的参考文档，影响对当前任务的注意力
4. **Library trait 平铺**：~30 个 lark trait 在 catalog 中各占一行，全部可见

## 设计目标

**主要目标**：提升 LLM 响应质量，减少信息过载导致的注意力分散。
成本降低是附带收益。

**设计原则**：参考 SKILL progressive disclosure 哲学，将大型的、重复的 kernel trait 进行拆分，保留精简的内容作为新的 always-on kernel trait，其余拆分为子 trait 由 OOC Object 按需加载。

支持 trait 分层（树形结构），默认只加载最上层的 traits，当上一层级的 trait 激活，下一层级的子 trait 的 description 列表才会加载到 context 中，然后 OOC Object 可以再自行按需加载。

## 核心设计：Trait 树形结构

### Trait ID 扩展为路径

**当前**：Trait ID = `namespace/name`（二级）
**新机制**：Trait ID = 文件路径（任意深度），对应文件目录树。

| 来源 | 根目录 | Trait ID | 文件路径 |
|------|--------|----------|----------|
| Kernel | `kernel/traits/` | `kernel/computable/output_format` | `kernel/traits/computable/output_format/TRAIT.md` |
| Library | `library/traits/` | `library/lark/doc` | `library/traits/lark/doc/TRAIT.md` |
| Object 私有 | `stones/{name}/traits/` | `reporter` | `stones/{name}/traits/reporter/TRAIT.md` |

**规则**：
- 每个 `TRAIT.md` 所在目录就是一个 trait
- 目录嵌套 = 父子关系
- 父 trait 的 `TRAIT.md` 放精简内容
- 子 trait 的 `TRAIT.md` 放详细内容
- Object 私有 trait 保持扁平，无需路径层级

### 三层 Progressive Disclosure 机制

```
层级 1 — 默认注入 Context
  └── 父 trait 的精简内容（always-on 部分）

层级 2 — 父 trait 激活后可见
  └── 子 trait 的 {id, description} 列表出现在 trait_catalog 中
  └── 对象可通过 readTrait("kernel/computable/output_format") 查看详情

层级 3 — 显式激活后注入
  └── activateTrait("kernel/computable/output_format") 注入子 trait 完整内容到当前栈帧
```

**加载行为变化**：

| 操作 | 之前 | 之后 |
|------|------|------|
| 默认 Context | 5 个 always-on trait 全量注入 (~100KB) | 精简版注入 (~5KB) |
| activateTrait("kernel/computable") | 注入完整内容 | 注入精简版 + 展示子 trait 列表 |
| activateTrait("kernel/computable/output_format") | 不支持 | 注入子 trait 全文到当前栈帧 |
| readTrait("kernel/computable/output_format") | 不支持 | 返回子 trait 全文（不注入 Context） |

## Kernel Trait 拆分方案

### 现有 trait 处理

| 当前 trait | 大小 | 处理 |
|-----------|------|------|
| `kernel/cognitive-style` | ~30KB | **拆入** `kernel/computable` 的子 trait |
| `kernel/output_format` | ~28KB | **合并入** `kernel/computable/output_format` |
| `kernel/talkable` | ~18KB | **精简** + 拆子 trait |
| `kernel/reflective` | ~10KB | **精简** + 拆子 trait |
| `kernel/verifiable` | ~3.5KB | **保持不变** |
| `kernel/computable` | ~14KB | **吸收** cognitive-style + output_format 后重组 |

### 新目录结构

```
kernel/traits/
├── computable/
│   ├── TRAIT.md                     ← always-on 精简版 (~2KB)
│   ├── output_format/
│   │   └── TRAIT.md              ← on-demand: 完整 TOML 规范 + 示例 + 错误模式
│   ├── program_api/
│   │   └── TRAIT.md              ← on-demand: 完整 API 参考文档
│   ├── stack_api/
│   │   └── TRAIT.md              ← on-demand: 栈帧 API 详细说明
│   └── multi_thread/
│       └── TRAIT.md              ← on-demand: 多线程 API
│
├── talkable/
│   ├── TRAIT.md                     ← always-on 精简版 (~1KB)
│   ├── cross_object/
│   │   └── TRAIT.md              ← on-demand: 跨对象函数调用协议
│   ├── ooc_links/
│   │   └── TRAIT.md              ← on-demand: ooc:// 协议 + 导航卡片
│   └── delivery/
│       └── TRAIT.md              ← on-demand: 交付规范
│
├── reflective/
│   ├── TRAIT.md                     ← always-on 精简版 (~800B)
│   ├── memory_api/
│   │   └── TRAIT.md              ← on-demand: 记忆 API 详细文档
│   └── reflect_flow/
│       └── TRAIT.md              ← on-demand: ReflectFlow 角色定义
│
├── verifiable/
│   └── TRAIT.md                     ← 保持不变 (~1KB)
│
│  ── 以下 conditional trait 保持不变 ──
├── plannable/    debuggable/    object_creation/
├── web_search/   file_search/    file_ops/
├── shell_exec/   testable/      reviewable/
├── library_index/  issue-discussion/
│
│  ── 删除 ──
├── cognitive-style/                ← 内容已拆入 computable/ 子树
├── output_format/                  ← 内容已合并入 computable/output_format
```

### always-on 精简内容设计

#### `kernel/computable/TRAIT.md` (~2KB)

内容范围：
1. 输出格式速查表（TOML 表名 + 用途）
2. 核心输出规则（5 条）
3. 核心 API 签名（print, getData, setData, persistData, talk, reflect, local, activateTrait, readTrait, createTrait, moveFocus, stack_throw）
4. 工具方法优先级（readFile > Bun.file 等）
5. 子 trait 列表（指向子 trait 的 name + 一句话描述）

不包含：
- 完整示例代码
- 反模式说明
- 详细参数说明
- TOML 格式演变历史
- 流式输出细节

#### `kernel/talkable/TRAIT.md` (~1KB)

内容范围：
1. talk() 签名和基本用法
2. 社交原则（5 条）
3. 回复规则（reply_to）

不包含：
- 跨对象函数调用协议
- ooc:// 链接细节
- 导航卡片
- 交付规范

#### `kernel/reflective/TRAIT.md` (~800B)
内容范围：
1. 记忆三层模型概述
2. reflect() 签名
3. 记忆维护原则（3 条）

不包含：
- 记忆 API 详细文档
- ReflectFlow 角色定义

### 预期效果

| 指标 | 之前 | 之后 | 改善 |
|------|------|------|------|
| 5 个大型 always-on kernel trait 渲染大小 | ~68KB | ~5KB | 93% 削减 |
| 其他 always-on trait（不变） | ~14KB | ~14KB | 不变 |
| 简单对话场景 Context 总大小 | ~84KB | ~35KB | 58% 削减 |
| trait_catalog lark 条目数 | ~30 行 | 1 行（折叠） | 97% 削减 |
| TOML 格式说明重复次数 | 3 次 | 1 次 | 消除重复 |

> 注：总 Context 从 ~84KB 降至 ~35KB 而非更激进的目标，是因为 identity (~20KB) + 其他 always-on trait (~14KB) + catalog/directory/process/messages (~8KB) 保持不变。进一步的优化需要在后续迭代中处理这些不变部分。

## Library Trait 树形化

### 新目录结构

```
library/traits/
├── lark/
│   ├── TRAIT.md                     ← 路由层：飞书能力概览 + 认证说明
│   ├── doc/                         ← 文档操作
│   ├── wiki/                        ← 知识库
│   ├── im/                          ← 即时通讯
│   ├── calendar/                    ← 日历
│   ├── sheets/                      ← 电子表格
│   ├── mail/                        ← 邮箱
│   ├── drive/                       ← 云空间
│   ├── task/                        ← 任务
│   ├── base/                        ← 多维表格
│   ├── minutes/                     ← 妙记
│   ├── vc/                          ← 视频会议
│   ├── event/                       ← 事件订阅
│   ├── contact/                     ← 通讯录
│   ├── whiteboard/                  ← 画板
│   ├── shared/                      ← 认证/配置共享基础
│   ├── openapi-explorer/            ← OpenAPI 探索
│   ├── skill-maker/                 ← Skill 制作
│   ├── workflow-standup-report/     ← 日程待办摘要
│   └── workflow-meeting-summary/    ← 会议纪要整理
├── http/
│   ├── TRAIT.md                     ← 路由层：HTTP 能力概览
│   └── client/
├── git/
│   ├── TRAIT.md                     ← 路由层：Git 能力概览
│   └── ops/
├── agent/
│   └── browser/
├── sessions/
│   └── index/
├── news/
│   └── aggregator/
├── ai/
│   └── text-deodorizer/
├── prd/
│   └── assistant/
└── session/
    └── kanban/
```

### trait_catalog 展示变化

**之前**（平铺 ~30 个 lark trait）：
```
### Inactive (use activateTrait to enable)
- lark/doc: 飞书云文档：创建和编辑...（长描述）
- lark/wiki: 飞书知识库：管理...（长描述）
...（25+ more lines）
```

**之后**（折叠展示）：
```
### Inactive
- library/lark: 飞书全域能力（文档/知识库/IM/日历/邮件/表格/任务...）→ activateTrait to see sub-traits
- library/http: HTTP 请求能力
- library/git: Git 版本控制操作
- library/agent/browser: 无头浏览器自动化
- library/sessions/index: Session 索引与筛选
- library/news/aggregator: 新闻聚合器
- library/ai/text-deodorizer: 去 AI 味
- library/prd/assistant: PRD 编写助手
- library/session/kanban: 任务看板
```

**当 `library/lark` 被激活时，catalog 扩展**：
```
### Active
- library/lark: 飞书全域能力
  → library/lark/doc: 文档创建/编辑/搜索
  → library/lark/wiki: 知识库管理
  → library/lark/im: 消息收发/群聊
  → library/lark/calendar: 日历/日程
  ...（子 trait 列表）
```

## 代码变更清单

### 0. 类型系统变更

#### `TraitDefinition` 变更

当前 `TraitDefinition` 使用 `namespace: string` + `name: string` 两个扁平字段。

变更方案：**保留 `namespace` 作为第一级（来源标识），`name` 改为完整相对路径**。

```typescript
// 之前
interface TraitDefinition {
  namespace: string;  // "kernel" | "library" | ""
  name: string;      // "cognitive-style" | "lark/doc" | "reporter"
}

// 之后
interface TraitDefinition {
  namespace: string;  // "kernel" | "library" | "" (不变)
  name: string;      // "computable/output_format" | "lark/doc" | "reporter"
  // namespace/name 组合为完整 ID: "kernel/computable/output_format"
  children?: TraitDefinition[];  // 子 trait 列表（树形结构）
  parent?: string;               // 父 trait ID（可选）
}
```

**Trait ID 构造**：`traitId = namespace ? namespace + "/" + name : name`
- `kernel` + `computable/output_format` → `kernel/computable/output_format`
- `library` + `lark/doc` → `library/lark/doc`
- `""` + `reporter` → `reporter`

**名称验证正则**：`/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/`（已支持多级路径）

#### `TraitTree` 数据结构

```typescript
interface TraitTree {
  id: string;                    // 完整 trait ID
  path: string;                  // TRAIT.md 的文件系统绝对路径
  trait: TraitDefinition;        // 解析后的 trait 定义
  children: TraitTree[];         // 子 trait 树节点
  depth: number;                 // 在树中的深度（根 = 0）
}
```

#### 子 Trait 的 Frontmatter 规则

子 trait 的 TRAIT.md 文件**可以有自己的 frontmatter**：
- `when`：子 trait 的激活条件。对于 on-demand 子 trait，使用 `when: never`（只能通过 `activateTrait` 激活）
- `deps`：子 trait 可以声明依赖。依赖也会随激活一起加载
- `hooks`：子 trait 的 hooks 与父 trait 的 hooks **叠加**（都生效，LIFO 顺序）
- `methods`：子 trait 的方法只在激活时注册到 MethodRegistry

**子 trait 不继承父 trait 的 frontmatter**——每个 TRAIT.md 是独立的。

#### Always-on 父 trait 的子 trait 可见性

**关键规则**：当父 trait 是 always-on 时，其子 trait 的 **description 列表**自动出现在 `trait_catalog` 中。

这不是按需的——因为父 trait 始终处于激活状态，所以子 trait 列表始终可见。这就是 Level 2 的含义：对于 always-on kernel trait，Level 2 是**自动生效**的。

区别在于：
- Level 2（子 trait 列表可见）≠ Level 3（子 trait 全文注入）
- LLM 能看到"有 kernel/computable/output_format 这个 trait 可用"，但需要 `activateTrait` 才能获得其完整内容

### 1. `kernel/src/trait/loader.ts`

**变更**：递归扫描 + 树形索引构建

- `scanTraits(dir)` 改为递归扫描：遇到含 `TRAIT.md` 的目录时，继续扫描其子目录（子目录也可能含 `TRAIT.md`）
- 新增 `buildTraitTree(traits)` 函数：将扁平的 TraitDefinition 列表构建为树形结构
- `TraitTree` 索引缓存在 World 级别，随 trait 文件变更刷新
- `findTraitDir(id)` 重写为路径解析：`kernel/computable/output_format` → `kernel/traits/computable/output_format/TRAIT.md`
  - 当前逻辑：直接拼接 `traits/{name}/TRAIT.md`
  - 新逻辑：去掉 namespace 前缀，拼接为 `{root}/traits/{relativePath}/TRAIT.md`
- `findLoadedTrait(id)` 同步更新：使用树形索引查找，支持多级路径
- `normalizeTraitLookup(name)` 更新：解析多级路径的 namespace/name

### 2. `kernel/src/trait/activator.ts`

**变更**：Progressive Disclosure 逻辑

- `activateTrait("kernel/computable")` 时：
  1. 加载父 trait 精简内容
  2. 将子 trait 的 {id, description} 列表注入 trait_catalog
  3. 不加载子 trait 全文

- `activateTrait("kernel/computable/output_format")` 时：
  1. 加载子 trait 全文注入当前栈帧
  2. 标记该子 trait 为 active

- `readTrait("kernel/computable/output_format")` 时：
  1. 返回子 trait 全文（不注入 Context）

### 3. `kernel/src/context/builder.ts`

**变更**：精简 Context 构建

- always-on trait 只注入 TRAIT.md 内容（现在是精简版）
- trait_catalog 区域改为树形展示
  - 未激活的根 trait： 单行折叠
  - 已激活的根 trait: 展开子 trait 列表
- 消除 TOML 格式说明的重复注入

### 4. Kernel Trait 文件拆分

- 新写 `kernel/traits/computable/TRAIT.md`（精简 ~2KB）
- 从 `cognitive-style` + `output_format` 提取 → `kernel/traits/computable/output_format/TRAIT.md`
- 从 `cognitive-style` 提取 → `kernel/traits/computable/program_api/TRAIT.md`
- 从 `cognitive-style` + `computable` 提取 → `kernel/traits/computable/stack_api/TRAIT.md`
- 从 `cognitive-style` 提取 → `kernel/traits/computable/multi_thread/TRAIT.md`
- 精简 `kernel/traits/talkable/TRAIT.md`（~1KB）
- 从 `talkable` 提取 → `kernel/traits/talkable/cross_object/TRAIT.md`
- 从 `talkable` 提取 → `kernel/traits/talkable/ooc_links/TRAIT.md`
- 从 `talkable` 提取 → `kernel/traits/talkable/delivery/TRAIT.md`
- 精简 `kernel/traits/reflective/TRAIT.md`（~800B）
- 从 `reflective` 提取 → `kernel/traits/reflective/memory_api/TRAIT.md`
- 从 `reflective` 提取 → `kernel/traits/reflective/reflect_flow/TRAIT.md`
- 删除 `kernel/traits/cognitive-style/`
- 删除 `kernel/traits/output_format/`

### 5. Library Trait 重命名

- 各 lark 子目录下的 TRAIT.md 中 trait ID 从 `"lark/doc"` 改为 `"library/lark/doc"`
- 新增 `library/traits/lark/TRAIT.md`（路由层内容）
- 不做向后兼容，所有旧引用统一更新为新 ID

### 6. 测试更新

- `kernel/tests/trait.test.ts`：测试递归扫描、树形索引、Progressive Disclosure
- `kernel/tests/context.test.ts`：测试精简后的 Context 大小、trait_catalog 格式
- 新增 trait ID 解析测试

## 不做向后兼容

所有旧的 trait 引用（如 `lark/doc`、`kernel/cognitive-style`）都需要统一更新为新的路径格式。不做旧 ID 的自动兼容映射。

### 迁移映射

| 旧 ID | 新 ID | 变更类型 |
|-------|-------|---------|
| `kernel/cognitive-style` | （删除） | 内容拆入 `kernel/computable/` 子树 |
| `kernel/output_format` | `kernel/computable/output_format` | 合并入 computable |
| `kernel/computable` | `kernel/computable`（精简） | 父 trait 内容精简 |
| `kernel/talkable` | `kernel/talkable`（精简） | 父 trait 内容精简 |
| `kernel/reflective` | `kernel/reflective`（精简） | 父 trait 内容精简 |
| `kernel/verifiable` | `kernel/verifiable`（不变） | 无变更 |
| `lark/doc` | `library/lark/doc` | namespace + 路径变更 |
| `lark/wiki` | `library/lark/wiki` | namespace + 路径变更 |
| `lark/*` | `library/lark/*` | namespace + 路径变更 |
| `http/client` | `library/http/client` | namespace 变更 |
| `git/ops` | `library/git/ops` | namespace 变更 |

### `readTrait` 与 `activateTrait` 的 ThinkLoop 交互

由于 ThinkLoop 每轮重建 Context，两个 API 的行为差异如下：

| API | 行为 | 跨轮持久性 |
|-----|------|-----------|
| `readTrait(id)` | 在 program 中调用，返回 TRAIT.md 全文作为 print 输出。**不注入 Context，不影响后续轮次** | 无。下轮 Context 重建后不可见 |
| `activateTrait(id)` | 写入 `node.activatedTraits`，**影响后续所有轮次的 Context 构建** | 有。activatedTraits 持久化在行为树节点上 |

**LLM 使用建议**（写入精简版 TRAIT.md 中）：
- 需要一次性参考的 API 文档 → 用 `readTrait`
- 需要在多轮中持续遵循的规则 → 用 `activateTrait`

### Hook 叠加规则

当父 trait 和子 trait 都定义了 hooks（如 `when_stack_pop`）时：
- **两者都生效**，按 LIFO 顺序执行（子 trait 的 hooks 先执行）
- `collectFrameHooks` 在 `cognitive-stack.ts` 中已经遍历所有激活的 traits，无需特殊处理
- 子 trait 的 hooks 在父 trait 的 hooks **之后**注册，执行时子 trait 先执行

## 与 OOC 哲学的对齐

- **G5（注意力与遗忘）**：Progressive Disclosure 是结构化的遗忘——让不相关的信息退场，为当前任务腾出空间
- **G13（认知栈）**：每个栈帧激活自己需要的 trait，不同帧有不同的认知上下文
- **G3（Trait 可组合）**：树形结构让 trait 的组合更加自然——父 trait 提供框架，子 trait 提供细节
- **G12（经验沉淀）**：对象在实践中学会何时需要 activateTrait，沉淀为直觉
