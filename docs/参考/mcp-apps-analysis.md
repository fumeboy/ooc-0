# MCP Apps 调研 — 对 OOC G11 的启发

调研日期：2026-03-10
来源：https://modelcontextprotocol.io/extensions/apps/overview

---

## 一、MCP Apps 是什么

MCP Apps 是 Model Context Protocol 的扩展，允许 MCP Server 的 tool 返回交互式 HTML 界面，
直接嵌入到 Host（Claude Desktop、VS Code 等）的对话流中渲染。

核心卖点：
- Context preservation — UI 嵌入对话，不需要切换 tab
- Bidirectional data flow — App 可以调用 Server 的 tool，Host 可以推送数据给 App
- Host capability delegation — App 可以委托 Host 调用用户已连接的能力
- Security — sandboxed iframe 隔离，deny-by-default CSP

## 二、渲染机制

### 三层架构

```
MCP Server (数据+逻辑)
    ↕ JSON-RPC over HTTP (StreamableHTTPServerTransport)
Host (Claude Desktop / 浏览器)
    ↕ postMessage (JSON-RPC dialect, ui:// scheme)
App (sandboxed iframe, 纯 HTML/JS/CSS)
```

### 完整流程

1. Server 注册 tool 时声明 `_meta.ui.resourceUri = "ui://tool-name/app.html"`
2. Server 注册 resource handler，返回打包好的 HTML（通常用 vite-plugin-singlefile 打包为单文件）
3. Host 调用 tool 时：
   - 根据 resourceUri 获取 HTML 资源（可预加载）
   - 创建 sandboxed iframe 渲染 HTML
   - 通过 postMessage 把 tool result 推给 iframe
4. iframe 内的 App：
   - `new App().connect()` 建立 postMessage 通道
   - `app.ontoolresult` 接收初始数据并渲染
   - `app.callServerTool()` 主动调用 server tool 获取新数据
   - 用户交互 → 调 tool → 拿结果 → 更新 DOM

### 关键代码模式

Server 端：
```typescript
// 注册 tool，声明 UI 资源
registerAppTool(server, "get-time", {
  title: "Get Time",
  inputSchema: {},
  _meta: { ui: { resourceUri: "ui://get-time/app.html" } },
}, async () => {
  return { content: [{ type: "text", text: new Date().toISOString() }] };
});

// 注册 resource，返回打包好的 HTML
registerAppResource(server, resourceUri, resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile("dist/app.html", "utf-8");
    return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
  },
);
```

App 端（iframe 内）：
```typescript
const app = new App({ name: "My App", version: "1.0.0" });
app.connect();

// 接收 host 推送的 tool result
app.ontoolresult = (result) => {
  const data = result.content?.find(c => c.type === "text")?.text;
  document.getElementById("output").textContent = data;
};

// 主动调用 server tool
button.addEventListener("click", async () => {
  const result = await app.callServerTool({ name: "get-time", arguments: {} });
  // 更新 UI...
});
```

### 安全模型

- sandboxed iframe：无法访问 parent DOM、cookies、localStorage
- 所有通信通过 postMessage
- CSP deny-by-default，需显式声明允许的外部资源
- Host 控制 App 可访问的 tool 范围

## 三、适用场景

- 复杂数据探索（交互式图表、地图钻取）
- 多选项配置（表单 vs 逐个问答）
- 富媒体查看（PDF、3D 模型、图片预览）
- 实时监控（持续更新的 dashboard）
- 多步骤工作流（审批、代码审查、分类）

## 四、与 OOC G11 的对比

| 维度 | MCP Apps | OOC G11 |
|------|----------|---------|
| UI 定义位置 | tool 的 `_meta.ui.resourceUri` | 对象的 `ui/index.tsx` |
| 数据获取 | `app.callServerTool()` via postMessage | 直接 fetch API + SSE |
| 隔离方式 | sandboxed iframe（不信任第三方） | Vite 动态 import（同源，无沙箱） |
| 嵌入位置 | 对话流中（聊天气泡位置） | Objects 页面的 tab |
| 框架依赖 | 任意（vanilla JS / React / Vue） | React（与前端同框架） |
| 通信协议 | JSON-RPC over postMessage | HTTP API + Jotai atoms |

## 五、对 OOC 的启发

### 5.1 UI 嵌入对话流

MCP Apps 最核心的创新是 **UI 出现在对话流中**，而不是独立页面。
OOC 当前的 G11 是"对象有自己的详情页"，UI 在 Objects 页面展示。

启发：对象在对话中返回特定 action 时，ChatPage 可以直接渲染该对象的 `ui/index.tsx`。
OOC 比 MCP Apps 更轻量——不需要 iframe 隔离，因为对象 UI 是同源的 React 组件。

```
当前 G11:
  对象 → ui/index.tsx → Objects 页面的 tab 里展示

进化后的 G11:
  对象 → ui/index.tsx → 可以在任何地方渲染
       ├── Objects 页面（完整详情视图）
       ├── ChatPage 对话流中（内嵌交互视图）
       └── 其他对象的 UI 中（组合嵌套）
```

### 5.2 Tool = UI 的声明式绑定

MCP Apps 的 `_meta.ui.resourceUri` 是一种声明式绑定：tool 声明"我有 UI"。
OOC 可以借鉴：trait 的 method 可以声明"调用我时展示这个 UI 组件"。

```typescript
// 假想的 OOC trait method 声明
{
  name: "showAnalysis",
  description: "展示分析结果",
  ui: "analysis-chart",  // 指向 ui/ 下的组件
}
```

### 5.3 双向数据流的简化

MCP Apps 需要 postMessage 是因为跨域隔离。OOC 的对象 UI 是同源的，
可以直接通过 Jotai atoms 或 React context 实现双向数据流，更简单。

### 5.4 不需要的部分

- iframe 沙箱隔离 — OOC 对象 UI 是自己的代码，不需要
- JSON-RPC over postMessage — 同源可以直接调用
- vite-plugin-singlefile 打包 — 已经在同一个 Vite 项目中
- CSP 配置 — 同源无需

## 六、结论

MCP Apps 解决的是"不可信第三方 UI 如何安全嵌入对话"的问题。
OOC 的对象 UI 是可信的（自己的代码），所以不需要 MCP Apps 的安全层。

但 MCP Apps 的**交互模式**（UI 嵌入对话流、tool 声明式绑定 UI、双向数据流）
值得 OOC 借鉴。OOC 可以用更轻量的方式实现同样的效果：
对象的 React 组件直接内联渲染在 ChatPage 中，通过 SSE + Jotai 实现实时更新。
