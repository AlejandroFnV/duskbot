// @vitest-environment happy-dom
import { act, createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { LIFE_MASCOT_MS, LIFE_MASCOT_STATE } from "@/lib/reply-life";
import type { MarkState } from "./mascot-engine";

import { loadLocale } from "@/lib/i18n";
import type { Bot, Message } from "@/state/store";
import { handoffWorkIds, roomAtWorkIds, RoomWorkingLines, roomStatusPhrase, roomWaitingPhrase, roomWorkingIds } from "./RoomWorkingLines";
import { roomWorkingPreview } from "@/lib/room-threads";

await loadLocale("en");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bot = (id: string, name: string) => ({
  id, name, color: "green", threadId: id, title: "", description: "", notifications: true, unread: false, messages: [],
  modelSelection: { instanceId: "test", model: "m" },
}) as Bot;
const members = [bot("echo", "Echo"), bot("nova", "Nova"), bot("moss", "Moss")];

describe("who works in a room", () => {
  it("names the speaker, every parallel turn and a member whose tool call is out, once each", () => {
    const toolCall = { id: "a", role: "bot", kind: "activity", at: 1, from: { botId: "moss", name: "Moss", color: "green" }, tool: { name: "Bash", input: "{}" } } as Message;
    expect(roomWorkingIds({ threadId: "t", busyBotId: "echo", busyBotIds: ["echo", "nova"] }, toolCall)).toEqual(["echo", "nova", "moss"]);
    expect(roomWorkingIds({ threadId: "t", busyBotId: null }, undefined)).toEqual([]);
  });
});

describe("members at work on a hand-off", () => {
  const who = (botId: string, name: string) => ({ botId, name, color: "green" });
  const line = (id: string, phase: "sent" | "result", from: string, to: string): Message => ({
    id, role: "bot", kind: "activity", at: 2, tool: { name: id, ok: true },
    handoff: { phase, from: who(from, from), to: who(to, to) },
  });
  const ask: Message = { id: "ask", role: "user", kind: "text", at: 1, text: "Get the launch ready" };

  it("counts each member a hand-off since the person's last line still waits on", () => {
    expect(handoffWorkIds([ask, line("a", "sent", "nova", "quill"), line("b", "sent", "nova", "moss")])).toEqual(["quill", "moss"]);
    expect(handoffWorkIds([ask, line("a", "sent", "nova", "quill"), line("b", "sent", "nova", "moss"), line("c", "result", "quill", "nova")])).toEqual(["moss"]);
  });

  it("forgets hand-offs from before the person last wrote", () => {
    expect(handoffWorkIds([line("a", "sent", "nova", "quill"), ask])).toEqual([]);
  });
});

describe("who works while others wait their turn", () => {
  const sent = (id: string, to: string): Message => ({ id, role: "bot", kind: "activity", at: 2, tool: { name: id, ok: true }, handoff: { phase: "sent", from: { botId: "ada", name: "Ada", color: "blue" }, to: { botId: to, name: to, color: "green" } } });
  const ask: Message = { id: "q", role: "user", kind: "text", at: 1, text: "go" };
  const room = {
    threadId: "t", busyBotId: "echo", busyBotIds: ["echo"], working: true,
    queue: [
      { botId: "echo", threadId: "t", state: "running" as const, position: 1, of: 3 },
      { botId: "nova", threadId: "t", state: "queued" as const, position: 2, of: 3, waitingForBotId: "echo" },
      { botId: "moss", threadId: "t", state: "queued" as const, position: 3, of: 3, waitingForBotId: "echo" },
    ],
  };
  const handoffs = handoffWorkIds([ask, sent("a", "echo"), sent("b", "nova"), sent("c", "moss")]);

  it("names only the one at work: members queued behind it are not working, even with a hand-off out to them", () => {
    expect(handoffs).toEqual(["echo", "nova", "moss"]);
    expect(roomAtWorkIds(room, undefined, handoffs)).toEqual(["echo"]);
    expect(roomWorkingPreview(room, (id) => members.find((m) => m.id === id)?.name)).toBe("Echo is working… · 2 queued");
  });

  it("keeps a member with a job running even when another of its jobs waits", () => {
    const both = { ...room, queue: [...room.queue, { botId: "echo", threadId: "t", state: "queued" as const, position: 4, of: 4 }] };
    expect(roomAtWorkIds(both, undefined, handoffs)).toEqual(["echo"]);
    expect(roomAtWorkIds({ ...room, queue: [] }, undefined, handoffs)).toEqual(["echo", "nova", "moss"]);
  });

  it("says who works and how many wait in one short phrase, singular for one name", () => {
    expect(roomWaitingPhrase(["Pixel"], 2)).toBe("Pixel is working · 2 waiting their turn");
    expect(roomWaitingPhrase(["Ada", "Lin"], 1)).toBe("Ada and Lin are working · 1 waiting their turn");
    expect(roomWaitingPhrase(["A", "B", "C", "D"], 3)).toBe("Several bots are working · 3 waiting their turn");
  });
});

describe("the room's working phrase", () => {
  it("names two or three bots as a list and calls more of them several", () => {
    expect(roomStatusPhrase(["Nova", "Quill"], "typing")).toBe("Nova and Quill are typing…");
    expect(roomStatusPhrase(["Nova", "Quill", "Rivet"], "working")).toBe("Nova, Quill, and Rivet are working…");
    expect(roomStatusPhrase(["Nova", "Quill", "Rivet", "Echo"], "working")).toBe("Several bots are working…");
  });
});

describe("the room's working line", () => {
  const draw = (workingIds: string[], speakerVisible = true, markState: MarkState = "streaming", phase = "friendly:chat.typing", waiting = 0) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(createElement(RoomWorkingLines, {
      group: { id: "room", turnStartedAt: 1 },
      members,
      workingIds,
      waiting,
      speaker: { bot: members[0], visible: speakerVisible, markState, phrases: ["typing…"], phase, since: null },
      slot: true,
    })));
    return { host, done: () => { flushSync(() => root.unmount()); host.remove(); } };
  };

  it("is one line for several bots: their faces in a stack and one phrase that names them, with nothing to unfold", () => {
    const { host, done } = draw(["echo", "nova", "moss"]);
    expect(host.querySelectorAll(".turn-presence")).toHaveLength(1);
    expect([...host.querySelectorAll("[data-bot-faces] [role=img]")].map((face) => face.getAttribute("aria-label"))).toEqual(["Echo", "Nova", "Moss"]);
    expect(host.querySelector(".turn-presence > div")?.getAttribute("title"), "no timer, step or tool name").toBe("Echo, Nova, and Moss are typing…");
    expect(host.querySelector("button[aria-expanded]")).toBeNull();
    done();
  });

  it("with 1 at work and 2 queued shows one face and one name, and counts the two waiting", () => {
    const { host, done } = draw(["echo"], true, "thinking", "friendly:thinking", 2);
    expect([...host.querySelectorAll("[data-bot-faces] [role=img]")].map((face) => face.getAttribute("aria-label"))).toEqual(["Echo"]);
    expect(host.querySelector(".turn-presence > div")?.getAttribute("title")).toBe("Echo is working · 2 waiting their turn");
    expect(host.textContent).not.toMatch(/Nova|Moss/);
    done();
  });

  it("keeps one bot at work on the plain 1:1 line", () => {
    const { host, done } = draw(["echo"]);
    expect(host.querySelectorAll("[data-bot-faces] [role=img]")).toHaveLength(1);
    expect(host.innerHTML).toMatch(/width(="|: )28px/);
    done();
  });

  it("gives each answering face its own quiet wait: the mascot, then the dots; a typing one is the bot itself", () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const { host, done } = draw(["echo", "nova"], true, "thinking", "friendly:thinking");
    const states = () => [...host.querySelectorAll("[data-bot-faces] [data-state]")].map((face) => face.getAttribute("data-state"));
    expect(states()).toEqual([LIFE_MASCOT_STATE, LIFE_MASCOT_STATE]);
    act(() => void vi.advanceTimersByTime(LIFE_MASCOT_MS.max + 20));
    expect(states()).toEqual(["thinking", "thinking"]);
    done();
    const typing = draw(["echo"]);
    expect([...typing.host.querySelectorAll("[data-bot-faces] [data-state]")].map((face) => face.getAttribute("data-state"))).toEqual(["streaming"]);
    typing.done();
    vi.useRealTimers();
  });

  it("keeps the slot when nobody works", () => {
    const { host, done } = draw([], false);
    expect(host.querySelector("[data-room-working-line]")).toBeNull();
    expect(host.querySelector(".turn-status-slot")).not.toBeNull();
    done();
  });
});
