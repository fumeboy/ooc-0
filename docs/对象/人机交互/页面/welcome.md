# WelcomePage — 无活跃 Session 时的首页

## 场景

用户首次打开 OOC，或关闭所有 Session 后，Stage 展示 WelcomePage。

## 结构

```
┌─────────────────────────────────────────┐
│                                         │
│       OOC — Object-Oriented Context    │
│    让上下文组织为活的对象生态           │
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │ alan │  │bruce │  │ fs   │  ...     │  ← 对象概览卡片
│  └──────┘  └──────┘  └──────┘          │
│                                         │
│  [输入框：和我说说你想做什么...]       │
│                                         │
└─────────────────────────────────────────┘
```

## 系统介绍

顶部简短介绍 OOC 的核心理念（从 `docs/meta.md` 摘出简化版）。

## 对象概览卡片

从 World 的 relations 展示所有顶级对象：

- 头像（ObjectAvatar）
- 名称
- `talkable.whoAmI`（一句话介绍）

点击对象卡片 → 打开 Stone 详情页。

## 输入框

用户输入文本，发送 → 新建 Session + 消息发给 Supervisor。

## 源码位置

`kernel/web/src/features/WelcomePage.tsx`
