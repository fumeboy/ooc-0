# readable（对外摘要）

readable 是 OOC 的**「Object 怎样被读」维度**：决定一个 Object 出现在思考者 context 里时怎样自我介绍、被渲染、被压缩、以及它的展示状态怎样被控制。与 visible（人类侧 UI）并列。

两个面是**同一 `<readable>` 渲染槽位的优先级回退**（`readable.ts > readable.md > readme.md > 默认`）：

- **静态面 readable.md**：Object 写给外部世界的自我介绍名片（原 readme.md，2026-05-28 重命名），与 self.md 构成双面身份。渲染器作槽位最低优先级来源读取。
- **动态面**经 `registerReadable` 注册：`readable`/`renderXml`（按状态算 XML，优先级高于 readable.md）、`windowMethods`（控展示的方法，如 set_viewport，只动展示状态不碰业务数据）、`compressView`（折叠/快照态）、`basicKnowledge`（窗口在场时注入的协议知识）、`onClose`、`consumedMessageIds`。与 executable（object method 改业务数据）按维度分注册、互不覆盖、同名 fail-loud。
