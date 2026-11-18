import { describe, expect, it } from "vitest";
import type { Message } from "@/state/store";
import { timelineParts } from "./bot-timeline";

const row = (id: string, at: number, role: Message["role"] = "bot"): Message => ({ id, at, role, kind: "text", text: id });
const ids = (parts: ReturnType<typeof timelineParts>) => parts.map((part) => [part.thread?.threadId ?? "open", part.messages.map((m) => m.id)]);

describe("one timeline for a bot's chat and its other conversations", () => {
  it("puts the other conversations' rows in among the open chat's by time, one run per conversation", () => {
    const open = [row("hi", 10, "user"), row("hello", 11), row("later", 50, "user")];
    const work = { threadId: "w", title: "QA cleanup", messages: [row("job", 20, "user"), row("on it", 21), row("done", 30)] };
    const parts = timelineParts(open, [work], true);
    expect(ids(parts)).toEqual([["open", ["hi", "hello"]], ["w", ["job", "on it", "done"]], ["open", ["later"]]]);
    expect(parts[1]!.thread).toEqual({ threadId: "w", title: "QA cleanup" });
  });

  it("keeps the open chat's own order even when its times are out of order", () => {
    const open = [row("a", 10), row("b", 5), row("c", 20)];
    const parts = timelineParts(open, [{ threadId: "w", title: "W", messages: [row("x", 15)] }], true);
    expect(parts.flatMap((part) => part.messages.map((m) => m.id))).toEqual(["a", "b", "x", "c"]);
  });

  it("merges rows from two other conversations by time and splits runs where the source changes", () => {
    const parts = timelineParts([], [
      { threadId: "a", title: "A", messages: [row("a1", 1), row("a2", 4)] },
      { threadId: "b", title: "B", messages: [row("b1", 2), row("b2", 3)] },
    ], true);
    expect(ids(parts)).toEqual([["a", ["a1"]], ["b", ["b1", "b2"]], ["a", ["a2"]]]);
  });

  it("hides other rows older than the oldest open row until the open chat is loaded from its start", () => {
    const open = [row("recent", 100)];
    const work = { threadId: "w", title: "W", messages: [row("old", 50), row("new", 150)] };
    expect(ids(timelineParts(open, [work], false))).toEqual([["open", ["recent"]], ["w", ["new"]]]);
    expect(ids(timelineParts(open, [work], true))).toEqual([["w", ["old"]], ["open", ["recent"]], ["w", ["new"]]]);
  });

  it("gives each run a key from its conversation and first row, and is the open chat alone without other rows", () => {
    const open = [row("hi", 1)];
    expect(timelineParts(open, [], false)).toEqual([{ key: "open:hi", messages: [open[0]] }]);
    expect(timelineParts([], [], true)).toEqual([]);
    expect(timelineParts(open, [{ threadId: "w", title: "W", messages: [row("x", 2)] }], true).map((part) => part.key)).toEqual(["open:hi", "w:x"]);
  });
});
