# 用例 012：多 Object 通过 Issue 讨论

## 场景描述

验证三个 Object 通过 Issue 进行多方讨论的能力。supervisor 创建 Issue，邀请 sophia 和 kernel 参与，分别从哲学和工程角度发表意见，最后汇总。

对应 spec 14.4 场景 3。

## 操作步骤

```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "请创建一个 Issue 讨论「线程树架构的下一步优化方向」，邀请 sophia 和 kernel 参与。先让 sophia 从哲学角度发表意见，再让 kernel 从工程角度发表意见，最后你汇总两方观点给我。"}' \
  --max-time 600
```

## 检查点

- [ ] supervisor 成功调用 createIssue 创建 Issue
- [ ] supervisor 用 [talk] 委派 sophia
- [ ] World 路由成功（日志出现 `跨 Object talk: supervisor → sophia`）
- [ ] sophia 独立执行并 return
- [ ] supervisor 用 [talk] 委派 kernel
- [ ] kernel 独立执行并 return
- [ ] supervisor 汇总两方观点并 return
