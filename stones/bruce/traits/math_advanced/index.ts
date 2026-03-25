
export function square(ctx, n) {
  return n * n;
}

export function sumOfSquares(ctx, a, b) {
  // 调用同 trait 内的 square 函数
  return square(ctx, a) + square(ctx, b);
}

export function hypotenuse(ctx, a, b) {
  // 调用 sumOfSquares，再开方
  return Math.sqrt(sumOfSquares(ctx, a, b));
}
