import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Bot } from "@/state/store";
import { QueuedHandoffsLine } from "./QueuedHandoffsLine";

const bots = [{ id: "ada", name: "Ada", color: "pink" }] as Bot[];
const render = (message: Parameters<typeof QueuedHandoffsLine>[0]["message"], onOpen?: () => void) =>
  renderToStaticMarkup(createElement(QueuedHandoffsLine, { message, bots, ...(onOpen ? { onOpen } : {}) }));

describe("QueuedHandoffsLine", () => {
  it("draws three waiting hand-offs as one event line with the teammate's avatar chip", () => {
    const html = render({ queuedHandoffs: { botId: "ada", count: 3 }, tool: { name: "3 handoffs waiting for Ada", ok: true } });
    expect(html).toContain("data-event-line");
    expect(html).toContain('data-queued-handoffs="3"');
    expect(html).toContain(">3 handoffs waiting for<");
    expect(html).toContain(">Ada<");
    expect(html).not.toContain("<button");
  });

  it("opens the teammate's thread when the line names one, and says one hand-off in the singular", () => {
    const html = render({ queuedHandoffs: { botId: "ada", count: 1 }, threadRef: { botId: "ada", threadId: "t", title: "QA" } }, () => {});
    expect(html).toContain(">1 handoff waiting for<");
    expect(html).toMatch(/<button[^>]*title="[^"]*QA/);
  });

  it("draws nothing for a line that is not a waiting hand-off", () => {
    expect(render({ tool: { name: "Sent to Ada", ok: true } })).toBe("");
  });
});
