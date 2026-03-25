
export function pIncrement(ctx) {
  const current = ctx.data.p_count || 0;
  const next = current + 1;
  ctx.setData("p_count", next);
  return next;
}

export function pGetCount(ctx) {
  return ctx.data.p_count || 0;
}

export function pReset(ctx) {
  ctx.setData("p_count", 0);
  return 0;
}

export function pSet(ctx, value) {
  ctx.setData("p_count", value);
  return value;
}
