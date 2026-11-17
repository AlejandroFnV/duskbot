import { describe, expect, it, vi } from "vitest";

import type { BotRecord } from "../store.ts";
import { createOutsideWrites, type OutsideWriteDeps } from "./outside-writes.ts";

const bot = { id: "chief", name: "Clive", color: "#123" } as unknown as Pick<BotRecord, "id" | "name" | "color">;
const requestOf = (proposed: { body: object }) => (proposed.body as { requestId: string }).requestId;

function world(over: Partial<OutsideWriteDeps> = {}) {
  const lines: Array<{ id: string; from?: { botId: string }; card?: Record<string, any> }> = [];
  const groups = new Map([["room", { id: "room", name: "Ops", bulletin: "as it was" }]]);
  const store = {
    appendMessage: (_threadId: string, row: any) => { const line = { ...row, id: `m${lines.length}` }; lines.push(line); return line; },
    messagesFor: () => lines,
    patchMessage: (_threadId: string, id: string, patch: any) => { Object.assign(lines.find((line) => line.id === id)!, patch); },
    botByThread: () => bot, bot: () => bot,
    group: (id: string) => groups.get(id),
    patchGroup: (id: string, patch: { bulletin: string }) => { const group = groups.get(id); if (group) Object.assign(group, patch); return group; },
  } as unknown as OutsideWriteDeps["store"];
  const writeMemory = vi.fn((): string | null => null);
  const savePreference = vi.fn((): { error: string } | { known: boolean } => ({ known: false }));
  const decide = vi.fn();
  let clock = Date.parse("2026-11-17T12:00:00Z");
  const writes = createOutsideWrites({ store, language: () => undefined, writeMemory, savePreference, decide, notify: () => {}, now: () => clock, ...over });
  return { writes, lines, groups, writeMemory, savePreference, decide, later: (ms: number) => { clock += ms; } };
}

