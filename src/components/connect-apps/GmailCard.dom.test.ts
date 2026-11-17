// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppPage, type AppPageModel } from "./AppPage";
import type { ConnectorPhase, Connectors } from "./use-connectors";
import type { ViaFlow } from "./via-flow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GMAIL = { slug: "gmail", label: "Gmail", blurb: "Email from Google", logo: null, domain: "mail.google.com" };

function connectorsWith(over: Partial<Connectors> = {}): Connectors {
  return {
    cards: [GMAIL], ready: true, configured: true, mode: "managed", setup: "ready", stale: false, phase: "ready",
    status: {}, error: null, aliasFor: null, setupFor: null, keyFor: null, via: null, viaRead: true, viaChecked: { gmail: true }, viaApps: {}, viaFlow: {},
    viaRoute: () => false, authorizeComposio: vi.fn(async () => {}), reopenVia: vi.fn(), checkVia: vi.fn(), setError: vi.fn(),
    askAlias: vi.fn(), askKey: vi.fn(), phaseOf: () => ({ kind: "connect" }), isConnected: () => false,
    connect: vi.fn(async () => {}), cancel: vi.fn(), continueAfterKey: vi.fn(async () => {}), resume: vi.fn(),
    disconnect: vi.fn(async () => true), reload: vi.fn(),
    ...over,
  } as Connectors;
}

function model(connectors: Connectors, phase: ConnectorPhase, over: Partial<AppPageModel> = {}): AppPageModel {
  return {
    entry: { id: "gmail", kind: "composio", label: "Gmail", description: "Email from Google", categories: ["communication"], icon: { glyph: "envelope" } },
    composioSlug: "gmail", ways: [], connection: "disconnected", phase, card: GMAIL, connectors, categoryLabel: "communication",
    usedBy: [], remoteClient: false, onOpenLogins: vi.fn(), onOpenKeys: vi.fn(),
    toolkit: { slug: "gmail", name: "Gmail", description: "Email from Google", category: "email", tools: 63 },
    ...over,
  } as AppPageModel;
}

let root: Root;
const render = async (page: AppPageModel) => {
  await act(async () => { root.render(createElement(AppPage, { model: page })); });
};
const card = () => document.querySelector<HTMLElement>("[data-gmail-card]")!;
// every main button on the page, wherever it sits: the card's is the only one
const primaries = () => [...document.querySelectorAll<HTMLButtonElement>("[data-app-page] .ca-primary")];
const shown = (button: HTMLButtonElement) => button.querySelector("span:not([aria-hidden])")?.textContent;
const line = () => card().querySelector("[data-gmail-line]");
const said = () => line()?.querySelector("span")?.textContent;

