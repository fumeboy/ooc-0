/**
 * http_client —— HTTP 请求 library trait
 *
 * 提供 HTTP 请求能力：GET/POST/通用请求。
 * 基于 Bun 原生 fetch API 实现。
 */

import { toolOk, toolErr } from "../../../../kernel/src/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/types/tool-result";

// ─── 类型定义 ─────────────────────────────────────────────

/** HTTP 请求的可选参数 */
interface HttpRequestOptions {
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 请求体（字符串或对象，对象会自动 JSON 序列化） */
  body?: string | Record<string, unknown>;
  /** 超时时间（毫秒，默认 30000） */
  timeout?: number;
}

/** HTTP 响应结果 */
interface HttpResponseData {
  /** HTTP 状态码 */
  status: number;
  /** 响应头（key-value） */
  headers: Record<string, string>;
  /** 响应体文本（超过 50000 字符会截断） */
  body: string;
}

/** 响应体最大长度，超过截断 */
const MAX_BODY_LENGTH = 50000;

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

// ─── 核心方法 ─────────────────────────────────────────────

/**
 * 通用 HTTP 请求
 * @param ctx - 上下文（保留，与其他 trait 签名一致）
 * @param method - HTTP 方法（GET/POST/PUT/DELETE 等）
 * @param url - 请求地址
 * @param options - 可选：headers、body、timeout
 * @returns 包含 status、headers、body 的结果
 */
export async function httpRequest(
  ctx: any,
  method: string,
  url: string,
  options?: HttpRequestOptions,
): Promise<ToolResult<HttpResponseData>> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  // 使用 AbortController 实现超时控制
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // 构建 fetch 选项
    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
    };

    // 处理请求头
    const headers: Record<string, string> = { ...options?.headers };

    // 处理请求体：对象自动 JSON 序列化
    if (options?.body !== undefined) {
      if (typeof options.body === "object") {
        fetchOptions.body = JSON.stringify(options.body);
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        fetchOptions.body = options.body;
      }
    }

    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // 发起请求
    const response = await fetch(url, fetchOptions);

    // 读取响应体并截断
    let body = await response.text();
    if (body.length > MAX_BODY_LENGTH) {
      body = body.slice(0, MAX_BODY_LENGTH) + `\n...[截断，原始长度 ${body.length}]`;
    }

    // 提取响应头
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return toolOk({ status: response.status, headers: responseHeaders, body });
  } catch (err: any) {
    // 区分超时和其他错误
    if (err?.name === "AbortError") {
      return toolErr(`请求超时（${timeout}ms）: ${url}`);
    }
    return toolErr(`HTTP 请求失败: ${err?.message ?? String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

// ─── 便捷方法 ─────────────────────────────────────────────

/**
 * 发起 GET 请求
 * @param ctx - 上下文
 * @param url - 请求地址
 * @param options - 可选：headers、timeout
 */
export async function httpGet(
  ctx: any,
  url: string,
  options?: Omit<HttpRequestOptions, "body">,
): Promise<ToolResult<HttpResponseData>> {
  return httpRequest(ctx, "GET", url, options);
}

/**
 * 发起 POST 请求
 * @param ctx - 上下文
 * @param url - 请求地址
 * @param body - 请求体（字符串或对象）
 * @param options - 可选：headers、timeout
 */
export async function httpPost(
  ctx: any,
  url: string,
  body: string | Record<string, unknown>,
  options?: Omit<HttpRequestOptions, "body">,
): Promise<ToolResult<HttpResponseData>> {
  return httpRequest(ctx, "POST", url, { ...options, body });
}

/* ========== Phase 2 新协议：llm_methods 对象导出 ========== */

import type { TraitMethod } from "../../../../kernel/src/types/index";

export const llm_methods: Record<string, TraitMethod> = {
  httpRequest: {
    name: "httpRequest",
    description: "通用 HTTP 请求",
    params: [
      { name: "method", type: "string", description: "HTTP 方法 GET/POST/PUT/DELETE", required: true },
      { name: "url", type: "string", description: "请求地址", required: true },
      { name: "headers", type: "object", description: "请求头", required: false },
      { name: "body", type: "string|object", description: "请求体", required: false },
      { name: "timeout", type: "number", description: "超时毫秒（默认 30000）", required: false },
    ],
    fn: ((ctx: any, { method, url, headers, body, timeout }: any) =>
      httpRequest(ctx, method, url, { headers, body, timeout })) as TraitMethod["fn"],
  },
  httpGet: {
    name: "httpGet",
    description: "发起 GET 请求",
    params: [
      { name: "url", type: "string", description: "请求地址", required: true },
      { name: "headers", type: "object", description: "请求头", required: false },
      { name: "timeout", type: "number", description: "超时毫秒", required: false },
    ],
    fn: ((ctx: any, { url, headers, timeout }: any) =>
      httpGet(ctx, url, { headers, timeout })) as TraitMethod["fn"],
  },
  httpPost: {
    name: "httpPost",
    description: "发起 POST 请求",
    params: [
      { name: "url", type: "string", description: "请求地址", required: true },
      { name: "body", type: "string|object", description: "请求体", required: true },
      { name: "headers", type: "object", description: "请求头", required: false },
      { name: "timeout", type: "number", description: "超时毫秒", required: false },
    ],
    fn: ((ctx: any, { url, body, headers, timeout }: any) =>
      httpPost(ctx, url, body, { headers, timeout })) as TraitMethod["fn"],
  },
};

export const ui_methods: Record<string, TraitMethod> = {};
