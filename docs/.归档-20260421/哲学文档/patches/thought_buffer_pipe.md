// 思想的元编程

// 初始上下文信息
// 所有 think thread 都具有
let root = {
    self
    kernel traits
    always traits
}

let target // think thread 的目标、需求

// think = 进行一个子函数调用 = 行为树子节点的派生
// think 会开启一个独立的线程
// think 的初始上下文由 parent thread 提供
let t1 = think("active extends traits", root)
>> // think 创建的 child thread 会输出信息
    a info
    b info
    c info
<<
    补充 input 信息 // parent thread 可以向 child thread 发送信息
>>
    more info output

// 可以将前一步的输出作为下一步的输入
// child thread 的初始上下文不是全盘继承 parent thread 的上文，而是由 parent thread 选择需要的信息
let t2 = think("do a search", root, t1.c)
>>
    d info

let t3 = think("make a plan", root, t1.a, t1.b)
>>
    step1
        step1-1
    step2
    step3

let t4 = think("zoom in on step1-1", root, t3.step1-1)
>>
    info

let t5 = think("zoom in on step2", root, t3.step2)
>>
    error info

// 根据输出信息，选择合适的信息组装上下文进行思考、处理
let t6 = think("handle error", root, t5.error_info, root.traits.how_to_handle_error)











