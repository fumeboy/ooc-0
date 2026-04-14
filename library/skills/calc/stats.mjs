#!/usr/bin/env node
/**
 * 统计工具脚本
 *
 * 用法: node stats.mjs "1,2,3,4,5"
 * 输出: 均值、中位数、标准差、最大值、最小值
 */

const input = process.argv[2];
if (!input) {
  console.log("用法: node stats.mjs \"1,2,3,4,5\"");
  process.exit(1);
}

const numbers = input.split(",").map(Number).filter(n => !isNaN(n));
if (numbers.length === 0) {
  console.log("错误: 没有有效的数字");
  process.exit(1);
}

const sum = numbers.reduce((a, b) => a + b, 0);
const mean = sum / numbers.length;

const sorted = [...numbers].sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
const median = sorted.length % 2 === 0
  ? (sorted[mid - 1] + sorted[mid]) / 2
  : sorted[mid];

const variance = numbers.reduce((acc, n) => acc + (n - mean) ** 2, 0) / numbers.length;
const stddev = Math.sqrt(variance);

console.log(`数据: [${numbers.join(", ")}]`);
console.log(`数量: ${numbers.length}`);
console.log(`总和: ${sum}`);
console.log(`均值: ${mean.toFixed(4)}`);
console.log(`中位数: ${median}`);
console.log(`标准差: ${stddev.toFixed(4)}`);
console.log(`最小值: ${Math.min(...numbers)}`);
console.log(`最大值: ${Math.max(...numbers)}`);
