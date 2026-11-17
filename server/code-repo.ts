import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import type { WireMessage } from "../shared/wire.ts";
import type { WireCodeRepo } from "../shared/wire-work.ts";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch"]);
const SHELL_TOOLS = new Set(["Bash", "bash", "shell", "exec_command"]);
const REPO_TTL_MS = 60_000;
/** Past this without activity an idle thread is no longer shown as a coding task, so it is not resolved at all. */
const IDLE_CUTOFF_MS = 24 * 60 * 60_000;

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

type GitRun = (folder: string) => Promise<string | null>;

const runGit: GitRun = (folder) => new Promise((done) => {
  execFile("git", ["-C", folder, "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD", "--absolute-git-dir", "--git-common-dir"],
    { encoding: "utf8", timeout: 5000 }, (error, stdout) => done(error ? null : stdout));
});

/** Parses `git rev-parse --show-toplevel --abbrev-ref HEAD --absolute-git-dir --git-common-dir` run in `folder`. */
export function parseRevParse(folder: string, output: string): WireCodeRepo | null {
  const [root, branch, gitDir, commonDir] = output.split("\n").map((line) => line.trim());
  if (!root || !branch || !gitDir || !commonDir) return null;
  const common = resolve(isAbsolute(commonDir) ? commonDir : resolve(folder, commonDir));
  const worktree = resolve(gitDir) !== common;
  return { root, branch: branch === "HEAD" ? null : branch, ...(worktree ? { worktree: true as const } : {}) };
}

const sameRepo = (a: WireCodeRepo | null | undefined, b: WireCodeRepo | null | undefined): boolean =>
  (a?.root ?? null) === (b?.root ?? null) && (a?.branch ?? null) === (b?.branch ?? null) && a?.worktree === b?.worktree;

/** Repo, branch and worktree of each thread. `of` never waits on git: it answers from the cache and starts at most one
 * background `git` per folder, then calls `changed` for each thread whose answer moved, so the next projection carries it.
 * Messages are read only when the thread's `version` (its newest message time) changes; archived threads and idle ones
 * quiet for a day are never resolved, so a large history is not loaded from disk. */
export function createCodeRepos({ git = runGit, now = Date.now, changed }: { git?: GitRun; now?: () => number; changed: (threadId: string) => void }) {
  const byFolder = new Map<string, { repo: WireCodeRepo | null; at: number }>();
  const inFlight = new Set<string>();
  const byThread = new Map<string, { key: string; folder: string | null }>();
  const refresh = (folder: string) => {
    if (inFlight.has(folder)) return;
    inFlight.add(folder);
    void git(folder).then((output) => {
      const before = byFolder.get(folder)?.repo;
      const repo = output ? parseRevParse(folder, output) : null;
      byFolder.set(folder, { repo, at: now() });
      if (!sameRepo(before, repo)) for (const [threadId, entry] of byThread) if (entry.folder === folder) changed(threadId);
    }, () => undefined).finally(() => inFlight.delete(folder));
  };
  return {
    of(threadId: string, messages: () => readonly WireMessage[], pinnedCwd: string | null | undefined, version: number | undefined, thread: { live?: boolean; archived?: boolean } = {}): WireCodeRepo | null {
      if (thread.archived || (!thread.live && version !== undefined && now() - version >= IDLE_CUTOFF_MS)) return null;
      const key = `${version ?? ""}|${pinnedCwd ?? ""}`;
      let entry = byThread.get(threadId);
      if (!entry || entry.key !== key) {
        entry = { key, folder: threadFolder(messages(), pinnedCwd) };
        byThread.set(threadId, entry);
      }
      if (!entry.folder) return null;
      const hit = byFolder.get(entry.folder);
      if (!hit || now() - hit.at >= REPO_TTL_MS) refresh(entry.folder);
      return hit?.repo ?? null;
    },
  };
}