beforeEach(() => { root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("Gmail connects on one card", () => {
  it("while Composio is asked whether Gmail is connected already, the card says Checking…, never Connect Gmail", async () => {
    const via = { signedIn: true, enabled: true, added: true } as Connectors["via"];
    // Composio Connect not read yet
    await render(model(connectorsWith({ configured: false, via: null, viaRead: false, viaChecked: {}, viaRoute: () => true }), { kind: "connect" }));
    expect(primaries().map(shown)).toEqual(["Checking…"]);
    expect(primaries()[0]!.disabled).toBe(true);

    // signed in to Composio, the app's own answer still out
    await render(model(connectorsWith({ configured: false, via, viaChecked: {}, viaRoute: () => true }), { kind: "connect" }));
    expect(primaries().map(shown)).toEqual(["Checking…"]);
    expect(said(), "no 'now pick your account' before Composio has answered").not.toBe("Signed in. Now pick your Google account.");

    // Composio said it is not connected: now it is Connect
    await render(model(connectorsWith({ configured: false, via, viaChecked: { gmail: true }, viaRoute: () => true }), { kind: "connect" }));
    expect(primaries().map(shown)).toEqual(["Connect Gmail"]);
  });

  it("Idle: one short safety line and one Connect Gmail button; no step list, no tool list", async () => {
    const connectors = connectorsWith();
    await render(model(connectors, { kind: "connect" }));
    expect(card().getAttribute("data-state")).toBe("idle");
    expect(card().querySelector(".ca-connect-note")?.textContent).toBe("Sign in with Google. Nothing is sent without your OK.");
    expect(primaries()).toHaveLength(1);
    expect(card().contains(primaries()[0]!)).toBe(true);
    expect(shown(primaries()[0]!)).toBe("Connect Gmail");
    expect(document.querySelector("[data-composio-key]")).toBeNull();
    expect(document.querySelector("[data-toolkit-group]")).toBeNull();
    expect(line()).toBeNull();
    await act(async () => { primaries()[0]!.click(); });
    expect(connectors.connect).toHaveBeenCalledWith("gmail");
  });

  it("connecting: the button says so, Cancel sits beside it, and a page left open says to finish there", async () => {
    const connectors = connectorsWith();
    await render(model(connectors, { kind: "connecting" }));
    expect(card().getAttribute("data-state")).toBe("connecting");
    expect(primaries()[0]!.disabled).toBe(true);
    expect(shown(primaries()[0]!), "the page is opening; no vendor named").toBe("Opening Google…");
    await act(async () => { card().querySelector<HTMLButtonElement>("[data-cancel]")!.click(); });
    expect(connectors.cancel).toHaveBeenCalledWith("gmail");

    await render(model(connectors, { kind: "continue", url: null }));
    expect(card().getAttribute("data-state")).toBe("connecting");
    expect(shown(primaries()[0]!)).toBe("Open page again");
    expect(line()?.getAttribute("role")).toBe("status");
    expect(said()).toBe("Finish signing in on the page that opened. This updates by itself.");
    await act(async () => { primaries()[0]!.click(); });
    expect(connectors.resume).toHaveBeenCalledWith("gmail");
  });

  it("Connected: a check and what bots can do now, nothing left to click on the card", async () => {
    const connectors = connectorsWith({ status: { gmail: { connected: true, accounts: [{ id: "ca_1", status: "ACTIVE" }] } } as Connectors["status"] });
    await render(model(connectors, { kind: "connected" }, { connection: "connected" }));
    expect(card().getAttribute("data-state")).toBe("connected");
    expect(card().querySelector(".ca-primary")).toBeNull();
    expect(card().querySelector(".ca-added")?.textContent).toContain("Connected");
    expect(said()).toBe("Connected. Your bots can read your email and draft replies now.");
    expect(document.querySelector("[data-accounts]"), "the account stays manageable below").not.toBeNull();
  });

  it("error: an expired sign-in says so and the one button reconnects it", async () => {
    const account = { id: "ca_1", alias: "work", status: "EXPIRED" } as never;
    const connectors = connectorsWith();
    await render(model(connectors, { kind: "reconnect", account }));
    expect(card().getAttribute("data-state")).toBe("error");
    expect(line()?.getAttribute("role")).toBe("alert");
    expect(said()).toBe("Your Gmail sign-in expired. Reconnect to keep using it.");
    expect(primaries()).toHaveLength(1);
    expect(shown(primaries()[0]!)).toBe("Reconnect");
    await act(async () => { primaries()[0]!.click(); });
    expect(connectors.connect).toHaveBeenCalledWith("gmail", "work", account);
  });

  describe("through Composio Connect, the same card and one button the whole way", () => {
    const via = (signedIn: boolean, flow?: ViaFlow) => connectorsWith({
      configured: false, mode: "unavailable", setup: "needs-setup", viaRoute: () => true,
      via: { added: signedIn, name: signedIn ? "composio-connect" : null, signedIn, enabled: signedIn } as Connectors["via"],
      viaFlow: flow ? { gmail: flow } : {},
    });

    it("the first click is Connect Gmail, no vendor named, and your own key waits behind Advanced", async () => {
      const connectors = via(false);
      const page = model(connectors, { kind: "connect" });
      await render(page);
      expect(card().querySelector(".ca-connect-note")?.textContent).toBe("Sign in with Google in your browser, then pick the account. Nothing is sent without your OK.");
      expect(card().textContent, "the first screen never names Composio").not.toMatch(/composio/i);
      expect(primaries()).toHaveLength(1);
      expect(shown(primaries()[0]!)).toBe("Connect Gmail");
      await act(async () => { primaries()[0]!.click(); });
      expect(connectors.authorizeComposio).toHaveBeenCalledWith("gmail");
      const toggle = card().querySelector<HTMLButtonElement>("[data-gmail-advanced] > button")!;
      expect(toggle.textContent).toBe("Advanced");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      await act(async () => { toggle.click(); });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const own = [...card().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Use my own Composio API key")!;
      await act(async () => { own.click(); });
      expect(page.onOpenKeys).toHaveBeenCalled();
    });

    it("authorizing says the page is opening, then waits on it; then the same button connects Gmail", async () => {
      await render(model(via(false, { step: "authorizing" }), { kind: "connect" }));
      expect(card().getAttribute("data-state")).toBe("connecting");
      expect(shown(primaries()[0]!)).toBe("Opening Google…");
      await render(model(via(false, { step: "authorizing", opened: true }), { kind: "connect" }));
      expect(shown(primaries()[0]!)).toBe("Waiting for Google…");

      const connectors = via(true);
      await render(model(connectors, { kind: "connect" }));
      expect(card().getAttribute("data-state")).toBe("idle");
      expect(said()).toBe("Signed in. Now pick your Google account.");
      expect(shown(primaries()[0]!)).toBe("Connect Gmail");
      await act(async () => { primaries()[0]!.click(); });
      expect(connectors.connect).toHaveBeenCalledWith("gmail");
    });

    it("a failed sign-in says what happened, and Retry starts it again", async () => {
      const connectors = via(true, { step: "failed", why: "cancelled" });
      await render(model(connectors, { kind: "failed", why: "cancelled" }));
      expect(card().getAttribute("data-state")).toBe("error");
      expect(line()?.getAttribute("role")).toBe("alert");
      expect(said()).toBe("The sign-in page closed before Gmail connected.");
      expect(primaries()).toHaveLength(1);
      expect(shown(primaries()[0]!)).toBe("Retry");
      await act(async () => { primaries()[0]!.click(); });
      expect(connectors.connect).toHaveBeenCalledWith("gmail");
    });

    it("Done: Connected, with no button left", async () => {
      await render(model(via(true, { step: "done" }), { kind: "connected" }, { connection: "connected" }));
      expect(card().getAttribute("data-state")).toBe("connected");
      expect(primaries()).toHaveLength(0);
      expect(said()).toBe("Connected. Your bots can read your email and draft replies now.");
    });
  });

  it("with the app password leading, the Composio card waits behind one other-ways toggle", async () => {
    await render(model(connectorsWith(), { kind: "connect" }, { ownFirst: true }));
    expect(document.querySelector("[data-gmail-card]")).toBeNull();
    expect(document.querySelector("[data-app-page] .ca-primary"), "nothing competes with the steps").toBeNull();
    const toggle = document.querySelector<HTMLButtonElement>("[data-other-ways] > button")!;
    expect(toggle.textContent).toBe("Other ways to connect");
    await act(async () => { toggle.click(); });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(card().querySelector(".ca-primary")?.textContent).toContain("Connect Gmail");
  });

  it("a Composio sign-in under way opens the other ways by itself, its status beside its button", async () => {
    await render(model(connectorsWith(), { kind: "continue", url: null }, { ownFirst: true }));
    const row = card().querySelector(".ca-connect-row")!;
    expect(row.querySelector(".ca-primary")).not.toBeNull();
    expect(row.querySelector("[data-gmail-line] > span:last-child")?.textContent).toBe("Finish signing in on the page that opened. This updates by itself.");
  });

  it("other apps keep their own page: no Gmail card", async () => {
    const connectors = connectorsWith();
    const page = model(connectors, { kind: "connect" }, {
      entry: { id: "slack", kind: "composio", label: "Slack", description: "Chat", categories: ["communication"], icon: { glyph: "envelope" } },
      composioSlug: "slack", card: { ...GMAIL, slug: "slack", label: "Slack" }, toolkit: undefined,
    });
    await render(page);
    expect(document.querySelector("[data-gmail-card]")).toBeNull();
    expect(document.querySelector("[data-app-page] [data-connect] .ca-primary")?.textContent).toContain("Connect Slack");
    expect(document.querySelector("[data-app-page] .ca-detail-header .ca-primary"), "the button sits under the name, not beside it").toBeNull();
  });
});
