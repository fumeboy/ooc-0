重新建模

文件目录结构
    .ooc/ -> ooc world
    .ooc/objects -> ooc objects
    .ooc/objects/{objectId} -> ooc object
    .ooc/objects/blueprint -> ooc object which id = blueprint
    .ooc/objects/blueprint/readme.md -> blueprint 的个人说明/定义/灵魂文件
    .ooc/objects/blueprint/index.ts -> blueprint 的数据类型定义
    .ooc/objects/blueprint/data.json -> blueprint 的数据
    .ooc/objects/blueprint/traits -> blueprint 的特质（对应我们原来的 bias 概念）；
    .ooc/objects/blueprint/traits/{trait_name} -> 具体特质的文件夹；特质类似于 claude code 的 skill 的概念，具有文档和程序
    .ooc/objects/blueprint/traits/part_foo/readme.md -> 和 skill 一样，有一个文档说明这个 trait 是什么
    .ooc/objects/blueprint/traits/part_foo/index.ts -> 和 skill 一样，可以提供程序进行扩展（对应我们现有的元编程能力）
    .ooc/objects/blueprint/effects -> ooc object 的工作区（对外产生影响的地方）
    .ooc/objects/blueprint/effects/{task_id} -> 对应的工作任务的区域, 也对应 blueprint 的一个 Flow 派生对象
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/context.xml -> blueprint Flow 的上下文
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/data.json -> blueprint Flow 对象的数据
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/traits -> blueprint Flow 对象可以加载/创建更多独属于当前任务的 traits
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/flows -> blueprint Flow 工作过程中，如何需要和其他对象交互，会在 flows 目录下创建其他对象的 Flow 对象目录
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/flows/browser -> blueprint Flow 工作过程中，和 browser 对象有交互，因此创建了 browser Flow 的目录
    .ooc/objects/blueprint/effects/2026-03-07-01_task_bar/shared -> 共享文件区，只有根 Flow 具有这个文件夹，子 Flow 只能复用根 Flow 的共享文件夹

原来的 biases/ codes/ windows/ 等，统一整合为 traits 对象扩展能力

原来的 thread 并行模型还需考虑，但是引入新的思考模型（具体见 docs/建模/.ooc/objects/blueprint/effects/2026-03-07-01_task_bar/context.xml）

在这个新的思考模型中，我引入了树形行为树的概念，object 在行动时，可以选择拆分“子步骤”，这就对应一个树的分支节点
目前 object 具有一个 focus 光标，可以移动到 doing/todo 的节点上表示正在处理对应的子步骤
当 focus 在某个子节点时，会自动缩略无关的节点的信息，只保留当前节点直接相关的信息
当一个子节点完成、回到父节点继续思考的过程，就好比 程序进程的 栈进、栈出，栈进 对应更具体的思考和处理，栈出 则自动实现“上下文回收”，避免信息持久污染LLM的上下文窗口