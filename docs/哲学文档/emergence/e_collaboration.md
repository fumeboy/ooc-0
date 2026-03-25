# E3: 对象生态协作

**涉及基因**: G1(万物皆对象) + G5(Context/通讯录) + G8(Effect)

当系统中存在多个专业对象时，协作自然发生：

```
researcher（研究员 Stone）
  ↓ main flow 接收任务
  ↓ 创建 sub-flow: browser
browser（浏览器工具 Stone）
  ↓ sub-flow 执行搜索
  ↓ 结果写入 shared/
researcher
  ↓ 创建 sub-flow: writer
writer（编码员 Stone）
  ↓ sub-flow 读取 shared/ 中的搜索结果
  ↓ 编写代码，写入 shared/
researcher
  ↓ 汇总结果，完成任务
```

关键点：
- 没有中央调度器——每个对象根据自己的 traits 和 context 自主决策
- 通讯录让对象知道「谁能做什么」，但不规定「谁必须做什么」
- talkable.functions 保证了协作的安全性——对象只能调用公开方法

## 新模型的变化

- Sub-flow 机制替代了旧模型的 delegateTo/talkInSpace
- 同一 Stone 在同一 main flow 下只有一个 sub-flow（唯一性约束）
- shared/ 目录提供任务级别的文件共享（替代旧模型的全局 SharedSpace）

## 验证状态

部分验证（Exp 009）：delegateTo/talkInSpace 基础设施可用。新模型的 sub-flow 机制待验证。
