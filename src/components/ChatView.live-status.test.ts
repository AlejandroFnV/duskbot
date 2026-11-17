// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/testing/quiet-canceled-animations";
import type { Bot, InstanceInfo, Message } from "@/state/store";
import type { RuntimeEvent } from "../../shared/runtime-events";
import type { ApprovalModeSelector } from "./ApprovalModeSelector";
import type { ModelPicker } from "./ModelPicker";
import { STATUS_HOLD_MS, STATUS_QUIET_MS } from "./TurnPresence";
import { LIFE_DOTS_MS, LIFE_MASCOT_MS, LIFE_MASCOT_STATE } from "@/lib/reply-life";
import { STATUS_MOUNT_MS } from "@/hooks/use-reached";
import { TYPING_MIN_MS } from "@/hooks/use-typing-hold";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = vi.hoisted(() => vi.fn());
const teammates = vi.hoisted((): Array<Record<string, unknown>> => []);
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({
    state: { ...original.initialState, bots: teammates as unknown as Bot[], config: null, instances: [{ instanceId: "test", driverKind: "claudeAgent", displayName: "Test", snapshot: { state: "available" } } as InstanceInfo] },
    dispatch,
  }) };
});
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false, reasonCode: "x", message: "" } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("./SidebarPopoverMenu", async (importOriginal) => ({
  ...await importOriginal<typeof import("./SidebarPopoverMenu")>(),
  SidebarPopoverMenu: (props: { renderTrigger: (state: { open: boolean }) => unknown }) => props.renderTrigger({ open: false }),
}));
vi.mock("@/lib/cloud-guest", () => ({ useCanWriteIn: () => null, useReactor: () => "user" }));
vi.mock("./ModelPicker", () => ({ ModelPicker: (_props: ComponentProps<typeof ModelPicker>) => createElement("span") }));
vi.mock("./ApprovalModeSelector", () => ({ ApprovalModeSelector: (_props: ComponentProps<typeof ApprovalModeSelector>) => createElement("span") }));

const { ChatView } = await import("./ChatView");
const { noteTurnEvent, resetTurnLive } = await import("@/state/turn-status");
const { resetLandedReplies } = await import("@/hooks/use-landed-reply");
const { noteSentTurn, resetSentTurns } = await import("@/state/sent-turn");

const THREAD = "selected";
const started = Date.UTC(2026, 9, 23, 12, 0, 0);
const busyBot = (messages: Message[], busy = true): Bot => ({
  id: "bot", threadId: THREAD, name: "Pepper", title: "", description: "", color: "green",
  notifications: true, unread: false, busy, activity: busy ? "working" : "idle", turnStartedAt: busy ? started : undefined, messages,
  modelSelection: { instanceId: "test", model: "profile-default" },
  tasks: [{ threadId: THREAD, title: "Dashboard", createdAt: 1, busy, activity: busy ? "working" : "idle", turnStartedAt: busy ? started : undefined,
    modelSelection: { instanceId: "test", model: "thread-model" }, approvalMode: "full" }],
});
const ask: Message = { id: "ask", role: "user", kind: "text", at: started, text: "Build me a sales dashboard" };
const intro: Message = { id: "intro", role: "bot", kind: "text", at: started + 5_000, text: "I'll build the dashboard now.", turnId: "t1" };

let seq = 0;
const engine = (event: Partial<RuntimeEvent>) => act(() => noteTurnEvent({
  eventId: `e${++seq}`, provider: "claudeAgent", threadId: THREAD, createdAt: new Date().toISOString(), turnId: "t1", ...event,
} as RuntimeEvent));

let host: HTMLDivElement;
let root: Root;
const render = (shown: Bot) => act(() => root.render(createElement(ChatView, { bot: shown })));
const mascot = () => host.querySelector(".turn-presence");
/** The line as it reads: the phrase fading out is not part of it. */
const statusLine = () => {
  const line = host.querySelector("[data-turn-status]")?.cloneNode(true) as HTMLElement | undefined;
  line?.querySelectorAll(".turn-phrase-out").forEach((node) => node.remove());
  return line?.textContent?.replace(/\s+/g, " ").trim() ?? null;
};

