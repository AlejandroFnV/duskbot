import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import { commandFolder, createCodeRepos, parseRevParse, threadFolder, toolFolder } from "./code-repo.ts";
import type { WireMessage } from "../shared/wire.ts";

const activity = (name: string, input: unknown): WireMessage =>
  ({ id: `${name}-${JSON.stringify(input)}`, role: "bot", kind: "activity", tool: { name, input: typeof input === "string" ? input : JSON.stringify(input) } }) as WireMessage;

describe("commandFolder", () => {
  it("reads a leading cd and git -C, home paths included", () => {
    expect(commandFolder("cd /repo/wt && pnpm test")).toBe("/repo/wt");
    expect(commandFolder("cd '/a b/c' && ls")).toBe("/a b/c");
    expect(commandFolder("cd ~/Development/x && ls")).toBe(`${homedir()}/Development/x`);
    expect(commandFolder("git -C /repo status")).toBe("/repo");
  });
  it("ignores relative folders and commands without one", () => {
    expect(commandFolder("cd src && ls")).toBeNull();
    expect(commandFolder("ls -la")).toBeNull();
  });
});

describe("toolFolder", () => {
  it("takes an edit's file folder and a shell command's folder, never a read", () => {
    expect(toolFolder("Edit", JSON.stringify({ file_path: "/repo/src/a.ts" }))).toBe("/repo/src");
    expect(toolFolder("Write", JSON.stringify({ file_path: "/repo/b.md" }))).toBe("/repo");
    expect(toolFolder("Bash", JSON.stringify({ command: "cd /repo && git status" }))).toBe("/repo");
    expect(toolFolder("Read", JSON.stringify({ file_path: "/repo/a.ts" }))).toBeNull();
    expect(toolFolder("Bash", "cd /repo && ls")).toBe("/repo");
    expect(toolFolder("Edit", undefined)).toBeNull();
  });
});

describe("threadFolder", () => {
  it("prefers the newest edit or command, then the pinned folder", () => {
    const messages = [activity("Edit", { file_path: "/old/a.ts" }), activity("Read", { file_path: "/other/x" }), activity("Bash", { command: "cd /new && pnpm test" })];
    expect(threadFolder(messages, "/pinned")).toBe("/new");
    expect(threadFolder([activity("Read", { file_path: "/x/y" })], "/pinned")).toBe("/pinned");
    expect(threadFolder([], null)).toBeNull();
  });
});

describe("parseRevParse", () => {
  it("tells a linked worktree from the main checkout and a detached HEAD", () => {
    expect(parseRevParse("/r", "/r\nmain\n/r/.git\n.git\n")).toEqual({ root: "/r", branch: "main" });
    expect(parseRevParse("/wt", "/wt\nfeat/x\n/r/.git/worktrees/wt\n/r/.git\n")).toEqual({ root: "/wt", branch: "feat/x", worktree: true });
    expect(parseRevParse("/r", "/r\nHEAD\n/r/.git\n/r/.git\n")).toEqual({ root: "/r", branch: null });
    expect(parseRevParse("/r", "")).toBeNull();
  });
});

describe("createCodeRepos", () => {
  it("runs git once per folder within a minute and rereads messages only when the thread changes", () => {
    let calls = 0, reads = 0, clock = 0;
    const repos = createCodeRepos((folder) => { calls++; return folder === "/r" ? "/r\nmain\n/r/.git\n.git\n" : null; }, () => clock);
    const messages = () => { reads++; return [activity("Bash", { command: "cd /r && ls" })]; };
    expect(repos.of("t1", messages, null, "m1")).toEqual({ root: "/r", branch: "main" });
    expect(repos.of("t1", messages, null, "m1")).toEqual({ root: "/r", branch: "main" });
    expect([calls, reads]).toEqual([1, 1]);
    clock = 61_000;
    repos.of("t1", messages, null, "m2");
    expect([calls, reads]).toEqual([2, 2]);
    expect(repos.of("t2", () => [], "/not-a-repo", undefined)).toBeNull();
  });
});
