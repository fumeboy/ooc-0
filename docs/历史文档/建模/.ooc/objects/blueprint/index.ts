import { base } from '../../../kernel/object'

// ooc core 模型
export interface self extends base {
    field_a: string
    field_b: number
    field_c: {
        field_c_a: string
        field_c_b: number
    }
}