beforeEach(() => {
  vi.useFakeTimers({ now: started + 72_000 });
  resetTurnLive();
  resetLandedReplies();
  resetSentTurns();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the working line", () => {
  it("is the bot's 28px mark and one quiet friendly phrase, with the timer and size kept in its tooltip", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    expect(mascot()).not.toBeNull();
    const first = statusLine();
    expect(["Working on it", "Chipping away", "Getting it done", "Making progress", "Handling it"]).toContain(first);
    expect(mascot()!.innerHTML).toMatch(/width(="|: )28px/);
    const row = mascot()!.firstElementChild as HTMLElement;
    expect([...row.classList]).toEqual(expect.arrayContaining(["h-9", "ps-2", "gap-[8.5px]"]));
    expect(row.title).toMatch(/^Working · /);
    expect(mascot()!.querySelector("[data-turn-status] .status-shimmer")).not.toBeNull();
    const slot = () => host.querySelector(".turn-status-slot")!;
    expect(slot().classList).not.toContain("-mt-3");

    engine({ type: "item.completed", itemType: "assistant_text", text: intro.text! } as Partial<RuntimeEvent>);
    render(busyBot([ask, intro]));
    expect(slot().classList, "under the bot's own bubble it sits close, as one more part of the reply").toContain("-mt-3");
    expect(mascot(), "a bubble in the middle of a turn is not its end: the line stays").not.toBeNull();
    act(() => void vi.advanceTimersByTime(STATUS_HOLD_MS));
    engine({ type: "turn.progress", activity: "write", itemId: "toolu_write", file: "index.html", bytes: 14 * 1024 + 300 } as Partial<RuntimeEvent>);
    expect(statusLine()).toBe("Writing some code");
  });

  it("stays through the turn's bubbles and leaves only when the turn ends, in 140ms", () => {
    const reply: Message = { id: "reply", role: "bot", kind: "text", at: started + 9_000, text: "Fair, quiet day", turnId: "t1" };
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    render(busyBot([ask, reply]));
    expect(mascot()).not.toBeNull();
    engine({ type: "turn.completed", ok: true } as Partial<RuntimeEvent>);
    render(busyBot([ask, reply], false));
    expect(host.querySelector(".turn-status-out"), "it leaves with a scale and fade").not.toBeNull();
    act(() => void vi.advanceTimersByTime(140));
    expect(mascot()).toBeNull();
  });

  it("comes 0.55 to 1.2 s after the send, as the mascot, condenses into the dots once, then the words come", () => {
    vi.setSystemTime(started);
    const markState = () => host.querySelector(".turn-presence [data-state]")?.getAttribute("data-state");
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    expect(mascot(), "nothing at first").toBeNull();
    act(() => void vi.advanceTimersByTime(STATUS_MOUNT_MS.min - 50));
    expect(mascot()).toBeNull();
    act(() => void vi.advanceTimersByTime(STATUS_MOUNT_MS.max - STATUS_MOUNT_MS.min + 60));
    expect(mascot(), "then the mark, wordless").not.toBeNull();
    expect(markState(), "the bot as itself first, not the dots").toBe(LIFE_MASCOT_STATE);
    expect(statusLine()).toBe("");
    act(() => void vi.advanceTimersByTime(LIFE_MASCOT_MS.max + 20));
    expect(markState(), "then it condenses into the thinking dots").toBe("thinking");
    act(() => void vi.advanceTimersByTime(LIFE_DOTS_MS.max + 20));
    expect(markState(), "and back, for good").toBe(LIFE_MASCOT_STATE);
    act(() => void vi.advanceTimersByTime(STATUS_QUIET_MS.max));
    expect(statusLine()).not.toBe("");
  });

  // the owner's "hi": the server answered the send 6.9 s after Enter, and the bot showed nothing until then
  it("shows within 100 ms of a send from this window, and stays put when the server's turn arrives seconds later", () => {
    vi.setSystemTime(started);
    const sentAsk: Message = { ...ask, id: "optimistic-s1", sendId: "s1" };
    act(() => noteSentTurn(THREAD, "s1", started));
    render(busyBot([sentAsk], false));
    act(() => void vi.advanceTimersByTime(100));
    expect(mascot(), "the bot is at it the moment the bubble is").not.toBeNull();
    act(() => void vi.advanceTimersByTime(6_800));
    const shown = mascot();
    expect(shown).not.toBeNull();
    engine({ type: "turn.started" });
    act(() => root.render(createElement(ChatView, { bot: { ...busyBot([sentAsk]), turnStartedAt: started + 6_900 } })));
    expect(mascot(), "no gap and no second opening when the server's turn starts").toBe(shown);
    expect(host.querySelector(".turn-status-out")).toBeNull();
  });

  it("says a quiet turn's notice once, in the working row, not in the chat as well", () => {
    const quiet: Message = { id: "quiet", role: "bot", kind: "activity", at: started + 75_000,
      tool: { name: "notice: Waiting on the model, no reply for 75 s. Slow models can take a while.", ok: true } };
    engine({ type: "turn.started" });
    render(busyBot([ask, quiet]));
    act(() => void vi.advanceTimersByTime(STATUS_QUIET_MS.max + 10));
    expect(statusLine()).toContain("Waiting on the model");
    expect(host.textContent!.split("Waiting on the model").length - 1, "one place only").toBe(1);
  });

  it("opens the same way when a step starts at once: mascot, dots, then the mascot with the bot's words", () => {
    vi.setSystemTime(started);
    const markState = () => host.querySelector(".turn-presence [data-state]")?.getAttribute("data-state");
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    engine({ type: "turn.progress", activity: "tool", tool: "set_status", label: "Comparing standing desks" } as Partial<RuntimeEvent>);
    engine({ type: "item.started", itemType: "tool", itemId: "w1", title: "WebSearch" } as Partial<RuntimeEvent>);
    act(() => void vi.advanceTimersByTime(STATUS_MOUNT_MS.max + 10));
    expect(markState(), "the bot as itself first, not at work yet").toBe(LIFE_MASCOT_STATE);
    expect(statusLine()).toBe("");
    act(() => void vi.advanceTimersByTime(LIFE_MASCOT_MS.max + 20));
    expect(markState(), "then the dots, though a step is running").toBe("thinking");
    expect(statusLine()).toBe("");
    act(() => void vi.advanceTimersByTime(LIFE_DOTS_MS.max + STATUS_QUIET_MS.max));
    expect(markState(), "then at work").not.toBe("thinking");
    expect(statusLine()).toBe("Comparing standing desks");
  });

  it("types as the bot itself, never the dots", () => {
    const markState = () => host.querySelector(".turn-presence [data-state]")?.getAttribute("data-state");
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    engine({ type: "content.delta", streamKind: "assistant_text", delta: "Hi" } as Partial<RuntimeEvent>);
    expect(markState()).toBe("streaming");
    expect(statusLine()).toBe("Typing…");
  });

  it("shows the bot's own label for its phase, and keeps it until it sets another", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    act(() => void vi.advanceTimersByTime(STATUS_HOLD_MS));
    engine({ type: "turn.progress", activity: "tool", tool: "set_status", label: "Comparing keyboard reviews" } as Partial<RuntimeEvent>);
    expect(statusLine()).toBe("Comparing keyboard reviews");
    engine({ type: "item.started", itemType: "tool", itemId: "w1", title: "WebSearch" } as Partial<RuntimeEvent>);
    engine({ type: "item.completed", itemType: "tool", itemId: "w1", ok: true } as Partial<RuntimeEvent>);
    expect(statusLine()).toBe("Comparing keyboard reviews");
    act(() => void vi.advanceTimersByTime(STATUS_HOLD_MS));
    engine({ type: "turn.progress", activity: "tool", tool: "set_status", label: "Drafting the summary" } as Partial<RuntimeEvent>);
    expect(statusLine()).toBe("Drafting the summary");
    expect(host.querySelector("[data-turn-now]")?.classList, "each new label rises in").toContain("turn-label-in");
    act(() => void vi.advanceTimersByTime(STATUS_HOLD_MS));
    engine({ type: "turn.completed", ok: true } as Partial<RuntimeEvent>);
    render(busyBot([ask], false));
    expect(host.querySelector(".turn-status-out"), "It leaves").not.toBeNull();
    expect(statusLine(), "with the bot's own words, not a stock phrase").toBe("Drafting the summary");
  });
});

