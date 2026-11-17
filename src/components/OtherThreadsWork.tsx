import type { Dispatch } from "react";
import { ChevronRight } from "../icons";
import type { Action, Bot, Task } from "@/state/store";
import { useTurnLive } from "@/state/turn-status";
import { turnNowPhrases } from "@/lib/live-activity";
import { quietText } from "@/lib/now-steps";
import { workingMark } from "@/lib/presence-mark";
import { localizedTaskTitle } from "@/lib/task-title";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { isArchived, orderedThreadList } from "./SidebarThreadRow";

/** The bot's other conversations running a turn now, as the sidebar sees them: the open one has its own line. */
export function otherWorkingThreads(bot: Pick<Bot, "threadId" | "tasks">): Task[] {
  return orderedThreadList((bot.tasks ?? []).filter((task) =>
    task.threadId !== bot.threadId && !isArchived(task) && task.activity !== "waiting-on-you" && (task.busy === true || task.activity === "working")));
}

function OtherThreadLine({ bot, task, dispatch }: { bot: Bot; task: Task; dispatch: Dispatch<Action> }) {
  const live = useTurnLive(task.threadId);
  const phrase = live.label?.trim() || turnNowPhrases(live.status)?.phrases[0] || t("chat.activity.working");
  const quiet = quietText(live.status && "quiet" in live.status ? live.status.quiet : undefined, Date.now());
  const title = localizedTaskTitle(task.title);
  return (
    <button
      type="button"
      data-other-thread-work={task.threadId}
      onClick={() => dispatch({ type: "switchTask", botId: bot.id, threadId: task.threadId })}
      title={t("chat.openThread", { title })}
      className="flex h-9 min-w-0 max-w-full items-center gap-[8.5px] rounded-full ps-2 pe-3 text-left text-[14px] leading-[22px] outline-none hover:bg-raised/50 focus-visible:ring-1 focus-visible:ring-focus"
    >
      <span className="relative top-px inline-flex shrink-0"><BotAvatar bot={bot} state={workingMark(live.status?.activity)} size={28} /></span>
      <span dir="auto" className="status-shimmer min-w-0 truncate" data-other-thread-phrase="">{phrase}</span>
      {quiet && <span className="shrink-0 text-[12px] text-ink-tertiary"> · {quiet}</span>}
      <span className="flex min-w-0 shrink items-center gap-1 text-[12px] text-ink-tertiary">
        <span aria-hidden="true">·</span>
        <span className="max-w-[240px] truncate">#{title}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </span>
    </button>
  );
}

/** One live line per other conversation the bot is working in, each opening that conversation. */
export function OtherThreadsWork({ bot, dispatch }: { bot: Bot; dispatch: Dispatch<Action> }) {
  const tasks = otherWorkingThreads(bot);
  if (!tasks.length) return null;
  return (
    <div data-other-threads-work={bot.id} className="flex flex-col items-start gap-1">
      {tasks.map((task) => <OtherThreadLine key={task.threadId} bot={bot} task={task} dispatch={dispatch} />)}
    </div>
  );
}
