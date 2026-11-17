import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => boolean) => snapshot(),
}));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

let local: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  vi.resetModules();
  local = memoryStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bot roles in the sidebar", () => {
  it("are shown until the person hides them", async () => {
    const preference = await import("./sidebar-role-preference");
    expect(preference.useSidebarBotRoles()).toBe(true);
    preference.setSidebarBotRoles(false);
    expect(preference.useSidebarBotRoles()).toBe(false);
    expect(local.getItem(preference.SIDEBAR_BOT_ROLES_KEY)).toBe("0");
    preference.setSidebarBotRoles(true);
    expect(preference.readSidebarBotRoles()).toBe(true);
  });

  it("keeps a choice saved by an earlier session", async () => {
    local.setItem("duskbot.sidebarBotRoles", "0");
    const preference = await import("./sidebar-role-preference");
    expect(preference.readSidebarBotRoles()).toBe(false);
  });
});