describe("each bubble's typing beat", () => {
  const fresh = (id: string, text: string): Message => ({ id, role: "bot", kind: "text", at: Date.now(), text, turnId: "t1" });
  const rows = () => [...host.querySelectorAll("[data-mid]")].map((row) => row.getAttribute("data-mid"));

  it("says Typing… for at least 500ms before each bubble lands, the line staying for the turn", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    const ack = fresh("ack", "On it, checking reviews now.");
    render(busyBot([ask, ack]));
    expect(rows(), "held while the line types").toEqual(["ask"]);
    expect(statusLine()).toBe("Typing…");
    act(() => void vi.advanceTimersByTime(TYPING_MIN_MS - 10));
    expect(rows()).toEqual(["ask"]);
    act(() => void vi.advanceTimersByTime(10));
    expect(rows()).toEqual(["ask", "ack"]);
    expect(mascot(), "the line stays for the rest of the turn").not.toBeNull();
    expect(statusLine()).not.toBe("typing…");
  });

  it("gives two bubbles that come together a typing beat each", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    render(busyBot([ask, fresh("one", "First."), fresh("two", "Second.")]));
    act(() => void vi.advanceTimersByTime(TYPING_MIN_MS));
    expect(rows()).toEqual(["ask", "one"]);
    expect(statusLine()).toBe("Typing…");
    act(() => void vi.advanceTimersByTime(TYPING_MIN_MS));
    expect(rows()).toEqual(["ask", "one", "two"]);
  });

  it("ends a turn with the last bubble landing in the frame the line starts leaving", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    const last = fresh("last", "It's 441, so yes.");
    engine({ type: "turn.completed", ok: true } as Partial<RuntimeEvent>);
    render(busyBot([ask, last], false));
    expect(statusLine()).toBe("Typing…");
    expect(rows()).toEqual(["ask"]);
    act(() => void vi.advanceTimersByTime(TYPING_MIN_MS));
    expect(host.querySelector(".turn-status-out"), "the line starts leaving").not.toBeNull();
    expect(rows()).toEqual(["ask", "last"]);
    act(() => void vi.advanceTimersByTime(140));
    expect(mascot()).toBeNull();
  });

  it("never holds back the person's own words", () => {
    engine({ type: "turn.started" });
    render(busyBot([ask]));
    const mine: Message = { id: "mine", role: "user", kind: "text", at: Date.now(), text: "also flag fraud" };
    render(busyBot([ask, fresh("ack", "On it."), mine]));
    expect(rows()).toEqual(["ask", "ack", "mine"]);
  });
});

