/**
 * git_ops —— Git 版本控制 library trait
 *
 * 提供 Git 版本控制操作能力：status/diff/log/add/commit/branch/checkout/push/pull。
 * 所有命令通过 Bun.spawn 在对象的 rootDir 下执行。
 */

import { toolOk, toolErr } from "../../../../kernel/src/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/types/tool-result";

// ─── 内部辅助 ─────────────────────────────────────────────

/**
 * 执行 git 命令并返回原始输出
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param args - git 子命令和参数数组
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

// ─── 类型定义 ─────────────────────────────────────────────

/** gitStatus 返回的工作区状态 */
interface GitStatusResult {
  /** 当前分支名 */
  branch: string;
  /** 领先远程的提交数 */
  ahead: number;
  /** 落后远程的提交数 */
  behind: number;
  /** 已暂存的文件路径列表 */
  staged: string[];
  /** 已修改但未暂存的文件路径列表 */
  unstaged: string[];
  /** 未跟踪的文件路径列表 */
  untracked: string[];
}

/** gitDiff 的可选参数 */
interface GitDiffOptions {
  /** 是否查看暂存区差异 */
  staged?: boolean;
  /** 只查看指定文件的差异 */
  file?: string;
}

/** gitLog 的可选参数 */
interface GitLogOptions {
  /** 返回条数（默认 10） */
  limit?: number;
}

/** 单条提交记录 */
interface GitLogEntry {
  /** 完整 commit hash */
  hash: string;
  /** 提交信息 */
  message: string;
  /** 作者名 */
  author: string;
  /** ISO 8601 日期 */
  date: string;
}

/** gitBranch 的可选参数 */
interface GitBranchOptions {
  /** 创建后是否切换到新分支 */
  checkout?: boolean;
}

/** gitPush 的可选参数 */
interface GitPushOptions {
  /** 是否强制推送 */
  force?: boolean;
  /** 设置上游分支（如 "origin feature/login"） */
  upstream?: string;
}

/** gitPull 的可选参数 */
interface GitPullOptions {
  /** 是否使用 rebase 模式 */
  rebase?: boolean;
}

// ─── 公开方法 ─────────────────────────────────────────────

/**
 * 获取工作区状态
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @returns 分支信息、暂存/未暂存/未跟踪文件列表
 */
