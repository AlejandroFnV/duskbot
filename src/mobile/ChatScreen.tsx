import { ChevronLeft, Monitor, MoreHorizontal } from "../icons";
import { useStore, type Bot, type Group } from "@/state/store";
import { ChatView } from "@/components/ChatView";
import { GroupView } from "@/components/GroupView";
import { BotAvatar } from "@/components/Avatar";
import { GroupAvatar } from "@/components/GroupAvatar";
import { t } from "@/lib/i18n";
import { RoundButton } from "./RoundButton";
import { botRole, NameRole } from "./bot-role";
import { ConnectionPill, useLiveConnection } from "./connection/ConnectionProblem";

/** The shared chat, with floating glass nav in place of its header row: back, the bot's pill (its profile) centred,
 * and the computer. The shared header keeps its height under the nav, so the transcript starts where it always does. */
export function ChatScreen({ bot, group, members, onBack, onProfile, onComputer }: {
  bot?: Bot;
  group?: Group;
  members: Bot[];
  onBack: () => void;
  onProfile: () => void;
  onComputer?: () => void;
}) {
  const { state } = useStore();
  const name = group?.name ?? bot?.name ?? "";
  const live = Boolean(bot && (bot.busy || state.computerControl[bot.id]?.held));
  const link = useLiveConnection();
  return (
    <div data-mobile-chat className="relative flex h-full flex-col">
      {group ? <GroupView key={group.id} group={group} /> : bot ? <ChatView bot={bot} /> : null}
      <div aria-hidden className="m-edge-top z-[29] h-[calc(var(--m-safe-top)+16px)]" />
      <nav
        aria-label={t("mobile.chat.nav", { name })}
        data-glass-nav=""
        className="pointer-events-none absolute inset-x-0 top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-[calc(var(--m-safe-top)+6px)]"
      >
        <RoundButton floating glass data-glass="back" label={t("mobile.chat.back")} onClick={onBack} className="pointer-events-auto">
          <ChevronLeft size={22} strokeWidth={2} />
        </RoundButton>
        <div className="relative flex min-w-0 justify-center">
          <button
            type="button"
            onClick={onProfile}
            data-glass="title"
            aria-label={t("mobile.chat.openProfile", { name })}
            className="mobile-press m-glass pointer-events-auto flex h-11 min-w-0 max-w-[calc(100vw-136px)] items-center gap-2 rounded-full pl-1.5 pr-4 text-ink"
          >
            <span data-glass-avatar="" className="flex shrink-0">
              {group
                ? <GroupAvatar members={members} size={30} />
                : bot && <BotAvatar bot={bot} size={30} state="idle" animated={false} />}
            </span>
            <span data-glass-name="" className="flex min-w-0"><NameRole name={name} role={!group && bot ? botRole(bot) : ""} className="text-[15px] font-semibold" /></span>
          </button>
          <ConnectionPill notice={link.notice === "reconnecting" ? null : link.notice} trying={link.trying} onRetry={link.retry} testId="mobile-chat-cloud-status" className="absolute top-[calc(100%+8px)] h-8 px-3" />
        </div>
        <div className="flex justify-end">
          {onComputer ? (
            <RoundButton floating glass data-glass="right" data-glass-kind="computer" label={live ? `${t("mobile.chat.computer")}, ${t("place.live")}` : t("mobile.chat.computer")} onClick={onComputer} className="pointer-events-auto">
              <Monitor size={19} strokeWidth={1.8} />
              {live && <span aria-hidden data-glass-live="" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-success" />}
            </RoundButton>
          ) : (
            <RoundButton floating glass data-glass="right" data-glass-kind="more" label={t("mobile.chat.openProfile", { name })} onClick={onProfile} className="pointer-events-auto">
              <MoreHorizontal size={20} strokeWidth={2} />
            </RoundButton>
          )}
        </div>
      </nav>
    </div>
  );
}
