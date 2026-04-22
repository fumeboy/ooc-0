---
namespace: self
name: reporter
when: always
command_binding:
  commands: ["return", "talk"]
description: 任务结束或阶段性汇报时产出报告文档 + 可选交互 View + 导航卡片
deps: []
---

<!-- 2026-04-22：when 从 never → always。
     原因：当 when=never + command_binding 时，reporter 只在 `talk/return` 的 form 打开期间被加载到 knowledge；
     form 关闭后立即卸载。若 LLM 在 open/close 间震荡，它会看到"有 reporter → 没 reporter"反复切换，
     引发自我怀疑的病态循环（参见 finish/20260422 相关 bugfix 讨论）。
     reporter 仅 supervisor 拥有（namespace=self），总是加载不会污染其他对象的 context。 -->


# Reporter — 报告能力（2026-04-21 新版）

你在 **return** 或 **talk to user** 时，可以（非强制）产出以下资产，引导用户查看你的产出：

## 两类产出

### 1. 报告文档（Markdown）

**路径**：`files/reports/{reportName}.md`（Flow 级：`flows/{sid}/objects/supervisor/files/reports/{reportName}.md`）

**何时产出**：
- 纯信息汇报（无需用户决策时）
- 需要永久记录的结果
- 可被别的对象作为知识引用

**写入方式**（在 program 沙箱中）：

```javascript
const reportPath = `${self_files_dir}/reports/report-2026-04-21.md`;
await callMethod("computable/file_ops", "writeFile", {
  path: reportPath,
  content: `# 任务报告\n\n## 结果\n\n...`,
});
```

### 2. 交互 View（Views 机制）

**路径**：`views/{reportName}/` 三件套（Flow 级：`flows/{sid}/objects/supervisor/views/{reportName}/`）

```
views/{reportName}/
├── VIEW.md          ← namespace=self, kind=view
├── frontend.tsx     ← React 组件（默认导出）
└── backend.ts       ← 可选，ui_methods / llm_methods
```

**何时产出**：
- 需要用户提交表单 / 打分 / 反馈
- 需要动态展示（如图表、可点击的链接列表）
- 希望用户的点击/输入能"唤醒"你继续思考

**写入方式**：

```javascript
/* 目录规划 */
const viewDir = `${task_files_dir}/../views/feedback-2026-04-21`;
/* 注：task_files_dir 指向 files/，View 在对象根 views/ 下，平级向上一层 */

/* 1. VIEW.md */
await callMethod("computable/file_ops", "writeFile", {
  path: `${viewDir}/VIEW.md`,
  content: `---
namespace: self
name: feedback-2026-04-21
kind: view
type: how_to_interact
when: never
description: 任务完成后的反馈收集表单
---

# 反馈表单`,
});

/* 2. frontend.tsx */
await callMethod("computable/file_ops", "writeFile", {
  path: `${viewDir}/frontend.tsx`,
  content: `import React, { useState } from "react";

export default function FeedbackView({ sessionId, objectName, callMethod }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    await callMethod("self:feedback-2026-04-21", "submitFeedback", { rating, comment });
    setDone(true);
  };

  if (done) return <div>已收到反馈，感谢！</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3>请为本次结果评分</h3>
      <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="评论（可选）" />
      <button onClick={submit}>提交</button>
    </div>
  );
}
`,
});

/* 3. backend.ts */
await callMethod("computable/file_ops", "writeFile", {
  path: `${viewDir}/backend.ts`,
  content: `export const ui_methods = {
  submitFeedback: {
    description: "用户提交反馈",
    params: [
      { name: "rating", type: "number", description: "1-5", required: true },
      { name: "comment", type: "string", description: "", required: false },
    ],
    fn: async (ctx, { rating, comment }) => {
      const key = \`feedback.\${Date.now()}\`;
      ctx.setData(key, { rating, comment });
      ctx.notifyThread && ctx.notifyThread(\`[UI] 用户反馈: \${rating} 星 - \${comment || "（无评论）"}\`);
      return { ok: true };
    },
  },
};
export const llm_methods = {};
`,
});
```

**验证编译**：

```javascript
for (const file of ["VIEW.md", "frontend.tsx", "backend.ts"]) {
  const content = await callMethod("computable/file_ops", "readFile", { path: `${viewDir}/${file}` });
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    try {
      new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).transformSync(content);
    } catch (e) {
      print(`${file} 编译失败: ${e.message}`);
      return;
    }
  }
}
print("View 三件套写入完成");
```

## 引导用户：[navigate] 卡片

在 return summary / talk to user 的消息末尾，输出导航卡片：

### 引用报告文档

```
[navigate title="任务报告" description="本次任务的完整报告"]
ooc://file/stones/supervisor/files/reports/report-2026-04-21.md
[/navigate]
```

（Flow 级的报告用 `ooc://file/flows/{sid}/objects/supervisor/files/reports/...`）

### 引用交互 View

```
[navigate title="反馈表单" description="请花 30 秒为本次结果打分"]
ooc://view/flows/{sessionId}/objects/supervisor/views/feedback-2026-04-21/
[/navigate]
```

**两类都输出时**（信息 + 交互）：

```
我已完成任务并整理了两份产出：

[navigate title="任务报告" description="结果详情"]
ooc://file/flows/{sessionId}/objects/supervisor/files/reports/result.md
[/navigate]

[navigate title="请给本次结果打分" description="帮助我改进"]
ooc://view/flows/{sessionId}/objects/supervisor/views/feedback-2026-04-21/
[/navigate]
```

## 何时选择哪种

| 场景 | 选择 |
|---|---|
| 纯汇报、无需决策 | 仅报告文档 |
| 需要用户输入（评分、勾选、填表） | 交互 View + 可选报告文档 |
| 动态展示（图表、实时数据） | 交互 View |
| 多步引导（用户确认某步之后才继续） | 交互 View + notifyThread 唤醒线程 |

## 用户提交后：notifyThread + 线程复活

当用户在 View 中提交表单（调用 ui_methods）：
- `ctx.setData(...)` 保存用户输入到 stone.data
- `ctx.notifyThread(msg)` 向根线程 inbox 写一条 system 消息
- 若你刚 return（根线程 done），线程会自动复活为 running
- 你会收到 inbox 消息，基于用户输入继续思考

这让"你 → 用户 → 你"的对话闭环，无需用户手动 talk。

## 可用依赖（前端组件）

frontend.tsx 可以 import（使用 `@ooc` 路径别名）：

- `react` / `jotai` — React 核心
- `lucide-react` — 图标库
- `@ooc/api/client` — `callMethod`, `fetchFlow`, `fetchSessionTree` 等
- `@ooc/components/ui/*` — 原子组件（MarkdownContent, Badge 等）
- `@ooc/lib/utils` — 工具函数（cn 等）

## 注意

- 每次更新 frontend.tsx / backend.ts 后建议调用 Bun.Transpiler 验证编译
- 不要在 VIEW.md frontmatter 写错 namespace（必须 `self`）或 name（必须与目录名一致）
- 报告文档的覆盖/追加由你决定（写 `final-report.md` 还是 `report-2026-04-21.md`）
- 导航卡片的 title/description 面向人类用户，注重可读性

## 历史回顾（2026-04-21 迁移前）

旧机制：`ui/index.tsx`（Stone 单页）+ `ui/pages/*.tsx`（Flow 多页）；
旧协议：`ooc://ui/{相对路径}`。
这些已于 2026-04-21 整体替换为 Views 机制，详见 `docs/对象/人机交互/自渲染.md`。