describe("the line's people", () => {
  const work = [
    { botId: "rigel", threadId: "rigel-t", summary: "Run the release checks", status: "running" as const },
    { botId: "pixel", threadId: "pixel-t", summary: "Polish the composer", status: "queued" as const },
    { botId: "ada", threadId: "ada-t", summary: "Review the plan", status: "waiting" as const },
  ];
  const delegating = (busy: boolean): Bot => {
    const shown = busyBot([ask, intro], busy);
    return { ...shown, waitingForTeammates: !busy, tasks: shown.tasks!.map((task) => ({ ...task, waitingForTeammates: !busy, teammateWork: busy ? undefined : work })) };
  };
  const note = () => host.querySelector("[data-teammate-work]");
  const summary = () => host.querySelector<HTMLButtonElement>("[data-teammate-work-summary]")?.closest("button") ?? null;

  beforeEach(() => {
    teammates.splice(0, teammates.length, ...["rigel:Rigel", "pixel:Pixel", "ada:Ada"].map((pair) => {
      const [id, name] = pair.split(":");
      return { id, name, threadId: `${id}-main`, title: "", description: "", color: "blue", notifications: true, unread: false, busy: false, messages: [] };
    }));
  });
  afterEach(() => void teammates.splice(0));

  it("while it only waits on its teammates, says how many assignments and whose, standing still", () => {
    render(delegating(false));
    act(() => void vi.advanceTimersByTime(STATUS_QUIET_MS.max));
    expect(note()?.querySelector("[data-teammate-work-summary]")?.textContent).toBe("3 assignments under way: Rigel, Pixel, and Ada");
    expect(mascot(), "no working mark or thinking line without a turn of its own").toBeNull();
    expect(host.querySelector("[data-turn-status]")).toBeNull();
    expect(note()!.querySelector(".status-shimmer")).toBeNull();
    expect(note()!.querySelector("[data-teammate-work-hint]")?.textContent).toBe("You can write to it meanwhile");
    expect(summary()?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("[data-teammate-work-thread]")).toBeNull();
  });

  it("keeps the working mark for a turn of its own, without the teammates' note", () => {
    engine({ type: "turn.started" });
    render(delegating(true));
    expect(mascot()).not.toBeNull();
    expect(note()).toBeNull();
  });

  it("opens to what each teammate is doing, each row opening that teammate's thread", () => {
    render(delegating(false));
    act(() => summary()!.click());
    expect(summary()!.getAttribute("aria-expanded")).toBe("true");
    const rows = [...host.querySelectorAll<HTMLButtonElement>("[data-teammate-work-thread]")];
    expect(rows.map((row) => row.dataset.teammateWorkThread)).toEqual(["rigel-t", "pixel-t", "ada-t"]);
    expect(rows.map((row) => row.querySelector("[data-teammate-work-phrase]")?.textContent)).toEqual(["Working", "Queued", "Waiting on an answer"]);
    expect(rows[0]!.textContent).toContain("Run the release checks");
    expect(rows[0]!.title).toBe("Open #Run the release checks");
    dispatch.mockClear();
    act(() => rows[1]!.click());
    expect(dispatch).toHaveBeenCalledWith({ type: "switchTask", botId: "pixel", threadId: "pixel-t" });
  });
});

