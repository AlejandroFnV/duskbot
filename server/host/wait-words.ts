import type { EngineWaits } from "../engine-memory.ts";
import { serverLine } from "../server-lines.ts";
import type { SteerQueueReason } from "../../shared/wire.ts";

export interface WaitWordsDeps {
  language(threadId: string): string | undefined;
  /** This Cloud's plan runs on the smallest machine, so a bigger one is what gives it more room. */
  starter(): boolean;
  /** The record of what the turn this thread runs is waiting for. */
  held(threadId: string, why: string): void;
  changed(): void;
}

export function createWaitWords(deps: WaitWordsDeps): EngineWaits & { queued(threadId: string, reason: SteerQueueReason | undefined): string | undefined } {
  return {
    text(threadId, { first, running, ahead }) {
      const language = deps.language(threadId);
      if (!first) return serverLine(language, "server.memory.still", { running, ahead });
      const wait = serverLine(language, "server.memory.wait", { running, ahead });
      return deps.starter() ? `${wait} ${serverLine(language, "server.memory.starter")}` : wait;
    },
    began(threadId, { running, ahead }) {
      deps.held(threadId, `memory: ${running} running, ${ahead} ahead${deps.starter() ? ", on Starter" : ""}`);
    },
    changed: deps.changed,
    queued(threadId, reason) {
      if (!reason) return undefined;
      return serverLine(deps.language(threadId), reason === "group-turn" ? "server.queued.groupTurn" : deps.starter() ? "server.queued.capacityStarter" : "server.queued.capacity");
    },
  };
}
