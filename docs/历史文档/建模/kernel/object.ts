// ooc core 模型
export interface base {
    _id: string // global unique
    _name: string // 展示名称
    
    _thinkable: {
        who_am_i: string // 对内的个人说明
    }

    _talkable: {
        who_am_i: string // 对外的个人说明
        functions: { // 对外展示的函数列表
            name: string // 函数名
            description: string // 函数说明
        }[]
    }

    _relatable: { // 关联对象列表
        name: string // 关联对象名
        description: string // 关联对象说明
    }[]


}