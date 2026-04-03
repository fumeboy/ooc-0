# Library 资源统一与 Trait 引用机制重构

<!--
@ref docs/meta.md — extends — Library 概念与目录结构
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — readTrait/activateTrait 多位置搜索
@referenced-by kernel/src/world/world.ts — implemented-by — 移除 _traits_ref 自动加载
@referenced-by kernel/traits/library_index/ — updated-by — 文档与 API 更新
-->

## 变更概述

**日期**: 2026-03-31

**变更类型**: 架构重构 + 概念统一

**影响范围**:
- `library/skills/` 目录已删除（合并到 `library/traits/`）
- `library/traits/` 目录新增 12 个 trait（从 skill 转换）
- `readTrait()` / `activateTrait()` API 行为变更
- `_traits_ref` 自动加载机制已移除

---

## 背景与动机

### 问题 1: Skill 与 Trait 概念重叠

原设计中存在两个相似但不同的概念：

| 概念 | 位置 | 结构 | 激活方式 |
|------|------|------|----------|
| Skill | `library/skills/*.md` | 单文件 markdown | `readLibrarySkill()` 读取内容 |
| Trait | `library/traits/{name}/` | 目录结构 (readme.md + 可选 index.ts) | `_traits_ref` 自动加载 |

这两个概念本质上都是"能力模板"，区别仅在于：
- Skill 是"被动读取"
- Trait 是"主动加载"

### 问题 2: `_traits_ref` 自动加载不够灵活

原设计中，对象通过 `data.json` 中的 `_traits_ref` 字段引用 library trait：
```json
{
  "_traits_ref": ["git_ops", "http_client"]
}
```

**缺点**：
- 引用是"全有或全无"的——要么加载全部，要么不加载
- 无法按需加载（例如"只在需要时才激活某个 trait"）
- 无法只查看内容而不激活

### 解决方案

1. **概念统一**：所有公共能力统一为 Trait，存放于 `library/traits/`
2. **按需激活**：对象通过 `readTrait()` 查看内容，通过 `activateTrait()` 激活到当前栈帧
3. **多位置搜索**：API 按优先级搜索多个位置

---

## 具体变更

### 1. Skill 转换为 Trait

原 `library/skills/` 目录下的 12 个 skill 已转换为 `library/traits/` 目录结构：

| 原文件 | 新位置 | 变更说明 |
|--------|--------|----------|
| `agent-browser.md` | `library/traits/agent-browser/readme.md` | 添加 `when: never` |
| `agent-self-evolution.md` | `library/traits/agent-self-evolution/readme.md` | name 从 `self-improvement` 改为 `agent-self-evolution` |
| `ai-text-deodorizer.md` | `library/traits/ai-text-deodorizer/readme.md` | name 从 `humanizer-zh` 改为 `ai-text-deodorizer` |
| `competitive-intel.md` | `library/traits/competitive-intel/readme.md` | name 从 `competitive-intelligence` 改为 `competitive-intel` |
| `context-relay-setup.md` | `library/traits/context-relay-setup/readme.md` | 新增 frontmatter |
| `coze-web-fetch.md` | `library/traits/coze-web-fetch/readme.md` | 添加 `when: never` |
| `coze-web-search.md` | `library/traits/coze-web-search/readme.md` | 添加 `when: never` |
| `deep-reading.md` | `library/traits/deep-reading/readme.md` | 新增 frontmatter |
| `news-aggregator.md` | `library/traits/news-aggregator/readme.md` | name 从 `news-aggregator-skill` 改为 `news-aggregator` |
| `prd-assistant.md` | `library/traits/prd-assistant/readme.md` | name 从 `feature-spec` 改为 `prd-assistant` |
| `sessions-index.md` | `library/traits/sessions-index/readme.md` | 添加 `when: never` |

**未转换的文件**（索引文件）：
- `index.md` — skill 目录索引
- `skill_market_catalog.md` — 市场目录

**转换规则**：
1. 所有新增 trait 统一设置 `when: never`（默认不自动激活）
2. 文件名作为 trait name（而非 frontmatter 中的 `name` 字段）
3. 没有 frontmatter 的文件补充添加

### 2. 移除 `_traits_ref` 自动加载

**修改文件**: `kernel/src/world/world.ts`

**原逻辑**：
```typescript
private async _loadTraits(stone: Stone) {
  const traitsRef = Array.isArray(stone.data._traits_ref)
    ? stone.data._traits_ref.map(String)
    : [];

  const kernelTraits = await loadAllTraits("", kernelTraitsDir);
  const libTraits = await loadTraitsByRef(libraryTraitsDir, traitsRef);  // 自动加载
  const objectTraits = await loadAllTraits(objectTraitsDir, "");
  // ...
}
```

