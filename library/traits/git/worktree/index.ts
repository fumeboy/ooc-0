/**
 * git/worktree —— Git worktree 管理 library trait
 *
 * 把 Git worktree 作为 OOC 线程 fork 的物理容器：
 * - `worktree_add({branch, path?})` 对应 think(context=fork)
 * - `worktree_remove({path})` 对应线程 return 后清理
 * - `worktree_list()` 查询当前所有 worktree
 *
 * 默认 worktree 路径：`.ooc/worktrees/{branch 斜杠转连字符}`
 *
 * @ref docs/工程管理/迭代/all/20260422_feature_git_pr_workflow.md — implements — Phase 2
 */

import { toolOk, toolErr } from "../../../../kernel/src/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/types/tool-result";
import type { TraitMethod } from "../../../../kernel/src/types/index";

// ─── 内部辅助 ─────────────────────────────────────────────

/**
 * 执行 git 命令
 */
async function runGit(
  ctx: any,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
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
 * 规范化默认 worktree 路径：把分支名里的斜杠转为连字符，放在 .ooc/worktrees/ 下
 * 例："feat/login" → ".ooc/worktrees/feat-login"
 */
export function defaultWorktreePath(branch: string): string {
  const safe = branch.replace(/[\\/]/g, "-");
  return `.ooc/worktrees/${safe}`;
}

// ─── 类型定义 ─────────────────────────────────────────────

export interface WorktreeAddInput {
  /** 分支名（不存在则自动创建） */
  branch: string;
  /** worktree 落盘路径（默认 .ooc/worktrees/{branch}） */
  path?: string;
  /** 如果分支不存在，从哪个 ref 创建（默认 HEAD） */
  createFrom?: string;
}

export interface WorktreeAddResult {
  branch: string;
  path: string;
}

export interface WorktreeListItem {
  path: string;
  branch: string;
  head: string;
}

// ─── 公开方法 ─────────────────────────────────────────────

/**
 * 创建新 worktree（对应线程 fork）
 *
 * 行为：
 * 1. 如果 `branch` 已存在 → `git worktree add {path} {branch}`
 * 2. 如果 `branch` 不存在 → `git worktree add -b {branch} {path} {createFrom ?? HEAD}`
 */
export async function worktreeAdd(
  ctx: any,
  input: WorktreeAddInput,
): Promise<ToolResult<WorktreeAddResult>> {
  if (!input?.branch?.trim()) return toolErr("worktreeAdd: branch 必填");
  const branch = input.branch.trim();
  const path = input.path?.trim() || defaultWorktreePath(branch);

  try {
    /* 检查分支是否存在 */
    const check = await runGit(ctx, ["rev-parse", "--verify", branch]);
    const branchExists = check.exitCode === 0;

    const args = branchExists
      ? ["worktree", "add", path, branch]
      : ["worktree", "add", "-b", branch, path, input.createFrom ?? "HEAD"];

    const { stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`git worktree add 失败: ${stderr.trim() || "unknown error"}`);
    }
    return toolOk({ branch, path });
  } catch (err: any) {
    return toolErr(`worktreeAdd 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 删除 worktree（对应线程 return 后清理）
 *
 * 默认 `force = false`——如果 worktree 有未提交改动会失败，调用方需要显式传 force
 */
export async function worktreeRemove(
  ctx: any,
  input: { path: string; force?: boolean },
): Promise<ToolResult<{ path: string }>> {
  if (!input?.path?.trim()) return toolErr("worktreeRemove: path 必填");
  try {
    const args = ["worktree", "remove", input.path.trim()];
    if (input.force) args.push("--force");

    const { stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`git worktree remove 失败: ${stderr.trim() || "unknown error"}`);
    }
    return toolOk({ path: input.path.trim() });
  } catch (err: any) {
    return toolErr(`worktreeRemove 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 列出当前所有 worktree（基于 `git worktree list --porcelain`）
 */
export async function worktreeList(
  ctx: any,
): Promise<ToolResult<WorktreeListItem[]>> {
  try {
    const { stdout, stderr, exitCode } = await runGit(ctx, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    if (exitCode !== 0) {
      return toolErr(`git worktree list 失败: ${stderr.trim() || "unknown error"}`);
    }

    /* porcelain 输出块：
     *   worktree /abs/path
     *   HEAD <sha>
     *   branch refs/heads/<name>
     *
     *   worktree /abs/path2
     *   ...
     */
    const items: WorktreeListItem[] = [];
    let cur: Partial<WorktreeListItem> = {};
    for (const line of stdout.split("\n")) {
      if (!line.trim()) {
        if (cur.path) items.push({
          path: cur.path,
          branch: cur.branch ?? "",
          head: cur.head ?? "",
        });
        cur = {};
        continue;
      }
      if (line.startsWith("worktree ")) cur.path = line.slice("worktree ".length).trim();
      else if (line.startsWith("HEAD ")) cur.head = line.slice("HEAD ".length).trim();
      else if (line.startsWith("branch ")) cur.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
    if (cur.path) items.push({
      path: cur.path,
      branch: cur.branch ?? "",
      head: cur.head ?? "",
    });
    return toolOk(items);
  } catch (err: any) {
    return toolErr(`worktreeList 执行失败: ${err?.message ?? String(err)}`);
  }
}

// ─── llm_methods 导出 ────────────────────────────────────

export const llm_methods: Record<string, TraitMethod> = {
  worktree_add: {
    name: "worktree_add",
    description:
      "创建 Git worktree（对应线程 fork 的物理容器）。branch 不存在时自动创建；默认路径 .ooc/worktrees/{branch}。",
    params: [
      { name: "branch", type: "string", description: "分支名", required: true },
      { name: "path", type: "string", description: "worktree 路径（默认 .ooc/worktrees/{branch}）", required: false },
      { name: "createFrom", type: "string", description: "如需新建分支，基于哪个 ref（默认 HEAD）", required: false },
    ],
    fn: ((ctx: any, args: WorktreeAddInput) => worktreeAdd(ctx, args)) as TraitMethod["fn"],
  },
  worktree_remove: {
    name: "worktree_remove",
    description:
      "删除 Git worktree。有未提交改动时失败；传 force=true 可强制删除。",
    params: [
      { name: "path", type: "string", description: "worktree 路径", required: true },
      { name: "force", type: "boolean", description: "强制删除（丢弃未提交改动）", required: false },
    ],
    fn: ((ctx: any, args: { path: string; force?: boolean }) =>
      worktreeRemove(ctx, args)) as TraitMethod["fn"],
  },
  worktree_list: {
    name: "worktree_list",
    description: "列出当前所有 worktree。",
    params: [],
    fn: ((ctx: any) => worktreeList(ctx)) as TraitMethod["fn"],
  },
};

export const ui_methods: Record<string, TraitMethod> = {};
