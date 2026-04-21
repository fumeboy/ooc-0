# OOC 测试手册（Testbook）

测试的目的不仅是证明程序没有 bug，更是验证 OOC 系统真的如 meta.txt 所设想的那样——
成为一个具备自适应能力的智能体协作网络。

每一组测试都对应 OOC 理论中的一个核心命题。
如果测试通过，说明这个命题在代码层面成立。

---

## 一、现有测试解读

### 1. test_stone.py —— "原子"的完备性

Stone 是 OOC 的基础粒子。meta.txt 定义 object 具有 field、method、bias、relation。
这组测试验证的命题是：**一个最基础的对象，是否真的能承载数据、行为、思维方式和关系？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_set_and_get_field | 对象能持有数据 |
| test_delete_field | 对象能遗忘数据 |
| test_list_fields_returns_copy | 对象的内部状态不会被外部意外篡改 |
| test_set_code_and_call_method | 对象能拥有可执行的行为 |
| test_set_code_replaces_all_methods | 对象的行为可以被完全重写（元编程基础） |
| test_add_and_get_bias | 对象能拥有思维方式 |
| test_remove_bias | 对象能放弃某种思维方式 |
| test_add_relation_with_object_target | 对象能与其他对象建立关系 |
| test_get_relations_filter_by_type | 对象能按类型检索关系（如只看 "uses" 关系） |
| test_round_trip | 对象的完整状态可以序列化和恢复 |

### 2. test_bias_think.py —— "思维方式"能否真正驱动思考

Bias 是 OOC 最核心的创新：对象不是被动的数据容器，而是拥有"思维视角"的主体。
这组测试验证：**Bias 能否构建 prompt、调用 LLM、解析结构化输出？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_think_returns_result | Bias 能通过 LLM 产出结构化的思考结果（thought + program） |
| test_think_with_non_json_response | 即使 LLM 返回自由文本，系统也能优雅降级 |
| test_think_with_markdown_json | 兼容 LLM 常见的 markdown 包裹格式 |
| test_think_sends_correct_messages | Bias 的 description 被正确注入为 system prompt |
| test_prompt_includes_context_prompt | 结构化 Context 被注入到 prompt 中 |
| test_default_kind_is_extend | 默认 Bias 是扩展型（按需激活） |
| test_roundtrip_serialization | Bias 的 kind/phase 在序列化后不丢失 |
| test_from_dict_backward_compatible | 旧数据（无 kind/phase）能正常加载 |

### 3. test_biases.py —— 内置 Bias 的"性格"是否正确

meta.bias.txt 定义了 15 个内置 Bias，每个都有明确的 kind、phase、when 条件。
这组测试验证：**每个内置 Bias 的触发条件、分类、阶段是否与设计文档一致？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_comprehension_is_always_on | 理解力是 always-on 的——对象时刻在理解上下文 |
| test_planning_requires_active | 只有活跃的对象才会制定计划 |
| test_boundary_is_always_on | 安全边界检查永远不能关闭 |
| test_cognitive_biases_kind_phase | 认知 Bias 的 main/extend 和 phase 分类正确 |
| test_execution_biases_kind_phase | 执行 Bias 的分类正确 |
| test_lifecycle_biases_kind_phase | 生命周期 Bias 全部是 main（不可跳过） |
| test_bias_think_with_mock | Bias 能通过 MockLLM 完成完整的思考流程 |



### 4. test_flow.py —— Flow 是否真的能"思考并行动"

Flow 是 OOC 的核心活跃单元。meta.txt 说"所有做事情都通过 Flow 完成"。
这组测试验证：**Flow 能否经历完整的生命周期、编排 Bias 进行思考、执行 program、管理子 Flow？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_initial_state_is_creating | Flow 创建时处于 creating 状态 |
| test_activate / test_destroy | Flow 有完整的生命周期状态机 |
| test_destroy_children | 销毁父 Flow 时递归销毁子 Flow（资源不泄漏） |
| test_process_event_activates_correct_biases | root_index 能正确筛选 Bias（always-on 被激活，条件不满足的不激活） |
| test_process_event_executes_program | 思考结果中的 program 被真正执行（set_field 生效） |
| test_process_event_without_llm_raises | 没有 LLM 的 Flow 无法思考（合理的错误边界） |
| test_flow_finish / test_flow_wait / test_flow_fail | Thinkloop 控制：Flow 能主动结束、等待、失败 |
| test_context_who_am_i_from_main_biases | Context.who_am_i 包含 stone.role 和 main bias（extend bias 不污染核心角色） |
| test_context_process_events_recorded | 每次思考都留下过程记录（可追溯） |
| test_run_flow_basic | World 调度引擎能驱动多轮 thinkloop |
| test_run_flow_stops_on_finish | Flow 调用 finish() 后 thinkloop 停止 |
| test_run_flow_stops_on_wait | Flow 调用 wait() 后 thinkloop 暂停 |
| test_on_child_flow_finished_resumes_parent | 子 Flow 完成后，等待中的父 Flow 被唤醒 |

