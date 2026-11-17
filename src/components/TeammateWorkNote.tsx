import { useId, useState, type Dispatch } from "react";
import type { WireTeammateWork } from "../../shared/wire";
import { ChevronRight } from "../icons";
import type { Action, Bot } from "@/state/store";
import { useTurnLive } from "@/state/turn-status";
import { turnNowPhrases } from "@/lib/live-activity";
import { activeLocale, t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";

type Teammates = ReadonlyArray<Pick<Bot, "id" | "name">>;

function teammateName(botId: string, bots: Teammates): string {
  return bots.find((bot) => bot.id === botId)?.name ?? t("chat.teammateWork.someone");
}

export function teammateWorkSummary(work: readonly WireTeammateWork[] | undefined, bots: Teammates): string {
  if (!work?.length) return t("chat.teammatesWorking");
  const names = new Intl.ListFormat(activeLocale(), { type: "conjunction" }).format([...new Set(work.map((item) => teammateName(item.botId, bots)))]);
  return work.length === 1 ? t("chat.teammateWork.summary.one", { names }) : t("chat.teammateWork.summary.many", { count: work.length, names });
}

function statusPhrase(status: WireTeammateWork["status"]): string {
  return status === "queued" ? t("chat.teammateWork.queued") : status === "waiting" ? t("chat.teammateWork.waiting") : t("chat.activity.working");
}

function TeammateWorkRow({ item, teammate, name, dispatch }: { item: WireTeammateWork; teammate: Bot | undefined; name: string; dispatch: Dispatch<Action> }) {
  const live = useTurnLive(item.threadId);
  const phrase = item.status === "running" ? live.label?.trim() || turnNowPhrases(live.status)?.phrases[0] || statusPhrase(item.status) : statusPhrase(item.status);
  return (
    <li>
      <button
        type="button"
        data-teammate-work-thread={item.threadId}
        onClick={() => dispatch({ type: "switchTask", botId: item.botId, threadId: item.threadId })}
        title={t("chat.openThread", { title: item.summary || name })}
        className="flex min-h-9 w-full min-w-0 max-w-full items-center gap-2 rounded-xl ps-2 pe-3 py-1 text-left text-[13px] leading-[20px] outline-none hover:bg-raised/50 focus-visible:ring-1 focus-visible:ring-focus"
      >
        {teammate && <span className="inline-flex shrink-0"><BotAvatar bot={teammate} size={24} /></span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 font-medium text-ink">{name}</span>
            <span aria-hidden="true" className="text-ink-tertiary">·</span>
            <span dir="auto" className="min-w-0 truncate text-ink-secondary" data-teammate-work-phrase="">{phrase}</span>
          </span>
          {item.summary && <span dir="auto" className="truncate text-[12px] text-ink-tertiary">{item.summary}</span>}
        </span>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </li>
  );
}

export function TeammateWorkNote({ work, bots, dispatch }: { work: readonly WireTeammateWork[] | undefined; bots: readonly Bot[]; dispatch: Dispatch<Action> }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const summary = teammateWorkSummary(work, bots);
  const expandable = Boolean(work?.length);
  return (
    <div data-teammate-work="" className="flex max-w-full flex-col items-start gap-1 ps-1">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-2 text-left text-[14px] leading-[22px] text-ink-secondary outline-none hover:bg-raised/50 focus-visible:ring-1 focus-visible:ring-focus"
        >
          <ChevronRight size={13} aria-hidden="true" className={open ? "shrink-0 rotate-90" : "shrink-0"} />
          <span role="status" className="min-w-0 truncate" data-teammate-work-summary="">{summary}</span>
        </button>
      ) : (
        <span role="status" className="flex min-h-9 items-center px-2 text-[14px] leading-[22px] text-ink-secondary" data-teammate-work-summary="">{summary}</span>
      )}
      {expandable && open && (
        <ul id={listId} className="flex w-full max-w-[520px] flex-col gap-0.5">
          {work!.map((item) => {
            const teammate = bots.find((bot) => bot.id === item.botId);
            return <TeammateWorkRow key={`${item.botId}:${item.threadId}`} item={item} teammate={teammate} name={teammateName(item.botId, bots)} dispatch={dispatch} />;
          })}
        </ul>
      )}
      <span className="px-2 text-[12px] text-ink-tertiary" data-teammate-work-hint="">{t("chat.teammateWork.youCanWrite")}</span>
    </div>
  );
}
