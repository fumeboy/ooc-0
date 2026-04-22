/**
 * git/pr —— GitHub PR 工作流 library trait
 *
 * 通过 `gh` CLI 包装 PR 全链路：创建 / 列表 / 查看 / CI 状态 / 评论 / 合并。
 * 所有命令在对象 rootDir 下执行。
 *
 * 设计要点：
 * - 统一通过 `gh` JSON 输出 + parse，避免正则解析不稳定
 * - `merge_pr` 需要调用者显式传 method（squash / merge / rebase），默认不允许空 method
 * - 所有网络操作都有 stderr 捕获（便于 LLM 根据错误自我修正）
 *
 * @ref docs/工程管理/迭代/all/20260422_feature_git_pr_workflow.md — implements
 */

import { toolOk, toolErr } from "../../../../kernel/src/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/types/tool-result";
import type { TraitMethod } from "../../../../kernel/src/types/index";

// ─── 内部辅助 ─────────────────────────────────────────────

/**
 * 执行 shell 命令（支持 gh / git），捕获 stdout/stderr/exitCode
 */
async function runCmd(
  ctx: any,
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd: ctx.rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode };
}

/**
 * 把 `gh ... --json xxx` 的 stdout JSON parse；非法 JSON 时返回 null（调用方再兜底成 error）
 */
function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── 类型定义 ─────────────────────────────────────────────

/** createPr 参数 */
export interface CreatePrInput {
  /** PR 目标分支（base） */
  base: string;
  /** PR 源分支（head） */
  head: string;
  /** PR 标题 */
  title: string;
  /** PR 正文 */
  body: string;
  /** 是否草稿 PR（默认 false） */
  draft?: boolean;
}

/** createPr 返回 */
export interface CreatePrResult {
  /** PR 编号 */
  number: number;
  /** PR URL */
  url: string;
}

/** listPrs 参数 */
export interface ListPrsInput {
  /** 状态过滤：open / closed / merged / all（默认 open） */
  state?: "open" | "closed" | "merged" | "all";
  /** 作者过滤（GitHub 用户名） */
  author?: string;
  /** 返回条数上限（默认 30） */
  limit?: number;
}

