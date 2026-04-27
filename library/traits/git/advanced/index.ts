/**
 * git/advanced —— Git 高级操作 library trait
 *
 * 提供 cherry-pick / revert / blame / rebase_onto 等高阶操作，
 * 以及 interactive_rebase（通过 GIT_SEQUENCE_EDITOR + GIT_EDITOR 脚本注入 todo 和消息）。
 *
 * @ref docs/工程管理/迭代/all/20260422_feature_git_pr_workflow.md — implements — Phase 3
 * @ref docs/工程管理/迭代/all/20260422_feature_git_pr_advanced.md — implements — Phase 1
 */

import { toolOk, toolErr } from "../../../../kernel/src/shared/types/tool-result";
import type { ToolResult } from "../../../../kernel/src/shared/types/tool-result";
import type { TraitMethod } from "../../../../kernel/src/shared/types/index";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── 内部辅助 ─────────────────────────────────────────────

async function runGit(
  ctx: any,
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: ctx.rootDir,
    stdout: "pipe",
    stderr: "pipe",
    env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode };
}

/**
 * 解析 git status --porcelain 里标记冲突（UU/AA/DU/UD/AU/UA/DD）的文件路径。
 * 用于 interactive_rebase 冲突回报。
 */
async function listConflictedFiles(ctx: any): Promise<string[]> {
  const { stdout } = await runGit(ctx, ["status", "--porcelain"]);
  const conflicted: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    /* porcelain 前两字符是 XY；冲突组合：DD AU UD UA DU AA UU */
    const xy = line.slice(0, 2);
    if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy)) {
      conflicted.push(line.slice(3).trim());
    }
  }
  return conflicted;
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
      if (!header) {
        i++;
        continue;
      }
      const m = header.match(/^([0-9a-f]+) (\d+) (\d+)/);
      if (!m) {
        i++;
        continue;
      }
      const commit = m[1];
      const finalLineRaw = m[3];
      if (!commit || !finalLineRaw) {
        i++;
        continue;
      }
      const finalLine = parseInt(finalLineRaw, 10);
      let author = "";
      let authorTime = 0;
      let j = i + 1;
      while (j < rawLines.length && !rawLines[j]?.startsWith("\t")) {
        const ln = rawLines[j];
        if (!ln) {
          j++;
          continue;
        }
        if (ln.startsWith("author ")) author = ln.slice("author ".length);
        else if (ln.startsWith("author-time ")) authorTime = parseInt(ln.slice("author-time ".length), 10);
        j++;
      }
      const contentLine = rawLines[j];
      const content = contentLine?.startsWith("\t") ? contentLine.slice(1) : "";
      const date = authorTime > 0 ? new Date(authorTime * 1000).toISOString() : "";
      lines.push({ lineNumber: finalLine, commit, author, date, content });
      i = j + 1;
    }
    return toolOk({ path: input.path.trim(), lines });
  } catch (err: any) {
    return toolErr(`blame 执行失败: ${err?.message ?? String(err)}`);
  }
}

// ─── interactive rebase ──────────────────────────────────

/** rebase todo 中允许的 action */
export type RebaseAction = "pick" | "reword" | "squash" | "fixup" | "drop" | "edit";

/** interactive_rebase 单条计划 */
export interface RebasePlanItem {
  /** todo action */
  action: RebaseAction;
  /** commit hash（可为短 hash，git 自己解析） */
  commit: string;
  /** reword / squash / fixup 时可选的新消息；必填于 reword，squash 下可省（合并默认消息） */
  message?: string;
}

/** interactive_rebase 参数 */
export interface InteractiveRebaseInput {
  /** rebase onto 的基准（分支 / commit） */
  onto: string;
  /** 从旧到新的 todo 列表；顺序即 git rebase todo 文件顺序 */
  plan: RebasePlanItem[];
}

/** interactive_rebase 成功返回 */
export interface InteractiveRebaseOk {
  /** 执行的 plan 条数 */
  applied: number;
}

/** interactive_rebase 冲突返回（非成功，但也非异常） */
export interface InteractiveRebaseConflict {
  /** 冲突标志 */
  conflict: true;
  /** 冲突文件列表 */
  files: string[];
  /** git stderr（辅助上层决策） */
  stderr: string;
}

