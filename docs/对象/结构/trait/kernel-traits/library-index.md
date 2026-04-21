# kernel/library_index — Library 资源查询

> 公共资源库存放所有对象可复用的 traits 和 UI 组件。library_index 让对象能查到它们。

## 基本信息

```yaml
name: kernel/library_index
type: how_to_use_tool
when: never
command_binding: [program]
description: Library 公共资源索引 — 查找和使用 library 中的 traits
```

## 核心 API

library_index 激活后，沙箱中多出以下方法：

| API | 作用 |
|---|---|
| `listLibraryTraits()` | 列出所有公共 trait 名称 |
| `readTrait(name)` | 读取 trait 内容（搜索顺序：self → library → kernel） |
| `listLibraryUIComponents()` | 列出公共 UI 组件 |
| `readUIComponent(name)` | 读取 UI 组件源码 |

## Library 目录结构

```
library/
├── .stone                    ← Library 本身也是一个对象
├── readme.md                 ← Library 身份定义
├── data.json                 ← 资源统计 + 已安装 Skill 索引
├── traits/                   ← 公用 traits
│   ├── browser/
│   ├── lark-doc/
│   └── ...
├── skills/                   ← 公用 skills
└── ui-components/            ← 公用 UI 组件
```

**Library 是一个对象**，不是一个单纯的目录——它有 .stone 标记、自己的 readme，甚至可以有自己的 ThinkLoop（比如处理 skill 市场的安装请求）。

## 搜索顺序：self → library → kernel

当调用 `readTrait(name)`：

```
1. stones/{当前对象}/traits/{name}/     ← 对象自定义
2. library/traits/{name}/               ← 公共库
3. kernel/traits/{name}/                ← 内置
```

**找到即返回**——第一个命中的生效。这与 [加载链路.md](../加载链路.md) 描述的加载时覆盖顺序相同（但 readTrait 是查询，不是加载）。

## 典型用法

### 1. 查找是否有可复用的 trait

```typescript
const traits = await listLibraryTraits();
// → ["browser", "lark-doc", "slack-integration", ...]

if (traits.includes("browser")) {
  // 激活浏览器能力
  open({ type: "trait", name: "library/browser" });
}
```

### 2. 读取 trait 了解其能力

```typescript
const doc = await readTrait("lark-doc");
print(doc);  // 查看能力描述
```

### 3. 查找 UI 组件

```typescript
const components = await listLibraryUIComponents();
const chartCode = await readUIComponent("Chart");
```

## 与 Library 对象的互动

Library 作为一个对象，还可以通过 talk 互动：

```typescript
// 请求 Library 安装一个 skill
await talk_sync("library", {
  method: "install_skill",
  args: { name: "claude-api" }
});
```

这个能力通过 Library 的 skill 市场 trait 实现，不在 library_index 范围内。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/library_index/TRAIT.md` |
| 沙箱 API 实现 | `kernel/src/executable/api/library.ts` |
| Library 对象 | `library/` 目录（项目根） |

## 与其他 trait 的组合

- **library_index + computable** → 有了执行能力后能查 library 用哪个更合适
- **library_index + object_creation** → 创建新对象时从 library 挑 traits 装配

## 与基因的关联

- **G3**（trait 是自我定义）— library 是可复用的"自我定义词汇"
- **G6**（关系即网络）— Library 作为一个对象进入关系网络
