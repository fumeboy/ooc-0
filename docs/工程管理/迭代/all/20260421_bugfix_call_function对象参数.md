# engine call_function 支持对象参数

> 类型：bugfix
> 创建日期：2026-04-21
> 完成日期：2026-04-21
> 状态：finish
> 负责人：Alan Kay

## 背景 / 问题描述

Trait Namespace 迭代把 trait 方法签名改为 `(ctx, { ...fields })` 对象解构；`llm_methods` / `ui_methods` 注册参数风格统一为对象。

但 `kernel/src/thread/engine.ts:1254` 的 `call_function` 处理仍走**位置参数展开**：它把 args 数组依次 spread 给函数，和对象风格不匹配。

**表象**：ReflectFlow 迭代里 bruce 需要调 `callMethod("reflective/reflect_flow", "talkToSelf", { message })` —— 实际走 `program` 绕过，因为直接 `call_function` 参数展开会把 `{message}` 当单个 positional arg。

## 目标

1. engine 的 `call_function` 处理识别并支持两种入参：
   - 单个对象（用 object destructure 调）
   - 多个 positional args（保持原行为）
2. 判定规则：若 args 是长度 1 且第一个元素是纯对象（非 array / null） → 视为对象参数；否则走位置参数
3. 所有 trait 方法（新旧）无需改动即可被正确调用

## 方案

1. `engine.ts:1254` 附近找到 call_function 分支：读 method，argv 解析后 if 判断调用风格
2. 写单元测试 `kernel/tests/engine-call-function-object-args.test.ts`：
   - 调 llm_methods（对象风格）成功
   - 调传统位置参数方法保持正常
   - 空参数对象 `{}` 也能调
3. 跑全量测试 0 回归

## 影响范围

- `kernel/src/thread/engine.ts`（一个分支改写）
- 新增 `kernel/tests/engine-call-function-object-args.test.ts`

## 验证标准

- 单元测试全绿
- 回归：现有 550 pass 保持
- bruce 体验：`talkToSelf` 不再需要绕 program 就能调用

## 执行记录

### 2026-04-21

**实现**：

- `kernel/src/thread/engine.ts` 两处 call_function 分支（line 1254 初次执行 + line 2140 resume 路径）：
  - 新判定规则：`args.args` 是**对象** → 整体作为第二个参数传给 fn（新协议 `(ctx, argsObj)`）
  - 兼容：`args.args` 是**数组** → 按位置参数展开（向后兼容）
  - 空对象 `{}` 场景也正确处理
- 新增测试 `kernel/tests/engine-call-function-object-args.test.ts` 覆盖三个场景：
  1. `(ctx, { message })` 新协议 llm_method
  2. 空参数方法 `{}` 调用
  3. `needsCtx=false` 路径

**根因**：Trait Namespace 迭代把 `llm_methods` 签名统一为 `(ctx, argsObj)` 对象解构，与沙箱 `callMethod` 保持一致；但 engine 的 call_function 分支仍按 `method.params` 列表将 argsObj 的字段展开为位置参数（如 `fn(ctx, argsObj.message)` 而不是 `fn(ctx, { message })`），导致 LLM 通过 `open call_function → submit` 路径调同一方法时参数错位（`{ message }` 解构取到 undefined）。

**测试基线**：550 pass → **553 pass**（+3 新测试），0 fail，6 skip

**影响**：
- 解锁 ReflectFlow 方案 B 的 `callMethod("reflective/reflect_flow", "talkToSelf", { message })` 调用路径
- 所有 trait 的 `llm_methods` 现在通过 `call_function` 和通过沙箱 `callMethod` 调用行为一致
