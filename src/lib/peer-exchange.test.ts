import { describe, expect, it } from "vitest";
import type { Message } from "@/state/store";
import { exchangeEntries, exchangeRuns, exchangeSummary, peerConversation } from "./peer-exchange";

const msg = (id: string, fields: Partial<Message>): Message => ({ id, role: "bot", kind: "text", at: 1, ...fields } as Message);
const ghosty = { id: "ghosty", name: "Ghosty" };
const amy = { id: "amy", name: "Amy" };

describe("exchangeSummary", () => {
  it("says one row as Messaged or Message from", () => {
    expect(exchangeSummary([{ direction: "outbound", peer: ghosty }])).toEqual({ kind: "single", direction: "outbound", peer: ghosty });
    expect(exchangeSummary([{ direction: "inbound", peer: ghosty }])).toMatchObject({ kind: "single", direction: "inbound" });
  });

  it("calls one message to each of several bots a fan-out, and counts anything else", () => {
    expect(exchangeSummary([{ direction: "outbound", peer: ghosty }, { direction: "outbound", peer: amy }])).toEqual({ kind: "fanout", peers: [ghosty, amy] });
    expect(exchangeSummary([{ direction: "inbound", peer: ghosty }, { direction: "outbound", peer: ghosty }, { direction: "inbound", peer: ghosty }]))
      .toEqual({ kind: "thread", count: 3, peers: [ghosty] });
  });
});

describe("exchangeEntries", () => {
  it("folds another bot's line and this bot's reply to it, but not the person's lines or cards", () => {
    const rows = [
      msg("you", { role: "user", text: "hi" }),
      msg("answer", { text: "hello", requestMessageId: "you" }),
      msg("asked", { role: "user", text: "[From @Ghosty (bot) · message · reply expected] status?", peerAsk: { botId: "ghosty", name: "Ghosty" } }),
      msg("reply", { text: "all good", requestMessageId: "asked" }),
      msg("card", { kind: "options", requestMessageId: "asked" }),
    ];
    const entries = exchangeEntries(rows, "me");
    expect([...entries.keys()]).toEqual(["asked", "reply"]);
    expect(entries.get("asked")).toEqual({ direction: "inbound", peer: ghosty });
    expect(entries.get("reply")).toEqual({ direction: "outbound", peer: ghosty });
  });

  it("reads sent rows as outbound, results as inbound, and leaves a bot's question to the person alone", () => {
    const rows = [
      msg("sent", { kind: "activity", tool: { name: "Sent to Ghosty", ok: true }, from: { botId: "me", name: "Me", color: "blue" }, threadRef: { botId: "ghosty", threadId: "t", title: "x" } }),
      msg("result", { kind: "activity", tool: { name: "Ghosty replied", ok: true }, roomRequest: { id: "r", phase: "result" }, from: { botId: "ghosty", name: "Ghosty", color: "green" }, threadRef: { botId: "ghosty", threadId: "t", title: "x" } }),
      msg("needs", { kind: "activity", tool: { name: "Ghosty needs your input: which?", ok: true }, from: { botId: "ghosty", name: "Ghosty", color: "green" }, threadRef: { botId: "ghosty", threadId: "t", title: "x" } }),
    ];
    const entries = exchangeEntries(rows, "me");
    expect(entries.get("sent")?.direction).toBe("outbound");
    expect(entries.get("result")?.direction).toBe("inbound");
    expect(entries.has("needs")).toBe(false);
  });
});

