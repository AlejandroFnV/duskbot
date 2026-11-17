import { describe, expect, it } from "vitest";

import { CODING_DONE_FOR_MS, codingState, codingTasks } from "./CodingTasks";
import type { Task } from "@/state/store";

const repo = { root: "/r", branch: "main" };
const task = (over: Partial<Task>): Task => ({ threadId: over.threadId ?? "t", title: "T", createdAt: 0, ...over }) as Task;

describe("codingState", () => {
  it("says working or done, and nothing while it waits on teammates", () => {
    expect(codingState(task({ busy: true }))).toBe("working");
    expect(codingState(task({ activity: "working" } as Partial<Task>))).toBe("working");
    expect(codingState(task({ waitingForTeammates: true }))).toBeNull();
    expect(codingState(task({}))).toBe("done");
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
