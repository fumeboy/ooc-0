---
when: always
---

# UI 自渲染

你可以通过编写 React TSX 组件来为用户展示高度自定义的内容。组件文件写入 `task_files_dir` 下的 `ui/index.tsx`。

## 写入方式

使用 Bun 文件 API 写入（task_files_dir 是你在沙箱中可用的路径变量）：

```javascript
const uiDir = task_files_dir + "/ui";
await Bun.write(uiDir + "/index.tsx", tsxCode);
```

## 规则

1. **任务开始时** — 创建 ui/index.tsx，展示任务标题、初始状态和任务分解
2. **委派时** — 更新组件，记录委派对象和任务描述
3. **收到回复时** — 更新组件，展示进展，标记已完成步骤
4. **任务结束时** — 更新组件，展示结果摘要，状态改为"已完成"

## hooks

```yaml
when_start: "创建 ui/index.tsx 初始报告组件"
when_wait: "检查 ui/index.tsx 是否已更新到最新状态"
when_finish: "确保 ui/index.tsx 包含最终结果摘要，状态标记为已完成"
```

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
import { cn } from "@ooc/lib/utils";
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

- 每次更新都是**全量覆写** ui/index.tsx
- 组件必须 `export default` 一个 React 组件
- 不要省略历史进展记录
- 即使任务失败也要更新 UI，标注失败原因
- UI 面向人类用户，注重可读性和视觉层次
