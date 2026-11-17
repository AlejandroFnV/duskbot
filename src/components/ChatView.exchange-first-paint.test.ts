// @vitest-environment happy-dom
// A long report to another bot is folded from the chat's first frame, even when its request is older than the rows
// painted first: the fold is read from the whole history, not from the slice on screen.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AppState, Bot, InstanceInfo, Message } from "@/state/store";

vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/cloud-guest", () => ({ useCanWriteIn: () => true, useReactor: () => "user" }));
vi.mock("./ModelPicker", () => ({ ModelPicker: () => null }));
vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));

const { ChatView, FIRST_PAINT_ROWS } = await import("./ChatView");
const { BotEditorStore, initialState } = await import("@/state/store");

const start = new Date(2026, 10, 17, 9, 0).getTime();
const ask: Message = { id: "ask", role: "user", kind: "text", at: start, text: "[From @Ghosty (bot) · work] run the checks",
  peerAsk: { botId: "ghosty", name: "Ghosty" } } as Message;
const steps: Message[] = Array.from({ length: FIRST_PAINT_ROWS + 4 }, (_, index) => ({
  id: `step${index}`, role: "bot", kind: "text", at: start + (index + 1) * 1_000, text: `step ${index}`, requestMessageId: "ask" }));
const report: Message = { id: "report", role: "bot", kind: "text", at: start + 60_000, text: "Resultados: pnpm typecheck OK", requestMessageId: "ask" };
const messages = [ask, ...steps, report];

it("folds a report whose request lies above the first painted rows in the very first frame", async () => {
  // a viewport already full, so the first paint keeps only the newest rows instead of growing before it shows
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 10_000 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  const bot: Bot = {
    id: "pepper", threadId: "pepper-thread", name: "Pepper", title: "", description: "", soul: "", color: "green",
    notifications: true, unread: false, busy: true, messages, modelSelection: { instanceId: "test", model: "m" },
    tasks: [{ threadId: "pepper-thread", title: "Thread", createdAt: 1, busy: true, activity: "idle", modelSelection: { instanceId: "test", model: "m" }, approvalMode: "ask" }],
  };
  const state: AppState = {
    ...initialState, connected: true, selectedId: bot.id, bots: [bot],
    instances: [{ instanceId: "test", driverKind: "codex", displayName: "Test", snapshot: { state: "available" }, capabilities: { agentsMcp: true } } as InstanceInfo],
  } as AppState;
  const value = { state, dispatch: vi.fn(), flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} };
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(createElement(BotEditorStore, { value, children: createElement(ChatView, { bot }) })));
  const first = container.innerHTML;
  expect(first).not.toContain("Resultados: pnpm typecheck OK");
  expect(first).toContain("messages with");
  // once every row has mounted the fold is the same one: how many rows were painted never changes it
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(container.querySelector('[data-mid="ask"]')).not.toBeNull();
  expect(container.innerHTML).not.toContain("Resultados: pnpm typecheck OK");
  expect(container.innerHTML).toContain("messages with");
  flushSync(() => root.unmount());
});
