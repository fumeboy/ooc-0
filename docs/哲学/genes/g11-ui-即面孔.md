## G11: UI 是对象的面孔

<!--
@referenced-by kernel/src/server/server.ts — referenced-by — API 提供对象数据给前端
@referenced-by kernel/src/server/events.ts — referenced-by — SSE 实时推送
@referenced-by kernel/web/src/App.tsx — implemented-by — 前端整体布局
@referenced-by kernel/web/src/features/ObjectDetail.tsx — implemented-by — 对象详情页
@referenced-by kernel/web/src/features/ProcessView.tsx — implemented-by — 行为树可视化
@referenced-by kernel/web/src/features/IdentityTab.tsx — implemented-by
@referenced-by kernel/web/src/features/DataTab.tsx — implemented-by
@referenced-by kernel/web/src/features/TraitsTab.tsx — implemented-by
@referenced-by kernel/web/src/features/EffectsTab.tsx — implemented-by
@referenced-by kernel/web/src/features/FlowDetail.tsx — implemented-by
@referenced-by kernel/web/src/components/Sidebar.tsx — implemented-by
@referenced-by kernel/web/src/hooks/useSSE.ts — referenced-by
@referenced-by docs/设计/g11-frontend.md — extended-by
-->

对象的 `ui/` 目录是它的「面孔」——决定自己如何被人类看见。

UI 不是外部系统强加的展示方式，而是对象「自我表达」的一部分。
对象最了解自己的数据结构和功能，因此由对象自己决定如何呈现。

对象通过 `ui_template` kernel trait 获得编写 UI 的能力（方法 + 指导），
UI 文件本身存储在 `ui/index.tsx`——它与 readme.md（身份）、data.json（状态）平级，
是对象的顶层组成部分，不是某个 trait 的附属品。

前端通过扫描 `objects/*/ui/index.tsx` 动态加载每个对象的 UI。

---

