import { describe, expect, it } from "vitest";

import { addServerLinePacks } from "../server-lines.ts";
import { createWaitWords } from "./wait-words.ts";

const words = (starter: boolean, language?: string) => {
  const held: [string, string][] = [];
  return { held, waits: createWaitWords({ language: () => language, starter: () => starter, held: (threadId, why) => held.push([threadId, why]), changed: () => {} }) };
};

describe("how a wait for memory reads", () => {
  it("names what runs and what is ahead, and that it starts by itself", () => {
    expect(words(false).waits.text("t", { first: true, running: 1, ahead: 2 }))
      .toBe("Waiting for memory on this cloud. Running now: 1. Ahead of this one: 2. It starts by itself when there's room.");
    expect(words(false).waits.text("t", { first: false, running: 1, ahead: 0 })).toBe("Still waiting for memory. Running now: 1. Ahead of this one: 0.");
  });

  it("says a bigger plan runs more on Starter only, once, in the person's language", () => {
    expect(words(true).waits.text("t", { first: true, running: 1, ahead: 0 })).toContain("Starter has room for about one task at a time. A bigger plan runs more at once.");
    expect(words(false).waits.text("t", { first: true, running: 1, ahead: 0 })).not.toContain("Starter");
    expect(words(true).waits.text("t", { first: false, running: 1, ahead: 0 })).not.toContain("Starter");
    addServerLinePacks({ xx: { "server.memory.wait": "Warten {running}/{ahead}.", "server.memory.starter": "Größerer Plan." } });
    expect(words(true, "xx").waits.text("t", { first: true, running: 1, ahead: 0 })).toBe("Warten 1/0. Größerer Plan.");
  });

  it("records the limit and what is ahead", () => {
    const { waits, held } = words(true);
    waits.began("t", { running: 1, ahead: 3 });
    expect(held).toEqual([["t", "memory: 1 running, 3 ahead, on Starter"]]);
  });
});

describe("how a held send reads", () => {
  it("says why, and offers a bigger plan only where the plan is what holds it", () => {
    expect(words(true).waits.queued("t", "capacity")).toContain("A bigger plan runs more");
    expect(words(false).waits.queued("t", "capacity")).toBe("Queued. Starts when this bot has a free thread slot.");
    expect(words(true).waits.queued("t", "group-turn")).toContain("room turn");
    expect(words(true).waits.queued("t", undefined)).toBeUndefined();
  });
});