**新逻辑**：
```typescript
private async _loadTraits(stone: Stone) {
  /* 两层分别加载：kernel（基座能力）和 object（对象自定义） */
  const kernelTraits = await loadAllTraits("", kernelTraitsDir);
  const objectTraits = await loadAllTraits(objectTraitsDir, "");
  // library traits 不再自动加载，改用 readTrait() / activateTrait() 按需访问

  consola.info(`[World] library traits 已改为按需加载，使用 readTrait() / activateTrait() 访问`);
  // ...
}
```

### 3. API 扩展：多位置搜索

**修改文件**: `kernel/src/flow/thinkloop.ts`

**新增辅助函数**:
```typescript
/**
 * 按优先级查找 trait 目录
 * 优先级：自身 traits/ → library/traits/ → kernel/traits/
 * 返回找到的目录路径，找不到返回 null
 */
function findTraitDir(name: string): string | null {
  const selfDir = join(traitsDir, name);
  if (existsSync(selfDir)) return selfDir;

  const libDir = join(libraryTraitsDir, name);
  if (existsSync(libDir)) return libDir;

  const kernelDir = join(kernelTraitsDir, name);
  if (existsSync(kernelDir)) return kernelDir;

  return null;
}
```

**`readTrait()` 返回值变更**：

新增 `source` 字段，标识 trait 来源位置：

| source 值 | 来源位置 |
|-----------|----------|
| `"self"` | 对象自身 `stones/{name}/traits/` |
| `"library"` | 公共库 `library/traits/` |
| `"kernel"` | 内核 `kernel/traits/` |

**`readTrait()` 错误提示变更**：

原错误：
```
[错误] trait "xxx" 不存在
```

新错误：
```
[错误] trait "xxx" 不存在（已检查：自身 traits/、library/traits/、kernel/traits/）
```

**`activateTrait()` 同样支持多位置搜索**

---

## API 变更详解

### `readTrait(name)`

**变更前行为**：只搜索对象自身 `traits/` 目录

**变更后行为**：按优先级搜索三个位置：
1. `stones/{name}/traits/{name}/` （自身）
2. `library/traits/{name}/` （公共库）
3. `kernel/traits/{name}/` （内核）

**返回值**：
```typescript
{
  name: string,
  readme: string,        // readme.md 正文内容
  when: string,          // 激活条件（always/never/...）
  code: string | null,   // index.ts 源码（如有）
  source: string         // 新增：来源位置（self/library/kernel）
}
```

### `activateTrait(name)`

**变更前行为**：只搜索对象自身 `traits/` 和 `kernel/traits/`

**变更后行为**：按优先级搜索三个位置（同上）

**注意**：
- 激活的 trait 只在当前栈帧有效
- 当 focus 离开当前节点时自动失效

### `listLibrarySkills()` / `readLibrarySkill()`

**状态**：已废弃，但保持向后兼容

**`readLibrarySkill(name)` 新行为**：
1. 先尝试旧位置 `library/skills/{name}.md`（目录已删除，此路径无效）
2. 再尝试新位置 `library/traits/{name}/readme.md`

---

## 迁移指南

### 从 `_traits_ref` 迁移

**旧方式**（不再支持）：
```json
// stones/supervisor/data.json
{
  "_traits_ref": ["git_ops", "http_client"]
}
```

**新方式**：

方式 A：直接在需要时激活（推荐）
```javascript
// 在需要使用时
readTrait("git_ops");           // 先查看内容
activateTrait("git_ops");       // 再激活到当前栈帧
```

方式 B：维护可选的 `traits_index`（约定，非强制）
```markdown
# stones/supervisor/traits/traits_index/readme.md

---
name: traits_index
when: always
---

# 我的 Traits 索引

## 常用公共 Traits

| 名称 | 描述 | 使用场景 |
|------|------|----------|
| git_ops | Git 操作 | 需要版本控制时 |
| http_client | HTTP 客户端 | 需要调用外部 API 时 |
| news-aggregator | 新闻聚合 | 需要获取资讯时 |
```

### 从 `readLibrarySkill()` 迁移

**旧方式**：
```javascript
const content = readLibrarySkill("news-aggregator");
```

**新方式**：
```javascript
const info = readTrait("news-aggregator");
// info.readme 包含原 skill 的完整内容
// info.source === "library" 标识来源位置
```

### 快速参考表

