/**
 * git/advanced —— Git 高级操作 library trait
 *
 * 提供 cherry-pick / revert / blame 等高阶操作。
 *
 * 说明：`interactive_rebase` 真正的 TODO 序列需要 `GIT_SEQUENCE_EDITOR` 注入脚本，
 * 本 iteration 先提供 `rebase_onto({ onto, upstream?, branch? })` 作为非交互式底座——
 * 交互式 rebase 的 todo-list 编排留给后续迭代（需要设计可靠的脚本协议）。
 *
 * @ref docs/工程管理/迭代/all/20260422_feature_git_pr_workflow.md — implements — Phase 3
 */

import { toolOk, toolErr } from "../../../../kernel/src/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/types/tool-result";
import type { TraitMethod } from "../../../../kernel/src/types/index";

// ─── 内部辅助 ─────────────────────────────────────────────

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

export interface BlameLine {
  /** 行号（从 1 开始，对应 file 中的当前行号） */
  lineNumber: number;
  /** 该行最后修改的 commit hash */
  commit: string;
  /** 作者 */
  author: string;
  /** 作者日期 ISO 8601 */
  date: string;
  /** 行内容（去掉末尾换行） */
  content: string;
}

export interface BlameResult {
  /** 文件路径 */
  path: string;
  /** 每行 blame 信息 */
  lines: BlameLine[];
}

// ─── 公开方法 ─────────────────────────────────────────────

/**
 * cherry-pick 指定 commit
 */