/**
 * 在临时目录生成 todo / 消息脚本，并跑 interactive rebase。
 *
 * 流程：
 * 1. 把 plan 转写为 git rebase todo 文件（`<action> <commit>`）。
 * 2. 对 reword/squash/fixup 的 message 构造顺序消息队列写入环境变量 MSG_1..N。
 * 3. 写一个 bash 脚本做 GIT_EDITOR：按 MSG_STATE_FILE 计数器从 env 读下一条 message，
 *    若存在则覆盖 git 传来的消息文件；否则保留 git 的默认消息。
 * 4. GIT_SEQUENCE_EDITOR="cp <todo>"，这样 git 直接把我们写好的 todo 当输入。
 * 5. 运行 `git rebase -i --onto <onto> <onto>`。
 *    （等价于从 onto 开始重放 plan 指定的 commit 序列到当前分支）
 *
 * 失败时：
 * - 捕获 rebase 冲突，返回 { ok:false, conflict:true, files }，**不自动 abort**
 *   —— 由上层 LLM 决策 `rebase_continue` / `rebase_abort`。
 * - 其他错误走标准 toolErr。
 */
export async function interactiveRebase(
  ctx: any,
  input: InteractiveRebaseInput,
): Promise<ToolResult<InteractiveRebaseOk> & { conflict?: boolean; files?: string[] }> {
  if (!input?.onto?.trim()) return toolErr("interactiveRebase: onto 必填");
  if (!Array.isArray(input?.plan) || input.plan.length === 0) {
    return toolErr("interactiveRebase: plan 必须是非空数组");
  }
  const validActions: RebaseAction[] = [
    "pick",
    "reword",
    "squash",
    "fixup",
    "drop",
    "edit",
  ];
  for (let i = 0; i < input.plan.length; i++) {
    const item = input.plan[i];
    if (!item || !validActions.includes(item.action)) {
      return toolErr(
        `interactiveRebase: plan[${i}].action 非法（期望 pick/reword/squash/fixup/drop/edit）`,
      );
    }
    if (!item.commit?.trim()) {
      return toolErr(`interactiveRebase: plan[${i}].commit 必填`);
    }
    if (item.action === "reword" && !item.message?.trim()) {
      return toolErr(`interactiveRebase: plan[${i}] action=reword 必须提供 message`);
    }
  }

  /* 准备临时工作区 */
  const workDir = mkdtempSync(join(tmpdir(), "ooc-irebase-"));
  const todoFile = join(workDir, "todo.txt");
  const stateFile = join(workDir, "msg-state");
  const msgEditor = join(workDir, "msg-editor.sh");

  /* 1) todo 文件 */
  const todoLines: string[] = [];
  /* 顺序消息环境变量：reword/squash/fixup 都会触发 GIT_EDITOR */
  const msgs: string[] = [];
  for (const item of input.plan) {
    if (item.action === "drop") {
      /* drop 行：git todo 支持 `drop <hash>`，同样可用注释行省略；我们显式写 drop 更可读 */
      todoLines.push(`drop ${item.commit.trim()}`);
    } else {
      todoLines.push(`${item.action} ${item.commit.trim()}`);
    }
    if (item.action === "reword" || item.action === "squash" || item.action === "fixup") {
      /* squash 在没有 message 时保留 git 默认合并消息，用空串占位不覆写 */
      msgs.push(item.message ?? "");
    }
  }
  writeFileSync(todoFile, todoLines.join("\n") + "\n");
  writeFileSync(stateFile, "0");

  /* 2) 消息编辑器脚本：按 MSG_STATE_FILE 的索引取 MSG_{i} */
  const scriptBody = [
    "#!/bin/bash",
    "# OOC interactive_rebase message editor — 顺序消费 MSG_1..MSG_N",
    'STATE_FILE="$MSG_STATE_FILE"',
    'INDEX=$(cat "$STATE_FILE" 2>/dev/null || echo "0")',
    "INDEX=$((INDEX+1))",
    'echo "$INDEX" > "$STATE_FILE"',
    'MSG_VAR="MSG_$INDEX"',
    'MSG="${!MSG_VAR}"',
    'if [ -n "$MSG" ]; then',
    '  printf "%s\\n" "$MSG" > "$1"',
    "fi",
    "",
  ].join("\n");
  writeFileSync(msgEditor, scriptBody);
  chmodSync(msgEditor, 0o755);

  /* 3) 组环境变量 */
  const env: Record<string, string> = {
    GIT_SEQUENCE_EDITOR: `cp ${todoFile}`,
    GIT_EDITOR: msgEditor,
    MSG_STATE_FILE: stateFile,
  };
  msgs.forEach((m, i) => {
    env[`MSG_${i + 1}`] = m;
  });

  try {
    /* 4) 运行 rebase
     * 使用 `git rebase -i --onto <onto> <onto>` —— 从 onto 开始按 todo 重放当前分支。
     */
    const { stderr, exitCode } = await runGit(
      ctx,
      ["rebase", "-i", "--onto", input.onto.trim(), input.onto.trim()],
      env,
    );

    if (exitCode !== 0) {
      /* 判断是否处在 rebase 冲突中 */
      const rebaseDir = existsSync(join(ctx.rootDir, ".git", "rebase-merge"))
        || existsSync(join(ctx.rootDir, ".git", "rebase-apply"));
      if (rebaseDir) {
        const files = await listConflictedFiles(ctx);
        return {
          ok: false,
          error: `interactive rebase 进入冲突状态（${files.length} 个文件）`,
          context:
            "用 `rebase_continue` 继续或 `rebase_abort` 放弃；解决冲突后需先 `git add`",
          /* 扩展字段：conflict + files */
          ...({ conflict: true, files } as any),
        } as any;
      }
      return toolErr(
        `interactive rebase 失败: ${stderr.trim() || "unknown error"}`,
      );
    }
    return toolOk({ applied: input.plan.length });
  } catch (err: any) {
    return toolErr(`interactiveRebase 执行失败: ${err?.message ?? String(err)}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * 继续进行中的 rebase（对应 `git rebase --continue`）。
 * 注意：调用前应当已 `git add` 解决后的冲突文件。
 */
export async function rebaseContinue(
  ctx: any,
): Promise<ToolResult<{ continued: true }>> {
  try {
    const { stderr, exitCode } = await runGit(
      ctx,
      ["rebase", "--continue"],
      /* GIT_EDITOR=true 避免 git 打开编辑器等待人 */
      { GIT_EDITOR: "true" },
    );
    if (exitCode !== 0) {
      return toolErr(`rebase --continue 失败: ${stderr.trim() || "unknown"}`);
    }
    return toolOk({ continued: true });
  } catch (err: any) {
    return toolErr(`rebaseContinue 执行失败: ${err?.message ?? String(err)}`);
  }
}

/**
 * 放弃进行中的 rebase（对应 `git rebase --abort`）。
 */
export async function rebaseAbort(
  ctx: any,
): Promise<ToolResult<{ aborted: true }>> {
  try {
    const { stderr, exitCode } = await runGit(ctx, ["rebase", "--abort"]);
    if (exitCode !== 0) {
      return toolErr(`rebase --abort 失败: ${stderr.trim() || "unknown"}`);
    }
    return toolOk({ aborted: true });
  } catch (err: any) {
    return toolErr(`rebaseAbort 执行失败: ${err?.message ?? String(err)}`);
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
  interactive_rebase: {
    name: "interactive_rebase",
    description:
      "交互式 rebase 编排：按 plan（从旧到新的 action 列表）重放 commit。冲突时返回 { ok:false, conflict:true, files }，由上层决策 rebase_continue / rebase_abort。",
    params: [
      { name: "onto", type: "string", description: "rebase 基准（分支或 commit）", required: true },
      {
        name: "plan",
        type: "array",
        description:
          "plan 数组；每项 { action: pick|reword|squash|fixup|drop|edit, commit: hash, message?: string }",
        required: true,
      },
    ],
    fn: ((ctx: any, args: InteractiveRebaseInput) =>
      interactiveRebase(ctx, args)) as TraitMethod["fn"],
  },
  rebase_continue: {
    name: "rebase_continue",
    description: "继续进行中的 rebase（等价 `git rebase --continue`）；调用前确保已 git add 解决后的冲突。",
    params: [],
    fn: ((ctx: any) => rebaseContinue(ctx)) as TraitMethod["fn"],
  },
  rebase_abort: {
    name: "rebase_abort",
    description: "放弃进行中的 rebase（等价 `git rebase --abort`）。",
    params: [],
    fn: ((ctx: any) => rebaseAbort(ctx)) as TraitMethod["fn"],
  },
};

export const ui_methods: Record<string, TraitMethod> = {};
