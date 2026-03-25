
function debugParams(ctx, a, b, c) {
  return {
    ctxKeys: Object.keys(ctx || {}),
    a: a,
    b: b,
    c: c,
    argTypes: {
      ctx: typeof ctx,
      a: typeof a,
      b: typeof b,
      c: typeof c
    }
  };
}
module.exports = { debugParams };