### 5. test_focus.py —— Focus 机制：对象能否自主拆分任务

meta.txt 说 Flow 具有"聚焦能力——可以自主拆分任务，创建子 Flow"。
这组测试验证：**Flow 能否创建子 Flow 树、传递上下文、收集结果？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_spawn_and_execute_child_flows | 父 Flow 能创建子 Flow 并让它们独立执行 |
| test_multi_level_flow_tree | 支持多层 Flow 派生树（root → level1 → level2） |
| test_destroy_tree | 销毁根节点时整棵树被递归销毁 |
| test_wait_children_collects_results | 父 Flow 能收集所有子 Flow 的执行结果（convergence） |
| test_child_flow_inherits_context | 子 Flow 继承父 Flow 的 world 和 llm（共享基础设施） |
| test_flow_tree_relations | Flow 树的 parent_of / child_of 关系链正确 |



### 6. test_context.py —— 结构化上下文是否能替代 flat dict

FlowContext 是本次重构的核心产物。meta.txt 中 Flow 的思考需要 who_am_i、request、process、flows 等结构化信息。
这组测试验证：**Context 能否正确组织思考所需的全部信息？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_create_with_who_am_i_and_request | Context 能承载角色认知和任务目标 |
| test_add_process_event | 执行过程被逐条记录（可追溯的思考链） |
| test_add_flow_status_update_existing | 子 Flow 状态更新而非追加（状态一致性） |
| test_to_prompt_basic | Context 能转为 LLM 可读的 prompt 文本 |
| test_to_prompt_with_process | 过程记录被包含在 prompt 中（LLM 能看到历史） |
| test_to_prompt_with_flows | 子 Flow 状态被包含在 prompt 中（LLM 能感知并行任务） |
| test_serialization_with_parent_ref | parent 引用通过 Ref 正确序列化 |

### 7. test_bias_flow.py —— extend Bias 能否以子 Flow 形式独立思考

BiasFlow 是 extend bias 的执行载体。meta.txt 说 extend bias "按照激活条件、按需参与思考"。
这组测试验证：**extend bias 能否作为独立的子 Flow 执行，持有 parent context，支持 refresh？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_create_basic | BiasFlow 能被创建并关联到一个 Bias |
| test_registered_as_child | BiasFlow 自动注册为 parent 的子 Flow |
| test_inherits_world_and_llm | BiasFlow 共享 parent 的基础设施 |
| test_execute_returns_result | BiasFlow 能独立执行思考并返回结果 |
| test_execute_without_llm_raises | 没有 LLM 时合理报错 |
| test_refresh_re_executes | refresh() 能基于最新 context 重新思考 |
| test_build_context_with_parent_context | BiasFlow 能访问 parent 的 public context |
| test_to_flow_status | BiasFlow 的状态能被 parent 感知 |

### 8. test_chat.py —— 对话是否真的能创建一个"继承了目标能力"的 Flow

meta.txt 说 Chat 是"来自外部对话的 Flow"，多继承自目标 Stone 和 Flow。
这组测试验证：**talk() 创建的 Chat 是否真的继承了目标对象的字段、方法、Bias？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_chat_inherits_target_fields | Chat 继承目标的字段（researcher 的 role 传递给 Chat） |
| test_chat_inherits_target_methods | Chat 继承目标的方法（可以调用 researcher 的 greet） |
| test_chat_inherits_target_biases | Chat 继承目标的 Bias（拥有 researcher 的思维方式） |
| test_chat_has_relations | Chat 建立 talk_from / talk_to 关系 |
| test_chat_messages | Chat 支持多轮消息交互 |
| test_chat_is_flow | Chat 是 Flow，具有完整的思考能力 |
| test_talk_registers_in_world | talk() 创建的 Chat 被注册到 World |
| test_stone_talk_method | 任何 Stone 都能通过 talk() 发起对话 |



