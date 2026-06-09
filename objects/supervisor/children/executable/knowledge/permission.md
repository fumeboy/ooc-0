---
activates_on: {"window::root": "show_content"}
---

# permission —— method 级三档准入控制

## 为什么 permission 属于我

元编程闭环让 Object 能改自己的 executable / self.md / 文件系统。每条 method 都要回答「该不该让 LLM 直接执行」。这是行动协议的一部分，所以它是 `ObjectMethod` 上的一个声明字段，与 paths / schema / exec / public 同层级——不是单独的拦截器子系统。runtime 在 thinkloop 分派 tool call **之前**查它。

## 三档语义

- **allow**（默认）—— 无人工介入直接执行。纯读 / 控制流：open_file / glob / grep / open_knowledge / compress / close / wait / end / plan / todo / do / talk。
- **ask** —— 触发 HITL：写一条 `permission_ask` ProcessEvent，thread 进 `paused`，等控制面 approve / reject。写副作用归这档：write_file / program(shell|ts|js) / relation_update / super flow 改 self.md / 任何 delete_*。
- **deny** —— 系统直接拒绝：写 `permission_denied` ProcessEvent + 合成一条 `function_call_output("denied: <reason>")` 让 LLM 看见原因（绝不让它「以为成功」），跳过本次分派。

## 声明 + 配置 = 决定（决策链，优先级从高到低）

1. **PermissionDecider** —— escape hatch，测试 fixture / 控制面经 `setPermissionDecider` 注入（`(thread, call) => Decision`）。
2. **policies.json** —— `stones/<self>/objects/<id>/config/policies.json` 的 `methods[<method>]`，用户 / Supervisor 微调，可 override 任意 method。
3. **ObjectMethod.permission** —— method 作者声明。注意它在代码里是个**函数** `(args) => "allow"|"ask"|"deny"`（`packages/@ooc/core/_shared/types/method.ts:60`），按本次调用的 args 动态判档，而非静态常量。
4. 都没填 → 缺省 **allow**（向后兼容）。

完整决策链与容错见 `packages/@ooc/core/executable/permissions.ts:12-22`。

## thinkloop 接入点

think 主循环在分派 tool call 前对每个 pending call 调 `decidePermission(thread, call)`（`packages/@ooc/core/thinkable/thinkloop.ts:1`、:272-): allow→继续 dispatch；ask→落 permission_ask + paused + 中止本轮（复用现有 pause 的「安全暂停点」：assistant output 已记录、tool call 未执行）；deny→落 permission_denied + 合成 function_call_output + 跳过。approve 后下一轮重走该 tool call（这次 decider 返回 allow），reject 走 deny 路径。

## 不变量

- 向后兼容：未声明 permission 的 method 维持 allow。
- 可见性（与 observable silent-swallow ban 一致）：ask / deny 必落 ProcessEvent；allow 不必。
- 可恢复：approve 后必须**真正执行**原 tool call，不是「批准了但跳过」。
- Deny 信息流：必写 function_call_output。
- 配置容错：policies.json 缺失 / JSON 错 / 字段拼错 → fallback 到声明默认，永不抛崩溃。

## 边界与未决

- **deny 档当前 0 项**：自改 `stones/<self>/executable/index.ts` 应该 deny，但当前只靠 write_file ask 的弱约束，缺硬拦（`object.doc.ts:1070` warning / Q0e todo）。这是我维度的待办：在 write_file exec 路径前缀检查里补 deny。
- **agent 面审批未实现**：ask 档的 approve / reject 当前是纯人类面（控制面 HITL）。让 Supervisor / parent 作为 agent 审批 children 的高赌注 method（呼应 object_relations 的 cross-object PR review），是 agent_native_parity 公理下的显式缺口。
- Stone 作者声明传递：custom object 的 method proxy 当前一律缺省 allow，stone 作者需自行声明。
