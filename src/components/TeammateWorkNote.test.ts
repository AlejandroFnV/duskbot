import { afterEach, describe, expect, it } from "vitest";

import { loadLocale, setLocale } from "@/lib/i18n";
import type { WireTeammateWork } from "../../shared/wire-work";
import { teammateWorkSummary } from "./TeammateWorkNote";

const bots = [{ id: "ada", name: "Ada" }, { id: "lin", name: "Lin" }];
const work = (botId: string, status: WireTeammateWork["status"]): WireTeammateWork => ({ botId, threadId: `${botId}-${status}`, summary: "", status });

describe("teammateWorkSummary", () => {
  afterEach(() => { setLocale("en"); });

  it("says queued when nothing has started yet", () => {
    expect(teammateWorkSummary([work("ada", "queued")], bots)).toBe("1 assignment queued: Ada");
    expect(teammateWorkSummary([work("ada", "queued"), work("lin", "queued")], bots)).toBe("2 assignments queued: Ada and Lin");
  });

  it("says under way when everything has started, a parked question included", () => {
    expect(teammateWorkSummary([work("ada", "running")], bots)).toBe("1 assignment under way: Ada");
    expect(teammateWorkSummary([work("ada", "running"), work("lin", "waiting")], bots)).toBe("2 assignments under way: Ada and Lin");
  });

  it("splits a mix into under way and queued", () => {
    expect(teammateWorkSummary([work("ada", "running"), work("lin", "queued")], bots)).toBe("2 assignments (1 under way, 1 queued): Ada and Lin");
  });

  it("speaks Spanish", async () => {
    await loadLocale("es");
    expect(teammateWorkSummary([work("ada", "queued")], bots)).toBe("1 encargo en cola: Ada");
    expect(teammateWorkSummary([work("ada", "running"), work("lin", "queued")], bots)).toBe("2 encargos (1 en marcha, 1 en cola): Ada y Lin");
  });
});