### 9. test_executor.py —— 对象的"行动"是否安全可控

meta.txt 说对象通过"输出 Python 程序"来行动。这意味着代码执行必须安全。
这组测试验证：**代码执行引擎是否既强大又安全？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_simple_execution | 基本代码能执行并返回结果 |
| test_stdout_capture | 执行输出被捕获（可观测） |
| test_context_injection | self 被正确注入（对象能操作自己） |
| test_modify_self_fields | 对象能通过代码修改自己的字段 |
| test_call_self_method | 对象能通过代码调用自己的方法 |
| test_dangerous_import_blocked | 危险模块（os, subprocess）被拦截 |
| test_runtime_error_caught | 运行时错误被捕获而非崩溃 |
| test_world_api_access | 对象能通过代码调用 world API |
| test_import_os_blocked / test_from_import_blocked | AST 级别的安全检查 |
| test_safe_import_allowed | 安全模块（json, math）不被误拦 |

### 10. test_metaprogramming.py —— 对象能否"为自己编写方法"

meta.txt 说对象"可以修改 self，包括字段、方法，具有元编程能力"。
meta.more.txt 将此类比为人类的"元认知"——不仅能思考问题，还能思考"如何思考问题"。
这组测试验证：**对象能否在运行时为自己添加、修改方法，并在持久化后保留？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_set_code_defines_method | 对象能通过 set_code 获得新方法 |
| test_set_code_redefine | 对象能重新定义已有方法（自我优化） |
| test_self_modify_via_executor | 对象通过执行代码为自己添加方法（真正的元编程） |
| test_self_modify_fields_via_executor | 对象通过执行代码修改自己的字段 |
| test_metaprogramming_persistence | 元编程后的方法在持久化后仍可调用 |
| test_metaprogramming_redefine_then_persist | 自我演化后持久化，恢复的是演化后的版本 |
| test_executor_metaprogramming_then_persist | 通过 Executor 元编程后持久化的完整链路 |

### 11. test_ref.py —— 对象引用是否支持延迟加载和序列化

meta.txt 中对象之间通过 Relation 关联，Ref[T] 是实现延迟加载的关键。
这组测试验证：**Ref 能否在序列化时变为 ID、在运行时按需解析为真实对象？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_get_without_resolver_raises | 没有 World 时 Ref 无法解析（合理的依赖） |
| test_ref_lazy_resolve | Ref 在首次 get() 时才解析（延迟加载） |
| test_ref_as_field | Ref 可以作为对象的字段值 |
| test_ref_to_dict / test_ref_from_dict | Ref 序列化为 {"__ref__": name} |
| test_nested_ref_in_list / test_nested_ref_in_dict | 嵌套在复杂数据结构中的 Ref 也能正确序列化 |
| test_round_trip | Ref 在持久化往返后仍能正确解析 |

### 12. test_world.py —— World 是否是一个可靠的"操作系统"

meta.txt 说 World 是特殊的对象，具有和底层系统交互的 API。
这组测试验证：**World 能否管理对象的创建、销毁、生命周期，并提供事件总线？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_world_self_registered | World 自身也是一个对象（自举） |
| test_create_object | World 能创建并注册对象 |
| test_create_duplicate_raises | 对象名唯一性约束 |
| test_destroy_object | World 能销毁对象 |
| test_destroy_world_raises | World 不能销毁自己（系统稳定性） |
| test_lifecycle_events | 对象创建/销毁时发射生命周期事件 |

### 13. test_persistence.py —— 对象能否"存档"和"恢复"

meta.txt 定义了对象的存档/销毁生命周期。
这组测试验证：**对象的完整状态（字段、方法、Bias、关系）能否持久化到磁盘并恢复？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_save_creates_files | 每个对象对应 code.py + data.json |
| test_save_data_json_content | data.json 包含字段、关系、Bias |
| test_round_trip_without_methods | 纯数据对象的往返 |
| test_round_trip_with_methods | 带方法的对象往返（code.py 保留源码） |
| test_load_without_code_py | 没有 code.py 时也能加载（向后兼容） |

