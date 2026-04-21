# MessageDock — 右侧消息坞

> 右侧消息面板。**仅桌面端 Flows 模式**。固定对话对象为 Supervisor。

## 为什么固定 Supervisor

每个 OOC Session 都有一个 Supervisor 作为总协调者。MessageDock 让用户**随时能和 Supervisor 对话**——不需要先找到它再打开。

如果用户想和其他对象对话：
- 打开对象的详情页，在 ChatPage 中交互
- 或通过 CommandPalette（Cmd+K）搜索后发消息

## 结构

```
┌─────────────────┐
│   Messages      │  ← MessageBubble（上）
│                 │
│                 │
│                 │
│                 │
├─────────────────┤
│ (streaming...)  │  ← StreamingIndicator
├─────────────────┤
│ [输入框]  [发送]│  ← MessageInput
└─────────────────┘
```

## MessageBubble — 消息气泡

- 用户消息：右对齐，灰色背景
- 对象消息：左对齐，白色背景
- 时间戳在 hover 时显示

支持：
- Markdown 渲染
- `ooc://` 链接识别
- 代码块高亮

## StreamingIndicator — 流式回复

当 Supervisor 正在回复（LLM 正在流式输出），这里实时展示 content 和 thinkingContent：

```
Thinking... 用户问了 X，我需要考虑 Y 和 Z ...
```

用户看到"对象在思考"的实时状态，避免等待焦虑。

## MessageInput — 消息输入框

- 多行输入（Cmd+Enter 发送）
- 支持 `@` 提及其他对象（触发 MentionPicker）
- 发送时消息投递到 supervisor.rootThread 的 inbox

## 折叠/展开

用户可折叠 MessageDock（右侧只留一个小按钮）。再点展开。折叠状态保存在 Jotai atom（`messageSidebarOpenAtom`）。

## 源码位置

```
kernel/web/src/features/MessageDock/
├── index.tsx
├── MessageBubble.tsx
├── StreamingIndicator.tsx
└── MessageInput.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— MessageDock 是持久对话通道
- **G8**（Effect 与 Space）— 用户输入是 Effect 的发起方
