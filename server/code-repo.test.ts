import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import { createCodeRepos, parseRevParse, threadFolder, toolFolder } from "./code-repo.ts";
import type { WireMessage } from "../shared/wire.ts";

const activity = (name: string, input: unknown): WireMessage =>
  ({ id: `${name}-${JSON.stringify(input)}`, role: "bot", kind: "activity", tool: { name, input: typeof input === "string" ? input : JSON.stringify(input) } }) as WireMessage;

describe("toolFolder", () => {
  it("takes the folder of an edited code file, never a read, a command or a note", () => {
    expect(toolFolder("Edit", JSON.stringify({ file_path: "/repo/src/a.ts" }))).toBe("/repo/src");
    expect(toolFolder("Write", JSON.stringify({ file_path: "~/Development/x/b.json" }))).toBe(`${homedir()}/Development/x`);
    expect(toolFolder("Write", JSON.stringify({ file_path: "/vault/cola/pendiente/nota.md" }))).toBeNull();
    expect(toolFolder("Edit", JSON.stringify({ file_path: "/repo/notes.TXT" }))).toBeNull();
    expect(toolFolder("Bash", JSON.stringify({ command: "cd /repo && git commit -m x" }))).toBeNull();
    expect(toolFolder("Bash", "cd /repo && ls")).toBeNull();
    expect(toolFolder("Read", JSON.stringify({ file_path: "/repo/a.ts" }))).toBeNull();
    expect(toolFolder("Edit", JSON.stringify({ file_path: "src/a.ts" }))).toBeNull();
    expect(toolFolder("Edit", undefined)).toBeNull();
  });
});

describe("threadFolder", () => {
  it("takes the newest code edit, and nothing for a thread that only talked, ran commands or wrote notes", () => {
    const messages = [activity("Edit", { file_path: "/old/a.ts" }), activity("Edit", { file_path: "/new/b.ts" }), activity("Write", { file_path: "/vault/n.md" }), activity("Bash", { command: "cd /vault && git push" })];
    expect(threadFolder(messages)).toBe("/new");
    expect(threadFolder([activity("Read", { file_path: "/x/y.ts" }), activity("Bash", { command: "cd /x && pnpm test" })])).toBeNull();
    expect(threadFolder([])).toBeNull();
  });
});

describe("parseRevParse", () => {
  it("tells a linked worktree from the main checkout and a detached HEAD", () => {
    expect(parseRevParse("/r", "/r\nmain\n/r/.git\n.git\n")).toEqual({ root: "/r", branch: "main" });
    expect(parseRevParse("/wt", "/wt\nfeat/x\n/r/.git/worktrees/wt\n/r/.git\n")).toEqual({ root: "/wt", branch: "feat/x", worktree: true, project: "r" });
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
    const repos = createCodeRepos({ git: () => { calls++; return new Promise((done) => { release = done; }); }, now: () => 0, changed: (id) => changed.push(id) });
    const messages = () => [activity("Edit", { file_path: "/r/a.ts" })];
    expect(repos.of("t1", messages, 1)).toBeNull();
    expect(repos.of("t1", messages, 1)).toBeNull();
    expect(calls).toBe(1);
    release(output);
    await flush();
    expect(changed).toEqual(["t1"]);
    expect(repos.of("t1", messages, 1)).toEqual({ root: "/r", branch: "main" });
  });

  it("reads messages only when the thread's version moves, and asks git again after a minute", async () => {
    let calls = 0, reads = 0, clock = 0;
    const repos = createCodeRepos({ git: async (folder) => { calls++; return folder === "/r" ? output : null; }, now: () => clock, changed: () => {} });
    const messages = () => { reads++; return [activity("Edit", { file_path: "/r/a.ts" })]; };
    repos.of("t1", messages, 1);
    await flush();
    for (let i = 0; i < 3; i++) expect(repos.of("t1", messages, 1)).toEqual({ root: "/r", branch: "main" });
    expect([calls, reads]).toEqual([1, 1]);
    clock = 61_000;
    repos.of("t1", messages, 2);
    await flush();
    expect([calls, reads]).toEqual([2, 2]);
    repos.of("t2", () => [activity("Edit", { file_path: "/not-a-repo/a.ts" })], undefined);
    await flush();
    expect(repos.of("t2", () => [activity("Edit", { file_path: "/not-a-repo/a.ts" })], undefined)).toBeNull();
  });

  it("never reads archived threads or ones idle for a day, unless they are working", async () => {
    let calls = 0, reads = 0;
    const day = 24 * 60 * 60_000;
    const repos = createCodeRepos({ git: async () => { calls++; return output; }, now: () => 2 * day, changed: () => {} });
    const messages = () => { reads++; return [activity("Edit", { file_path: "/r/a.ts" })]; };
    expect(repos.of("archived", messages, 2 * day, { archived: true })).toBeNull();
    expect(repos.of("idle", messages, day - 1)).toBeNull();
    expect([calls, reads]).toEqual([0, 0]);
    repos.of("busy", messages, day - 1, { live: true });
    await flush();
    expect([calls, reads]).toEqual([1, 1]);
  });

  it("does not announce a change when git answers the same repo again", async () => {
    let clock = 0;
    const changed: string[] = [];
    const repos = createCodeRepos({ git: async () => output, now: () => clock, changed: (id) => changed.push(id) });
    const messages = () => [activity("Edit", { file_path: "/r/a.ts" })];
    repos.of("t1", messages, 0);
    await flush();
    clock = 61_000;
    repos.of("t1", messages, 0);
    await flush();
    expect(changed).toEqual(["t1"]);
  });
});