### 14. test_bootstrap.py —— 系统能否正确启动和关闭

这组测试验证：**OOC 系统的完整启动链路（World → Extensions → 持久化加载）和关闭链路（持久化保存）。**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_startup | 启动后 world、user、filesystem、browser、terminal 都存在 |
| test_shutdown_persists_objects | 关闭时对象被持久化 |
| test_restart_loads_objects | 重启后对象被恢复（状态不丢失） |
| test_directories_created | 启动时自动创建必要的目录 |

### 15. test_filesystem_ext.py / test_browser_ext.py / test_terminal_ext.py —— Extension 是否安全可用

meta.more.txt 详细定义了 Extension 的权限边界和生命周期。
这组测试验证：**Extension 能否安全地提供外部资源访问？**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_path_traversal_blocked | 文件系统不允许路径穿越（安全边界） |
| test_allowed_domains / test_blocked_domains | 浏览器有域名黑白名单 |
| test_blocked_command | 终端有命令白名单 |
| test_created_by_relation | Extension 创建的对象自动建立 created_by 关系 |
| test_cleanup | Extension 清理时释放所有资源 |

### 16. test_e2e_research.py —— Deep Research 场景的端到端验证

这是最接近 meta.bias.mock.txt 场景的测试。
验证：**从用户发起研究请求，到 Flow 树创建、Bias 触发、子 Flow 执行、结果收集的完整链路。**

| 测试 | 验证的 OOC 命题 |
|------|----------------|
| test_research_flow_tree | 研究任务被拆分为 search/read/analyze/write 四个子 Flow |
| test_bias_orchestration | Bias 编排管线正确工作（root_index → think → synthesis → execute） |
| test_focus_and_convergence | Focus 拆分任务 + Convergence 收集结果 |
| test_extension_interaction | Flow 能通过 Extension 访问外部资源 |
| test_system_bootstrap_with_extensions | 完整系统启动后对象数量正确 |
| test_persistence_across_restart | 对象在系统重启后状态不丢失 |

---

## 二、尚未覆盖的场景——对照 meta.txt 的差距分析

以下是 meta.txt / meta.more.txt / meta.bias.txt / meta.bias.mock.txt 中描述了，
但当前测试尚未验证的核心场景。按重要程度排序。

### A. 自我演化（Self-Evolution）—— OOC 最核心的承诺

meta.txt 说对象具有"自我学习能力、自我优化能力"。
meta.bias.mock.txt 中 researcher 在研究过程中自主新增了 academic_search_bias 并优化了 planning_bias。
**当前没有任何测试验证 Bias 的动态添加和优化。**

建议测试：
- test_flow_adds_bias_during_thinking: Flow 在 thinkloop 中通过 actions 为自己添加新 Bias
- test_flow_modifies_bias_during_thinking: Flow 修改已有 Bias 的 prompt（自我优化）
- test_self_evolution_persists: 自我演化后的 Bias 在持久化后保留
- test_metaprogramming_adds_method_then_calls_it: 对象在 thinkloop 中为自己编写新方法并立即使用

### B. 多轮 Thinkloop 的智能行为

meta.txt 描述的 thinkloop 是循环式的：思考 → 执行 → 更新 context → 继续。
当前 test_run_flow_basic 只验证了"执行 N 次"，没有验证"基于上一轮结果决定下一步"。

建议测试：
- test_thinkloop_context_accumulates: 每轮 think 的结果累积到 context.process 中，后续轮次能看到历史
- test_thinkloop_flow_decides_to_finish: Flow 在第 N 轮思考后自主决定 finish（而非外部控制）
- test_thinkloop_flow_spawns_child_then_waits: Flow 在 thinkloop 中创建子 Flow 并 wait，子 Flow 完成后 parent 恢复
- test_thinkloop_with_real_bias_orchestration: 使用完整的内置 Bias 集合（comprehension + planning + execution）进行多轮思考

### C. Flow 派生树的完整生命周期

meta.bias.mock.txt 描述了 26 个 Flow 的完整生命周期。
当前测试只验证了 2-3 层的简单树结构。

