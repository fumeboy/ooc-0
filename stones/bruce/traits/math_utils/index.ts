
export function add(ctx, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('add requires two numbers');
  }
  return a + b;
}

export function multiply(ctx, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('multiply requires two numbers');
  }
  return a * b;
}

export function factorial(ctx, n) {
  if (typeof n !== 'number' || n < 0 || !Number.isInteger(n)) {
    throw new Error('factorial requires a non-negative integer');
  }
  if (n <= 1) return 1;
  return n * factorial(ctx, n - 1);
}

export function subtract(ctx, a, b) {
  return a - b;
}
