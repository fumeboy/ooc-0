# readable（对外摘要）

readable 是 OOC 的**面向 LLM 的展示维度**：决定一个 Object 出现在思考者 context 里时怎样被渲染、压缩、以及它的展示状态怎样被控制。与 visible（人类侧 UI）并列。

经 `registerReadable` 注册：`readable`/`renderXml`（渲染窗口）、`windowMethods`（控展示的方法，如 set_viewport，只动展示状态不碰业务数据）、`compressView`（折叠/快照态）、`basicKnowledge`（窗口在场时注入的协议知识）、`onClose`、`consumedMessageIds`。与 executable（object method 改业务数据）按维度分注册、互不覆盖、同名 fail-loud。
