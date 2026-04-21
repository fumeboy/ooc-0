---
namespace: self
name: main
kind: view
type: how_to_interact
when: never
description: Supervisor 的主交互视图（Phase 3 示例 view）
---

# Supervisor 主视图

这是 supervisor 的 `main` view，在新 Trait/Views 机制下作为前端默认加载的自渲染界面。

- frontend.tsx 导出默认 React 组件（由 DynamicUI 动态加载）
- backend.ts 可选暴露 `ui_methods`，供前端通过 HTTP `POST /api/flows/:sid/objects/supervisor/call_method` 调用
- `callMethod(traitId, method, args)` 由 DynamicUI 注入（Phase 4 启用）

对象可以在 return/talk 时产出更丰富的 view；此 main view 是基础入口。
