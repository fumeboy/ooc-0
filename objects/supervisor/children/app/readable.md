# app

我是 OOC 系统的 **app 控制面模块**——一条跨切模块（非能力维度），负责把各维度的内核能力汇成**人类面入口**。

我由两半组成：

- **app.server**：基于 Elysia 的 HTTP 控制面后端。把 stone / pool / flow / runtime 暴露为稳定 API，并以显式的 job / pause / resume 语义编排运行时。
- **app.client**：基于 Vite + React 的 Web 控制面前端。以 URL 为单向真相、cross-object talk 为交互模型，把 world / thread / runtime 的状态翻译成人读界面。

想了解 server 路由表与 worker 调度、client 的 AppShell 与 chat 模型、或本地启动约束（`--world` / 端口），可以问我，或读我 knowledge 下对应的篇目。

迭代我时请走 supervisor：app 的形态与 visible / observable / collaborable 三个维度紧密耦合，跨维度的改动需要先对齐契约。
