# Stage — 主内容区

> 中间的核心区域。当前打开的视图在此展示。

## 组成

```
┌──────────────────────────────────────┐
│  EditorTabs  [tab1 x] [tab2 x] [+]   │  ← IDE 风格标签栏
├──────────────────────────────────────┤
│  Breadcrumb: docs / 哲学 / genes...  │  ← 路径面包屑
│                          [🔄]        │  ← RefreshButton
├──────────────────────────────────────┤
│                                       │
│                                       │
│          视图内容                     │  ← 由 ViewRegistry 分发
│                                       │
│                                       │
└──────────────────────────────────────┘
```

## EditorTabs — IDE 风格标签栏

多 tab 切换 + 关闭。类似 VS Code 的标签栏：

- 顶部**路径面包屑**
- 小圆角 label 样式 tab
- 关闭按钮（x）
- 可右键菜单（Close Others / Close All）

### tabKey 决定是否复用

打开同一路径**不新开 tab**（复用已有）。这由 ViewRegistry 注册的 `tabKey` 决定。

例如：打开 `flows/sess_1/issues/ISSUE-001` 两次，只有一个 tab。

## Breadcrumb — 路径面包屑

在 Tab 和 Content 之间显示当前打开文件的完整路径：

```
docs / 哲学 / genes / g01-数据即对象.md
```

点击各段可导航回去。

## RefreshButton — 手动刷新

点击触发当前视图的 `refresh()`。用途：

- SSE 断线时手动拉最新
- 调试时验证"不靠 SSE 数据是否正确"

## ViewRegistry — 视图分发

路径 → 视图组件 的映射。详见 [../view-registry.md](../view-registry.md)。

## 源码位置

```
kernel/web/src/features/Stage/
├── index.tsx
├── EditorTabs.tsx
├── Breadcrumb.tsx
└── RefreshButton.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— Stage 是主展示区
