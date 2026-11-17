import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import type { WireCodeRepo, WireMessage } from "../shared/wire.ts";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch"]);
const SHELL_TOOLS = new Set(["Bash", "bash", "shell", "exec_command"]);
const REPO_TTL_MS = 60_000;

const expandHome = (path: string): string => path === "~" ? homedir() : path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
const unquote = (word: string): string => word.replace(/^(["'])(.*)\1$/, "$2");

/** The folder a shell command works in: a leading `cd <dir>` or a `git -C <dir>`. Absolute or home paths only. */
export function commandFolder(command: string): string | null {
  const match = /^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/.exec(command) ?? /\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/.exec(command);
  if (!match) return null;
  const folder = expandHome(unquote(match[1]!));
  return isAbsolute(folder) ? folder : null;
}

/** The folder an edit or a shell call in this thread touched, from the activity row's recorded input. Reads never count. */
export function toolFolder(name: string, input: string | undefined): string | null {
  if (!input || (!EDIT_TOOLS.has(name) && !SHELL_TOOLS.has(name))) return null;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(input) as Record<string, unknown>; } catch { return SHELL_TOOLS.has(name) ? commandFolder(input) : null; }
  if (EDIT_TOOLS.has(name)) {
    const file = parsed.file_path ?? parsed.notebook_path ?? parsed.path;
    return typeof file === "string" && isAbsolute(expandHome(file)) ? dirname(expandHome(file)) : null;
  }
  const command = parsed.command ?? parsed.cmd;
  return typeof command === "string" ? commandFolder(command) : null;
}

/** The newest folder an edit or command in these messages touched, else the pinned folder. */
export function threadFolder(messages: readonly WireMessage[], pinnedCwd: string | null | undefined): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.kind !== "activity" || !message.tool) continue;
    const folder = toolFolder(message.tool.name, message.tool.input);
    if (folder) return folder;
  }
  return pinnedCwd ?? null;
}

type GitRun = (folder: string) => string | null;

const runGit: GitRun = (folder) => {
  try {
    return execFileSync("git", ["-C", folder, "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD", "--absolute-git-dir", "--git-common-dir"],
      { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
};

/** Parses `git rev-parse --show-toplevel --abbrev-ref HEAD --absolute-git-dir --git-common-dir` run in `folder`. */
export function parseRevParse(folder: string, output: string): WireCodeRepo | null {
  const [root, branch, gitDir, commonDir] = output.split("\n").map((line) => line.trim());
  if (!root || !branch || !gitDir || !commonDir) return null;
  const common = resolve(isAbsolute(commonDir) ? commonDir : resolve(folder, commonDir));
  const worktree = resolve(gitDir) !== common;
  return { root, branch: branch === "HEAD" ? null : branch, ...(worktree ? { worktree: true as const } : {}) };
}

/** Repo, branch and worktree of each thread, resolved on the server and cached: by folder for a minute, by thread until
 * its newest message changes. */
export function createCodeRepos(git: GitRun = runGit, now: () => number = Date.now) {
  const byFolder = new Map<string, { repo: WireCodeRepo | null; at: number }>();
  const byThread = new Map<string, { key: string; folder: string | null }>();
  const repoAt = (folder: string): WireCodeRepo | null => {
    const hit = byFolder.get(folder);
    if (hit && now() - hit.at < REPO_TTL_MS) return hit.repo;
    const output = git(folder);
    const repo = output ? parseRevParse(folder, output) : null;
    byFolder.set(folder, { repo, at: now() });
    return repo;
  };
  return {
    of(threadId: string, messages: () => readonly WireMessage[], pinnedCwd: string | null | undefined, lastMessageId: string | undefined): WireCodeRepo | null {
      const key = `${lastMessageId ?? ""}|${pinnedCwd ?? ""}`;
      let entry = byThread.get(threadId);
      if (!entry || entry.key !== key) {
        entry = { key, folder: threadFolder(messages(), pinnedCwd) };
        byThread.set(threadId, entry);
      }
      return entry.folder ? repoAt(entry.folder) : null;
    },
  };
}
