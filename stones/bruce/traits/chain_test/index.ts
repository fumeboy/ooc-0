
export function double(ctx, n) {
  return n * 2;
}

export function doubleAndAdd(ctx, a, b) {
  // 尝试调用同一 trait 内的 double 函数
  return double(ctx, a) + double(ctx, b);
}

export function pipeline(ctx, n) {
  // 链式调用：double -> doubleAndAdd
  const d = double(ctx, n);
  return doubleAndAdd(ctx, d, n);
}
