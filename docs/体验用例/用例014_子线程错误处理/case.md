# 用例 014：子线程错误处理

## 场景描述

验证子线程中 program 执行失败后的错误处理机制：错误是否被沙箱捕获、是否传播到父线程、LLM 能否看到错误信息。

对应 spec 14.4 场景 5。

## 前置条件

- 后端启动，线程树架构默认启用
- sophia 对象可用

## 操作步骤

```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "请创建一个子线程，让它执行一段会失败的代码：throw new Error(\"测试错误\")。观察错误是否正确传播回来，然后告诉我结果。"}' \
  --max-time 120
```

## 预期结果

1. sophia 创建子线程执行 `throw new Error("测试错误")`
2. CodeExecutor 沙箱捕获错误，不崩溃
3. 错误信息完整保留在 action 的 result 字段中
4. LLM 能看到错误信息并分析
5. 主线程正常完成

## 检查点

- [ ] `throw new Error` 被沙箱捕获
- [ ] 错误信息完整保留
- [ ] 线程不崩溃（status 保持 running）
- [ ] LLM 能看到错误并做出合理分析
- [ ] 主线程正常完成（status=done）
