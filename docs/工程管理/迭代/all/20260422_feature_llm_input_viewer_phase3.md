# LLMInputViewer Phase 3 — 对比视图 + active-forms 结构化

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P2

## 背景

`llm_input_structured_view.md` Phase 1+2 完成。Phase 3 对比视图 + active-forms 纳入 `<user>` 子节点留作 backlog。

## 目标

1. **对比视图**：选择两个 `llm.input.txt`（同线程 loop_N / loop_N+1 或不同线程）做结构 diff，高亮变化节
2. **active-forms 纳入 `<user>` 子节点**：engine.ts 的外部追加逻辑移入 contextToMessages，避免 active-forms 作为 `<user>` 兄弟节点存在
3. **Hover 溯源**：鼠标悬停 knowledge window 显示"它为什么被激活"（scope chain 推导 / command binding / pinned）

## 方案

### Phase 1 — active-forms 内联

- engine.ts 两处外部追加（line 877/2064）改为 buildThreadContext 入参 → contextToMessages 内部生成 `<active-forms>` 作为 `<user>` 子节点
- 更新 XML 结构测试

### Phase 2 — 对比视图

- `LLMInputViewer` 加 "Compare" 按钮
- 选择第二个文件（LRU / 同线程历史）→ 左右双栏 diff
- Node 级 diff（非行级）

### Phase 3 — Hover 溯源

- 每个 knowledge window 注入 "source" 属性（command_binding / explicit_open / always）
- UI hover 解释

## 影响范围

- `kernel/src/thread/engine.ts`（active-forms 内联）
- `kernel/web/src/features/LLMInputViewer.tsx`

## 验证标准

- 对比视图可用
- active-forms 位于 `<user>` 子节点

## 执行记录

（初始为空）
