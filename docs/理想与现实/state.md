# OOC 当前项目状态

> 最后更新：2026-03-14

---

## 系统状态：Phase 7 认知栈模型

OOC 系统经过哲学重构后从零重建。Phase 1-6+ 已完成，当前进入 Phase 7——基于 G13 认知栈模型的统一重构。

### 已完成

**Phase 1: 端到端骨架** ✅
- 类型系统、持久化层、Stone、Flow + ThinkLoop、Context、World、Server、CLI

**Phase 2: Trait 系统** ✅
- Trait 加载器、方法注册表、激活器
- Context 集成 + ThinkLoop 集成 + Kernel Traits

**Phase 3: 行为树** ✅
- 行为树 CRUD、Focus 光标管理、结构化遗忘渲染
- TodoList 待办队列（驱动 focus 移动）

**Phase 4: 对象协作** ✅
- 消息路由器（fire-and-forget）、协作 API、共享文件
- TaskSession、消息中断机制

**Phase 5: 异步调度 + 通信机制** ✅
- Scheduler 异步调度器、talk() fire-and-forget
- Bruce 对象（系统体验测试者）

**Phase 6: Web 前端 + User Object + SSE** ✅
- User Object（G1: 人类也是对象）、SSE 事件总线
- 前端骨架：Sidebar + ObjectDetail + FlowDetail + ProcessView + 命令面板
- Flow 续写（多轮对话）

**Phase 6+: 执行引擎增强** ✅
- Context 结构优化：INSTRUCTIONS / KNOWLEDGE 分离（formatContextAsMessages）
- Block scope 隔离：多代码块合并时 `{ }` 包裹，消除 const/let 冲突
- Effects 回执：`>>> effects:` 段落，LLM 直接看到副作用是否生效
- 错误分类与定位：SyntaxError（整块未执行）vs 运行时错误（带行号 `◄ ERROR` 标注）
- EffectTracker 声明式重构：新增 API 只需声明 `effect` 格式化函数
- talk() 重构：`talk(message, target, replyTo?)` 同步投递 + replyTo 全链路 + 消息 ID 暴露
- 多对象协作验证通过：researcher → helper → researcher → user 端到端成功
- 错误传播：sub-flow 失败/超时自动向 initiatedBy 投递系统通知
- 对象自定义 UI：import.meta.glob 扫描 + ObjectDetail 动态 UI Tab
- LLM 行为引导优化：任务完成即停止规则 + talk() 不重复发送规则
- G12 经验沉淀验证通过（exp-029）：createTrait → 持久化 → activateTrait → context 注入 → 效率提升
- Mirror 行为观察 + Trait Hooks 生命周期钩子
- web_search kernel trait：所有对象具备互联网访问能力
- Sub-flow 架构重构（进行中）：main flow + sub-flow 持久化在同一目录树下
- 测试：153 pass

**Phase 7: G13 认知栈模型** 🔄（哲学设计完成，待工程实现）
- 混合栈模型：过程与思维是同一帧的两面
- before/after 非递归元认知帧：Trait 自动激活 + 经验沉淀时机
- 作用域链：Context 从当前帧到帧 0 自然继承
- 统一 G2/G3/G5/G9/G11/G12 六条基因的底层机制

### 下一步

| 内容 | 优先级 | 说明 |
|------|--------|------|
| G13 认知栈工程实现 | P0 | 行为树节点携带 traits 声明，focus 进出自动激活/停用 |
| before/after 元认知帧 | P0 | push 时自动准备（trait 激活），pop 时自动收尾（经验沉淀） |
| 解决"规划循环"问题 | P1 | Exp-035 暴露：LLM 在复杂任务中过度规划不执行 |
| 多轮经验积累 | P2 | exp-029 验证了一轮沉淀→复用，需验证多轮迭代 trait 演化 |
| Thread 并发调度 | P3 | 长期目标 |

---

## 代码统计

| 类别 | 文件数 | 说明 |
|------|--------|------|
| 后端源码 | ~40 | `src/**/*.ts` |
| 前端源码 | ~20 | `.ooc/web/src/**/*.{ts,tsx,css}` |
| 测试 | 13 | `tests/**/*.test.ts`（153 个测试用例） |
| 文档 | 若干 | `docs/`（哲学 + 架构 + 设计 + 实验 + 工作流） |

## 技术栈

- **Runtime**: Bun 1.3.9
- **语言**: TypeScript（strict mode）
- **LLM**: 智谱 glm-4.6（OpenAI 兼容协议）
- **后端依赖**: consola（日志）、gray-matter（frontmatter 解析）
- **前端**: React 19 + Vite + Tailwind CSS 4 + Jotai + shadcn/ui + Lucide React

## 已知限制

1. **G13 认知栈待实现**：混合栈模型哲学设计完成，工程实现尚未开始
2. **LLM 规划循环**：复杂任务中 LLM 过度规划、不执行（Exp-035）
3. **LLM 行为引导**：LLM 偶尔不遵循 trait 教育（如不调用 completeStep、过度社交）
4. **前端 SSE 开发模式**：Vite proxy 会 buffer SSE 流，开发模式下 SSE 直连后端 8080 端口