| 操作 | 旧 API | 新 API |
|------|--------|--------|
| 查看 skill 内容 | `readLibrarySkill("name")` | `readTrait("name").readme` |
| 查看 trait 完整信息 | 无 | `readTrait("name")` |
| 激活 trait | `_traits_ref` 自动加载 | `activateTrait("name")` |
| 列出自身 traits | `listTraits()` | `listTraits()`（不变） |
| 列出公共 traits | `listLibraryTraits()` | `listLibraryTraits()`（不变） |
| 搜索公共 traits | `searchLibrary("关键词")` | `searchLibrary("关键词")`（不变） |

---

## 设计哲学

### 为什么选择 `when: never`？

所有从 skill 转换来的 trait 都设置了 `when: never`，这是有意的设计：

1. **按需加载**：对象应该在需要时才激活某个 trait，而不是让所有 trait 一直占用 context 空间
2. **减少干扰**：无关的 trait 描述不会污染当前任务的 context
3. **显式优于隐式**：`activateTrait("news-aggregator")` 清晰表达了"我现在需要这个能力"的意图

### 为什么移除 `_traits_ref`？

`_traits_ref` 的问题：
1. **全有或全无**：要么在 Flow 启动时加载所有引用的 trait，要么都不加载
2. **粒度太粗**：无法为某个子任务单独激活某个 trait
3. **不够灵活**：无法"先看看内容再决定是否激活"

新设计的优势：
1. **细粒度控制**：可以在任意栈帧激活任意 trait
2. **按需激活**：先 `readTrait()` 查看内容，再决定是否 `activateTrait()`
3. **自动清理**：离开当前节点时自动失效，不会污染后续 context

---

## 后续调整

在初次实现后，根据反馈进行了以下额外调整：

### 调整 1: `when` 字段支持自然语言条件

**修正**：文档中原来错误地说 "所有 library traits 都是 `when: never`"，实际上 `when` 字段支持三种形式：

| 值 | 含义 | 示例 |
|----|------|------|
| `"always"` | 始终激活 | `when: always` |
| `"never"` | 不自动激活 | `when: never` |
| 自然语言 | 条件激活 | `when: "用户需要搜索时"` |

**激活规则**（`kernel/src/trait/activator.ts`）：
- `when === "always"` → 自动激活
- `when === "never"` → 不激活（除非被依赖）
- **其他（自然语言）** → 仅当名称出现在作用域链中时激活

### 调整 2: `readTrait` 返回值移除 `code` 字段

**原返回值**：
```typescript
{
  name: string,
  readme: string,
  when: string,
  code: string | null,  // 已移除
  source: string
}
```

**新返回值**：
```typescript
{
  name: string,
  readme: string,
  when: string,
  source: string  // "self" | "library" | "kernel"
}
```

**原因**：`code`（index.ts 源码）是系统内部使用的，对象只需要 `readme.md` 的内容。方法调用通过激活后的两段式调用方式进行。

### 调整 3: 两段式方法调用

**变更位置**：`kernel/src/trait/registry.ts`

**原方式**：
```javascript
// 扁平式调用，可能产生命名冲突
methodFoo(arg1, arg2);
```

**新方式**（推荐）：
```javascript
// 两段式调用，明确指定所属 trait
traitBar.methodFoo(arg1, arg2);
```

**实现**：`buildSandboxMethods()` 返回值同时包含：
- 扁平化映射 `{ methodName: function }`（向后兼容）
- 嵌套映射 `{ traitName: { methodName: function, ... } }`（新方式）

**使用示例**：
```javascript
// 激活 trait
activateTrait("git_ops");

// 两段式调用（推荐）
git_ops.commit("feat: add feature", "完善功能");

// 扁平式调用（兼容）
commit("feat: add feature", "完善功能");
```

---

## 测试验证

### 运行测试

```bash
bun test kernel/tests/library.test.ts
bun test kernel/tests/trait.test.ts
```

### 测试结果

```
✓ kernel/tests/library.test.ts: 13 pass
✓ kernel/tests/trait.test.ts: 18 pass
```

### 测试覆盖的变更点

| 测试文件 | 覆盖的变更 |
|----------|------------|
| `library.test.ts` | `searchLibrary` 只搜索 traits 目录 |
| `trait.test.ts` | `loadAllTraits` 三层加载、`loadTraitsByRef` 按引用加载 |

---

## 回滚方案

如果需要回滚此变更：

1. **恢复 `library/skills/` 目录**：从 git 历史恢复
2. **恢复 `_traits_ref` 加载逻辑**：在 `world.ts` 中恢复相关代码
3. **回滚 `thinkloop.ts` 中的搜索逻辑**：恢复只搜索自身和 kernel 的行为

---

## 相关文档

- `docs/meta.md` — Library 概念与目录结构
- `kernel/traits/library_index/readme.md` — 最新使用说明
- `kernel/traits/library_index/index.ts` — API 实现
