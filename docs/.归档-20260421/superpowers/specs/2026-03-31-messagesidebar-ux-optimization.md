---
name: MessageSidebar UX 优化
description: MessageSidebar 流式输出完善 + 滚动行为优化 + Program/Action 卡片简化
type: reference
created: 2026-03-31
status: spec
---

# MessageSidebar UX 优化设计文档

## 背景

在体验 `kernel/web` 界面时发现两个体验问题：

1. **流式输出不完整**：MessageSidebar 有流式输出 `[talk]` 信息，但 `[thought]`、`[program]`、`[action]` 的流式支持不完整或缺失
2. **滚动体验差**：消息输出太快时自动滚动到底部，导致用户阅读历史消息时被打断，搞不清上下文位置

## 问题分析

### 问题 1：流式输出不一致

当前后端 SSE 事件支持情况：

| 段落标记 | 内容类型 | 流式事件 | 当前状态 |
|---------|---------|---------|---------|
| `[thought]` | Markdown 思考内容 | `stream:thought` | ✅ 已支持 |
| `[talk/target]` | Markdown 消息内容 | `stream:talk` | ✅ 已支持 |
| `[program]` / `[program/shell]` | JavaScript/Shell 代码 | `stream:program` | ❌ 缺失 |
| `[action/toolName]` | JSON 参数 | `stream:action` | ❌ 缺失 |

**代码位置确认：**

- 后端 `kernel/src/flow/thinkloop.ts` 第 702 行：`streamingSection: "thought" | "talk" | null`，不支持 `"program"` 和 `"action"`
- 后端 `kernel/src/server/events.ts`：只有 `stream:thought` 和 `stream:talk` 事件类型定义
- 前端 `kernel/web/src/store/session.ts`：只有 `streamingThoughtAtom` 和 `streamingTalkAtom`

### 问题 2：自动滚动打断阅读

当前 `MessageSidebar.tsx` 第 135-140 行：

```typescript
useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }
}, [timeline.length, streamingTalk, streamingThought]);
```

每次新消息或流式更新都强制滚动到底部，用户无法停留在历史位置阅读。

### 问题 3：Program/Action 卡片展示冗余

当前 `ActionCard.tsx` 对 `program` 和 `action` 类型采用双栏布局：
- 左栏：Program/Action（content/input）
- 右栏：Result（output）

**问题**：
1. 很多时候用户不关心执行结果，只关心执行了什么操作
2. Result 可能很长，占用大量空间
3. 流式输出时，只有 content 有数据，result 为空

## 设计方案

### 一、流式事件扩展

#### 1.1 后端事件类型扩展

`kernel/src/server/events.ts` 新增：

```typescript
// 新增事件类型
| { type: "stream:program"; objectName: string; taskId: string; lang?: "javascript" | "shell"; chunk: string }
| { type: "stream:action"; objectName: string; taskId: string; toolName: string; chunk: string }
| { type: "stream:program:end"; objectName: string; taskId: string }
| { type: "stream:action:end"; objectName: string; taskId: string; toolName: string }
```

#### 1.2 后端流式解析扩展

`kernel/src/flow/thinkloop.ts`：

- `streamingSection` 类型扩展：`"thought" | "talk" | "program" | "action" | null`
- 新增 `streamingProgramLang`：`"javascript" | "shell"`
- 新增 `streamingActionToolName`：`string | null`
- `checkLineTag` 已支持 `[program]`、`[action/toolName]` 检测，只需扩展 `endCurrentSection` 和流式推送逻辑

#### 1.3 前端类型扩展

`kernel/web/src/api/types.ts`：同步更新 `SSEEvent` 类型

#### 1.4 前端 State 扩展

`kernel/web/src/store/session.ts` 新增：

```typescript
/** 流式 program 内容（逐步累积） */
export const streamingProgramAtom = atom<{
  taskId: string;
  lang?: "javascript" | "shell";
  content: string;
} | null>(null);

/** 流式 action 内容（逐步累积） */
export const streamingActionAtom = atom<{
  taskId: string;
  toolName: string;
  content: string;
} | null>(null);
```

