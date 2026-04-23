# Debugger 诊断经验库

## 已知问题模式

### 模式 1：API 幻觉

**症状**：对象在 [program] 中调用不存在的函数，报错 "xxx is not defined"

**典型案例**：nexus 调用 `readFile()`、`readCode()`，实际沙箱中不存在这些函数

**根因**：LLM 混淆了不同环境的 API。沙箱中可用的 API 列在 computable trait 中，但 LLM 会从训练数据中"记忆"出不存在的函数名

**诊断线索**：
- actions 中出现连续的 error，每次换一个函数名尝试
- 最终 fallback 到 shell 命令（`#!/bin/sh cat ...`）

**修复方向**：
- computable trait 中明确列出所有可用 API 和文件操作方式
- 已修复：computable trait 现在声明了 Bun 运行时和标准库 API

### 模式 2：路径迷失

**症状**：对象用 `find`、`ls` 大量探索文件系统，浪费 5-10 个 actions 才找到目标文件

**典型案例**：kernel 花了 22 个 actions 探索代码结构，最终超时失败

**根因**：对象的 context 中没有路径信息。虽然沙箱注入了 `self_dir`、`world_dir` 等变量，但 context 的 STATUS 区域没有显示这些变量的值，对象不知道自己在哪

**诊断线索**：
- actions 中大量 `find`、`ls`、`pwd` 命令
- 对象在 thought 中说"让我先找到项目结构"
- 使用绝对路径硬编码（如 `/Users/xxx/...`）

**修复方向**：
- context STATUS 区域注入路径变量值
- 已修复：context 现在显示 self_dir、world_dir、task_dir 等的实际值
- 对象的 memory.md 中预置项目结构知识

### 模式 3：文件写入路径错误

**症状**：对象写文件到错误位置（多一层目录、少一层目录、拼错路径）

**典型案例**：nexus 把 index.ts 写到 `user/user/stones/nexus/...`（多了一层 user/）

**根因**：对象用 shell 或 Bun.write 写文件时，路径完全靠自己拼接。shell 的工作目录是 `self_dir`（stones/{name}/），对象不清楚相对路径的基准

**诊断线索**：
- actions 中 `Bun.write` 或 shell 写入后，后续 `ls` 找不到文件
- 对象在 thought 中说"文件写到了错误路径"
- 出现路径中有重复段（如 `user/user/` 或 `stones/stones/`）

**修复方向**：
- context 中明确显示路径变量值（已修复）
- 对象应使用 `self_dir`、`task_files_dir` 等变量拼接路径，而非猜测相对路径

### 模式 4：超时浪费

**症状**：对象在简单任务上消耗大量 actions，最终超时（达到 maxIterations）

**典型案例**：kernel 收到"改一行代码"的任务，花了 22 个 actions 探索代码结构后超时

**根因**：对象缺少持久化的项目知识。每次新 session 都从零开始探索，没有利用 memory.md 中的经验

**诊断线索**：
- actions 总数接近 maxIterations（通常 30）
- 前 50% 的 actions 都在"探索"而非"执行"
- 对象的 memory.md 为空或缺少项目结构信息

**修复方向**：
- 为对象创建 memory.md，预置项目结构知识
- 已修复：kernel、nexus、sophia、iris 都有了 memory.md

### 模式 5：消息重复发送

**症状**：对象向同一个目标发送内容相同或相似的消息

**诊断线索**：
- actions 中多次出现 `talk()` 调用，目标和内容相似
- effects 显示多次"已投递"

**根因**：对象不确定消息是否发送成功，或者 context 中没有清晰显示已发送的消息

### 模式 6：假完成

**症状**：对象声称任务完成，但实际产出不存在或不正确

**诊断线索**：
- `finish_plan_node` 的 summary 说"已完成"，但没有验证 action
- 文件声称已写入，但 `ls` 找不到
- 测试声称通过，但没有实际运行测试的 action

**根因**：对象跳过了验证步骤（违反 verifiable trait）

### 模式 7：LLM 流式空内容与参数越界

**症状**：简单请求（如 “hi”）也触发任务失败或“处理超时”，同时日志出现 HTTP 400

**根因**：
- 上游流式响应只返回 reasoning_content，客户端仅消费 delta.content 导致空输出
- max_tokens 设为 400000，超过上游上限（<= 131072），触发 400
- when_wait 注入后未再次输出 [wait]，被判定为超时

**诊断线索**：
- 终端出现 `HTTP 400 ... max_tokens ... <= 131072`
- flow 中出现 “任务处理超时，未能完成”
- llm.output.txt 为空或仅含 [thought]/[talk]/[wait]

**修复方向**：
- 限制 max_tokens 上限
- 流式无 content 时回退到非流式或使用 reasoning_content
- when_wait 注入后允许下一轮自动进入 waiting

## 本次案例

**触发**：supervisor 收到 “hi” 即失败

**证据**：终端报 `HTTP 400 max_tokens ... 400000`；流式仅 reasoning_content；Flow 已回复但最终 failed

**修复**：限制 max_tokens、流式回退、pendingWait 兜底

**验证**：发送 “hi” 后 Flow 状态为 waiting，正常回复

## 诊断工具箱

### 快速扫描脚本

```javascript
// 扫描 session 下所有 flow 的状态和错误
const { readdirSync } = require("node:fs");
const sessionDir = world_dir + "/flows/{SESSION_ID}/objects/";
for (const name of readdirSync(sessionDir)) {
  // 读取 data.json（flow 状态）
  const dataPath = sessionDir + name + "/data.json";
  const data = JSON.parse(await Bun.file(dataPath).text());
  
  // 读取 threads.json（线程树）
  const threadsPath = sessionDir + name + "/threads.json";
  const threads = JSON.parse(await Bun.file(threadsPath).text());
  
  // 递归收集所有 thread 的 actions
  const collectActions = async (threadId) =&gt; {
    const threadPath = sessionDir + name + "/thread-" + threadId + ".json";
    const thread = JSON.parse(await Bun.file(threadPath).text());
    let actions = [...(thread.actions || [])];
    for (const childId of thread.children || []) {
      actions.push(...await collectActions(childId));
    }
    return actions;
  };
  
  const actions = await collectActions(threads.rootThreadId);
  const errors = actions.filter(a =&gt; (a.result || "").toLowerCase().includes("error"));

  print(`${name}: status=${data.status} actions=${actions.length} errors=${errors.length}`);
}
```
