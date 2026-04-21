# ChatPage — 对话页

> 用户与对象的主对话界面。区别于 MessageDock（固定 Supervisor），ChatPage 是**对任意对象**的对话。

## 结构

```
┌──────────────────────────────────────┬─────────────┐
│                                      │             │
│   对话时间线                          │  对象信息   │
│   ┌──────────────┐                   │  面板       │
│   │ [用户] 你好   │                   │             │
│   └──────────────┘                   │  Readme/    │
│          ┌──────────────┐            │  Data/      │
│          │ [alan] 你好  │            │  Shared     │
│          └──────────────┘            │             │
│   ...                                 │             │
│                                       │             │
├───────────────────────────────────────┤             │
│  [输入框...]                          │             │
└───────────────────────────────────────┴─────────────┘
```

## 组件

### ChatTimeline

对话时间线。混合展示：
- **TalkCard**（消息）— 用户消息 / 对象回复
- **ActionCard**（Action）— 对象的 thinking / tool_use / text

按时间排序。

详见 [../卡片/README.md](../卡片/README.md)。

### FloatingInput

底部浮动输入框：
- 多行输入
- `@` mention（触发 MentionPicker）
- 发送按钮（或 Cmd+Enter）

### ObjectInfoPanel

右侧对象信息面板。三个 Tab：

- **Readme** — 对象的 readme 内容
- **Data** — data.json 键值对
- **Shared** — files/ 下的共享文件列表

让用户对"正在和谁对话"有直观了解。

### MentionPicker

输入 `@` 时出现的下拉框：
- 搜索所有对象（按名字模糊匹配）
- 显示头像 + `talkable.whoAmI`
- 选中后插入 `@name`

## 对话目标

ChatPage 的 URL 通常是 `chat/{objectName}`，表明"和这个对象对话"。

消息发送：

```
POST /api/chat/{objectName}/message
  body: { content, mentions }
→ 后端 talk(target=objectName, message={from: user, content})
→ 对应对象的 Flow 处理
→ SSE 推送对方的回复
```

## 源码位置

```
kernel/web/src/features/ChatPage/
├── index.tsx
├── ChatTimeline.tsx
├── FloatingInput.tsx
├── ObjectInfoPanel.tsx
└── MentionPicker.tsx
```
