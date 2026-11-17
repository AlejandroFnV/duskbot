import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { WireMessage } from "../shared/wire.ts";
import type { WireCodeRepo } from "../shared/wire-work.ts";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch"]);
/** Notes and prose: writing one (a vault note, a report) is not programming, so it never makes a code project. */
const PROSE_FILE = /\.(md|markdown|txt)$/i;
/** Alejandro's notes vault: a git repo, but never a code project, whatever file in it a thread touches. */
const NOT_CODE_ROOTS = [resolve(homedir(), "AIOS")];
const REPO_TTL_MS = 60_000;
/** Past this without activity an idle thread is no longer shown as a coding task, so it is not resolved at all. */
const IDLE_CUTOFF_MS = 24 * 60 * 60_000;

const expandHome = (path: string): string => path === "~" ? homedir() : path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;

/** The folder of a code file this thread edited, from the activity row's recorded input. Reads, shell commands and
 * edits to notes never count: only a real change to code tells that the thread is programming. */
export function toolFolder(name: string, input: string | undefined): string | null {
  if (!input || !EDIT_TOOLS.has(name)) return null;
  let parsed: Record<string, unknown> | unknown[];
  try { parsed = JSON.parse(input) as Record<string, unknown> | unknown[]; } catch { return null; }
  // Claude Code names one file; Codex records its edit as a list of changes, `[{ path, kind, diff }]`.
  const files = Array.isArray(parsed)
    ? parsed.map((change) => (change && typeof change === "object" ? (change as Record<string, unknown>).path : undefined))
    : [parsed.file_path ?? parsed.notebook_path ?? parsed.path];
  for (const file of files) {
    if (typeof file !== "string" || PROSE_FILE.test(file)) continue;
    const path = expandHome(file);
    if (isAbsolute(path)) return dirname(path);
  }
  return null;
}

/** The folder of the newest code file edited in these messages; none when the thread never edited code. */
export function threadFolder(messages: readonly WireMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.kind !== "activity" || !message.tool) continue;
    const folder = toolFolder(message.tool.name, message.tool.input);
    if (folder) return folder;
  }
  return null;
}

type GitRun = (folder: string) => Promise<string | null>;

const runGit: GitRun = (folder) => new Promise((done) => {
  execFile("git", ["-C", folder, "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD", "--absolute-git-dir", "--git-common-dir"],
    { encoding: "utf8", timeout: 5000 }, (error, stdout) => done(error ? null : stdout));
});

/** Parses `git rev-parse --show-toplevel --abbrev-ref HEAD --absolute-git-dir --git-common-dir` run in `folder`.
 * A repo under a notes root (or a worktree of one) is not a code project, so it answers none. */
export function parseRevParse(folder: string, output: string, notCode: readonly string[] = NOT_CODE_ROOTS): WireCodeRepo | null {
  const [root, branch, gitDir, commonDir] = output.split("\n").map((line) => line.trim());
  if (!root || !branch || !gitDir || !commonDir) return null;
  const common = resolve(isAbsolute(commonDir) ? commonDir : resolve(folder, commonDir));
  if (notCode.some((skip) => resolve(root) === skip || dirname(common) === skip)) return null;
  const worktree = resolve(gitDir) !== common;
  const project = basename(dirname(common));
  return { root, branch: branch === "HEAD" ? null : branch, ...(worktree ? { worktree: true as const, ...(project ? { project } : {}) } : {}) };
}

const sameRepo = (a: WireCodeRepo | null | undefined, b: WireCodeRepo | null | undefined): boolean =>
  (a?.root ?? null) === (b?.root ?? null) && (a?.branch ?? null) === (b?.branch ?? null) && a?.worktree === b?.worktree && a?.project === b?.project;

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
    of(threadId: string, messages: () => readonly WireMessage[], version: number | undefined, thread: { live?: boolean; archived?: boolean } = {}): WireCodeRepo | null {
      if (thread.archived || (!thread.live && version !== undefined && now() - version >= IDLE_CUTOFF_MS)) return null;
      const key = `${version ?? ""}`;
      let entry = byThread.get(threadId);
      if (!entry || entry.key !== key) {
        entry = { key, folder: threadFolder(messages()) };
        byThread.set(threadId, entry);
      }
      if (!entry.folder) return null;
      const hit = byFolder.get(entry.folder);
      if (!hit || now() - hit.at >= REPO_TTL_MS) refresh(entry.folder);
      return hit?.repo ?? null;
    },
  };
}
