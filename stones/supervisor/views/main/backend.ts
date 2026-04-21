/**
 * Supervisor 主 View 后端（Phase 3 示例）
 *
 * - ui_methods：开放给前端（通过 HTTP POST /call_method 调用）
 * - llm_methods：开放给 LLM 沙箱（通过 callMethod 调用）
 *
 * @ref docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md#4.4
 */
import type { TraitMethod } from "../../../../../kernel/src/types/index.js";

/** UI methods：前端通过 POST /api/flows/:sid/objects/supervisor/call_method 触发 */
export const ui_methods: Record<string, TraitMethod> = {
  ping: {
    name: "ping",
    description: "View ping 示例：回显参数并写入 data.lastPing",
    params: [
      {
        name: "from",
        type: "string",
        description: "来源标识（通常传 'ui'）",
        required: false,
      },
    ],
    fn: async (ctx: any, args: Record<string, unknown>) => {
      const from = typeof args.from === "string" ? args.from : "unknown";
      ctx.setData("lastPing", { from, ts: Date.now() });
      return { ok: true, from, at: Date.now() };
    },
  },
};

/** LLM methods：默认为空；如需对 LLM 也开放方法，可在此填入 */
export const llm_methods: Record<string, TraitMethod> = {};
