# kernel/debuggable — 系统化调试

> 遇到错误时，你必须系统化地调查根因，而不是猜测和尝试。

## 基本信息

```yaml
name: kernel/debuggable
type: how_to_think
description: 系统化调试四阶段流程，根因先于修复（需要时 activateTrait 加载）
```

**注意**：debuggable 没有 `activates_on.show_content_when`——它不响应任何 command。激活方式是：
- LLM 主动 `open(title="加载调试能力", type=trait, name=kernel/debuggable, description="查看调试指南")`，或
- 其他 trait 的 hook 在出错时触发其激活

## 铁律

> **没有根因调查，不做任何修复。**

## 四阶段调试流程

### 阶段 1：读完整错误信息

不要只看第一行。stack trace、上下文、时间戳、前后日志都要读。

**反模式**：看到 "TypeError" 就开始猜是哪个变量。

### 阶段 2：定位出错环节

错误发生在：
- 输入验证？
- 中间计算？
- 输出格式化？
- 外部调用？

精确定位到具体的一段代码 / 一行配置，不要"大概在某个模块"。

### 阶段 3：形成假设

**一次只一个假设**。基于证据（第 1-2 阶段的观察），形成一个可验证的假设：

> "我假设：如果 X 为 null，则 Y 函数在 line 42 处抛出 undefined access"

假设必须**可验证**——能通过一个具体操作（打印、断点、实验）证实或证伪。

### 阶段 4：最小变更验证

**不要一次改多处**。针对假设，做**最小的**改动，观察结果。

- 假设成立 → 继续修复
- 假设不成立 → 回到阶段 3 形成新假设，**不要保留改动**

## when_error hook

debuggable 定义了 `when_error` hook——当程序执行出错时，自动注入：

```
程序执行失败。不要猜测修复。按四阶段流程：
1. 读完整错误信息
2. 定位出错环节
3. 形成假设
4. 最小变更验证
```

这个 hook **不是 activates_on.show_content_when 触发**，而是 Engine 在 program 执行失败时检测到错误状态后注入。

## 为什么不是默认激活

因为**不是每个任务都出错**。如果默认注入，每次 Context 里都塞 debuggable 的内容，占用 token。按需加载更经济。

hook 机制保证了"**在真正需要时自动出现**"——对象不会错过调试指导。

## 反模式警告

debuggable 特别警示以下行为：

- **破坏性捷径**：`rm -rf node_modules && npm install`（不调查，直接重装）
- **迷信重试**：同样的命令跑三遍期待不同结果
- **试错陷阱**：改一个，没好，再改一个，没好，再改一个...最后 5 处改动但不知道哪处起作用

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/debuggable/TRAIT.md` |
| when_error hook 注入 | `kernel/src/thread/hooks.ts` |
| 错误检测 | `kernel/src/thread/engine.ts`（program 执行失败路径） |

## 与其他 trait 的组合

- **debuggable + verifiable** → 修复后必须跑验证确认（不能凭"应该好了"声称修好）
- **debuggable + reflective** → 调试过程中的发现沉淀为经验

## 与基因的关联

- **G12**（经验沉淀）— 调试经验是值得沉淀的（"X 错误的根因是 Y"）
- **G4**（输出程序以行动）— 调试本身也是通过 program 进行
