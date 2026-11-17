// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { PeerExchangeLine } from "./PeerExchangeLine";
import { PeerExchangeView } from "./PeerExchangeView";

let host: HTMLDivElement, root: Root;
const ada = { id: "ada", name: "Ada" };
const bots = [{ id: "ada", name: "Ada", color: "green" }] as unknown as Bot[];

beforeEach(() => {
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

it("shows only the bot-to-bot lines under a 'self ↔ peer' title, and Back to chat closes it", () => {
  const onClose = vi.fn();
  const lines = [
    { id: "a", at: 1, direction: "outbound" as const, peer: ada, text: "Please review the PR" },
    { id: "b", at: 2, direction: "inbound" as const, peer: ada, text: "Reviewed, two notes" },
  ];
  act(() => root.render(createElement(PeerExchangeView, { self: { name: "Chief", color: "blue" }, peers: [ada], lines, bots, onClose })));
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog.querySelector("h2")?.textContent).toBe("Chief ↔ Ada");
  const rows = [...dialog.querySelectorAll("[data-exchange-line]")];
  expect(rows.map((row) => row.getAttribute("data-exchange-line"))).toEqual(["outbound", "inbound"]);
  expect(rows[0]!.textContent).toContain("Chief to Ada");
  expect(rows[1]!.textContent).toContain("Reviewed, two notes");
  act(() => document.querySelector<HTMLButtonElement>("[data-exchange-back]")!.click());
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("says so when there is nothing between the bots", () => {
  act(() => root.render(createElement(PeerExchangeView, { self: { name: "Chief" }, peers: [ada], lines: [], bots, onClose: () => {} })));
  expect(document.querySelector("[role=dialog]")?.textContent).toContain("No messages between these bots");
});

it("a chip opens the view with its bot instead of unfolding in place when given onOpen", () => {
  const onOpen = vi.fn(), onToggle = vi.fn();
  act(() => root.render(createElement(PeerExchangeLine, { summary: { kind: "single", direction: "outbound", peer: ada }, bots, expanded: false, onToggle, onOpen })));
  const chip = host.querySelector<HTMLButtonElement>("button")!;
  expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
  act(() => chip.click());
  expect(onOpen).toHaveBeenCalledWith([ada]);
  expect(onToggle).not.toHaveBeenCalled();
});
