import { describe, expect, it } from "vitest";

import { CODING_DONE_FOR_MS, codingState, codingTasks, isCheckCommand } from "./CodingTasks";
import type { Task } from "@/state/store";

const repo = { root: "/r", branch: "main" };
const task = (over: Partial<Task>): Task => ({ threadId: over.threadId ?? "t", title: "T", createdAt: 0, ...over }) as Task;

describe("isCheckCommand", () => {
  it("knows tests, typechecks and lint", () => {
    for (const command of ["vitest run a.test.ts", "npx tsc --noEmit", "eslint src", "pnpm test", "npm run lint", "pnpm typecheck"]) expect(isCheckCommand(command)).toBe(true);
    for (const command of ["git status", "pnpm install", "ls tests"]) expect(isCheckCommand(command)).toBe(false);
    expect(isCheckCommand(undefined)).toBe(false);
  });
});

describe("codingState", () => {
  it("reads running, checking, handed off and finished", () => {
    expect(codingState(task({ busy: true }), { activity: "edit" } as never)).toBe("coding");
    expect(codingState(task({ busy: true }), { activity: "command", target: "pnpm test" } as never)).toBe("testing");
    expect(codingState(task({ busy: true }), { activity: "command", target: "node", detail: "npx vitest run x" } as never)).toBe("testing");
    expect(codingState(task({ waitingForTeammates: true }), null)).toBe("review");
    expect(codingState(task({}), null)).toBe("done");
  });
});

describe("codingTasks", () => {
  it("keeps repo threads, drops finished ones after a day and archived ones", () => {
    const now = 10 * CODING_DONE_FOR_MS;
    const tasks = [
      task({ threadId: "plain", updatedAt: now }),
      task({ threadId: "fresh", codeRepo: repo, updatedAt: now - 1000 }),
      task({ threadId: "stale", codeRepo: repo, updatedAt: now - CODING_DONE_FOR_MS - 1 }),
      task({ threadId: "staleBusy", codeRepo: repo, updatedAt: 0, busy: true }),
      task({ threadId: "archived", codeRepo: repo, updatedAt: now, archivedAt: now }),
    ];
    expect(codingTasks({ tasks } as never, now).map((one) => one.threadId).sort()).toEqual(["fresh", "staleBusy"]);
    expect(codingTasks({ tasks: [] } as never, now)).toEqual([]);
  });
});
