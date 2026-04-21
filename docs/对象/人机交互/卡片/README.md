# 卡片组件 — 信息展示的基本单元

> ActionCard 和 TalkCard 是 OOC 最核心的两种卡片。它们有共同的设计语言。

## 两种卡片

| 卡片 | 用途 | 主要字段 |
|---|---|---|
| **ActionCard** | 展示单条 action | thinking / text / tool_use / mark_inbox |
| **TalkCard** | 展示单条对话消息 | from → to，content |

## 共同设计

两者都用 **Safari tab 风格圆角过渡**：

```
┌─────────────────────────────────────┐
│  CardHeader                          │
│  [头像] [类型 Badge] [时间] [工具栏]  │
├─────────────────────────────────────┤
│  CardBody                            │
│                                      │
│  (内容)                              │
│                                      │
└─────────────────────────────────────┘
```

## ActionCard

### CardHeader

- 对象头像（ObjectAvatar）
- **类型 Badge**：thinking / text / tool_use / mark_inbox
  - 对 tool_use：显示工具名 + 参数摘要（如 `open(command=program)`）
- 时间戳
- 工具栏：Zoom-in / Copy / Ref

### CardBody

根据 action 类型渲染：

- **thinking / text** — MarkdownContent 渲染
- **tool_use** — 显示工具名 + 完整参数 + 返回结果（结构化展示）
- **mark_inbox** — 显示标记的消息 id + action（ack/ignore/todo）

### ZoomSheet

点击 Zoom-in 按钮 → 打开 Sheet 侧滑面板，显示 action 的完整详情（未截断）。

## TalkCard

### CardHeader

- 发送方头像
- **from → to** 标签（如 `alan → bruce`）
- `[talk]` 类型标签
- 时间戳
- 工具栏（同 ActionCard）

### CardBody

- MarkdownContent 渲染消息内容
- 识别 `ooc://` 链接（见 [../ooc-protocol.md](../ooc-protocol.md)）
- 识别 `@mention`（点击可跳转）

### ZoomSheet

展开消息完整详情（包括 mentions 列表、reply 关系等）。

## 通用行为

### Copy

把内容复制到剪贴板（markdown 格式）。

### Ref

生成 `ooc://action/{id}` 链接并复制。可用于在其他消息中引用此 action。

## 源码位置

```
kernel/web/src/components/
├── ActionCard.tsx
├── TalkCard.tsx
├── CardHeader.tsx           ← 共用
├── CardBody.tsx             ← 共用
└── ZoomSheet.tsx            ← 共用
```

## 与基因的关联

- **G10**（行动记录不可变）— 卡片展示的 action 从不改写
- **G11**（UI 即面孔）— 卡片是信息的主要可视化单元
