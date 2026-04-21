# E7: 知识的对象化

**涉及基因**: G1(万物皆对象) + G3(Trait) + G7(持久化)

当一个概念被建模为对象时，它获得了：
- 身份（thinkable.who_am_i / talkable.who_am_i）
- 结构化知识（traits 中的 readme.md）
- 可调用的能力（traits 中的 index.ts）
- 与其他概念的关系（_relatable）

例如：「代码质量」不是一个抽象概念，而是一个 Stone 对象：
- traits/lint/ 提供了代码检查方法
- traits/review/ 提供了代码审查指导
- talkable.functions 暴露了 review(code) 接口
- _relatable 连接到 coding_standards、security_policy 等对象

其他 Flow 不需要「理解」代码质量——它们只需要调用 quality.review(code)。
知识被封装在对象中，通过接口共享。

## 验证状态

未验证。待设计实验。
