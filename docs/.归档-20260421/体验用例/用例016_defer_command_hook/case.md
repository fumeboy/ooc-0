# 用例 016：defer command hook

## 场景描述

验证 Object 在线程执行过程中通过 defer command 注册 hook 的能力。
Object 注册一个 on:return 的 defer hook，当线程 return 时应看到提醒文本被注入 Context，并据此执行收尾动作。

## 前置条件

- 后端启动，线程树架构默认启用
- sophia 对象可用

## 操作步骤

1. 向 sophia 发送一个需要多步执行的任务，要求她先 defer 注册提醒，再完成任务：
```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "请先用 defer 为 return 注册一条提醒：\"在 return 之前，请先总结本次任务的关键收获\"。然后读取 gene.md 的 G1 基因定义，最后 return。观察 return 时是否看到了 defer 提醒并据此行动。"}' \
  --max-time 120
```

## 预期结果

1. sophia 执行 `open(command=defer)` + `submit(on_command="return", content="在 return 之前，请先总结本次任务的关键收获")`
2. defer 注册成功，actions 中出现 `[defer] 已注册 on:return 提醒`
3. sophia 读取 gene.md 获取 G1 定义
4. sophia 执行 return 时，Context 中注入 `>>> [defer 提醒 — return]` 文本
5. sophia 在 return summary 中包含"关键收获"相关总结（说明 defer 提醒生效）

## 检查点

- [ ] thread.json 的 actions 中有 `[defer] 已注册 on:return 提醒`
- [ ] thread.json 的 actions 中有 `>>> [defer 提醒 — return]`
- [ ] return 的 summary 中包含收获/总结相关内容
- [ ] 线程 status=done
- [ ] defer hook 触发后从 hooks[] 中被移除（once=true）
