# 迭代进度展示 + 导航卡片推送

> 两个独立功能：A) MessageDock 顶部展示 Flow 实时迭代进度；B) 对象通过消息格式约定向用户推送可点击的导航卡片。

## 功能 A：迭代进度实时展示

### 动机

后端存在多层迭代限制（单 Flow 100 轮、全局 200 轮、talk 100 轮），但前端完全不可见。用户无法感知当前对话消耗了多少资源、离上限还有多远。

### 设计

#### 后端：新增 SSE 事件 `flow:progress`

**事件结构**：

```typescript
{
  type: "flow:progress";
  objectName: string;
  taskId: string;
  iterations: number;         // 当前 Flow 已执行轮次
  maxIterations: number;      // 单 Flow 上限 (100)
  totalIterations: number;    // 全局已执行轮次（所有 Flow 合计）
  maxTotalIterations: number; // 全局上限 (200)
}
```

**触发点与发射策略**：

两种运行模式各有一个发射点，互不重复：

1. **Scheduler 模式**（多 Flow 协作）：由 Scheduler 在 `run()` 方法的 for 循环内，`entry.iterations++; totalIterations++;`（scheduler.ts:144-145）之后发射。Scheduler 持有全局计数和每个 entry 的迭代数，数据最完整。
2. **ThinkLoop 独立模式**（单 Flow，无 Scheduler）：由 ThinkLoop 在 while 循环内 `iteration++`（thinkloop.ts:116）之后发射，此时 `totalIterations = iterations`。

Scheduler 调用 ThinkLoop 时传入 `maxIterations=1`，ThinkLoop 在此模式下不发射进度事件（由 Scheduler 统一发射），避免重复。判断方式：ThinkLoop 接收一个可选参数 `emitProgress?: boolean`（默认 true），Scheduler 调用时传 false。

**前端只展示入口 Flow 的进度**：Scheduler 可能同时运行多个 Flow（round-robin），但 MessageDock 只关心用户发起的入口 Flow。前端 useSSE 收到 `flow:progress` 时，只有当 `event.taskId` 匹配当前 `activeSessionIdAtom` 时才更新 `flowProgressAtom`。

**改动文件**：

| 文件 | 改动 |
|------|------|
| `kernel/src/server/events.ts` | SSEEvent 联合类型新增 `flow:progress` |
| `kernel/src/flow/thinkloop.ts` | 新增 `emitProgress` 参数，独立模式下在 `iteration++` 后发射进度事件，需 import `emitSSE` |
| `kernel/src/world/scheduler.ts` | 在 `entry.iterations++; totalIterations++` 后发射进度事件，需 import `emitSSE`；调用 ThinkLoop 时传 `emitProgress: false` |

#### 前端：MessageDock 顶部进度条

**新增 atom**：

```typescript
// store/progress.ts
interface FlowProgress {
  objectName: string;
  taskId: string;
  iterations: number;
  maxIterations: number;
  totalIterations: number;
  maxTotalIterations: number;
}
export const flowProgressAtom = atom<FlowProgress | null>(null);
```

**useSSE hook 扩展**：

- 监听 `flow:progress` 事件：仅当 `event.taskId` 匹配当前 `activeSessionIdAtom` 时更新 `flowProgressAtom`，忽略其他 Flow 的进度事件。
- 监听 `flow:end` 事件：仅当 `event.taskId` 匹配当前 `flowProgressAtom` 的 `taskId` 时清空进度（设为 null），避免子 Flow 结束误清入口 Flow 的进度。
- `flow:progress` 事件不推入 `lastFlowEventAtom`，避免触发不必要的 `debouncedRefresh` 刷新。在 useSSE 的事件分发中单独处理。

**新增组件 `ProgressIndicator`**：

- 位置：MessageDock 顶部（消息列表上方）
- 展示：`iterations / maxIterations` 文字 + 细进度条
- 颜色策略：取 `Math.max(iterations/maxIterations, totalIterations/maxTotalIterations)` 作为进度比例
  - < 60%：默认色（neutral）
  - 60-80%：提示色（amber）
  - > 80%：警告色（red）
- 隐藏条件：`flowProgressAtom === null`（无活跃 Flow）

**改动文件**：

| 文件 | 改动 |
|------|------|
| `kernel/web/src/api/types.ts` | SSEEvent 类型新增 `flow:progress` |
| `kernel/web/src/store/` | 新增 `progress.ts`（flowProgressAtom） |
| `kernel/web/src/hooks/useSSE.ts` | 处理 `flow:progress` 和 `flow:end` 事件 |
| `kernel/web/src/features/MessageSidebar.tsx`（或 MessageDock） | 顶部插入 ProgressIndicator |
| `kernel/web/src/components/ProgressIndicator.tsx` | 新增组件 |

### 数据流

```
Scheduler 每轮调度后
  → eventBus.emit("flow:progress", { iterations, max, total, totalMax })
  → SSE 推送到前端
  → useSSE 更新 flowProgressAtom
  → MessageDock 顶部 ProgressIndicator 响应式渲染

Flow 结束时
  → eventBus.emit("flow:end")
  → useSSE 清空 flowProgressAtom
  → ProgressIndicator 隐藏
```

---

## 功能 B：ooc:// 导航卡片推送

### 动机

对象（如 supervisor）在执行任务过程中可能生成文档、UI 或其他内容。目前对象只能 talk 纯文本给用户，用户需要自己去找对应的文件。需要一种机制让对象主动引导用户查看特定内容。

### 设计

#### 消息格式约定

