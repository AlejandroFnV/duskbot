// Grok Bot's mark state rules, ported from its renderer: `bO`, the `gQe` step table and the `gO` settle deadline.
import { useEffect, useState } from "react";

import { useTurnLive, type LiveStatus } from "@/state/turn-status";
import { useLiveReplyActive } from "@/state/live-reply";
import { useStoppedAt } from "@/lib/stop-turn";
import { lastNonReceipt } from "@/lib/receipts";
import type { MarkState } from "./mascot-engine";
import { presenceKind, TYPING_MARK, useHeldPresence, workingMark } from "@/lib/presence-mark";

/** A turn's finished or failed state shows this long after it settles. */
export const SETTLED_HOLD_MS = 8000;

export type TurnOutcome = "success" | "error" | "cancelled";

export interface TurnFacts {
  /** A turn is running. */
  running: boolean;
  /** The reply's words are streaming in. */
  composing: boolean;
  /** What the running turn reports doing now. */
  activity?: LiveStatus["activity"] | null;
  /** A card or question waits on the person, with no turn running. */
  awaiting: boolean;
  /** The newest turn's end, held for 8 s. */
  settled?: { at: number; outcome: TurnOutcome } | null;
}

/** Grok's `gQe`, keyed by the steps our engines report. A turn that has not named a step yet is thinking, as Grok's
 * line is from the first frame after a send; a tool we cannot name is plain working. */
const STEP_STATES: Record<NonNullable<TurnFacts["activity"]>, MarkState> = {
  thinking: "thinking",
  reply: "streaming",
  read: "reading",
  fetch: "reading",
  web: "searching",
  search: "searching",
  command: "running",
  write: "coding",
  edit: "coding",
  tool: "working",
};

/** Grok's `bO`: running beats waiting, waiting beats a fresh outcome, and an outcome shows for 8 s before idle. */
export function turnMarkState(facts: TurnFacts, now: number): MarkState {
  if (facts.running) return facts.composing ? "streaming" : facts.activity ? STEP_STATES[facts.activity] : "thinking";
  if (facts.awaiting) return "blocked";
  const settled = facts.settled;
  if (!settled || now >= settled.at + SETTLED_HOLD_MS) return "idle";
  return settled.outcome === "success" ? "finished" : settled.outcome === "error" ? "failed" : "idle";
}

export interface MarkBot {
  threadId?: string | null;
  busy?: boolean;
  activity?: string | null;
  messages?: ReadonlyArray<{ kind: string; tool?: { ok?: boolean } }>;
}

/** The sidebar row's mark state for a bot. A turn that ends while the row is on screen shows finished (or failed) for
 * 8 s, as Grok's lastTurnSettlement does; a stop from here ends it quietly. Unread and selection change nothing. */
export function useBotMarkState(bot: MarkBot, running = Boolean(bot.busy)): MarkState {
  const threadId = bot.threadId ?? "";
  const live = useTurnLive(threadId || null);
  const composing = useLiveReplyActive(threadId || null);
  const stoppedAt = useStoppedAt(threadId);
  const last = lastNonReceipt(bot.messages);
  const failed = last?.kind === "activity" && last.tool?.ok === false;
  const [settled, setSettled] = useState<TurnFacts["settled"]>(null);
  const [wasRunning, setWasRunning] = useState(running);
  if (wasRunning !== running) {
    setWasRunning(running);
    const now = Date.now();
    const stopped = stoppedAt !== undefined && now - stoppedAt < SETTLED_HOLD_MS;
    setSettled(running ? null : { at: now, outcome: stopped ? "cancelled" : failed ? "error" : "success" });
  }
  const [, wake] = useState(0);
  useEffect(() => {
    if (!settled) return;
    const left = settled.at + SETTLED_HOLD_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => wake((tick) => tick + 1), left);
    return () => clearTimeout(timer);
  }, [settled]);
  // a running turn shows the typing dots only while its reply is being written, and the bot's own mascot at work otherwise
  const activity = live.status?.activity;
  const presence = useHeldPresence(running ? presenceKind({ writing: composing, activity, worked: true }) : null);
  if (presence) return presence === "typing" ? TYPING_MARK : workingMark(activity);
  return turnMarkState({
    running,
    composing: composing || live.status?.activity === "reply",
    activity: running ? live.status?.activity ?? null : null,
    awaiting: bot.activity === "waiting-on-you",
    settled,
  }, Date.now());
}