#### 1.5 前端 SSE 事件处理

`kernel/web/src/hooks/useSSE.ts` 新增处理：

- `stream:program`：累积到 `streamingProgramAtom`
- `stream:program:end`：清空 `streamingProgramAtom`
- `stream:action`：累积到 `streamingActionAtom`
- `stream:action:end`：清空 `streamingActionAtom`

#### 1.6 前端流式渲染

`MessageSidebar.tsx` 渲染逻辑：

- 检测 `activeFlow?.status === "running"`
- 渲染 `streamingProgram`：使用简化的 ActionCard（只展示 content + loading 状态）
- 渲染 `streamingAction`：使用简化的 ActionCard（只展示 content + loading 状态）

---

### 二、滚动行为优化（方案 A：新消息按钮）

#### 2.1 核心逻辑

```typescript
// 检测用户是否在底部
const isUserAtBottom = useCallback(() => {
  if (!scrollRef.current) return true;
  const { scrollTop, clientHeight, scrollHeight } = scrollRef.current;
  // 阈值：允许底部有 50px 的偏差
  const threshold = 50;
  return scrollTop + clientHeight >= scrollHeight - threshold;
}, []);
```

#### 2.2 状态管理

新增状态：

```typescript
/** 用户是否主动滚动到非底部位置 */
const [userScrolledUp, setUserScrolledUp] = useState(false);

/** 未读消息数量（用户不在底部期间新增的消息数） */
const [unreadCount, setUnreadCount] = useState(0);

/** 滚动到顶部前的 timeline 长度，用于计算新增消息数 */
const lastKnownLengthRef = useRef(0);
```

#### 2.3 交互规则

| 场景 | 行为 |
|-----|------|
| 初始状态 | userScrolledUp = false，自动滚动 |
| 用户向上滚动 | 检测到 `!isUserAtBottom()`，设置 `userScrolledUp = true`，记录 `lastKnownLength = timeline.length` |
| 新消息到达（userScrolledUp = true） | 1. 不自动滚动<br>2. 计算 `unreadCount = timeline.length - lastKnownLength`<br>3. 显示「↓ N 条新消息」按钮 |
| 用户滚动回底部 | 设置 `userScrolledUp = false`，重置 `unreadCount = 0` |
| 点击「新消息」按钮 | 平滑滚动到底部，重置状态 |

#### 2.4 滚动监听

```typescript
useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;

  const handleScroll = () => {
    const atBottom = isUserAtBottom();
    if (atBottom && userScrolledUp) {
      // 用户手动滚回底部
      setUserScrolledUp(false);
      setUnreadCount(0);
    } else if (!atBottom && !userScrolledUp) {
      // 用户主动向上滚动
      setUserScrolledUp(true);
      lastKnownLengthRef.current = timeline.length;
    }
  };

  el.addEventListener("scroll", handleScroll, { passive: true });
  return () => el.removeEventListener("scroll", handleScroll);
}, [userScrolledUp, isUserAtBottom]);
```

#### 2.5 新消息到达时的处理

修改原有的自动滚动 effect：

```typescript
/* 自动滚动逻辑 */
useEffect(() => {
  if (!userScrolledUp && scrollRef.current) {
    // 用户在底部时才自动滚动
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  } else if (userScrolledUp) {
    // 用户不在底部时，更新未读计数
    setUnreadCount(timeline.length - lastKnownLengthRef.current);
  }
}, [timeline.length, streamingTalk, streamingThought, streamingProgram, streamingAction, userScrolledUp]);
```

#### 2.6 按钮 UI

按钮样式：
- 悬浮在消息列表底部中央
- 圆角胶囊样式
- 文字：「↓ N 条新消息」
- 点击时平滑滚动到底部

---

### 三、Program/Action 卡片简化

#### 3.1 设计原则

| 场景 | 展示内容 |
|-----|---------|
| **消息列表中（默认）** | content（input）+ 状态指示器 |
| **Maximize（放大查看）** | content + result |

#### 3.2 状态指示器