建议测试：
- test_deep_flow_tree_lifecycle: 4+ 层 Flow 树的创建、执行、销毁
- test_parallel_child_flows: 多个子 Flow 并行执行，parent 等待全部完成
- test_child_flow_failure_propagation: 子 Flow 失败时 parent 如何处理
- test_flow_tree_context_isolation: 子 Flow 的 context 不污染 parent（隔离性）
- test_flow_tree_context_sharing: 子 Flow 能读取 parent 的 public context（共享性）

### D. Bias 的三阶段编排（pre_thinking → thinking → post_thinking）

meta.txt 明确定义了三个阶段：
- pre_thinking: 联想、信息查找
- thinking: 输出计划、具体行动
- post_thinking: 修饰、检查、约束

当前测试只验证了 kind/phase 字段的值，没有验证阶段顺序是否被执行引擎尊重。

建议测试：
- test_bias_phase_ordering: pre_thinking bias 先于 thinking bias 执行，thinking 先于 post_thinking
- test_pre_thinking_informs_thinking: pre_thinking 阶段的输出（如 comprehension）影响 thinking 阶段的输入
- test_post_thinking_can_veto: post_thinking 阶段的 boundary_bias 能否否决 thinking 阶段的决策

### E. Synthesis 的冲突仲裁

meta.bias.txt 说 synthesis_bias 需要"检测冲突、加权综合、冲突仲裁"。
当前 test_multiple_results_uses_llm 只验证了"多个结果交给 LLM"，没有验证冲突场景。

建议测试：
- test_synthesis_conflicting_actions: 两个 Bias 输出矛盾的 actions（一个说创建，一个说删除），synthesis 如何仲裁
- test_synthesis_confidence_weighting: 高置信度的 Bias 结果权重更大
- test_synthesis_priority_ordering: 高优先级的 Bias 结果优先

### F. 对话能力的深度验证

meta.txt 说对象具有"对话能力"。当前 test_chat.py 只验证了 Chat 的创建和继承，
没有验证多轮对话中 context 的演化。

建议测试：
- test_multi_turn_conversation: 多轮对话中 Chat 的 context 持续积累
- test_chat_spawns_child_flow: Chat 在对话过程中自主创建子 Flow 处理子任务
- test_chat_with_full_bias_set: Chat 继承目标的 Bias 后，完整的 Bias 编排管线工作正常

### G. Extension 协作

meta.more.txt 说 Extension 之间可以协作（如 browser 下载文件时委托 filesystem 创建 file 对象）。
当前没有测试验证 Extension 之间的协作。

建议测试：
- test_browser_delegates_to_filesystem: browser 下载内容后通过 filesystem 保存
- test_flow_uses_multiple_extensions: Flow 在一次 thinkloop 中同时使用 browser 和 filesystem
- test_extension_objects_have_relations: Extension 创建的对象之间建立 references 关系

### H. 记忆能力

meta.txt 说对象具有"记忆能力"。meta.bias.txt 定义了 memory_bias。
当前没有测试验证记忆的存储和检索。

建议测试：
- test_memory_bias_stores_important_info: memory_bias 将重要信息存储到对象的 field 中
- test_memory_persists_across_flows: 一个 Flow 的记忆在后续 Flow 中可被检索
- test_memory_across_restart: 记忆在系统重启后仍然存在

### I. BiasFlow 与 Thinkloop 的集成

BiasFlow 目前是独立测试的，没有验证它在 Flow.think() 中的实际使用。

建议测试：
- test_extend_bias_creates_bias_flow: Flow.think() 中 extend bias 被激活时自动创建 BiasFlow
- test_bias_flow_result_feeds_synthesis: BiasFlow 的结果被传递给 synthesis_bias
- test_bias_flow_refresh_on_context_change: parent context 更新后 BiasFlow 自动 refresh

### J. 安全边界的端到端验证

meta.bias.txt 说 boundary_bias 是 always-on 的，负责"确保操作在权限范围内"。
当前只有 sandbox 级别的安全测试，没有 Bias 级别的安全验证。

建议测试：
- test_boundary_bias_blocks_dangerous_action: boundary_bias 能否在 synthesis 阶段否决危险操作
- test_code_review_bias_catches_unsafe_code: code_review_bias 能否检测到不安全的元编程代码
