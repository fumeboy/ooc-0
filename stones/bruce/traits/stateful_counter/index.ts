
let count = 0;

export function increment(ctx) {
  count++;
  return count;
}

export function decrement(ctx) {
  count--;
  return count;
}

export function getCount(ctx) {
  return count;
}

export function reset(ctx) {
  count = 0;
  return count;
}
