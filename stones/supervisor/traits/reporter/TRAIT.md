---
name: reporter
namespace: self
when: never
command_binding:
  commands: ["return", "talk"]
---

# UI 自渲染

你可以通过编写 React TSX 组件来为用户展示高度自定义的内容。

Flow 级别的 UI 写入 `task_files_dir` 下的 `ui/pages/*.tsx`（多页模式，每个页面一个文件）。

## 引导用户查看页面

在 return 或 talk to user 时，使用 ooc link 导航卡片引导用户访问你创建的 UI 页面：

```
[navigate title="任务进展报告" description="查看详细的任务分解和执行状态"]ooc://ui/flows/{sessionId}/objects/{objectName}/ui/pages/report.tsx[/navigate]
```

其中 `{sessionId}` 和 `{objectName}` 用实际值替换。`ooc://ui/` 后面是相对于 World 根目录的真实路径。

用户点击导航卡片后，前端会自动打开对应的 Flow 视图并展示 UI 页面。

## 写入方式

```javascript
const pagesDir = task_files_dir + "/ui/pages";
await Bun.write(pagesDir + "/report.tsx", tsxCode);
```

## 规则

1. **任务开始时** — 创建页面，展示任务标题、初始状态和任务分解
2. **委派时** — 更新页面，记录委派对象和任务描述
3. **收到回复时** — 更新页面，展示进展，标记已完成步骤
4. **任务结束时** — 更新页面，展示结果摘要，状态改为"已完成"

## 可用依赖

组件可以 import 以下模块（使用 `@ooc` 路径别名）：

- `react` / `jotai` — React 核心
- `lucide-react` — 图标库
- `@ooc/api/client` — 数据获取 API（fetchFlow, fetchSessionTree 等）
- `@ooc/components/ui/*` — 原子组件（MarkdownContent, Badge 等）
- `@ooc/lib/utils` — 工具函数（cn 等）

## 示例

```tsx
import React, { useEffect, useState } from "react";
import { fetchFlow } from "@ooc/api/client";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function SupervisorReport({ sessionId, objectName }) {
  const [flow, setFlow] = useState(null);
  useEffect(() => {
    fetchFlow(sessionId).then(setFlow);
  }, [sessionId]);

  if (!flow) return <div style={{ padding: 16, color: "#888" }}>加载中...</div>;

  const tasks = [
    { name: "分析需求", status: "completed" },
    { name: "委派 coder 实现", status: "in_progress" },
    { name: "汇总结果", status: "pending" },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>任务进展</h2>
      <p style={{ color: "#666", marginTop: 4 }}>状态: {flow.status}</p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => (
          <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {t.status === "completed" && <CheckCircle size={16} color="green" />}
            {t.status === "in_progress" && <Clock size={16} color="orange" />}
            {t.status === "pending" && <AlertCircle size={16} color="#ccc" />}
            <span>{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 注意

- 每个页面文件必须 `export default` 一个 React 组件
- 每次更新都是**全量覆写**对应的页面文件
- 不要省略历史进展记录
- 即使任务失败也要更新 UI，标注失败原因
- UI 面向人类用户，注重可读性和视觉层次

## 验证 UI

每次写入页面文件后，**必须验证文件能否编译成功**：

```javascript
const uiPath = pagesDir + "/report.tsx";
await Bun.write(uiPath, tsxCode);

try {
  const code = await Bun.file(uiPath).text();
  new Bun.Transpiler({ loader: "tsx" }).transformSync(code);
  print("UI 验证通过");
} catch (e) {
  print("UI 编译失败:", e.message);
}
```
