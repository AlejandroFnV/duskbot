// @vitest-environment happy-dom
// A conversation that fails to load is tried again only once it changes, and nothing is tried after the chat closes.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/state/store", async (original) => ({ ...(await original<typeof import("@/state/store")>()), api }));
const { forgetTimelineThreads, REFRESH_MS, useBotTimeline } = await import("./BotTimeline");

const task = (threadId: string, updatedAt: number) => ({ threadId, title: threadId, createdAt: 1, updatedAt });
const lyra = (updatedAt: number) => ({ id: "lyra", name: "Lyra", threadId: "main", mainThreadId: "main", tasks: [task("main", 9), task("qa", updatedAt)] }) as unknown as Bot;
function Chat({ bot }: { bot: Bot }) { useBotTimeline(bot, [], true); return null; }

afterEach(() => { forgetTimelineThreads(); api.mockReset(); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("another conversation that fails to load", () => {
  it("is not retried on its own, only once it changes, and never after the chat closes", async () => {
    vi.useFakeTimers();
    api.mockRejectedValue(new Error("gone"));
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => { root.render(createElement(Chat, { bot: lyra(5) })); });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS * 5); });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => { root.render(createElement(Chat, { bot: lyra(6) })); await vi.advanceTimersByTimeAsync(REFRESH_MS); });
    expect(api).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS * 5); });
    expect(api).toHaveBeenCalledTimes(2);
  });
});