/** PR 列表项 */
export interface PrListItem {
  number: number;
  title: string;
  state: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** getPr 返回 */
export interface PrDetail extends PrListItem {
  body: string;
  /** 统一 diff 文本（gh pr diff 输出） */
  diff: string;
  /** PR 上的评论列表 */
  comments: Array<{ author: string; body: string; createdAt: string }>;
}

/** getPrChecks 返回 */
export interface PrChecksResult {
  /** 每一项 check 的状态 */
  checks: Array<{
    name: string;
    state: string;
    conclusion: string | null;
    link: string | null;
  }>;
  /** 汇总结论：pass / fail / pending / unknown */
  summary: "pass" | "fail" | "pending" | "unknown";
}

/** commentOnPr 参数 */
export interface CommentOnPrInput {
  number: number;
  body: string;
  /** 如果要回复某条评论，指定其 ID（可选） */
  inReplyTo?: string;
}

/** mergePr 参数 */
export interface MergePrInput {
  number: number;
  /** 合并方式（必须显式指定，防止误操作） */
  method: "squash" | "merge" | "rebase";
  /** 合并后是否删除 head 分支（默认 false） */
  deleteBranch?: boolean;
}

// ─── 公开方法 ─────────────────────────────────────────────

/**
 * 创建 PR（通过 gh pr create）
 */
export async function createPr(
  ctx: any,
  input: CreatePrInput,
): Promise<ToolResult<CreatePrResult>> {
  if (!input?.base?.trim()) return toolErr("createPr: base 分支必填");
  if (!input?.head?.trim()) return toolErr("createPr: head 分支必填");
  if (!input?.title?.trim()) return toolErr("createPr: title 必填");
  if (typeof input?.body !== "string") return toolErr("createPr: body 必须是字符串");

  try {
    const args = [
      "gh",
      "pr",
      "create",
      "--base",
      input.base,
      "--head",
      input.head,
      "--title",
      input.title,
      "--body",
      input.body,
    ];
    if (input.draft) args.push("--draft");

    const { stdout, stderr, exitCode } = await runCmd(ctx, args);
    if (exitCode !== 0) {
      return toolErr(
        `gh pr create 失败: ${stderr.trim() || stdout.trim() || "unknown error"}`,
      );
    }

    /* gh pr create 成功输出一行 URL，形如 "https://github.com/owner/repo/pull/42" */
    const url = stdout.trim().split("\n").pop() ?? "";
    const match = url.match(/\/pull\/(\d+)\/?$/);
    if (!match) {
      return toolErr(`gh pr create 输出无法解析 PR number: ${url || stdout.trim()}`);
    }
    return toolOk({ number: parseInt(match[1], 10), url });
  } catch (err: any) {
    return toolErr(`createPr 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 列出 PR（gh pr list --json ...）
 */
export async function listPrs(
  ctx: any,
  input?: ListPrsInput,
): Promise<ToolResult<PrListItem[]>> {
  try {
    const args = [
      "gh",
      "pr",
      "list",
      "--state",
      input?.state ?? "open",
      "--limit",
      String(input?.limit ?? 30),
      "--json",
      "number,title,state,author,headRefName,baseRefName,url,createdAt,updatedAt",
    ];
    if (input?.author?.trim()) args.push("--author", input.author.trim());

    const { stdout, stderr, exitCode } = await runCmd(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`gh pr list 失败: ${stderr.trim() || "unknown error"}`);
    }

    const raw = safeJsonParse<any[]>(stdout);
    if (!raw) return toolErr(`gh pr list JSON 解析失败: ${stdout.slice(0, 200)}`);

    const items: PrListItem[] = raw.map(r => ({
      number: r.number,
      title: r.title,
      state: r.state,
      author: r.author?.login ?? "",
      headRefName: r.headRefName,
      baseRefName: r.baseRefName,
      url: r.url,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return toolOk(items);
  } catch (err: any) {
    return toolErr(`listPrs 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 获取 PR 详情（含 diff + 评论）
 */
export async function getPr(
  ctx: any,
  { number: prNumber }: { number: number },
): Promise<ToolResult<PrDetail>> {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return toolErr("getPr: number 必须是正整数");
  }
  try {
    /* 1. PR 元数据 + 评论 */
    const viewArgs = [
      "gh",
      "pr",
      "view",
      String(prNumber),
      "--json",
      "number,title,state,author,headRefName,baseRefName,url,createdAt,updatedAt,body,comments",
    ];
    const view = await runCmd(ctx, viewArgs);
    if (view.exitCode !== 0) {
      return toolErr(`gh pr view 失败: ${view.stderr.trim() || "unknown error"}`);
    }
    const raw = safeJsonParse<any>(view.stdout);
    if (!raw) return toolErr(`gh pr view JSON 解析失败`);

    /* 2. diff */
    const diff = await runCmd(ctx, ["gh", "pr", "diff", String(prNumber)]);
    /* diff 失败不致命——仍返回其他信息，diff 留空字符串 */
    const diffText = diff.exitCode === 0 ? diff.stdout : "";

    const detail: PrDetail = {
      number: raw.number,
      title: raw.title,
      state: raw.state,
      author: raw.author?.login ?? "",
      headRefName: raw.headRefName,
      baseRefName: raw.baseRefName,
      url: raw.url,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      body: raw.body ?? "",
      diff: diffText,
      comments: Array.isArray(raw.comments)
        ? raw.comments.map((c: any) => ({
            author: c.author?.login ?? "",
            body: c.body ?? "",
            createdAt: c.createdAt ?? "",
          }))
        : [],
    };
    return toolOk(detail);
  } catch (err: any) {
    return toolErr(`getPr 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 获取 PR 的 CI checks 状态
 */
export async function getPrChecks(
  ctx: any,
  { number: prNumber }: { number: number },
): Promise<ToolResult<PrChecksResult>> {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return toolErr("getPrChecks: number 必须是正整数");
  }
  try {
    const { stdout, stderr, exitCode } = await runCmd(ctx, [
      "gh",
      "pr",
      "checks",
      String(prNumber),
      "--json",
      "name,state,conclusion,link",
    ]);
    /* gh pr checks 在 CI 失败时 exitCode = 1，但 stdout 仍有数据，所以不能单看 exitCode */
    if (exitCode !== 0 && !stdout.trim()) {
      return toolErr(`gh pr checks 失败: ${stderr.trim() || "unknown error"}`);
    }

    const raw = safeJsonParse<any[]>(stdout) ?? [];
    const checks = raw.map(r => ({
      name: r.name ?? "",
      state: r.state ?? "",
      conclusion: r.conclusion ?? null,
      link: r.link ?? null,
    }));

    /* 汇总：只要有一条 fail → fail；否则有 pending → pending；全 pass → pass */
    let summary: PrChecksResult["summary"] = "unknown";
    if (checks.length > 0) {
      const states = checks.map(c => (c.conclusion ?? c.state).toLowerCase());
      if (states.some(s => s === "failure" || s === "fail" || s === "timed_out" || s === "cancelled")) {
        summary = "fail";
      } else if (states.some(s => s === "in_progress" || s === "pending" || s === "queued")) {
        summary = "pending";
      } else if (states.every(s => s === "success" || s === "pass" || s === "neutral" || s === "skipped")) {
        summary = "pass";
      } else {
        summary = "unknown";
      }
    }
    return toolOk({ checks, summary });
  } catch (err: any) {
    return toolErr(`getPrChecks 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 在 PR 上添加评论
 *
 * 注意：`gh pr comment` 目前不支持 threaded reply；inReplyTo 参数保留以便未来扩展
 * （通过 GraphQL API 实现）。当前实现只创建顶层评论。
 */
export async function commentOnPr(
  ctx: any,
  input: CommentOnPrInput,
): Promise<ToolResult<{ number: number }>> {
  if (!Number.isInteger(input?.number) || input.number <= 0) {
    return toolErr("commentOnPr: number 必须是正整数");
  }
  if (!input.body?.trim()) return toolErr("commentOnPr: body 必填");

  try {
    const { stderr, exitCode } = await runCmd(ctx, [
      "gh",
      "pr",
      "comment",
      String(input.number),
      "--body",
      input.body,
    ]);
    if (exitCode !== 0) {
      return toolErr(`gh pr comment 失败: ${stderr.trim() || "unknown error"}`);
    }
    return toolOk({ number: input.number });
  } catch (err: any) {
    return toolErr(`commentOnPr 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 合并 PR（高危操作——调用者必须显式指定 method）
 */
export async function mergePr(
  ctx: any,
  input: MergePrInput,
): Promise<ToolResult<{ number: number }>> {
  if (!Number.isInteger(input?.number) || input.number <= 0) {
    return toolErr("mergePr: number 必须是正整数");
  }
  if (!["squash", "merge", "rebase"].includes(input?.method)) {
    return toolErr(
      `mergePr: method 必须是 squash / merge / rebase（当前: ${input?.method}）`,
    );
  }

  try {
    const methodFlag =
      input.method === "squash"
        ? "--squash"
        : input.method === "rebase"
          ? "--rebase"
          : "--merge";
    const args = ["gh", "pr", "merge", String(input.number), methodFlag];
    if (input.deleteBranch) args.push("--delete-branch");

    const { stderr, exitCode } = await runCmd(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`gh pr merge 失败: ${stderr.trim() || "unknown error"}`);
    }
    return toolOk({ number: input.number });
  } catch (err: any) {
    return toolErr(`mergePr 执行失败: ${err?.message ?? String(err)}`);
  }
}

// ─── llm_methods 导出 ────────────────────────────────────

export const llm_methods: Record<string, TraitMethod> = {
  create_pr: {
    name: "create_pr",
    description:
      "创建 GitHub PR（通过 gh CLI）。需要先把分支 push 到远程。",
    params: [
      { name: "base", type: "string", description: "目标分支（如 main）", required: true },
      { name: "head", type: "string", description: "源分支", required: true },
      { name: "title", type: "string", description: "PR 标题", required: true },
      { name: "body", type: "string", description: "PR 正文（支持 Markdown）", required: true },
      { name: "draft", type: "boolean", description: "是否草稿 PR", required: false },
    ],
    fn: ((ctx: any, args: CreatePrInput) => createPr(ctx, args)) as TraitMethod["fn"],
  },
  list_prs: {
    name: "list_prs",
    description: "列出仓库的 PR。",
    params: [
      { name: "state", type: "string", description: "状态（open/closed/merged/all），默认 open", required: false },
      { name: "author", type: "string", description: "作者过滤", required: false },
      { name: "limit", type: "number", description: "返回条数（默认 30）", required: false },
    ],
    fn: ((ctx: any, args: ListPrsInput) => listPrs(ctx, args)) as TraitMethod["fn"],
  },
  get_pr: {
    name: "get_pr",
    description: "获取指定 PR 的详情（含 diff + 评论）。",
    params: [
      { name: "number", type: "number", description: "PR 编号", required: true },
    ],
    fn: ((ctx: any, args: { number: number }) => getPr(ctx, args)) as TraitMethod["fn"],
  },
  get_pr_checks: {
    name: "get_pr_checks",
    description: "获取 PR 的 CI checks 状态。",
    params: [
      { name: "number", type: "number", description: "PR 编号", required: true },
    ],
    fn: ((ctx: any, args: { number: number }) => getPrChecks(ctx, args)) as TraitMethod["fn"],
  },
  comment_on_pr: {
    name: "comment_on_pr",
    description: "在 PR 上添加评论（顶层评论；inReplyTo 预留未启用）。",
    params: [
      { name: "number", type: "number", description: "PR 编号", required: true },
      { name: "body", type: "string", description: "评论内容", required: true },
      { name: "inReplyTo", type: "string", description: "（预留）回复目标评论 ID", required: false },
    ],
    fn: ((ctx: any, args: CommentOnPrInput) => commentOnPr(ctx, args)) as TraitMethod["fn"],
  },
  merge_pr: {
    name: "merge_pr",
    description:
      "合并 PR（高危；method 必填 squash/merge/rebase，推荐在用户明确确认后调用）。",
    params: [
      { name: "number", type: "number", description: "PR 编号", required: true },
      { name: "method", type: "string", description: "合并方式（squash/merge/rebase）", required: true },
      { name: "deleteBranch", type: "boolean", description: "合并后删除 head 分支", required: false },
    ],
    fn: ((ctx: any, args: MergePrInput) => mergePr(ctx, args)) as TraitMethod["fn"],
  },
};

export const ui_methods: Record<string, TraitMethod> = {};