describe("exchangeRuns", () => {
  it("groups consecutive exchange items, stepping over rows the chat does not draw", () => {
    type Item = { rows: Message[]; hidden?: boolean };
    const items: Item[] = [
      { rows: [msg("a", { role: "user", text: "[From @Ghosty (bot) · message · x] one", peerAsk: { botId: "ghosty", name: "Ghosty" } })] },
      { rows: [msg("step", { kind: "activity", tool: { name: "Read", ok: true } })], hidden: true },
      { rows: [msg("b", { text: "two", requestMessageId: "a" })] },
      { rows: [msg("c", { role: "user", text: "mine" })] },
    ];
    const all = items.flatMap((item) => item.rows);
    const runs = exchangeRuns(items, (item) => item.rows, exchangeEntries(all, "me"), (item) => item.hidden === true);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ start: 0, end: 0, summary: { kind: "single", direction: "inbound", peer: ghosty } });
    expect(runs[1]).toMatchObject({ start: 1, end: 2, summary: { kind: "single", direction: "outbound", peer: ghosty } });
  });

  type Item = { rows: Message[] };
  const runsOf = (rows: Message[], threadBotId: string) =>
    exchangeRuns(rows.map((row) => ({ rows: [row] })), (item: Item) => item.rows, exchangeEntries(rows, threadBotId)).map((run) => run.summary);

  it("reads a hand-off in the asker's chat as Messaged then Message from, the resume row folded in", () => {
    const from = { botId: "dusk", name: "dusk bot", color: "blue" as const };
    const to = { botId: "writer", name: "writer", color: "green" as const };
    const ref = { botId: "writer", threadId: "w", title: "@dusk bot · work" };
    const rows = [
      msg("you", { role: "user", text: "ask writer" }),
      msg("sent", { kind: "activity", tool: { name: "Sent to writer", ok: true }, from, threadRef: ref, handoff: { phase: "sent", from, to, text: "What do you do?" } }),
      msg("back", { kind: "activity", tool: { name: "writer replied", ok: true, output: "I write." }, roomRequest: { id: "r", phase: "result" }, from: to, threadRef: ref,
        handoff: { phase: "result", from: to, to: from } }),
      msg("resumed", { kind: "activity", tool: { name: "Resumed with writer's results, reviewing", ok: true }, peerResume: true }),
      msg("final", { text: "writer writes." }),
    ];
    expect(runsOf(rows, "dusk")).toEqual([
      { kind: "single", direction: "outbound", peer: { id: "writer", name: "writer", color: "green" } },
      { kind: "single", direction: "inbound", peer: { id: "writer", name: "writer", color: "green" } },
    ]);
    const entries = exchangeEntries(rows, "dusk");
    expect(entries.get("resumed")).toMatchObject({ step: true });
    expect(entries.has("final")).toBe(false);
  });

  it("reads the same exchange in the asked bot's chat as Message from then Messaged", () => {
    const rows = [
      msg("ask", { text: "@writer What do you do?", roomRequest: { id: "r", phase: "request" }, from: { botId: "dusk", name: "dusk bot", color: "blue" }, at: 10 }),
      msg("step", { kind: "activity", tool: { name: "Read", ok: true }, at: 11 }),
      msg("reply", { text: "I write.", at: 12 }),
    ];
    expect(runsOf(rows, "writer")).toEqual([
      { kind: "single", direction: "inbound", peer: { id: "dusk", name: "dusk bot", color: "blue" } },
      { kind: "single", direction: "outbound", peer: { id: "dusk", name: "dusk bot", color: "blue" } },
    ]);
  });
});

describe("peerConversation", () => {
  const rows = [
    msg("you", { role: "user", text: "how is it going?", at: 1 }),
    msg("answer", { text: "fine", requestMessageId: "you", at: 2 }),
    msg("asked", { role: "user", text: "[From @Ghosty (bot) · message · reply expected] status?", peerAsk: { botId: "ghosty", name: "Ghosty" }, at: 3 }),
    msg("reply", { text: "all good", requestMessageId: "asked", at: 4 }),
    msg("amyAsk", { role: "user", text: "[From @Amy (bot) · message · reply expected] ping", peerAsk: { botId: "amy", name: "Amy" }, at: 5 }),
    msg("amyReply", { text: "pong", requestMessageId: "amyAsk", at: 6 }),
    msg("later", { role: "user", text: "thanks", at: 7 }),
  ];
  const entries = exchangeEntries(rows, "me");

  it("keeps only the lines traded with the chosen bot, oldest first, without the provenance note", () => {
    expect(peerConversation(rows, entries, [ghosty])).toEqual([
      { id: "asked", at: 3, direction: "inbound", peer: ghosty, text: "status?" },
      { id: "reply", at: 4, direction: "outbound", peer: ghosty, text: "all good" },
    ]);
  });

  it("never shows the person's own lines, and takes several bots at once", () => {
    const ids = peerConversation(rows, entries, [ghosty, amy]).map((line) => line.id);
    expect(ids).toEqual(["asked", "reply", "amyAsk", "amyReply"]);
    expect(ids).not.toContain("you");
    expect(ids).not.toContain("later");
  });

  it("leaves out steps and rows with nothing to read", () => {
    const steps = new Map(entries);
    steps.set("reply", { direction: "outbound", peer: ghosty, step: true });
    const blank = [...rows, msg("empty", { kind: "activity", at: 8 })];
    steps.set("empty", { direction: "outbound", peer: ghosty });
    expect(peerConversation(blank, steps, [ghosty]).map((line) => line.id)).toEqual(["asked"]);
  });
});
