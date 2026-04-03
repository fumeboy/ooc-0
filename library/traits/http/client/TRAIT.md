---
namespace: http
name: client
type: how_to_use_tool
version: 1.0.0
when: always
description: HTTP 请求能力：GET/POST/通用请求
deps: []
---
# HTTP 请求能力

你可以通过以下 API 发起 HTTP 请求。基于 Bun 原生 fetch 实现。

## 可用 API

### httpGet(url, options?)

发起 GET 请求。

- `url` — 请求地址
- `options.headers` — 自定义请求头
- `options.timeout` — 超时时间（毫秒，默认 30000）

```javascript
const result = await httpGet("https://api.example.com/users");
// result.data = {
//   status: 200,
//   headers: { "content-type": "application/json", ... },
//   body: '{"users": [...]}'
// }
```

### httpPost(url, body, options?)

发起 POST 请求。如果 body 是对象，自动 JSON 序列化并设置 Content-Type。

- `url` — 请求地址
- `body` — 请求体（字符串或对象）
- `options.headers` — 自定义请求头
- `options.timeout` — 超时时间（毫秒，默认 30000）

```javascript
const result = await httpPost("https://api.example.com/users", { name: "Alice" });
// result.data = {
//   status: 201,
//   headers: { ... },
//   body: '{"id": 1, "name": "Alice"}'
// }
```

### httpRequest(method, url, options?)

通用 HTTP 请求方法，httpGet 和 httpPost 都委托给它。

- `method` — HTTP 方法（GET/POST/PUT/DELETE 等）
- `url` — 请求地址
- `options.headers` — 自定义请求头
- `options.body` — 请求体（字符串或对象）
- `options.timeout` — 超时时间（毫秒，默认 30000）

```javascript
const result = await httpRequest("PUT", "https://api.example.com/users/1", {
  body: { name: "Bob" },
  headers: { "Authorization": "Bearer token123" },
  timeout: 10000,
});
```

## 注意事项

1. 响应 body 超过 50000 字符会被截断，避免上下文溢出
2. 超时默认 30 秒，可通过 options.timeout 自定义
3. 如果 body 是对象，自动设置 `Content-Type: application/json`
4. 网络错误或超时返回 `toolErr`，包含错误信息
