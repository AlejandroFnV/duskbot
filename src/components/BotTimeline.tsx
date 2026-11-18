import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import { ChevronRight } from "../icons";
import { timelineParts, type ThreadTranscript, type TimelinePart } from "@/lib/bot-timeline";
import { t } from "@/lib/i18n";
import { localizedTaskTitle } from "@/lib/task-title";
import { transcriptLookups, type TranscriptLookups } from "@/lib/transcript-derivations";
import { api, visibleMessages, type Action, type Bot, type Message, type Task } from "@/state/store";
import { ChatRowsContext, useChatRows } from "./chat-rows";
import { isArchived, threadRecency } from "./SidebarThreadRow";

export const TIMELINE_THREADS = 6;
export const TIMELINE_PAGE = 40;
const REFRESH_MS = 1_500;

type Page = { messages?: Message[]; activeLeafId?: string | null };

/** The bot's other conversations its own chat also shows, newest first; none while one of them is the open one. */
export function timelineThreads(bot: Pick<Bot, "threadId" | "mainThreadId" | "tasks">): Task[] {
  if (bot.mainThreadId && bot.threadId !== bot.mainThreadId) return [];
  return (bot.tasks ?? [])
    .filter((task) => task.threadId !== bot.threadId && !isArchived(task))
    .sort((a, b) => threadRecency(b) - threadRecency(a))
    .slice(0, TIMELINE_THREADS);
}

const fetched = new Map<string, { at: number; messages: readonly Message[] }>();

const splitKey = (key: string) => ({ threadId: key.slice(0, key.lastIndexOf("@")), at: Number(key.slice(key.lastIndexOf("@") + 1)) });
const staleKeys = (signature: string) => signature.split(",").filter(Boolean).map(splitKey)
  .filter(({ threadId, at }) => (fetched.get(threadId)?.at ?? -1) < at);

/** Each listed conversation's newest rows: fetched at once the first time, then again a moment after it changes. */
function useThreadTranscripts(threads: readonly Task[]): ThreadTranscript[] {
  const [version, settle] = useState(0);
  const signature = threads.map((task) => `${task.threadId}@${threadRecency(task)}`).join(",");
  const latest = useRef(signature);
  latest.current = signature;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const load = () => {
      timer.current = null;
      for (const { threadId, at } of staleKeys(latest.current)) {
        void api<Page>(`/api/threads/${encodeURIComponent(threadId)}/messages?limit=${TIMELINE_PAGE}`, { background: true })
          .then((page) => {
            fetched.set(threadId, { at, messages: visibleMessages({ messages: page.messages ?? [], activeLeafId: page.activeLeafId ?? undefined }) });
            settle((count) => count + 1);
          })
          .catch(() => {});
      }
    };
    const stale = staleKeys(signature);
    if (!stale.length || timer.current) return;
    if (stale.some(({ threadId }) => !fetched.has(threadId))) load();
    else timer.current = setTimeout(load, REFRESH_MS);
  }, [signature]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const names = threads.map((task) => `${task.threadId}\u0001${task.title}`).join("\u0002");
  return useMemo(() => names.split("\u0002").filter(Boolean).flatMap((entry) => {
    const [threadId = "", title = ""] = entry.split("\u0001");
    const rows = fetched.get(threadId);
    return rows ? [{ threadId, title: localizedTaskTitle(title), messages: rows.messages }] : [];
  }), [names, version]);
}

/** Tests only. */
export function forgetTimelineThreads(): void {
  fetched.clear();
}

export type TimelineRun = TimelinePart & { lookups?: TranscriptLookups };

/** The open chat's rows with the bot's other conversations in among them by time, in runs per conversation. */
export function useBotTimeline(bot: Bot, open: Message[], complete: boolean): TimelineRun[] {
  const threads = useMemo(() => timelineThreads(bot), [bot]);
  const others = useThreadTranscripts(threads);
  return useMemo(() => timelineParts(open, others, complete).map((part) => part.thread
    ? { ...part, lookups: transcriptLookups(part.messages, part.messages) }
    : part), [open, others, complete]);
}

/** A run from another conversation: labelled with it, read here, answered there. */
export function ThreadStretch({ thread, dispatch, children }: { thread: NonNullable<TimelinePart["thread"]>; dispatch: Dispatch<Action>; children: ReactNode }) {
  const rows = useChatRows();
  const own = useMemo(() => ({ ...rows, threadId: thread.threadId, hasMore: false, focus: null, canReact: false }), [rows, thread.threadId]);
  return (
    <div data-timeline-thread={thread.threadId} className="contents">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => dispatch({ type: "switchTask", botId: rows.botId, threadId: thread.threadId })}
          title={t("chat.openThread", { title: thread.title })}
          className="flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-ink-tertiary outline-none hover:bg-raised/50 hover:text-ink-secondary focus-visible:ring-1 focus-visible:ring-focus"
        >
          <span className="max-w-[320px] truncate">{t("chat.otherThread.inThread", { title: thread.title })}</span>
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      </div>
      <ChatRowsContext.Provider value={own}>{children}</ChatRowsContext.Provider>
    </div>
  );
}

/** Above the message box when the newest rows came from another conversation: where what you type goes. */
export function WritingToOpenChat({ bot, last, dispatch }: { bot: Pick<Bot, "id" | "name">; last: TimelineRun | undefined; dispatch: Dispatch<Action> }) {
  const thread = last?.thread;
  if (!thread) return null;
  return (
    <div data-writing-to-open-chat="" className="flex flex-wrap items-center gap-x-1.5 px-5 pb-1.5 text-[12px] text-ink-tertiary">
      <span>{t("chat.otherThread.writingHere", { name: bot.name })}</span>
      <button
        type="button"
        onClick={() => dispatch({ type: "switchTask", botId: bot.id, threadId: thread.threadId })}
        className="max-w-[320px] truncate rounded text-ink-secondary underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-focus"
      >
        {t("chat.otherThread.writeInThread", { title: thread.title })}
      </button>
    </div>
  );
}
