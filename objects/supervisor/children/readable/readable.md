# readable（对外摘要）

readable 是 OOC 的**「Object 怎样被读」维度**：决定一个 Object 出现在思考者 context 里时怎样把自己投影成 context window——怎样自我介绍、按视角算出什么投影 class、把 Data 渲染成什么 content、展示程度怎样被调。与 visible（人类侧 UI）并列。

两个面是**同一 `<readable>` 投影槽位的优先级回退**（动态 readable 投影 > 静态 readable.md > placeholder）：

- **静态面 readable.md**：Object 写给外部世界的自我介绍名片，与 self.md 构成双面身份。渲染器作槽位最低优先级兜底读取。
- **动态面**是 class 的 `readable` 模块：`readable(ctx, self, win)` 投影函数（按 Data + 视角算出投影 class 与 content，优先级高于 readable.md）+ `window` 投影 class 声明（每个 class 声明展示哪些 object method + 提供哪些 window method）。window method 只动投影态 `win`、返回新 win，不碰业务 Data。与 executable（object method 改业务 Data）并列收口进 `export const Class`、同名 fail-loud。
