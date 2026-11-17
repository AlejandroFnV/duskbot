import { ChevronRight } from "../../icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { localizedTaskTitle } from "@/lib/task-title";
import { useStore, type Bot, type Task } from "@/state/store";
import { useTurnLive, type LiveStatus } from "@/state/turn-status";
import { isArchived, orderedThreadList } from "../SidebarThreadRow";
import { Card, rowCls, RowText } from "./rows";

export const CODING_DONE_FOR_MS = 24 * 60 * 60_000;
export type CodingState = "coding" | "testing" | "review" | "done";

const CHECK_COMMAND = /\b(vitest|jest|tsc|eslint|playwright)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|typecheck|check)\b/;

export function isCheckCommand(text: string | undefined): boolean {
  return !!text && CHECK_COMMAND.test(text);
}

export function codingState(task: Pick<Task, "busy" | "activity" | "waitingForTeammates">, live: LiveStatus | null): CodingState {
  const running = task.busy === true || task.activity === "working";
  if (running && live?.activity === "command" && (isCheckCommand(live.detail) || isCheckCommand(live.target))) return "testing";
  if (running) return "coding";
  if (task.waitingForTeammates) return "review";
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
  coding: "botPanel.coding.state.coding",
  testing: "botPanel.coding.state.testing",
  review: "botPanel.coding.state.review",
  done: "botPanel.coding.state.done",
} as const satisfies Record<CodingState, string>;

const repoName = (root: string): string => root.split(/[\\/]/).filter(Boolean).at(-1) ?? root;

function CodingRow({ bot, task }: { bot: Bot; task: Task }) {
  const { dispatch } = useStore();
  const live = useTurnLive(task.threadId);
  const state = codingState(task, live.ended ? null : live.status);
  const repo = task.codeRepo!;
  const title = localizedTaskTitle(task.title);
  const where = [repoName(repo.root), repo.branch ?? t("botPanel.coding.detached"), repo.worktree ? t("botPanel.coding.worktree") : null]
    .filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      data-panel-coding={task.threadId}
      data-coding-state={state}
      onClick={() => dispatch({ type: "switchTask", botId: bot.id, threadId: task.threadId })}
      title={t("chat.openThread", { title })}
      className={cn(rowCls, "w-full cursor-pointer text-left outline-none hover:bg-ink/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus")}
    >
      <RowText title={<span className="block truncate">{title}</span>} hint={<span title={repo.root}>{where}</span>} />
      <span className={cn("shrink-0 text-[12px] leading-[18px] text-ink-secondary", state !== "done" && "status-shimmer")}>{t(STATE_LABEL[state])}</span>
      <ChevronRight size={14} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
    </button>
  );
}

/** What the bot is programming: one row per thread working in a git repo. Nothing when there is none. */
export function CodingTasks({ bot }: { bot: Bot }) {
  const tasks = codingTasks(bot);
  if (!tasks.length) return null;
  return (
    <Card label={t("botPanel.coding.title")} anchor="coding">
      {tasks.map((task) => <CodingRow key={task.threadId} bot={bot} task={task} />)}
    </Card>
  );
}
