export function willThrow(): string {
  throw new Error("intentional runtime error");
}

export function willTypeError(x: any): string {
  return x.nonexistent.property;
}