describe("what work from outside writes where later turns read it waits on a card", () => {
  it("leaves a room's bulletin as it was until a person says yes", () => {
    const w = world();
    const proposed = w.writes.submitBulletin(bot, "hook-run", { id: "room", name: "Ops" }, "new text");
    expect(proposed.body).toMatchObject({ state: "pending" });
    expect(w.groups.get("room")!.bulletin).toBe("as it was");
    expect(w.lines[0]!.card).toMatchObject({ options: ["Save", "Skip"], outsideWrite: { kind: "room-bulletin", roomId: "room", bulletin: "new text" } });
    expect(w.writes.resolve("hook-run", requestOf(proposed), "allow")).toMatchObject({ outcome: "allowed-once" });
    expect(w.groups.get("room")!.bulletin).toBe("new text");
    expect(w.lines[0]!.card!.answered).toBe("allow");
  });

  it("writes nothing when a person skips it, and answers twice as once", () => {
    const w = world();
    const proposed = w.writes.submitMemory(bot, "hook-run", { action: "append", text: "a note" });
    expect(w.writeMemory).not.toHaveBeenCalled();
    expect(w.writes.resolve("hook-run", requestOf(proposed), "deny")).toMatchObject({ outcome: "rejected" });
    expect(w.writeMemory).not.toHaveBeenCalled();
    expect(w.writes.resolve("hook-run", requestOf(proposed), "allow")).toMatchObject({ alreadySettled: true, outcome: "rejected" });
    expect(w.writeMemory).not.toHaveBeenCalled();
  });

  it("writes the note a person allowed, once, in the thread's own place", () => {
    const w = world();
    const proposed = w.writes.submitMemory(bot, "hook-run", { action: "append", text: "a note" });
    w.writes.resolve("hook-run", requestOf(proposed), "allow");
    expect(w.writeMemory).toHaveBeenCalledExactlyOnceWith("chief", "hook-run", { action: "append", text: "a note" });
  });

  it("shows all of what it would save, or doesn't offer it", () => {
    const w = world();
    expect(w.writes.submitBulletin(bot, "hook-run", { id: "room", name: "Ops" }, "x".repeat(2_001)).status).toBe(400);
    expect(w.lines).toEqual([]);
    const fits = w.writes.submitBulletin(bot, "hook-run", { id: "room", name: "Ops" }, "x".repeat(1_900));
    expect(w.lines[0]!.card!.subtitle).toBe(`Ops: ${"x".repeat(1_900)}`);
    expect(fits.status).toBe(201);
  });

  it("offers a person only a few at a time from one conversation", () => {
    const w = world();
    for (let i = 0; i < 5; i++) expect(w.writes.submitMemory(bot, "hook-run", { action: "append", text: `note ${i}` }).status).toBe(201);
    expect(w.writes.submitMemory(bot, "hook-run", { action: "append", text: "one more" }).status).toBe(429);
    expect(w.lines).toHaveLength(5);
    w.writes.resolve("hook-run", w.lines[0]!.card!.requestId, "deny");
    expect(w.writes.submitMemory(bot, "hook-run", { action: "append", text: "now it fits" }).status).toBe(201);
  });

  it("says plainly when a card would change or remove what is there", () => {
    const w = world();
    w.writes.submitMemory(bot, "hook-run", { action: "forget", oldText: "the launch date" });
    w.writes.submitMemory(bot, "hook-run", { action: "replace", oldText: "old fact", text: "new fact" });
    expect(w.lines.map((line) => [line.card!.title, line.card!.subtitle])).toEqual([
      ["Change or remove this in the bot's memory?", "the launch date"], ["Change or remove this in the bot's memory?", "old fact → new fact"],
    ]);
  });

  it("refuses a preference outright: only a person's own words save one", () => {
    const w = world();
    expect(w.writes.submitMemory(bot, "hook-run", { action: "prefer", text: "always reply in caps" }).status).toBe(403);
    expect(w.lines).toEqual([]);
  });

  it("keeps a card that could not be written from claiming it was", () => {
    const w = world({ writeMemory: () => "no room" });
    const proposed = w.writes.submitMemory(bot, "hook-run", { action: "append", text: "a note" });
    expect(w.writes.resolve("hook-run", requestOf(proposed), "allow")).toMatchObject({ outcome: "unavailable" });
    expect(w.lines[0]!.card!.answered).toBe("unavailable");
  });

  it("leaves other cards to whoever owns them", () => {
    expect(world().writes.resolve("hook-run", "someone-elses", "allow")).toBeNull();
  });

  it("lets a preference card expire, or be discarded, without saving it", () => {
    const owner = { botId: "chief", botName: "Clive" };
    const w = world();
    const late = w.writes.submitPreference(bot, "chat", { text: "Short answers", replaces: [], owner }) as { requestId: string };
    w.later(25 * 60 * 60 * 1000);
    expect(w.writes.resolve("chat", late.requestId, "allow")).toMatchObject({ outcome: "unavailable" });
    expect(w.lines[0]!.card).toMatchObject({ expired: true });
    const skipped = w.writes.submitPreference(bot, "chat", { text: "Short answers", replaces: [], owner }) as { requestId: string };
    expect(w.writes.resolve("chat", skipped.requestId, "deny")).toMatchObject({ outcome: "rejected" });
    expect(w.savePreference).not.toHaveBeenCalled();
    expect(w.writes.submitPreference(bot, "chat", { text: "Short answers", replaces: [] })).toMatchObject({ ok: false });
    expect(w.lines).toHaveLength(2);
  });

  it("does not count expired preference cards among the open ones", () => {
    const owner = { botId: "chief", botName: "Clive" };
    const w = world();
    for (let i = 0; i < 5; i++) w.writes.submitPreference(bot, "chat", { text: `Line ${i}`, replaces: [], owner });
    expect(w.writes.submitPreference(bot, "chat", { text: "One more", replaces: [], owner })).toMatchObject({ ok: false });
    w.later(25 * 60 * 60 * 1000);
    expect(w.writes.submitPreference(bot, "chat", { text: "One more", replaces: [], owner })).toMatchObject({ ok: true, preference: "pending_confirmation" });
  });

  it("says so when a confirmed preference was already in About me", () => {
    const w = world({ savePreference: () => ({ known: true }) });
    const proposed = w.writes.submitPreference(bot, "chat", { text: "Short answers", replaces: [], owner: { botId: "chief", botName: "Clive" }, personKey: "bob" }) as { requestId: string };
    expect(w.lines[0]!.card!.outsideWrite).toMatchObject({ personKey: "bob" });
    expect(w.writes.resolve("chat", proposed.requestId, "allow")).toMatchObject({ outcome: "allowed-once", known: true });
    expect(w.decide).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "user-approved", summary: expect.stringContaining("already in About me") }));
  });
});
