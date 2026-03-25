
export function probeCtx(ctx) {
  return {
    type: typeof ctx,
    isNull: ctx === null,
    isUndefined: ctx === undefined,
    keys: ctx ? Object.keys(ctx) : [],
    proto: ctx ? Object.getOwnPropertyNames(Object.getPrototypeOf(ctx) || {}) : [],
    str: String(ctx)
  };
}
