---
activates_on: {"window::root": "show_content"}
---

# executable 维度的测试规格

这是我（executable）这一片的能力测试规格——验证「LLM 经 4 个稳定 tool 原语在 ContextObject 上调 Method 改变世界」是否真的成立。规格的代码体在 `packages/@ooc/meta/storybook/`，我在这里吸收 Tier A 的判据、原样保留 Tier B 的 rubric，并索引相关 story。

测试分两层：**Tier A** 是控制面确定性（零真 LLM、可进 CI，跑 `bun run test:storybook`），只验**结构**；**Tier B** 是 agent-native（真 LLM、env-gated），对运行中的 world 派任务、抽过程轨迹 + 确定性产物核验。4 原语 exec/close/wait/compress 驱动真实编辑的深度行为属 Tier B + e2e S1/S2。

## Tier A —— 控制面确定性

判据（结构验证，无 LLM）：

- **TC-EXEC-01**：Object 自定义的 `ui_methods` 在 ContextObject 上执行并返回结果——经 `/api/stones/{id}/call_method` 调 `add(x,y)` 返回 `{ sum: 5 }`（method 调用改变/返回世界状态）。
- **TC-EXEC-02**：Object 定义的 `window.commands`（即 `window.methods`，LLM 路径命令）经 `loadObjectWindow` loader 可加载，且 `paths` 还原正确。

代码：`packages/@ooc/meta/storybook/stories/executable.story.ts`（`runControlPlane`），收为 `bun:test` 的入口在 `stories/_control-plane.test.ts`。

## Tier B —— agent-native（真 LLM，env-gated）

派「读一个文件 + 改其中一处」任务，`processTrace` 显示 exec/edit 动作；fs diff + git 核验产物。当前 story 的 agent-native 形态是：派 supervisor 用一个工具原语（glob/program 等）列仓库根的 `.md` 文件，核验 `execs` 中确实用到了 tool 原语（glob/grep/program/open_file/do 之一）。

rubric（收编 `playbooks/executable.playbook.md` + e2e S1/S2，**原样保留**）：

- **Good**：用 OOC 推荐命令（file_window.edit）精确改、文件落盘正确、对话回 user。
- **OK**：用 shell/write_file 全覆盖 / 命令重试 ≥2。
- **Bad**：文件未变 / 任务未完成 / form 卡 executing。

跑：`RUN_STORYBOOK_AGENT=1 OOC_BACKEND=http://127.0.0.1:3000 bun run packages/@ooc/meta/storybook/runner.ts`。

## 单元 catalog 索引（L3）

`packages/@ooc/meta/storybook/stories/L3_executable.stories.ts` 是方法 / registry 维度劈分 / tool 原语的单元 catalog。下面只列归我（executable）的条目；该文件里另有几条 `layer: "executable"` 但实际验的是 **readable** 维度（见末尾），不归我。

归 executable 的 story（id + expectation）：

- **L3-REG-EXECUTABLE** —— `registerExecutable` 只注册 object methods + 类元，拒绝 readable 字段。
- **L3-METHOD-COLLISION** —— 同一 type 上 object method 与 window method 同名 → 注册期 fail-loud（`assertNoMethodNameCollision`）。属维度边界用例：它锚的是「object method（我）与 window method（readable）名全局唯一」的不变量，从我这侧（先 `registerExecutable` 再 `registerReadable` 触发）验证。
- **L3-CONSTRUCTOR-LOOKUP** —— `kind=constructor` 的 method 经 `lookupConstructor` 命中（root 命令委托到 Object constructor）。
- **L3-PARENTCLASS-CHAIN** —— 未注册 type 经 `parentClass` 链回退解析 method（class/executable：缺省继承 root）。
- **L3-UI-METHOD-CALL** —— Object 的 `ui_methods` 经 HTTP `/call_method` 执行并返回结果。
- **L3-WINDOW-COMMAND-LOAD** —— Object 的 `window.methods`（LLM 路径命令）经 `loadObjectWindow` 可加载。

## L3 中归 readable 的条目（不归我）

下列条目在源文件中标 `layer: "executable"`，但验的是 readable 维度（windowMethod / set_viewport / registerReadable），归 readable 那一片：

- **L3-REG-READABLE** —— `registerReadable` 注册 windowMethods/readable，与 executable 互不覆盖。
- **L3-FILE-WINDOWMETHOD** —— builtin file 的 `set_viewport` 是 windowMethod，不在 object methods 表。

（L3-METHOD-COLLISION 跨两维度，我把它索引在 executable 侧，因为它从 `registerExecutable` 起手并验证「object method 名」的全局唯一不变量；readable 侧也可同名引用。）
