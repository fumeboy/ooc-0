# ReflectFlow — 对象的常驻反思子对象

> 每个主动思考的对象都有一个 ReflectFlow（也称 SelfMeta）——它是这个对象的"常驻反思通道"。

## 目录结构

ReflectFlow 的数据在 **Stone 目录下**（不在 flows/ 下），因为它是对象的**常驻**组件：

```
stones/{name}/
├── readme.md
├── data.json
├── reflect/                   ← ReflectFlow 的持久化
│   ├── data.json              ← ReflectFlow 的运行时数据
│   ├── process.json           ← ReflectFlow 的行为树
│   └── files/                 ← ReflectFlow 的共享数据
└── ...
```

**为什么在 Stone 下**：
- ReflectFlow 跨 Session 存在（不是某次任务的 Flow）
- 它和 Stone 的身份绑定——每个对象一个专属 ReflectFlow
- 行为树 process.json 记录了反思历史，可跨时间保留

## 身份共享

ReflectFlow **共享主对象的身份**：
- 同一个 readme.md
- 同一个 whoAmI
- 同一组 traits（但视角不同——它的 Context 更强调反思）

但 ReflectFlow 有**特殊权限**：
- 只有它可以写 `stones/{name}/readme.md`
- 只有它可以写 `stones/{name}/data.json`（Stone 级，非 Flow 级）
- 只有它可以创建 `stones/{name}/traits/xxx/`（Stone 自定义 trait）

## 触发方式

### 主 Flow 调用 reflect()

```typescript
// 在主 Flow 的 program 中
await reflect("请记住：issue-discussion 实际位置在 talkable 下")
```

实现：

```typescript
async function reflect(message: string) {
  await talk("_selfmeta", { content: message });
}
```

消息投递到 ReflectFlow 的 inbox，触发它的 ThinkLoop。

### reflective.when_finish hook

主 Flow 即将 return 时，自动提示：

```
请花一轮思考回顾...用 reflect 告诉你的 ReflectFlow：
  - reflect("请记住：...")
  - reflect("请保存：key=..., value=...")
  - reflect("请沉淀为 trait：...")
```

LLM 如果接受提示，就会 reflect。

### 定时审视（可选）

ReflectFlow 也可以**自发**审视最近的主 Flow actions——比如每 10 轮检查一次"有没有值得沉淀的"。这需要在 ReflectFlow 的 readme 中定义"工作节奏"。

## ReflectFlow 的处理流程

```
1. 收到 reflect 消息
2. ThinkLoop 启动（作为独立 Flow）
3. 读取消息内容，判断类别：
   - 记忆请求 → 考虑是否写 memory.md
   - 数据保存 → 考虑是否写 data.json
   - 能力沉淀 → 考虑是否创建/修改 trait
4. 读取相关文件，判断是否已有类似内容
5. 审视：
   - 有验证证据吗？（verifiable）
   - 适合写到哪里？（memory / readme / trait）
   - 是否冲突既有内容？
6. 执行（或拒绝）
7. return 回复主 Flow："已记录" 或 "未记录，原因：..."
```

## ReflectFlow 的"性格"

ReflectFlow 的 readme 通常是：

```markdown
# 我是 XXX 的 ReflectFlow

我负责审视 XXX 的经历，决定什么值得沉淀。

## 我的原则
- 保守：宁可不记，不要误记
- 诚实：没有证据的沉淀都要拒绝
- 克制：不要让 memory.md 越来越长，重复内容要合并
- 尊重：如果主 Flow 强烈要求，尊重它（但要记录原因）

## 我不做的事
- 不擅自修改 readme（除非主 Flow 明确要求，且多次验证）
- 不创建不稳定的 trait（可能误导未来的我）
- 不忽略 verifiable 门禁
```

这些"性格"可以通过 reflect() 修改——但通常由项目初始化时由人类设定。

## 反向对话

**ReflectFlow 可以反向回复主 Flow**！这是 G2 里讲的"双向自我对话"：

```
主 Flow: reflect("请记住 X")
ReflectFlow: 
  - 审视后决定拒绝
  - talk("main-flow-sender", { content: "我不记。原因：X 缺乏验证证据。请先运行 Y 确认。" })

主 Flow 收到回复：
  - Context 中看到 ReflectFlow 的答复
  - 决定是否先验证再重试
```

这让"沉淀"是一个**对话过程**，不是单向命令。

## Tab UI

前端可以打开 ReflectFlow 的详情页，看到：

- 反思的 actions 历史（process）
- data.json（反思的临时数据）
- memory.md（记录的长期记忆）

详见 [../../人机交互/页面/](../../人机交互/页面/)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| ReflectFlow 目录 | `stones/{name}/reflect/` |
| reflective trait | `kernel/traits/reflective/` |
| reflect() API | `kernel/traits/reflective/memory_api/` |
| 作为特殊 Flow 的运行 | 机制同普通 Flow（engine + scheduler） |

## 与基因的关联

- **G12**（经验沉淀）— ReflectFlow 是沉淀的驱动器
- **G2**（Stone 与 Flow）— ReflectFlow 是 Stone 的"第二 Flow"