describe("the mascot and its status line through a long turn", () => {
  it("hides while the bot waits on the person, and the next turn starts clean", () => {
    engine({ type: "turn.progress", activity: "edit", itemId: "toolu_edit", file: "app.ts", bytes: 2048 } as Partial<RuntimeEvent>);
    const asking = busyBot([ask, intro]);
    render({ ...asking, activity: "waiting-on-you", tasks: asking.tasks!.map((task) => ({ ...task, activity: "waiting-on-you" })) });
    expect(mascot()).toBeNull();

    engine({ type: "turn.completed", ok: true } as Partial<RuntimeEvent>);
    const next: Message = { id: "next", role: "user", kind: "text", at: started + 90_000, text: "Add a chart" };
    render(busyBot([ask, intro, next]));
    expect(mascot(), "a new prompt shows the line before the new turn's first frame").not.toBeNull();
  });
});

describe("what the bot is doing right now", () => {
  const search: Message = { id: "search", role: "bot", kind: "activity", at: started + 4_000, turnId: "t1",
    tool: { name: "WebSearch", itemId: "s1", ok: true, step: { activity: "web", target: "Acme construction leads" } } };
  const bash: Message = { id: "bash", role: "bot", kind: "activity", at: started + 6_000, turnId: "t1",
    tool: { name: "Bash", itemId: "b1", step: { activity: "command", target: "scrape.py", detail: "python3 scrape.py --pages 40" } } };
  const toggle = () => host.querySelector<HTMLButtonElement>(".turn-presence button[aria-expanded]");
  const steps = () => [...host.querySelectorAll("[data-now-step]")].map((step) => `${step.getAttribute("data-now-step")}: ${step.querySelector("[dir=auto]")?.textContent}`);

  it("is one calm line with no steps to unfold, as grok shows none in the chat", () => {
    engine({ type: "turn.started" });
    engine({ type: "item.started", itemType: "tool", itemId: "b1", title: "Bash" } as Partial<RuntimeEvent>);
    engine({ type: "turn.progress", activity: "command", itemId: "b1", target: "scrape.py", quiet: { kind: "idle" } } as Partial<RuntimeEvent>);
    render(busyBot([ask, search, bash]));
    expect(statusLine()).toBe("Running a few commands · Idle, no output yet");
    expect(toggle(), "the step list unfolds only with tool calls shown").toBeNull();
    expect(steps()).toEqual([]);
  });
});
