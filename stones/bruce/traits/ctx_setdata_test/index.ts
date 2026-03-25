
export function testSetData(ctx) {
  const before = ctx.data.p_count;
  ctx.setData("p_count", 999);
  const after = ctx.data.p_count;
  return { before, after, same: before === after };
}
