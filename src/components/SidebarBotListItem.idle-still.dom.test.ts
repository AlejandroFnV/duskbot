// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialState, type Bot } from "@/state/store";

vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("./mascot-view", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mascot-view")>()),
  DuskMark: (props: { life?: boolean; state?: string; animated?: boolean }) =>
    createElement("span", { "data-testid": "mark", "data-life": String(props.life ?? true), "data-state": props.state ?? "idle" }),
}));

import { BotListItem, botRowProps } from "./Sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "atlas", threadId: "thread-atlas", name: "Atlas", title: "", description: "", notifications: true,
  color: "green", unread: false, modelSelection: { instanceId: "claude", model: "test" }, messages: [], ...overrides,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

function render(candidate: Bot, density: "comfortable" | "icons" = "comfortable") {
  act(() => root.render(createElement(BotListItem, botRowProps(initialState, vi.fn(), candidate, { density, query: "", onMenu: vi.fn() }))));
  return host.querySelector<HTMLElement>("[data-testid=mark]")!;
}

describe.each(["comfortable", "icons"] as const)("a %s sidebar row's mascot", (density) => {
  it("rests still with no turn running", () => {
    const mark = render(bot(), density);
    expect(mark.dataset.life).toBe("false");
    expect(mark.dataset.state).toBe("idle");
  });

  it("moves while its turn runs and goes still again once it ends", () => {
    vi.useFakeTimers();
    expect(render(bot({ busy: true }), density).dataset.life).toBe("true");
    const done = render(bot({ busy: false }), density);
    expect(done.dataset.life).toBe("false");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(render(bot({ busy: false }), density).dataset.state).toBe("idle");
  });
});
