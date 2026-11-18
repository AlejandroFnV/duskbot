import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import { ThreadStretch, TIMELINE_THREADS, timelineThreads, WritingToOpenChat } from "./BotTimeline";
import { ChatRowsContext, type ChatRows } from "./chat-rows";

const task = (threadId: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ threadId, title: threadId, createdAt: 1, updatedAt, ...extra });
const bot = {
  id: "lyra", name: "Lyra", threadId: "main", mainThreadId: "main",
  tasks: [task("main", 9), task("qa", 5), task("old", 2, { archivedAt: 3 }), task("seo", 7)],
} as unknown as Bot;

describe("which other conversations a bot's chat shows", () => {
  it("lists the bot's other conversations newest first, not the open or archived ones", () => {
    expect(timelineThreads(bot).map((one) => one.threadId)).toEqual(["seo", "qa"]);
  });

  it("shows none while another conversation is the open one", () => {
    expect(timelineThreads({ ...bot, threadId: "qa" })).toEqual([]);
  });

  it("still lists them for a bot whose main conversation is not known yet", () => {
    expect(timelineThreads({ ...bot, mainThreadId: undefined }).map((one) => one.threadId)).toEqual(["seo", "qa"]);
  });

  it("keeps to the newest few", () => {
    const many = Array.from({ length: TIMELINE_THREADS + 3 }, (_, index) => task(`t${index}`, index + 10));
    const listed = timelineThreads({ ...bot, tasks: [task("main", 1), ...many] } as unknown as Bot);
    expect(listed).toHaveLength(TIMELINE_THREADS);
    expect(listed[0]!.threadId).toBe(`t${TIMELINE_THREADS + 2}`);
  });
});

describe("the rows from another conversation in the bot's chat", () => {
  it("are labelled with that conversation and give their rows its id", () => {
    const seen: string[] = [];
    const Probe = () => createElement(ChatRowsContext.Consumer, null, (rows: ChatRows | null) => {
      seen.push(`${rows?.threadId}:${rows?.canReact}:${rows?.hasMore}`);
      return null;
    });
    const rows = { botId: "lyra", threadId: "main", canReact: true, hasMore: true, focus: null } as unknown as ChatRows;
    const html = renderToStaticMarkup(createElement(ChatRowsContext.Provider, { value: rows },
      createElement(ThreadStretch, { thread: { threadId: "qa", title: "QA cleanup" }, dispatch: vi.fn() }, createElement(Probe))));
    expect(html).toContain('data-timeline-thread="qa"');
    expect(html).toContain("In #QA cleanup");
    expect(seen).toEqual(["qa:false:false"]);
  });
});

describe("where what you type goes", () => {
  const run = { key: "qa:x", thread: { threadId: "qa", title: "QA cleanup" }, messages: [] };

  it("says it goes to your chat with the bot when the newest rows came from another conversation", () => {
    const html = renderToStaticMarkup(createElement(WritingToOpenChat, { bot, last: run, dispatch: vi.fn() }));
    expect(html).toContain("You&#x27;re writing to your chat with Lyra.");
    expect(html).toContain("Write in #QA cleanup");
  });

  it("says nothing when the newest rows are your own chat's", () => {
    expect(renderToStaticMarkup(createElement(WritingToOpenChat, { bot, last: { key: "open:x", messages: [] }, dispatch: vi.fn() }))).toBe("");
    expect(renderToStaticMarkup(createElement(WritingToOpenChat, { bot, last: undefined, dispatch: vi.fn() }))).toBe("");
  });
});
