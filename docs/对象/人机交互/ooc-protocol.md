# ooc:// 协议 — 前端内部链接系统

> 对象间导航的统一寻址方式。让"引用其他对象 / 文件"可被前端识别和拦截。

## 格式

```
ooc://object/{name}                       ← 指向一个 Stone 对象
ooc://file/{name}/{path}                  ← 指向对象的共享文件
ooc://view/{相对路径}                     ← 指向对象的 View（2026-04-21 新增，取代旧 ooc://ui/）
                                            Stone 级：ooc://view/stones/{name}/views/{viewName}/
                                            Flow 级：  ooc://view/flows/{sid}/objects/{name}/views/{viewName}/
                                            尾部斜杠代表整个 view 目录（默认指向 frontend.tsx）
ooc://action/{action_id}                  ← 指向某个 action（可选）
ooc://thread/{thread_id}                  ← 指向某个线程（可选）
ooc://issue/{issue_id}                    ← 指向某个 Issue
ooc://task/{task_id}                      ← 指向某个 Task
```

## 在 Markdown 中的用法

对象生成的 markdown 里可以写：

```markdown
请查看 [alan 的 readme](ooc://object/alan) 了解背景。
相关数据文件：ooc://file/researcher/data.csv
对应 Issue：[ISSUE-001](ooc://issue/ISSUE-001)
```

前端的 **MarkdownContent** 组件会识别这些链接：

- **不跳转到外部**（不是 http/https，浏览器不处理）
- **打开 OocLinkPreview 侧滑面板**
- 预览内容根据链接类型决定

## 链接类型与预览

| 链接类型 | 预览内容 |
|---|---|
| `ooc://object/X` | 对象名片：头像 + whoAmI + Traits + Public Methods |
| `ooc://file/X/path` | 文件内容预览（Markdown 渲染或 CodeMirror） |
| `ooc://view/X/...` | View 路径（OocNavigateCard 跳转进 FlowView 的 View tab；预览展示路径字符串） |
| `ooc://issue/X` | Issue 摘要卡片 |
| `ooc://task/X` | Task 摘要卡片 |
| `ooc://action/X` | Action 完整详情 |
| `ooc://thread/X` | 线程摘要（节点状态 + 最近 action） |

## 实现

### 前端拦截

```tsx
// MarkdownContent.tsx
function onLinkClick(e: MouseEvent, href: string) {
  if (href.startsWith("ooc://")) {
    e.preventDefault();
    openOocLinkPreview(href);
    return;
  }
  // 其他链接：浏览器正常跳转
}
```

### 解析

```typescript
function parseOocLink(url: string): OocLink {
  const match = url.match(/^ooc:\/\/(\w+)\/(.+)$/);
  if (!match) return null;
  const [, type, rest] = match;
  switch (type) {
    case "object": return { type: "object", name: rest };
    case "file":   return parseFileLink(rest);
    case "issue":  return { type: "issue", id: rest };
    // ...
  }
}
```

## 在对话中的用途

### 1. 明确引用

对象回复时引用其他对象：

```
alan: 这个问题需要 [filesystem](ooc://object/filesystem) 配合。
```

用户看到链接，点击预览，快速理解 alan 在说谁。

### 2. 附带上下文

对象提供数据：

```
bruce: 测试结果在 ooc://file/bruce/test-results.json
```

用户点击直接看文件内容。

### 3. 协作参考

```
supervisor: 这次讨论记录在 [ISSUE-001](ooc://issue/ISSUE-001)
```

跨 Session 可引用同一个 Issue——因为 Session ID 需要额外带（例如 `ooc://issue/{sid}/ISSUE-001`）。具体格式在实现中细化。

## 为什么不用常规 URL

常规 URL（如 `/stones/alan`）：
- 看起来像外部链接
- 点击会导航离开当前页面
- 难以和普通文本区分

`ooc://` 明确表达"这是 OOC 内部资源"：
- 浏览器不会尝试跳转（未知 scheme）
- 前端可以拦截，提供自定义预览
- 对对象（LLM）来说，语义清晰（一眼看出引用类型）

## 源码位置

```
kernel/web/src/lib/ooc-protocol.ts    ← 解析 + 类型
kernel/web/src/components/OocLinkPreview.tsx
kernel/web/src/components/MarkdownContent.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— 让对象生成的内容"活"起来
- **G6**（关系即网络）— 链接让关系可导航
