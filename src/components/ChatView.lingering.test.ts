// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
const { useLingering } = await import("@/hooks/use-lingering");

function render(seen: boolean[]) {
  function Probe({ on, chat }: { on: boolean; chat: string }) {
    seen.push(useLingering(on, 140, chat));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  return { root, show: (on: boolean, chat: string) => act(() => root.render(createElement(Probe, { on, chat }))) };
}

it("holds the line for its fade within the same chat", () => {
  vi.useFakeTimers();
  const seen: boolean[] = [];
  const { root, show } = render(seen);
  show(true, "busy");
  show(false, "busy");
  expect(seen.at(-1)).toBe(true);
  act(() => vi.advanceTimersByTime(140));
  expect(seen.at(-1)).toBe(false);
  act(() => root.unmount());
  vi.useRealTimers();
});

it("never carries a working chat's line into the chat opened next", () => {
  const seen: boolean[] = [];
  const { root, show } = render(seen);
  show(true, "busy");
  const from = seen.length;
  show(false, "idle");
  expect(seen.slice(from)).not.toContain(true);
  act(() => root.unmount());
});