在卡片 header 中显示：

| 状态 | 指示器样式 |
|-----|-----------|
| loading/执行中 | 旋转的 Loader2 图标 + 无文字（或「执行中」） |
| success/OK | 绿色圆点或 ✓ 图标 + 「OK」文字 |
| failed/错误 | 红色圆点或 ✗ 图标 + 「FAIL」文字 |

#### 3.3 ActionCard 组件修改

`kernel/web/src/components/ui/ActionCard.tsx`：

**现有逻辑（第 170 行）：**
```typescript
const isProgram = action.type === "program";
const isAction = action.type === "action";
const isProgramOrAction = isProgram || isAction;
```

**修改点：**

1. **消息列表渲染（非 Modal）**：
   - 移除 Result 右栏
   - 只保留 Program/Action 左栏
   - 状态指示器显示在 header 中（已有类似逻辑，需要强化）

2. **Maximize Modal 渲染**：
   - 保持原有双栏布局
   - 完整展示 content + result

**关键代码位置：**

- 第 308-332 行：双栏布局逻辑
- 第 388-406 行：Modal 内渲染逻辑

#### 3.4 流式卡片的特殊处理

流式 `streamingProgram` 和 `streamingAction` 渲染时：
- 没有 `result`，只有 `content`
- 状态固定为 `loading`
- 流式结束后，等待 `flow:action` 事件到达后替换为正式 ActionCard

---

## 修改文件清单

### 后端修改

| 文件路径 | 修改内容 |
|---------|---------|
| `kernel/src/server/events.ts` | 新增 `stream:program`、`stream:action` 事件类型 |
| `kernel/src/flow/thinkloop.ts` | 流式解析支持 `program` 和 `action` 段落 |

### 前端修改

| 文件路径 | 修改内容 |
|---------|---------|
| `kernel/web/src/api/types.ts` | 同步 `SSEEvent` 类型 |
| `kernel/web/src/store/session.ts` | 新增 `streamingProgramAtom`、`streamingActionAtom` |
| `kernel/web/src/hooks/useSSE.ts` | 处理新的流式事件 |
| `kernel/web/src/features/MessageSidebar.tsx` | 滚动行为优化 + 流式 program/action 渲染 |
| `kernel/web/src/components/ui/ActionCard.tsx` | Program/Action 卡片简化（默认隐藏 result） |

## 边界情况处理

### 1. 流式事件与正式事件的衔接

- 流式 `stream:*:end` 事件到达时，不清空 atom（参考 `stream:talk:end` 的处理方式）
- 正式 `flow:action` 事件到达并渲染后，再清空对应的 streaming atom
- 或采用 `stream:talk:end` 的现有逻辑：标记 `ended: true`，等待正式事件

### 2. 用户快速滚动切换

- 滚动监听使用 `passive: true` 提升性能
- 未读计数在用户滚回底部时自动清零

### 3. 多类型流式内容同时出现

- timeline 中同一时刻可能存在：
  - `streamingThought`
  - `streamingProgram`
  - `streamingAction`
  - `streamingTalk`
- 按现有顺序渲染在 timeline 之后

## 非目标

以下内容不在本次优化范围内：

1. `ProcessView`（行为树视图）中的 ActionCard 展示：本次只优化 MessageSidebar 场景
2. ChatPage Timeline：仅聚焦 MessageSidebar 组件
3. 流式输出的 Result：Result 是执行后产生的，无法流式输出

## 验证标准

1. **流式输出验证**：
   - `[program]` 段落内容能实时流式展示
   - `[action/toolName]` 段落内容能实时流式展示

2. **滚动行为验证**：
   - 用户向上滚动后，新消息不会强制跳到底部
   - 出现「N 条新消息」按钮
   - 点击按钮能平滑滚动到底部
   - 滚动到底部后按钮消失

3. **卡片简化验证**：
   - MessageSidebar 中 program/action 卡片默认不显示 result
   - 卡片 header 正确显示 loading/OK/FAIL 状态
   - 点击 Maximize 能看到完整的 result
