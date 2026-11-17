// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import type { PeerRef } from "@/lib/peer-exchange";
import { PeerExchangeLine } from "./PeerExchangeLine";

let host: HTMLDivElement, root: Root;
const NAMES = ["Ada", "Lin", "Pixel", "Rigel", "Edie", "Nova", "Quill"];
const COLORS = ["blue", "green", "pink", "orange", "purple", "silver", "red"];
const bots = NAMES.map((name, i) => ({ id: name.toLowerCase(), name, color: COLORS[i] })) as unknown as Bot[];
const peers = (count: number): PeerRef[] => NAMES.slice(0, count).map((name) => ({ id: name.toLowerCase(), name }));

beforeEach(() => {
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const renderLine = (count: number) => act(() => root.render(createElement(PeerExchangeLine, {
  summary: count === 1 ? { kind: "single", direction: "outbound", peer: peers(1)[0]! } : { kind: "fanout", peers: peers(count) },
  bots, expanded: false, onToggle: () => {},
})));
const items = () => host.querySelectorAll("[data-avatar-stack-item]");

it("one bot keeps today's single avatar and name, with no stack", () => {
  renderLine(1);
  expect(host.querySelector("[data-avatar-stack]")).toBeNull();
  expect(host.querySelector("button")?.textContent).toBe("Ada");
});

it("four bots show all four avatars overlapping, named in the group label", () => {
  renderLine(4);
  const stack = host.querySelector("[data-avatar-stack]")!;
  expect(stack.getAttribute("role")).toBe("group");
  expect(stack.getAttribute("aria-label")).toBe("Ada, Lin, Pixel, Rigel");
  expect(items()).toHaveLength(4);
  expect(host.querySelector("[data-avatar-stack-more]")).toBeNull();
  expect((items()[0] as HTMLElement).style.marginInlineStart).toBe("");
  expect((items()[1] as HTMLElement).style.marginInlineStart).toBe("-4px");
  expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Show messages with Ada, Lin, Pixel, Rigel");
  expect(host.textContent).toContain("4 bots");
});

it("seven bots show four avatars and +3 for the rest, all seven named", () => {
  renderLine(7);
  expect(items()).toHaveLength(4);
  expect(host.querySelector("[data-avatar-stack-more]")?.textContent).toBe("+3");
  expect(host.querySelector("[data-avatar-stack]")?.getAttribute("aria-label")).toBe(NAMES.join(", "));
  expect(host.textContent).toContain("7 bots");
});
