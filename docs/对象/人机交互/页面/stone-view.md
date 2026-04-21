# StoneView — Stone 的多 Tab 详情

> 打开 `stones/{name}` 时看到的页面。**自渲染优先**——如果对象有 ui/index.tsx，优先显示。

## 两种模式

### 模式 1：自渲染（DynamicUI）

对象有 `ui/index.tsx` → 通过 Vite 动态 import 加载，全屏展示。

Header 显示：
- 头像 + 名称
- 右侧 Tab 切换（Readme / Data / Shared / **UI** ← 自渲染）
- **默认选中 UI Tab**（表示"这个对象有自定义界面"）

### 模式 2：ObjectDetail（通用）

对象没有 `ui/index.tsx` → 展示通用的 ObjectDetail 组件。

## ObjectDetail 的 Tabs

```
Header:  头像 | alan                         [Readme] [Data] [Effects] [Memory] [UI]
─────────────────────────────────────────
Content: （当前 Tab 的内容）
```

### ReadmeTab

双栏布局：
- **左栏** — Readme 正文（Markdown 渲染）
- **右栏** — ProfileCard（头像大图 + 基本信息）+ TraitsList + MethodsList

TraitsList 点击某 trait → 弹出 TraitModal 查看详情。

### DataTab

data.json 的键值对表格。复杂值（嵌套对象/数组）可展开折叠。

### EffectsTab

本对象参与过的 Session 列表。点击进入 FlowDetail（嵌入式 Flow 查看）。

### MemoryTab

memory.md 全文展示（Markdown 渲染）。

### UITab

如果对象有自定义 UI：显示自渲染内容（DynamicUI）。
如果没有：此 Tab 不显示。

## 头像策略

ObjectAvatar：
- 基于 name 的 hash 选颜色
- 首字母作为文字
- 无需后端数据（离线可用）

详见 [../原子组件.md](../原子组件.md)。

## 降级策略

自渲染失败 → 自动切到 ObjectDetail，无报错页。

## 源码位置

```
kernel/web/src/features/StoneView/
├── index.tsx               ← 判断有无 ui/index.tsx 并分派
├── ObjectDetail.tsx        ← 通用详情
├── ReadmeTab.tsx
├── DataTab.tsx
├── EffectsTab.tsx
└── MemoryTab.tsx
```