**普通 ooc:// 链接**（已有，不变）：消息文本中直接写 `ooc://object/sophia`，MarkdownContent 已能识别并渲染为可点击链接，打开 OocLinkPreview 侧滑面板。

**导航卡片**（新增）：用 `[navigate]` 标记包裹：

```
[navigate title="项目看板" description="当前任务进度总览"]ooc://file/objects/supervisor/shared/kanban.md[/navigate]
```

属性：
- `title`（必填）— 卡片标题
- `description`（可选）— 卡片描述文字
- 标记内的 URL 必须是合法的 `ooc://` 链接

#### 前端解析

**解析策略：预提取 + 占位符替换**

`[navigate]` 标记与 Markdown 的 `[text](url)` 链接语法存在冲突风险，因此采用预提取方案：在 Markdown 渲染前提取所有 `[navigate]` 块，替换为 HTML comment 占位符（HTML comment 能安全穿越 Markdown 解析），渲染后再将占位符替换为 React 组件。

**解析函数 `parseNavigateBlocks(text)`**：

```typescript
interface NavigateBlock {
  title: string;
  description?: string;
  url: string;
  index: number; // 占位符索引
}

interface ParseResult {
  cleanText: string;           // [navigate] 块被替换为占位符后的文本
  blocks: NavigateBlock[];     // 提取出的导航块
}
```

正则：`/\[navigate\s+title="([^"]+)"(?:\s+description="([^"]*)")?\]\s*(ooc:\/\/\S+)\s*\[\/navigate\]/g`

注意：URL 匹配用 `\S+`（非空白字符）而非 `[^\[]+`，避免跨行匹配意外内容。

**处理流程**：

1. `parseNavigateBlocks(text)` 提取所有 `[navigate]` 块，每个替换为 `<!--ooc-nav-0-->`, `<!--ooc-nav-1-->` ...
2. 将 `cleanText` 交给 ReactMarkdown 渲染（HTML comment 被忽略，不影响 Markdown 解析）
3. 渲染后，在 MarkdownContent 组件中扫描输出，将 `<!--ooc-nav-N-->` 占位符替换为 `<OocNavigateCard>` React 组件
4. 如果 URL 格式不合法（不是 `ooc://` 开头），降级为纯文本展示

**集成位置**：MarkdownContent 组件内部，在调用 ReactMarkdown 前后各加一步处理。

**改动文件**：

| 文件 | 改动 |
|------|------|
| `kernel/traits/talkable/readme.md` | 追加导航卡片格式文档 |
| `kernel/web/src/lib/navigate-parser.ts` | 新增 `parseNavigateBlocks()` 解析函数 |
| `kernel/web/src/components/OocNavigateCard.tsx` | 新增卡片组件 |
| `kernel/web/src/components/ui/MarkdownContent.tsx` | 集成预提取 + 占位符替换逻辑 |
| `kernel/web/src/store/session.ts` | 卡片点击导航需要 import `editorTabsAtom` / `activeFilePathAtom`（已有，无需新增） |

#### 新增组件 `OocNavigateCard`

```typescript
interface OocNavigateCardProps {
  title: string;
  description?: string;
  url: string; // ooc:// URL
}
```

**样式**：
- 圆角卡片，带左侧彩色边框（与 OOC 主题一致）
- 图标（ExternalLink 或 Navigation 图标）
- 标题 + 描述文字
- "打开" 按钮（右侧）

**点击行为**：
- 解析 `ooc://` URL 类型（复用 `lib/ooc-url.ts` 的 `parseOocUrl`）
- `ooc://object/{name}` → 打开 StoneView（设置 editorTabs + activeFilePath 为 `stones/{name}`）
- `ooc://file/objects/{name}/shared/{path}` → 打开对应文件 tab（设置 editorTabs + activeFilePath）
- 其他 / 解析失败 → 打开 OocLinkPreview 侧滑面板（降级）

#### talkable trait 文档更新

在 `kernel/traits/talkable/readme.md` 的 "ooc:// 链接协议" 章节后追加导航卡片用法说明和示例。

### 数据流

```
LLM 输出 [talk/user] 含 [navigate]...[/navigate]
  → parser 提取为 talk 消息内容
  → SSE flow:message 推送到前端
  → MessageDock 渲染消息气泡
  → MarkdownContent 识别 [navigate] 块
  → 渲染 OocNavigateCard 组件（卡片样式）
  → 用户点击 "打开" 按钮
  → ViewRouter 导航到对应页面
```

---

## 不做的事

- 不新建 kernel trait（复用 talkable）
- 不自动跳转页面（卡片需用户主动点击）
- 不改 talk() API 签名（纯消息格式约定）
- 不展示 talk 轮次计数（只展示 ThinkLoop 迭代进度）

## 测试策略

- `parseNavigateBlocks` 单元测试：正常格式、缺少属性、多个块、URL 不合法降级、跨行内容不匹配
- `ProgressIndicator` 颜色逻辑单元测试：验证 `Math.max(flow%, global%)` 阈值计算（< 60% neutral, 60-80% amber, > 80% red）
- 后端 `flow:progress` 事件：验证 Scheduler 模式和 ThinkLoop 独立模式下各自正确发射，且不重复
- 前端 useSSE 过滤：验证只有匹配 `activeSessionIdAtom` 的 `flow:progress` 事件更新 atom，子 Flow 的 `flow:end` 不误清入口 Flow 进度
- 前端集成：手动验证 MessageDock 进度条显示/隐藏、颜色变化、卡片渲染和点击导航
