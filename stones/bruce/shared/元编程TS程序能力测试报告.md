# 元编程 TS 程序能力测试报告

## 总览

8 个场景，5 PASS / 3 FAIL，发现 1 个 CRITICAL + 3 个 MEDIUM bug。

| # | 场景 | 结果 |
|---|------|------|
| 1 | 基础函数创建与调用 | ✅ PASS |
| 2 | 多函数导出 | ✅ PASS |
| 3 | 函数间互调 | ✅ PASS |
| 4 | 有状态交互 | ❌ FAIL |
| 5 | 多 trait 叠加 | ✅ PASS |
| 6 | 同名函数冲突 | ❌ FAIL |
| 7 | code 语法错误处理 | ❌ FAIL (7a) / ✅ 7b,7c |
| 8 | 复杂返回值 | ✅ PASS |

---

## 发现的 Bug

### CRITICAL: ctx.data 是冻结快照，有状态 trait 函数无法正确累积状态

**场景4b** — ctx.setData 写入后，ctx.data 不更新。

证据：
- pIncrement 连续 3 次调用都返回相同值（而非递增）
- testSetData 在 ctx.setData 后立即读 ctx.data，值不变（before=0, after=0）
- ctx.setData 确实写入了底层存储（沙箱全局 getData 能读到更新值）

根因：ctx.data 在每轮思考开始时创建为只读快照，整轮不变。
影响：任何需要在同一轮中通过 ctx 累积状态的 trait 函数都会行为错误。

---

### MEDIUM-1: ctx API 不完整

**场景4b** — ctx 对象只有 5 个属性：data, setData, print, taskId, sharedDir。

缺少 getData, persistData 方法，与沙箱全局 API 不一致。ctx.setData 的语义实际是 persistData（同时写 stone.data + flow.data），命名误导。

---

### MEDIUM-2: 同名函数冲突时无隔离

**场景6** — 两个 trait 导出同名函数 process()，无论激活哪个，始终调用后创建的版本。

证据：
- 创建 conflict_a（返回 "A:x"），再创建 conflict_b（返回 "B:x"）
- 只激活 conflict_a → process("test") 返回 "B:test"（预期 "A:test"）

根因：createTrait 热加载时就将导出函数注入沙箱全局作用域，后创建的覆盖先创建的。activateTrait 未对函数可见性做隔离。

---

### MEDIUM-3: 语法错误的 trait code 静默失败

**场景7a** — createTrait 的 code 包含语法错误时，创建/激活/调用全链路无报错，但函数不可用。

证据：
- createTrait("broken_syntax") 返回 "创建成功（已热加载）" — 实际热加载失败
- activateTrait("broken_syntax") 返回 "已激活"
- 调用 broken() → "broken is not defined" — 用户无法定位原因

预期：createTrait 时应检测语法错误并报错，或至少提示热加载失败。

---

## 正面发现

1. **基础路径稳固** — 创建/激活/调用的核心流程可靠
2. **多函数导出正常** — 单 trait 多 export 无问题
3. **内部互调走原始引用** — trait 内部函数间调用不经过 async 包装，性能和语义都正确
4. **多 trait 叠加无冲突** — 不同名函数共存正常
5. **返回值直接引用传递** — Map/Set/Date 等非 JSON 类型完整保留，好设计
6. **运行时错误正确传播** — 可 try/catch 捕获，错误信息清晰

---

## 修复建议优先级

1. **CRITICAL** ctx.data 冻结快照 → 改为 Proxy 或每次 ctx.setData 后刷新 ctx.data
2. **MEDIUM-3** 语法错误静默失败 → createTrait 时做编译检查，失败则拒绝创建
3. **MEDIUM-2** 同名函数冲突 → 至少在 activateTrait 时检测冲突并警告
4. **MEDIUM-1** ctx API 不完整 → 补齐 getData/persistData，或明确文档化 ctx 的设计边界