import { afterEach, describe, expect, it, vi } from "vitest";

import { STATUS_LABEL_MAX, STATUS_TOOL } from "../../shared/turn-progress.ts";
import type { RuntimeEvent } from "../contracts.ts";
import { toolStep } from "../step-summary.ts";
import { derivedLabel, LABEL_HOLD_MS, MODEL_HOLD_MS, searchTopic } from "./derived-status.ts";
import type { ProgressEvent } from "./progress-gate.ts";
import { TurnStatus } from "./status-calls.ts";

const call = (title: string, input: unknown) => {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  return { title, input: text, step: toolStep({ title, input: text }) };
};

describe("derivedLabel", () => {
  it("names a web search by its topic, however the engine spells the tool", () => {
    expect(derivedLabel(call("WebSearch", { query: "best budget mechanical keyboards India 2026" }), undefined)?.label)
      .toBe("Searching for best budget mechanical");
    expect(derivedLabel(call("web_search", "\"weather in Delhi\""), undefined)?.label).toBe("Searching for weather in Delhi");
    expect(derivedLabel(call("mcp__agents__web_search_many", { queries: ["notion pricing", "coda pricing"] }), undefined)?.label)
      .toBe("Searching for notion pricing");
    expect(derivedLabel(call("mcp__agents__use_tool", { name: "web_search_many", arguments: { queries: [{ query: "obsidian sync" }] } }), undefined)?.label)
      .toBe("Searching for obsidian sync");
    expect(derivedLabel(call("WebSearch", {}), undefined)?.label).toBe("Searching the web");
  });

  it("names pages, sites, files and commands", () => {
    expect(derivedLabel(call("WebFetch", { url: "https://www.theverge.com/reviews/keyboards" }), undefined)?.label).toBe("Reading theverge.com");
    const opened = derivedLabel(call("mcp__browser__agent_browser_navigate", { url: "https://news.ycombinator.com/" }), undefined);
    expect(opened).toEqual({ label: "Checking news.ycombinator.com", site: "news.ycombinator.com" });
    expect(derivedLabel(call("agent_browser_click", { ref: "e12" }), undefined, opened?.site)?.label).toBe("Checking news.ycombinator.com");
    expect(derivedLabel(call("agent_browser_click", { ref: "e12" }), undefined)?.label).toBe("Using the browser");
    expect(derivedLabel(call("Write", { file_path: "/tmp/w/report.md", content: "x" }), undefined)?.label).toBe("Writing report.md");
    expect(derivedLabel({ title: "Bash", step: toolStep({ title: "Bash", summary: "python3 scrape.py --all" }) }, undefined)?.label)
      .toBe("Running a command");
    expect(derivedLabel({ title: "Bash", step: toolStep({ title: "Bash", summary: "cd ~/repo && git push origin main" }) }, undefined)?.label)
      .toBe("Uploading changes");
    expect(derivedLabel({ title: "Bash", step: toolStep({ title: "Bash", summary: "kill $(cat /tmp/dev.pid)" }) }, undefined)?.label)
      .toBe("Stopping processes");
    expect(derivedLabel({ title: "Bash", step: { activity: "command", target: "-" } }, undefined)?.label).toBe("Running a command");
    expect(derivedLabel({ title: "Bash", step: { activity: "command", target: "" } }, undefined)?.label).toBe("Running a command");
    expect(derivedLabel(call("computer", { action: "screenshot" }), undefined)?.label).toBe("Using the computer");
    expect(derivedLabel(call("mcp__agents__memory_update", { text: "x" }), undefined)?.label).toBe("Checking my notes");
  });

  it("says nothing for a call it cannot name, and keeps every label short and clean", () => {
    expect(derivedLabel(call("list_bots", {}), undefined)).toBeUndefined();
    expect(derivedLabel(call("ToolSearch", { query: "select:WebSearch" }), undefined)).toBeUndefined();
    const long = derivedLabel(call("WebSearch", { query: "x".repeat(200) }), undefined)!.label;
    expect(long.length).toBeLessThanOrEqual(STATUS_LABEL_MAX);
    expect(derivedLabel(call("WebSearch", { query: "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" }), undefined)!.label)
      .not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("reads a query as a topic", () => {
    expect(searchTopic("\"standing desk\" reviews site:reddit.com -ikea 2025 OR 2026")).toBe("standing desk reviews");
  });
});

describe("TurnStatus derived labels", () => {
  afterEach(() => vi.useRealTimers());

  const started = (title: string, input: unknown, turnId = "t1"): Extract<RuntimeEvent, { type: "item.started" }> => {
    const text = JSON.stringify(input);
    return {
      eventId: `e-${title}`, provider: "claudeAgent", threadId: "th", turnId, createdAt: new Date().toISOString(),
      type: "item.started", itemType: "tool", itemId: `i-${title}-${text.length}`, title, input: text, step: toolStep({ title, input: text }),
    } as Extract<RuntimeEvent, { type: "item.started" }>;
  };

  const setup = () => {
    vi.useFakeTimers();
    const frames: ProgressEvent[] = [];
    const status = new TurnStatus({ emit: (frame) => frames.push(frame), now: () => Date.now() });
    const labels = () => frames.map((frame) => frame.label);
    return { status, frames, labels };
  };

  it("shows the first label at once and holds each one before the next", () => {
    const { status, frames, labels } = setup();
    status.derive(started("WebSearch", { query: "keyboard reviews" }));
    expect(labels()).toEqual(["Searching for keyboard reviews"]);
    expect(frames[0]).toMatchObject({ type: "turn.progress", tool: STATUS_TOOL, turnId: "t1" });
    status.derive(started("WebFetch", { url: "https://rtings.com/keyboard" }));
    status.derive(started("WebFetch", { url: "https://www.theverge.com/x" }));
    expect(labels()).toHaveLength(1);
    vi.advanceTimersByTime(LABEL_HOLD_MS);
    expect(labels()).toEqual(["Searching for keyboard reviews", "Reading theverge.com"]);
  });

  it("lets the bot's own label stand, then derives again", () => {
    const { status, labels } = setup();
    const own = status.take({
      eventId: "s", provider: "claudeAgent", threadId: "th", turnId: "t1", createdAt: "", type: "item.started", itemType: "tool",
      itemId: "s1", title: "mcp__agents__set_status", input: JSON.stringify({ status: "comparing keyboards" }),
    } as RuntimeEvent);
    expect(own?.frame?.label).toBe("Comparing keyboards");
    status.derive(started("WebSearch", { query: "keyboard reviews" }));
    expect(labels()).toEqual([]);
    expect(status.stamp({ type: "turn.progress", threadId: "th", turnId: "t1", activity: "web" } as ProgressEvent).label).toBe("Comparing keyboards");
    vi.advanceTimersByTime(MODEL_HOLD_MS);
    status.derive(started("WebSearch", { query: "keyboard prices" }));
    expect(labels()).toEqual(["Searching for keyboard prices"]);
  });

  it("drops a waiting label when the turn ends, and derives nothing without a way to send it", () => {
    const { status, labels } = setup();
    status.derive(started("WebSearch", { query: "a" }));
    status.derive(started("WebSearch", { query: "b" }));
    status.forget("th");
    vi.advanceTimersByTime(LABEL_HOLD_MS * 2);
    expect(labels()).toEqual(["Searching for a"]);
    const silent = new TurnStatus();
    silent.derive(started("WebSearch", { query: "c" }));
    expect(silent.stamp({ type: "turn.progress", threadId: "th", turnId: "t1", activity: "web" } as ProgressEvent).label).toBeUndefined();
  });
});
