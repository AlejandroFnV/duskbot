import { ChevronRight } from "../../icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { localizedTaskTitle } from "@/lib/task-title";
import { useStore, type Bot, type Task } from "@/state/store";
import { isArchived, orderedThreadList } from "../SidebarThreadRow";
import { Card, rowCls, RowText } from "./rows";

export const CODING_DONE_FOR_MS = 24 * 60 * 60_000;
/** Only what is certain: the bot is working in the thread, or it finished. Waiting on teammates says neither. */
export type CodingState = "working" | "done" | null;

export function codingState(task: Pick<Task, "busy" | "activity" | "waitingForTeammates">): CodingState {
  if (task.busy === true || task.activity === "working") return "working";
  if (task.waitingForTeammates) return null;
  return "done";
}

/** The bot's threads that work in a git repo, without finished ones older than a day. */
export function codingTasks(bot: Pick<Bot, "tasks">, now = Date.now()): Task[] {
  return orderedThreadList((bot.tasks ?? []).filter((task) => {
    if (!task.codeRepo || isArchived(task)) return false;
    const live = task.busy === true || task.activity === "working" || task.waitingForTeammates === true;
    return live || now - (task.updatedAt ?? task.createdAt) < CODING_DONE_FOR_MS;
  }));
}

const STATE_LABEL = {
  working: "botPanel.coding.state.working",
  done: "botPanel.coding.state.done",
} as const satisfies Record<NonNullable<CodingState>, string>;

const repoName = (root: string): string => root.split(/[\\/]/).filter(Boolean).at(-1) ?? root;
/** The branch only when it says something: not the usual main line, and not a detached checkout. */
const shownBranch = (branch: string | null): string | null => branch && branch !== "main" && branch !== "master" ? branch : null;

function CodingRow({ bot, task }: { bot: Bot; task: Task }) {
  const { dispatch } = useStore();
  const state = codingState(task);
  const repo = task.codeRepo!;
  const title = localizedTaskTitle(task.title);
  const where = [repo.project ?? repoName(repo.root), shownBranch(repo.branch)].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      data-panel-coding={task.threadId}
      data-coding-state={state ?? undefined}
      onClick={() => dispatch({ type: "switchTask", botId: bot.id, threadId: task.threadId })}
      title={t("chat.openThread", { title })}
      className={cn(rowCls, "w-full cursor-pointer text-left outline-none hover:bg-ink/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus")}
    >
      <RowText title={<span className="block truncate">{title}</span>} hint={<span title={repo.root}>{where}</span>} />
      {state && <span className={cn("shrink-0 text-[12px] leading-[18px] text-ink-secondary", state === "working" && "status-shimmer")}>{t(STATE_LABEL[state])}</span>}
      <ChevronRight size={14} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
    </button>
  );
}

/** The code projects the bot works on: one row per thread that edited code in a git repo. Nothing when there is none. */
export function CodingTasks({ bot }: { bot: Bot }) {
  const tasks = codingTasks(bot);
  if (!tasks.length) return null;
  return (
    <Card label={t("botPanel.coding.title")} anchor="coding">
      {tasks.map((task) => <CodingRow key={task.threadId} bot={bot} task={task} />)}
    </Card>
  );
}
