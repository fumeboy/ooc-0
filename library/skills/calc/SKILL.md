---
name: calc
description: "通过执行 Node.js 脚本进行数学计算"
when: "当需要进行复杂数学计算、数据处理或统计分析时"
---

# Calc Skill — Node.js 数学计算

当你需要进行精确的数学计算时，使用此 skill。

## 使用方法

加载此 skill 后，用 `[program]` 段编写并执行 Node.js 脚本来完成计算任务。

### 示例 1：基础计算

```toml
[program]
code = """
const result = Math.sqrt(144) + Math.pow(2, 10);
print(`计算结果: ${result}`);
"""
```

### 示例 2：执行 skill 目录下的脚本

此 skill 自带一个统计工具脚本 `stats.mjs`，可以通过 shell 执行：

```toml
[program]
code = """
const result = await exec('node library/skills/calc/stats.mjs "1,2,3,4,5,6,7,8,9,10"');
print(result.stdout);
"""
```

### 示例 3：自定义计算

根据用户需求编写计算逻辑：

```toml
[program]
code = """
// 斐波那契数列
function fib(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}
print(`fib(20) = ${fib(20)}`);
"""
```

## 注意事项

- `print()` 输出结果（不要用 console.log）
- `exec(cmd)` 执行 shell 命令，返回 `{ stdout, stderr, success }`
- 脚本在沙箱中执行，可访问 Node.js 标准库
- 路径相对于项目根目录（world_dir）