export async function gitStatus(
  ctx: any,
): Promise<ToolResult<GitStatusResult>> {
  try {
    const { stdout, stderr, exitCode } = await runGit(ctx, [
      "status",
      "--porcelain=v2",
      "--branch",
    ]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git status 失败");

    let branch = "";
    let ahead = 0;
    let behind = 0;
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of stdout.split("\n")) {
      if (!line) continue;

      // 分支头信息
      if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length);
        continue;
      }

      // 领先/落后信息
      if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
        continue;
      }

      // 未跟踪文件
      if (line.startsWith("? ")) {
        untracked.push(line.slice(2));
        continue;
      }

      // 普通变更条目（porcelain v2 格式：1 XY ...）
      if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const parts = line.split(" ");
        const xy = parts[1]; // XY 状态码
        // 最后一个字段是文件路径（对于 rename 是 tab 分隔的两个路径）
        const pathPart = line.split("\t");
        const filePath =
          pathPart.length > 1
            ? pathPart[pathPart.length - 1]
            : parts[parts.length - 1];

        // X 非 . 表示暂存区有变更
        if (xy[0] !== ".") staged.push(filePath);
        // Y 非 . 表示工作区有变更
        if (xy[1] !== ".") unstaged.push(filePath);
      }
    }

    return toolOk({ branch, ahead, behind, staged, unstaged, untracked });
  } catch (err: any) {
    return toolErr(`git status 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 获取差异
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param options - 可选：staged（暂存区差异）、file（指定文件）
 * @returns diff 文本
 */
export async function gitDiff(
  ctx: any,
  options?: GitDiffOptions,
): Promise<ToolResult<string>> {
  try {
    const args = ["diff"];
    if (options?.staged) args.push("--staged");
    if (options?.file) args.push("--", options.file);

    const { stdout, stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git diff 失败");

    return toolOk(stdout);
  } catch (err: any) {
    return toolErr(`git diff 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 获取提交历史
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param options - 可选：limit（返回条数，默认 10）
 * @returns 提交记录数组
 */
export async function gitLog(
  ctx: any,
  options?: GitLogOptions,
): Promise<ToolResult<GitLogEntry[]>> {
  try {
    const limit = options?.limit ?? 10;
    const { stdout, stderr, exitCode } = await runGit(ctx, [
      "log",
      `--format=%H|%s|%an|%aI`,
      `-n`,
      String(limit),
    ]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git log 失败");

    const entries: GitLogEntry[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      // 用第一个 | 分割 hash，然后第二个 | 分割 message，以此类推
      // 注意 message 本身可能包含 |，所以从右往左解析
      const firstPipe = line.indexOf("|");
      if (firstPipe === -1) continue;

      const hash = line.slice(0, firstPipe);
      const rest = line.slice(firstPipe + 1);

      // 从右边找 date（ISO 格式，最后一个 |）
      const lastPipe = rest.lastIndexOf("|");
      if (lastPipe === -1) continue;
      const date = rest.slice(lastPipe + 1);

      const middle = rest.slice(0, lastPipe);
      // 从右边找 author（倒数第二个 |）
      const secondLastPipe = middle.lastIndexOf("|");
      if (secondLastPipe === -1) continue;
      const author = middle.slice(secondLastPipe + 1);
      const message = middle.slice(0, secondLastPipe);

      entries.push({ hash, message, author, date });
    }

    return toolOk(entries);
  } catch (err: any) {
    return toolErr(`git log 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 将文件添加到暂存区
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param files - 要添加的文件路径数组
 */
export async function gitAdd(
  ctx: any,
  files: string[],
): Promise<ToolResult<string>> {
  if (!files || files.length === 0) {
    return toolErr("请指定要添加的文件");
  }

  try {
    const { stderr, exitCode } = await runGit(ctx, ["add", ...files]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git add 失败");

    return toolOk(`已添加 ${files.length} 个文件到暂存区`);
  } catch (err: any) {
    return toolErr(`git add 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 创建提交
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param message - 提交信息
 * @returns 包含 commit hash 的结果
 */
export async function gitCommit(
  ctx: any,
  message: string,
): Promise<ToolResult<{ hash: string }>> {
  if (!message || !message.trim()) {
    return toolErr("提交信息不能为空");
  }

  try {
    const { stdout, stderr, exitCode } = await runGit(ctx, [
      "commit",
      "-m",
      message,
    ]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git commit 失败");

    // 从输出中提取 commit hash（格式如 "[main abc1234] message"）
    const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
    const hash = match ? match[1] : "";

    return toolOk({ hash });
  } catch (err: any) {
    return toolErr(`git commit 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 创建新分支
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param name - 分支名称
 * @param options - 可选：checkout（创建后是否切换）
 */
export async function gitBranch(
  ctx: any,
  name: string,
  options?: GitBranchOptions,
): Promise<ToolResult<string>> {
  if (!name || !name.trim()) {
    return toolErr("分支名称不能为空");
  }

  try {
    const { stderr, exitCode } = await runGit(ctx, ["branch", name]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git branch 失败");

    // 如果需要切换到新分支
    if (options?.checkout) {
      const checkout = await runGit(ctx, ["checkout", name]);
      if (checkout.exitCode !== 0) {
        return toolErr(
          checkout.stderr.trim() || `分支已创建但切换失败: ${name}`,
        );
      }
      return toolOk(`已创建并切换到分支: ${name}`);
    }

    return toolOk(`已创建分支: ${name}`);
  } catch (err: any) {
    return toolErr(`git branch 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 切换分支
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param branch - 目标分支名称
 */
export async function gitCheckout(
  ctx: any,
  branch: string,
): Promise<ToolResult<string>> {
  if (!branch || !branch.trim()) {
    return toolErr("分支名称不能为空");
  }

  try {
    const { stderr, exitCode } = await runGit(ctx, ["checkout", branch]);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git checkout 失败");

    return toolOk(`已切换到分支: ${branch}`);
  } catch (err: any) {
    return toolErr(`git checkout 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 推送到远程仓库
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param options - 可选：force（强制推送）、upstream（设置上游）
 */
export async function gitPush(
  ctx: any,
  options?: GitPushOptions,
): Promise<ToolResult<string>> {
  try {
    const args = ["push"];
    if (options?.force) args.push("-f");
    if (options?.upstream) args.push("-u", ...options.upstream.split(" "));

    const { stdout, stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git push 失败");

    return toolOk(stderr.trim() || stdout.trim() || "推送成功");
  } catch (err: any) {
    return toolErr(`git push 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 从远程仓库拉取
 * @param ctx - 上下文（需要 ctx.rootDir）
 * @param options - 可选：rebase（使用 rebase 模式）
 */
export async function gitPull(
  ctx: any,
  options?: GitPullOptions,
): Promise<ToolResult<string>> {
  try {
    const args = ["pull"];
    if (options?.rebase) args.push("--rebase");

    const { stdout, stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) return toolErr(stderr.trim() || "git pull 失败");

    return toolOk(stdout.trim() || stderr.trim() || "拉取成功");
  } catch (err: any) {
    return toolErr(`git pull 执行失败: ${err?.message ?? String(err)}`);
  }
}
