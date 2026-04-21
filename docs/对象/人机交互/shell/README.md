# Shell — 整体布局骨架

> 前端的最外层结构：三栏 LeftRail + Stage + MessageDock。

## 三栏布局

```
┌─────────────┬────────────────────────────┬────────────┐
│             │                            │            │
│             │                            │  Message   │
│  LeftRail   │          Stage             │  Dock      │
│             │                            │            │
│   (导航)    │       (主内容)             │ (对话面板) │
│             │                            │            │
│             │                            │            │
└─────────────┴────────────────────────────┴────────────┘
```

## 三个子文档

| 文档 | 内容 |
|---|---|
| [left-rail.md](left-rail.md) | 左侧栏：Logo + Tab 切换 + 文件树 + 热力图 |
| [stage.md](stage.md) | 主内容区：EditorTabs + 视图分发 |
| [message-dock.md](message-dock.md) | 右侧消息坞：与 Supervisor 对话 |

## 响应式

- **桌面端**：三栏完整展示
- **平板**：LeftRail 可折叠
- **移动端**：只显示 Stage；其他通过弹出层触发

## 源码位置

```
kernel/web/src/
├── App.tsx                       ← Shell 入口
├── features/LeftRail/            ← 左侧栏
├── features/Stage/               ← 中间主区
└── features/MessageDock/         ← 右侧坞
```