export async function cherryPick(
  ctx: any,
  input: { commit: string },
): Promise<ToolResult<{ commit: string }>> {
  if (!input?.commit?.trim()) return toolErr("cherryPick: commit 必填");
  try {
    const { stderr, exitCode } = await runGit(ctx, [
      "cherry-pick",
      input.commit.trim(),
    ]);
    if (exitCode !== 0) {
      return toolErr(
        `git cherry-pick 失败: ${stderr.trim() || "unknown error"}`,
        "发生冲突时请解决后用 `git cherry-pick --continue`；放弃用 `git cherry-pick --abort`",
      );
    }
    return toolOk({ commit: input.commit.trim() });
  } catch (err: any) {
    return toolErr(`cherryPick 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * revert 指定 commit
 */
export async function revert(
  ctx: any,
  input: { commit: string; noCommit?: boolean },
): Promise<ToolResult<{ commit: string }>> {
  if (!input?.commit?.trim()) return toolErr("revert: commit 必填");
  try {
    const args = ["revert"];
    if (input.noCommit) args.push("--no-commit");
    args.push(input.commit.trim());

    const { stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`git revert 失败: ${stderr.trim() || "unknown error"}`);
    }
    return toolOk({ commit: input.commit.trim() });
  } catch (err: any) {
    return toolErr(`revert 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 非交互式 rebase
 *
 * `git rebase --onto {onto} {upstream} {branch}`
 * - onto: 目标基准
 * - upstream: 当前分支和哪个分支分叉（可选，默认当前上游）
 * - branch: 要 rebase 的分支（可选，默认当前）
 */
export async function rebaseOnto(
  ctx: any,
  input: { onto: string; upstream?: string; branch?: string },
): Promise<ToolResult<{ onto: string }>> {
  if (!input?.onto?.trim()) return toolErr("rebaseOnto: onto 必填");
  try {
    const args = ["rebase", "--onto", input.onto.trim()];
    if (input.upstream?.trim()) args.push(input.upstream.trim());
    if (input.branch?.trim()) args.push(input.branch.trim());

    const { stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) {
      return toolErr(
        `git rebase 失败: ${stderr.trim() || "unknown error"}`,
        "冲突时解决后 `git rebase --continue`，放弃用 `git rebase --abort`",
      );
    }
    return toolOk({ onto: input.onto.trim() });
  } catch (err: any) {
    return toolErr(`rebaseOnto 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * git blame 指定文件（可选行范围）
 *
 * 使用 `--line-porcelain` 稳定解析
 */
export async function blame(
  ctx: any,
  input: { path: string; range?: string },
): Promise<ToolResult<BlameResult>> {
  if (!input?.path?.trim()) return toolErr("blame: path 必填");
  try {
    const args = ["blame", "--line-porcelain"];
    if (input.range?.trim()) args.push("-L", input.range.trim());
    args.push("--", input.path.trim());

    const { stdout, stderr, exitCode } = await runGit(ctx, args);
    if (exitCode !== 0) {
      return toolErr(`git blame 失败: ${stderr.trim() || "unknown error"}`);
    }

    /* porcelain 格式：
     *   <sha> <orig-line> <final-line> [<num-lines>]
     *   author Name
     *   author-mail <mail>
     *   author-time <unix>
     *   author-tz +0800
     *   ... (more headers)
     *   \t<code>            ← 代码行以 tab 开头
     */
    const lines: BlameLine[] = [];
    const rawLines = stdout.split("\n");
    let i = 0;
    while (i < rawLines.length) {
      const header = rawLines[i];
      const m = header.match(/^([0-9a-f]+) (\d+) (\d+)/);
      if (!m) {
        i++;
        continue;
      }
      const commit = m[1];
      const finalLine = parseInt(m[3], 10);
      let author = "";
      let authorTime = 0;
      let j = i + 1;
      while (j < rawLines.length && !rawLines[j].startsWith("\t")) {
        const ln = rawLines[j];
        if (ln.startsWith("author ")) author = ln.slice("author ".length);
        else if (ln.startsWith("author-time ")) authorTime = parseInt(ln.slice("author-time ".length), 10);
        j++;
      }
      const content = j < rawLines.length && rawLines[j].startsWith("\t") ? rawLines[j].slice(1) : "";
      const date = authorTime > 0 ? new Date(authorTime * 1000).toISOString() : "";
      lines.push({ lineNumber: finalLine, commit, author, date, content });
      i = j + 1;
    }
    return toolOk({ path: input.path.trim(), lines });
  } catch (err: any) {
    return toolErr(`blame 执行失败: ${err?.message ?? String(err)}`);
  }
}

// ─── llm_methods 导出 ────────────────────────────────────

export const llm_methods: Record<string, TraitMethod> = {
  cherry_pick: {
    name: "cherry_pick",
    description:
      "cherry-pick 指定 commit 到当前分支。冲突时需人工解决并 `git cherry-pick --continue`。",
    params: [
      { name: "commit", type: "string", description: "commit hash", required: true },
    ],
    fn: ((ctx: any, args: { commit: string }) => cherryPick(ctx, args)) as TraitMethod["fn"],
  },
  revert: {
    name: "revert",
    description: "撤销指定 commit（创建一条反向提交）。",
    params: [
      { name: "commit", type: "string", description: "要撤销的 commit hash", required: true },
      { name: "noCommit", type: "boolean", description: "只产生改动，不自动提交", required: false },
    ],
    fn: ((ctx: any, args: { commit: string; noCommit?: boolean }) =>
      revert(ctx, args)) as TraitMethod["fn"],
  },
  rebase_onto: {
    name: "rebase_onto",
    description:
      "非交互式 `git rebase --onto {onto} [upstream] [branch]`。冲突时需人工 --continue / --abort。",
    params: [
      { name: "onto", type: "string", description: "目标基准（分支 / commit）", required: true },
      { name: "upstream", type: "string", description: "分叉点上游（可选）", required: false },
      { name: "branch", type: "string", description: "要 rebase 的分支（可选，默认当前）", required: false },
    ],
    fn: ((ctx: any, args: { onto: string; upstream?: string; branch?: string }) =>
      rebaseOnto(ctx, args)) as TraitMethod["fn"],
  },
  blame: {
    name: "blame",
    description: "查看文件的 blame 信息，可选行范围。",
    params: [
      { name: "path", type: "string", description: "文件路径", required: true },
      { name: "range", type: "string", description: "行范围（如 '10,20'），可选", required: false },
    ],
    fn: ((ctx: any, args: { path: string; range?: string }) =>
      blame(ctx, args)) as TraitMethod["fn"],
  },
};

export const ui_methods: Record<string, TraitMethod> = {};
