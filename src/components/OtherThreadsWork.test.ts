import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({ byThread: {} as Record<string, Record<string, unknown>> }));
vi.mock("@/state/turn-status", () => ({ useTurnLive: (threadId: string) => live.byThread[threadId] ?? { ended: false, status: null } }));

import type { Bot } from "@/state/store";
import { OtherThreadsWork, otherWorkingThreads } from "./OtherThreadsWork";

const bot = {
  id: "ada", name: "Ada", color: "blue", threadId: "main",
  tasks: [
    { threadId: "main", title: "Main", createdAt: 1, busy: true },
    { threadId: "quote", title: "Reply to a fragment", createdAt: 2, busy: true },
    { threadId: "files", title: "Files", createdAt: 3, activity: "working" },
    { threadId: "idle", title: "Idle", createdAt: 4 },
    { threadId: "asks", title: "Asks", createdAt: 5, busy: true, activity: "waiting-on-you" },
    { threadId: "old", title: "Old", createdAt: 6, busy: true, archivedAt: 7 },
  ],
} as unknown as Bot;

describe("the bot's work in its other conversations", () => {
  it("lists every other conversation running a turn, and not the open one, idle, waiting or archived ones", () => {
    expect(otherWorkingThreads(bot).map((task) => task.threadId).sort()).toEqual(["files", "quote"]);
    expect(otherWorkingThreads({ threadId: "main", tasks: undefined })).toEqual([]);
  });

  it("shows one line per conversation with what it is doing now and a way into it", () => {
    live.byThread = {
      quote: { ended: false, status: { activity: "thinking" }, label: "Looking through files" },
      files: { ended: false, status: { activity: "command", tool: "Bash", target: "npx pnpm@10.33.0 test" } },
    };
    const dispatch = vi.fn();
    const html = renderToStaticMarkup(createElement(OtherThreadsWork, { bot, dispatch }));
    expect(html.match(/data-other-thread-work=/g)).toHaveLength(2);
    expect(html).toContain('data-other-thread-work="quote"');
    expect(html).toContain("Looking through files");
    expect(html).toContain("#Reply to a fragment");
    expect(html).not.toContain('data-other-thread-work="main"');
  });

  it("is nothing when the bot works only in the open conversation", () => {
    const solo = { ...bot, tasks: bot.tasks!.slice(0, 1) } as Bot;
    expect(renderToStaticMarkup(createElement(OtherThreadsWork, { bot: solo, dispatch: vi.fn() }))).toBe("");
  });
});
