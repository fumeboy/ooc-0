
// 中文注释：这是一个工具函数
export function greet(name: string): string {
  return `你好，${name}！欢迎使用 OOC 系统 🎉`;
}

export function matchEmail(text: string): boolean {
  const regex = /^[\w.-]+@[\w.-]+\.\w+$/;
  return regex.test(text);
}
