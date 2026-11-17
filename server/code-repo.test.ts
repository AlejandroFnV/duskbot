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
  const output = "/r\nmain\n/r/.git\n.git\n";
  const flush = () => new Promise((done) => setTimeout(done, 0));

  it("never waits on git: the first answer is empty, the resolved repo comes with the next one", async () => {
    let release: (value: string | null) => void = () => {};
    const changed: string[] = [];
    let calls = 0;
    const repos = createCodeRepos({ git: () => { calls++; return new Promise((done) => { release = done; }); }, changed: (id) => changed.push(id) });
    const messages = () => [activity("Bash", { command: "cd /r && ls" })];
    expect(repos.of("t1", messages, null, 1)).toBeNull();
    expect(repos.of("t1", messages, null, 1)).toBeNull();
    expect(calls).toBe(1);
    release(output);
    await flush();
    expect(changed).toEqual(["t1"]);
    expect(repos.of("t1", messages, null, 1)).toEqual({ root: "/r", branch: "main" });
  });

  it("reads messages only when the thread's version moves, and asks git again after a minute", async () => {
    let calls = 0, reads = 0, clock = 0;
    const repos = createCodeRepos({ git: async (folder) => { calls++; return folder === "/r" ? output : null; }, now: () => clock, changed: () => {} });
    const messages = () => { reads++; return [activity("Bash", { command: "cd /r && ls" })]; };
    repos.of("t1", messages, null, 1);
    await flush();
    for (let i = 0; i < 3; i++) expect(repos.of("t1", messages, null, 1)).toEqual({ root: "/r", branch: "main" });
    expect([calls, reads]).toEqual([1, 1]);
    clock = 61_000;
    repos.of("t1", messages, null, 2);
    await flush();
    expect([calls, reads]).toEqual([2, 2]);
    repos.of("t2", () => [], "/not-a-repo", undefined);
    await flush();
    expect(repos.of("t2", () => [], "/not-a-repo", undefined)).toBeNull();
  });
});
