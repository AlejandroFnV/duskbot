import { describe, expect, it } from "vitest";
import type { HandoffView } from "./coordinator.ts";
import { teammateWork } from "./teammate-work.ts";

const view = (over: Partial<HandoffView>): HandoffView => ({ id: "h", rootId: "r", threadId: "t", botId: "b", key: "k", text: "", createdAt: 0, status: "running", result: "", reported: false, executions: 0, approvalGranted: false, kind: "assignment", restarts: 0, mode: "work", reply: "resume", ...over }) as HandoffView;

describe("teammateWork", () => {
  it("lists each open assignment by bot, its own thread, the brief's first line and a coarse status", () => {
    expect(teammateWork([
      view({ botId: "rigel", threadId: "rigel-t1", text: "  Run the release checks\nthen report back", status: "running" }),
      view({ botId: "ada", threadId: "ada-t1", text: "Review the plan", status: "queued" }),
      view({ botId: "lin", threadId: "lin-t1", text: "Fix the API", status: "waiting" }),
      view({ botId: "pixel", threadId: "pixel-t1", text: "Polish the UI", status: "resume" }),
    ])).toEqual([
      { botId: "rigel", threadId: "rigel-t1", summary: "Run the release checks", status: "running" },
      { botId: "ada", threadId: "ada-t1", summary: "Review the plan", status: "queued" },
      { botId: "lin", threadId: "lin-t1", summary: "Fix the API", status: "waiting" },
      { botId: "pixel", threadId: "pixel-t1", summary: "Polish the UI", status: "running" },
    ]);
  });

  it("leaves out work sent to a room and shortens a long brief", () => {
    const [row, ...rest] = teammateWork([view({ text: "x".repeat(200) }), view({ groupId: "g1" })]);
    expect(rest).toEqual([]);
    expect(row!.summary).toHaveLength(80);
    expect(row!.summary.endsWith("…")).toBe(true);
  });
});
