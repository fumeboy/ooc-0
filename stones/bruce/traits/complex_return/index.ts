
export function returnObject(name: string, age: number) {
  return { name, age, active: true };
}

export function returnArray(n: number) {
  return Array.from({ length: n }, (_, i) => i * 2);
}

export function returnNested() {
  return {
    users: [
      { id: 1, name: "Alice", tags: ["admin", "dev"] },
      { id: 2, name: "Bob", tags: ["dev"] }
    ],
    meta: {
      total: 2,
      nested: { deep: { value: 42 } }
    }
  };
}

export function returnEdgeCases() {
  return {
    nullVal: null,
    undefinedVal: undefined,
    boolTrue: true,
    boolFalse: false,
    zero: 0,
    emptyString: "",
    emptyArray: [],
    emptyObject: {}
  };
}

export function returnMap() {
  const m = new Map();
  m.set("a", 1);
  m.set("b", 2);
  return m;
}

export function returnSet() {
  return new Set([1, 2, 3]);
}

export function returnDate() {
  return new Date("2025-01-01T00:00:00Z");
}
