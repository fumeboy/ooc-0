# FlowView — 单个 Flow 的详情

> 打开 `flows/{sid}/objects/{name}` 时看到的页面。

## 结构

```
┌────────────────────────────────────────────┐
│ Header:                                    │
│  头像 | alan (running)        [Tabs]       │
├────────────────────────────────────────────┤
│                                            │
│                                            │
│         Readme 全屏展示                    │
│                                            │
│                                            │
├────────────────────────────────────────────┤
│ ╭──╮                                        │
│ ├──┤  ← iOS 风格装饰条                     │
│ ╰──╯                                        │
│                                            │
│  [Timeline] [Process] [Data] [Memory] [UI]│
│                                            │
│  当前 Tab 的内容                           │
└────────────────────────────────────────────┘
```

## Header

- 头像
- 名称
- 状态 Badge（running / waiting / done / failed）
- 右侧 Tabs 按钮组（切换底部抽屉的 Tab）

## 主体：Readme 全屏

上部分（Header 下方）展示该对象的 Readme 全屏——让用户先理解"这是什么对象"。

## 底部抽屉

iOS 风格——默认 90% 高度，可拖动收起。

### TimelineTab

时间线，混合展示：
- 消息（TalkCard）
- actions（ActionCard）

按时间排序。与 ChatPage 的 ChatTimeline 类似，但不限于某次对话。

### ProcessTab

行为树视图——复用 ProcessView 组件。详见 [../行为树可视化.md](../行为树可视化.md)。

### DataTab

分栏设计：
- **左栏** — Flow 级 data.json
- **右栏** — Stone 级 data.json（对比查看）

### MemoryTab

会话记忆（`flows/{sid}/objects/{name}/memory.md`）。

### UITab

Flow 的自渲染 UI。加载 `ui/pages/*.tsx`（多页）通过 DynamicUI。

## PausedPanel（条件渲染）

如果当前 Flow 在 pausing 状态，抽屉顶部显示 PausedPanel：

- **Context** 预览（llm.input.txt 内容）
- **LLM Output** 编辑器（llm.output.txt，可修改）
- **Resume** 按钮

详见 [../../认知/context/pause.md](../../认知/context/pause.md)。

## 源码位置

```
kernel/web/src/features/FlowView/
├── index.tsx
├── TimelineTab.tsx
├── ProcessTab.tsx
├── DataTab.tsx
├── MemoryTab.tsx
└── PausedPanel.tsx
```
