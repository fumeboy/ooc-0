---
title: visible 测试规格 — Tier A 控制面判据 + Tier B agent-native rubric
description: 验证我可见性维度的测试契约：client-source-url / Vite serve 安全边界 / stone:changed kind=view / UI↔行为闭环，外加 agent-native 产出 rubric 与 story 索引
activates_on:
  "object::root": "show_content"
---

# visible 测试规格

我（visible 维度）的能力由 storybook 两层验证：Tier A 控制面确定性（零真 LLM、进 CI），Tier B agent-native（真 LLM、env-gated）。代码在 `packages/@ooc/storybook`——本页只吸收**判据**，不复制实现。

我的维度定位：持有并演化自身 UI 页面（stone `visible/index.tsx` + flow `client/pages/`），人类经 HTTP callMethod 交互。

## Tier A —— 控制面确定性判据

每条 TC 是一个可证伪的契约；任一翻红即我维度的回归。

- **TC-VIS-01**：`client-source-url` 返回正确 `absPath`/`fsUrl`，指向真实文件。判据：status 200 + `absPath` 以 `visible/index.tsx` 结尾 + `fsUrl === /@fs${absPath}` + 文件确实存在。
- **TC-VIS-02**：Vite serve `/@fs` 的 visible 组件返回模块代码（含 `export default`）。**需 live Vite 指向同一 world，否则 SKIP**。
- **TC-VIS-03**：Vite 安全边界——拒绝 serve `executable/` 路径，返回 403（`Forbidden`/`Restricted`）。同样 **需 live Vite，否则 SKIP**。
- **TC-VIS-04**：`visible/index.tsx` 变更触发后端 `stone:changed` 事件，`kind === "view"`、`objectId` 匹配、`files` 非空数组（Vite HMR 的后端侧信号）。runtime.stoneRegistry 不可达（非 dev）则 SKIP。
- **TC-VIS-05**：UI↔行为闭环——visible 组件存在 + `callMethod` 端点调通 executable（`call_method` 返回 `returnValue.hello === "ooc"`）。

**SKIP 不是失败**：TC-VIS-02/03 的真渲染/真 serve 是 F 层（frontend e2e）的活；控制面只断映射端点与安全语义。

## Tier B —— agent-native rubric（原样保留）

agent-native 对运行中的 world 派任务，由真 LLM 亲手行使能力，再抽轨迹 + 确定性产物核验。

注：supervisor 的 self.md 明确「✗ 不直接编辑 UI（派 visible 维度的 Agent）」——它正确地不亲手写 `visible/index.tsx`。故 agent-native 演示验证 supervisor 能做的部分（**创建可被赋予 UI 的对象**，create_object 落 session worktree 即算成功）；visible 页面**产出**由 visible 维度 agent 负责，确定性产物验证落在 Tier A TC-VIS-01/05 + frontend e2e F3。若 supervisor 恰好也顺手写了 visible（url 可解析）则更佳。

rubric（规格已就地收编进本 tests.md；story 代码在 `packages/@ooc/storybook/stories/`）：

- **Good**：tsx 在 worktree、含 `default export`、endpoint 200。
- **OK**：产出但语法瑕疵 / 路径偏。
- **Bad**：未产出 / endpoint 404。

## Story 索引（代码在 packages/@ooc/storybook）

### `stories/visible.story.ts`
- `runControlPlane()` — Tier A，承载 TC-VIS-01..05（上文判据）。
- `runAgentNative()` — Tier B，派 supervisor 创建对象（`sb_ui_<tag>`）。expectation：对象已建（evolve 合入 main 或 create_object 落 session worktree），可见性前提就绪；visible 页面待 visible 维度 agent 产出。

### `stories/L8_visible.stories.ts`（单元 catalog，`layer: "visible"`）
- **L8-CLIENT-URL-STONE** — expectation：stone scope `client-source-url` 指向 `visible/index.tsx`（单页）。
- **L8-CLIENT-URL-FLOW** — expectation：flow scope `client-source-url` 指向 `client/pages/:page.tsx`（多页）；当前 skip，需多页 client 资产 + live Vite（归 F 层）。
- **L8-TYPES-CATALOG** — expectation：`/api/objects/_shared/types` 列出全部已注册 type（≥5 且含 `file`）。**跨 app**：对象类型目录端点偏 app-server，visible 仅作前端按 type 索引 method 的消费方。
- **L8-WORLD-CONFIG** — expectation：`/api/world/config` 返回 `siteName` 等 world 级公开配置（前端 Logo 等）。**跨 app**：world 级配置由 app-server 提供，visible 是消费方。
