// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialState, type Bot } from "@/state/store";

vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("./mascot-view", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mascot-view")>()),
  DuskMark: (props: { life?: boolean; state?: string }) =>
    createElement("span", { "data-testid": "mark", "data-life": String(props.life ?? true), "data-state": props.state ?? "idle" }),
}));

import { BotListItem, botRowProps } from "./Sidebar";
import { SidebarBotTile } from "./SidebarTiles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESTING = new Set(["idle", "finished", "failed", "blocked"]);

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "atlas", threadId: "thread-atlas", name: "Atlas", title: "", description: "", notifications: true,
  color: "green", unread: false, modelSelection: { instanceId: "claude", model: "test" }, messages: [], ...overrides,
});
const failedTool = [{ id: "a1", role: "bot", kind: "activity", text: "Bash", at: 1, tool: { name: "Bash", ok: false } }] as Bot["messages"];

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

const views = {
  row: (candidate: Bot) => createElement(BotListItem, botRowProps(initialState, vi.fn(), candidate, { density: "comfortable", query: "", onMenu: vi.fn() })),
  icon: (candidate: Bot) => createElement(BotListItem, botRowProps(initialState, vi.fn(), candidate, { density: "icons", query: "", onMenu: vi.fn() })),
  tile: (candidate: Bot) => createElement(SidebarBotTile, botRowProps(initialState, vi.fn(), candidate, { density: "comfortable", query: "", onMenu: vi.fn() })),
};

describe.each(Object.entries(views))("the sidebar %s mascot", (_, view) => {
  const mark = (candidate: Bot) => {
    act(() => root.render(view(candidate)));
    return host.querySelector<HTMLElement>("[data-testid=mark]")!.dataset;
  };

  it("rests with its own blinks when no turn runs, even after a failed step", () => {
    expect(mark(bot())).toMatchObject({ state: "idle", life: "true" });
    expect(mark(bot({ messages: failedTool })).state).toBe("idle");
  });

  it("works only while the row says it is running, and rests again once the turn ends", () => {
    vi.useFakeTimers();
    expect(RESTING.has(mark(bot({ busy: true })).state!)).toBe(false);
    expect(RESTING.has(mark(bot({ busy: false })).state!)).toBe(true);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(mark(bot({ busy: false })).state).toBe("idle");
  });

  it("does not work while the bot waits on the person", () => {
    const waiting = bot({ busy: true, tasks: [{ threadId: "child", title: "child", createdAt: 1, activity: "waiting-on-you" }] } as Partial<Bot>);
    expect(RESTING.has(mark(waiting).state!)).toBe(true);
  });
});
