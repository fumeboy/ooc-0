import { self } from "../..";

/**
 * @module foo
 * @description foo
 */

interface _self extends self {
    field_foo: number // foo 字段
}

/**
 * @function foo
 * @description foo
 * @param {number} a - 第一个数
 * @param {number} b - 第二个数
 * @returns {number} 两数之和
 */
export function foo(self: _self, a: number, b: number): number {
    return self.field_foo + a + b;
}