// @vitest-environment happy-dom
// The composer's usage warning: closed once, it stays closed across polls and reloads until its reset or running out.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";

const HOUR = 3_600_000;
const fixture = vi.hoisted(() => ({ limits: [] as unknown[] }));
vi.mock("@/lib/limit-resets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limit-resets")>()),
  useEngineLimits: () => fixture.limits,
}));

const limit = (usedPercent: number, resetsAt: number, blocked = false) => ({
  engine: "claude", name: "Claude", driver: "claude", window: "weekly", usedPercent, resetsAt, blocked, windows: [{ window: "weekly", usedPercent, resetsAt }],
});

let root: Root | null = null;
let host: HTMLElement;
async function render(fresh = false) {
  if (fresh) vi.resetModules();
  const { UsageBanner } = await import("./UsageMeter");
  root?.unmount();
  root = createRoot(host);
  flushSync(() => root!.render(createElement(UsageBanner, { engine: "claude", onSeeUsage: () => {} })));
}
const banner = () => host.querySelector("[data-usage-banner]");
function dismiss() {
  flushSync(() => (host.querySelector("button[aria-label]") as HTMLButtonElement).click());
}

const stored = new Map<string, string>();
const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) };

beforeEach(() => {
  setLocale("en");
  vi.stubGlobal("localStorage", storage);
  stored.clear();
  host = document.createElement("div");
  document.body.append(host);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
});
afterEach(() => { root?.unmount(); root = null; host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("UsageBanner", () => {
  it("has an opaque background so the chat does not show through", async () => {
    fixture.limits = [limit(98, Date.now() + 4 * HOUR)];
    await render();
    expect(banner()?.className).toContain("var(--color-menu)");
    expect(banner()?.className).not.toMatch(/\bbg-ink\/\[/);
  });

  it("stays closed when the reset moves by seconds and after a reload", async () => {
    const reset = Date.now() + 4 * HOUR;
    fixture.limits = [limit(98, reset)];
    await render();
    expect(banner()).not.toBeNull();
    dismiss();
    expect(banner()).toBeNull();
    fixture.limits = [limit(99, reset + 7_000)];
    await render();
    expect(banner()).toBeNull();
    await render(true);
    expect(banner()).toBeNull();
  });

  it("shows again on running out, and after the reset", async () => {
    const reset = Date.now() + 4 * HOUR;
    fixture.limits = [limit(98, reset)];
    await render();
    dismiss();
    fixture.limits = [limit(100, reset, true)];
    await render(true);
    expect(banner()?.getAttribute("data-usage-banner")).toBe("danger");
    fixture.limits = [limit(98, reset)];
    await render(true);
    expect(banner()).toBeNull();
    vi.setSystemTime(reset + 60_000);
    fixture.limits = [limit(97, reset + 7 * 24 * HOUR)];
    await render(true);
    expect(banner()).not.toBeNull();
  });
});
