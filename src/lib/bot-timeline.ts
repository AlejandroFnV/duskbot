import type { Message } from "@/state/store";

export interface ThreadTranscript {
  threadId: string;
  title: string;
  messages: readonly Message[];
}

/** A run of the timeline from one conversation: `thread` is absent for the conversation that is open. */
export interface TimelinePart {
  key: string;
  thread?: { threadId: string; title: string };
  messages: Message[];
}

type Row = { message: Message; thread?: ThreadTranscript };

/**
 * The open conversation's rows with the other conversations' rows put in among them by time, cut into runs that each
 * come from one conversation. The open rows keep their own order. `complete` says the open rows reach back to the
 * conversation's start; when they do not, nothing older than the oldest open row is shown, so loading earlier rows
 * never has to reshuffle what is on screen.
 */
export function timelineParts(open: readonly Message[], others: readonly ThreadTranscript[], complete: boolean): TimelinePart[] {
  const from = complete || !open.length ? -Infinity : open[0]!.at;
  const elsewhere: Row[] = others
    .flatMap((thread) => thread.messages.filter((message) => message.at >= from).map((message) => ({ message, thread })))
    .sort((a, b) => a.message.at - b.message.at);
  if (!elsewhere.length) return open.length ? [{ key: `open:${open[0]!.id}`, messages: [...open] }] : [];
  const rows: Row[] = [];
  let next = 0;
  for (const message of open) {
    while (next < elsewhere.length && elsewhere[next]!.message.at < message.at) rows.push(elsewhere[next++]!);
    rows.push({ message });
  }
  rows.push(...elsewhere.slice(next));
  const parts: TimelinePart[] = [];
  for (const { message, thread } of rows) {
    const last = parts.at(-1);
    if (last && last.thread?.threadId === thread?.threadId) {
      last.messages.push(message);
      continue;
    }
    parts.push({
      key: `${thread?.threadId ?? "open"}:${message.id}`,
      ...(thread ? { thread: { threadId: thread.threadId, title: thread.title } } : {}),
      messages: [message],
    });
  }
  return parts;
}
