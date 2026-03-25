export function typedAdd(a: number, b: number): number {
  return a + b;
}

export function mistyped(x: number): string {
  // TS 类型错误：返回 number 但声明返回 string
  return x * 2 as any;
}