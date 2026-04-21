# Pause — 人机协作检查点

> Engine 可以在 LLM 返回后、执行前暂停，让人类介入查看、修改 LLM 输出。

## 机制

```
Engine 单轮流程：
  构建 Context
    ↓
  发给 LLM
    ↓
  接收 LLM 输出
    ↓
  ──── 检查暂停信号 ────  ← Pause 在这里触发
    ↓
  执行（open/submit/close ...）
    ↓
  下一轮
```

## 何时触发暂停

三种触发方式：

1. **全局信号**：设置 `pause: true` 的环境变量或 API 调用，Engine 检测到后下一轮暂停
2. **用户通过 UI 操作**：前端 pause 按钮设置 pausing 状态
3. **Flow 达到某个标记点**（如 readme 中声明 `pause_before_return: true`）

## 暂停时写出的文件

```
flows/{sid}/objects/{name}/paused/
├── llm.input.txt     ← 本轮发送给 LLM 的完整 Context（文本形式）
└── llm.output.txt    ← LLM 返回的原始输出（含 tool calls 的原文）
```

这两个文件是**人类可读可写**的：

- **llm.input.txt** — 用户可查看"LLM 收到了什么"——用于调试 Context 构建问题
- **llm.output.txt** — 用户可**修改**，如改掉一个 tool call 的参数

## 恢复执行

用户点击 "Resume"：

1. 读取 `llm.output.txt` 作为实际输出
2. Engine 按正常流程解析 + 执行
3. Flow 继续下一轮

**如果用户修改了 llm.output.txt**，Engine 按修改后的执行——这就是"人工介入"的核心。

## 为什么需要这个

### 调试复杂任务

当一个任务跑了几十轮仍未达到目标，暂停可以让你：
- 查看某一轮的 Context 是否正确
- 修正 LLM 的一个错误决策，观察后续
- 保存问题场景，事后研究

### 协作边界

有些任务 LLM **不能独自决策**（如发送邮件、改生产数据库）。暂停让人类做最后确认。

### 安全网

Engine 遇到危险操作（如 `rm` 大面积文件）前暂停，强制人类看一眼。

## 前端展示

详见 [../../人机交互/页面/flow-view.md](../../人机交互/页面/flow-view.md) 的 **PausedPanel** 部分：

- 显示 Context 内容
- 显示 LLM 原始输出
- 提供 "Edit output" 编辑器
- 提供 "Resume" 按钮

## 暂停状态的 Flow

```
running → pausing → paused（等待人类）
                      ↓
                    resume
                      ↓
                    running
```

paused 状态下：
- 线程树不前进
- 其他线程可继续（pause 只影响被暂停的线程）
- Session 保持活跃

## 与 wait 的区别

| 概念 | 等谁 | 触发 | 是否存文件 |
|---|---|---|---|
| **wait** | 子线程 / inbox 消息 | Tool call `wait` | 否 |
| **pause** | 人类 | Pausing 状态 | 是（llm.input/output） |

wait 是"线程间等待"；pause 是"人机协作的等待"。

## 源码锚点

| 概念 | 实现 |
|---|---|
| pause 检测 | `kernel/src/thread/engine.ts` |
| 文件写出 | `kernel/src/thread/persistence.ts` → `writePauseFiles()` |
| resume 处理 | Engine 的 tool call 解析路径 |
| 前端 UI | `kernel/web/src/features/PausedPanel.tsx` |

## 与基因的关联

- **G4**（输出程序以行动）— pause 切断了"LLM 输出 → 执行"的自动路径
- **G12**（经验沉淀）— 人工修正的轮次是宝贵的沉淀素材
