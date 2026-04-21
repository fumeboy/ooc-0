# E8: 渐进式能力获取

**涉及基因**: G2(Stone/Flow) + G1(万物皆对象) + G4(程序行动)

一个新创建的 Stone 只有基础属性（继承 kernel traits）。
通过一系列操作，它可以逐步获得能力：

```
1. 创建 Stone "assistant"           → 空对象（仅有 kernel traits）
2. 设置 readme.md                   → 有了身份
3. 添加自定义 traits                → 有了专属能力
4. 建立 _relatable                  → 有了社会关系
5. 接收任务，创建 Flow              → 有了思考能力
6. 在 Flow 中沉淀经验为新 trait     → 能力在成长
```

每一步都是独立的、可逆的。
对象的能力不是在构造时一次性确定的，而是可以随时增减的。

## 新模型的变化

- Kernel traits 提供基础能力（所有对象自动继承）
- User traits 提供专属能力（可覆盖 kernel 同名 trait）
- 能力获取 = 创建新 trait 或为已有 trait 添加 index.ts

## 验证状态

已验证（Exp 005）：createObject + writeCode 完整流程。
