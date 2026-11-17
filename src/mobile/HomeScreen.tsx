import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { BellDot, Check, ChevronDown, ChevronRight, MonitorSmartphone, Pin, PinOff, Plus, RotateCcw, Search, Star, UserRound } from "../icons";
import { api, retryLoad, useStore, type Bot, type Group } from "@/state/store";
import { BotAvatar, MausAvatar } from "@/components/Avatar";
import { GroupAvatar, useGroupYou } from "@/components/GroupAvatar";
import { UserFace } from "@/components/UserAvatar";
import { useMobileAccount } from "./account/AccountGate";
import { botPreview, groupPreview, lastPreviewable, sidebarPreviewMessages } from "@/components/sidebar-preview";
import { WorkingDots } from "@/components/WorkingIndicator";
import { partitionSidebarBots, withPrimaryTile } from "@/lib/sidebar-layout";
import { loadCollapsedSections, saveCollapsedSections, toggleCollapsedSection } from "@/lib/sidebar-preferences";
import { homeSections } from "./home-sections";
import { botShowsUnread } from "@/lib/bot-unread";
import { botUnreadThreadIds, markBotRead } from "@/lib/folder-read";
import { stateForBot } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { threadRefUrl } from "@/lib/thread-refs";
import { RoundButton } from "./RoundButton";
import { ContextMenu, useLongPress, type ContextAction } from "./ContextMenu";
import { PullToRefresh } from "./PullToRefresh";
import { revealOnce, useListFlip } from "./list-motion";
import { refreshSnapshot } from "./refresh";
import { usePlatform } from "./platform";
import { ConnectionPill, ConnectionProblemCard, useLiveConnection } from "./connection/ConnectionProblem";
import { listTime } from "./time";
import { EmptyState } from "./Illustration";
import { useOffline } from "./network";
import type { OpenSheet } from "./sheets";

/** The row stays pressed while its chat builds offscreen, so the hand sees the tap land; cleared when the chat arrives. */
function holdPressed(el: HTMLElement) {
  for (const held of document.querySelectorAll("[data-opening]")) delete (held as HTMLElement).dataset.opening;
  el.dataset.opening = "";
}

export function releasePressed() {
  for (const held of document.querySelectorAll("[data-opening]")) delete (held as HTMLElement).dataset.opening;
}

type Entry =
  | { kind: "bot"; id: string; bot: Bot; at: number; preview: string; unread: boolean; section?: string }
  | { kind: "group"; id: string; group: Group; members: Bot[]; at: number; preview: string; unread: boolean; section?: string };

const BAR_TOP = "calc(var(--m-safe-top) + 6px)";
const LIST_TOP = "calc(var(--m-safe-top) + 64px)";

function lastAt(owner: Bot | Group): number {
  return lastPreviewable(sidebarPreviewMessages(owner))?.at ?? owner.tasks?.reduce((max, task) => Math.max(max, task.createdAt ?? 0), 0) ?? 0;
}

/** Grok's home: a few round buttons floating over the top, the pinned bots big, then every chat as a plain row. */
export function HomeScreen({ onOpenChat, onOpenSheet }: { onOpenChat: (id: string) => void; onOpenSheet: OpenSheet }) {
  const { state, dispatch } = useStore();
  const platform = usePlatform();
  const offline = useOffline();
  const live = useLiveConnection();
  const you = useGroupYou();
  const phone = useMobileAccount()?.account ?? null;
  // the phone's own account first: its photo, else its drawn head; the desktop's profile otherwise
  const face = phone ?? you?.face ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<{ entry: Entry; rect: DOMRect; pinnedTile: boolean; source: HTMLElement | null } | null>(null);

  const { pinned, entries, sections } = useMemo(() => {
    const parts = partitionSidebarBots(state.bots);
    const { primary } = withPrimaryTile(parts, state.bots.find((bot) => bot.defaultBot && !bot.hidden)?.id);
    const top = [...(primary ? [primary] : []), ...parts.pinnedBots.filter((bot) => bot.id !== primary?.id)];
    const topIds = new Set(top.map((bot) => bot.id));
    const visible = state.bots.filter((bot) => !bot.hidden && !topIds.has(bot.id) && (parts.unsectionedBots.includes(bot) || parts.sectionedBots.includes(bot) || parts.sectionChiefs.includes(bot)));
    const rows: Entry[] = [
      ...visible.map((bot): Entry => ({ kind: "bot", id: bot.id, bot, at: lastAt(bot), preview: botPreview(bot, sidebarPreviewMessages(bot), state.instances), unread: botShowsUnread(bot), section: bot.section })),
      ...state.groups.map((group): Entry => {
        const members = state.bots.filter((bot) => group.memberIds.includes(bot.id));
        return { kind: "group", id: group.id, group, members, at: lastAt(group), preview: groupPreview(group, state.bots, state.instances), unread: Boolean(group.unread), section: group.dm ? undefined : group.section };
      }),
    ];
    return { pinned: top, entries: rows, sections: homeSections(rows, state.sections ?? []) };
  }, [state.bots, state.groups, state.instances, state.sections]);
  // the same collapsed list the desktop sidebar keeps, so a department folded there by name folds here too
  const [collapsedIds, setCollapsedIds] = useState<string[]>(() => loadCollapsedSections());
  const toggleSection = useCallback((id: string) => setCollapsedIds((current) => {
    const next = toggleCollapsedSection(current, id);
    saveCollapsedSections(next);
    return next;
  }), []);
  const headed = sections.length > 1 || pinned.length > 0;

  useListFlip(listRef, `${pinned.length}|${collapsedIds.join(",")}|${sections.map((section) => section.items.map((entry) => entry.id).join(",")).join("|")}`);
  const sawSkeleton = useRef(!state.hydrated);
  const reveal = useCallback((el: HTMLDivElement | null) => {
    if (el && sawSkeleton.current) { sawSkeleton.current = false; revealOnce(el); }
  }, []);

  const unreadNotes = state.notifications.filter((note) => !note.read).length;
  const primary = pinned[0];

  const actionsFor = useCallback((entry: Entry): ContextAction[] => {
    // the desktop app already opens these links (electron/chat-link.mjs), so the phone hands it the same ones
    const desktopLink = entry.kind === "bot" ? threadRefUrl({ botId: entry.id, threadId: entry.bot.threadId }) : `duskbot://thread/${encodeURIComponent(entry.group.threadId)}`;
    const list: ContextAction[] = [];
    if (entry.kind === "bot") {
      const bot = entry.bot;
      list.push({ key: "pin", label: bot.pinned ? t("sidebar.bot.unpin") : t("sidebar.bot.pin"), icon: bot.pinned ? <PinOff size={18} /> : <Pin size={18} />, onSelect: () => dispatch({ type: "updateBot", botId: bot.id, patch: { pinned: !bot.pinned } }) });
      list.push(botUnreadThreadIds(bot).length > 0
        ? { key: "read", label: t("sidebar.grok.markRead"), icon: <Check size={18} />, onSelect: () => { void markBotRead(bot, api, (updated) => dispatch({ type: "botPatched", bot: updated })).catch(() => {}); } }
        : { key: "unread", label: t("sidebar.grok.markUnread"), icon: <BellDot size={18} />, onSelect: () => dispatch({ type: "markUnread", botId: bot.id }) });
    }
    list.push({ key: "profile", label: t("mobile.home.openProfile"), icon: <UserRound size={18} />, onSelect: () => onOpenSheet({ kind: "profile", id: entry.id }) });
    if (platform.share) {
      list.push({ key: "desktop", label: t("mobile.home.openOnDesktop"), icon: <MonitorSmartphone size={18} />, onSelect: () => { void platform.share?.({ title: entry.kind === "bot" ? entry.bot.name : entry.group.name, url: desktopLink }); } });
    }
    return list;
  }, [dispatch, onOpenSheet, platform]);

  const openMenu = useCallback((entry: Entry, rect: DOMRect, source: HTMLElement | null, pinnedTile = false) => setMenu({ entry, rect, pinnedTile, source }), []);

  return (
    <div className="relative h-full bg-app">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}
      >
        <PullToRefresh
          scrollRef={scrollRef}
          onRefresh={() => refreshSnapshot(state, dispatch)}
          top={LIST_TOP}
          indicator={(progress, refreshing) => <RefreshMark bot={primary} progress={progress} refreshing={refreshing} />}
        >
          <div ref={listRef} style={{ paddingTop: LIST_TOP }} className="pb-[calc(var(--m-safe-bottom)+24px)]">
            {state.hydrated && <ConnectionProblemCard notice={live.notice} place={live.place} trying={live.trying} onRetry={live.retry} />}
            {!state.hydrated ? (state.loadFailed ? (
              <EmptyState tone="error" art="signpost" className="pt-16" title={t("mobile.home.loadFailedTitle")} body={t(offline ? "mobile.home.loadFailedOffline" : "mobile.home.loadFailedBody")}
                action={{ label: t("mobile.home.retry"), icon: <RotateCcw size={17} aria-hidden />, onClick: retryLoad }} />
            ) : <HomeSkeleton />) : pinned.length + entries.length === 0 ? (
              <EmptyState mascot="blue" className="pt-20" title={t("mobile.home.emptyTitle")} body={t("mobile.home.emptyBody")}
                action={{ label: t("mobile.home.emptyAction"), icon: <Plus size={18} aria-hidden />, onClick: () => onOpenSheet({ kind: "create" }) }} />
            ) : (
              <div ref={reveal}>
                {pinned.length > 0 && (
                  <section aria-labelledby="home-pinned" data-no-swipe>
                  <h2 id="home-pinned" className="sr-only">{t("sidebar.section.pinned")}</h2>
                  <div className="grid grid-cols-3 gap-y-3 px-5 pb-2 pt-1">
                    {pinned.map((bot) => (
                      <PinnedTile key={bot.id} bot={bot} onOpen={onOpenChat} onMenu={(rect, source) => openMenu(botEntry(bot, state), rect, source, true)} />
                    ))}
                  </div>
                  </section>
                )}
                {entries.length > 0 ? sections.map((section) => {
                  const name = section.name ?? t("mobile.home.chats");
                  const collapsed = headed && collapsedIds.includes(section.id);
                  const listId = `home-section-${section.id}`;
                  return (
                    <section key={section.id} data-section={section.id}>
                      {headed && (
                        <h2>
                          <button type="button" onClick={() => toggleSection(section.id)} aria-expanded={!collapsed} aria-controls={listId}
                            aria-label={t(collapsed ? "sidebar.section.expand" : "sidebar.section.collapse", { name })}
                            className="mobile-press flex min-h-11 w-full items-center gap-1 px-5 pt-2 text-left text-[17px] leading-[22px] text-ink-secondary">
                            <span className="min-w-0 truncate">{name}</span>
                            {collapsed ? <ChevronRight size={17} aria-hidden className="shrink-0" /> : <ChevronDown size={17} aria-hidden className="shrink-0" />}
                          </button>
                        </h2>
                      )}
                      {!collapsed && (
                        <ul id={listId} role="list" aria-label={name}>
                          {section.items.map((entry) => (
                            <li key={entry.id} data-flip-key={entry.id}>
                              <HomeRow entry={entry} onOpen={onOpenChat} onMenu={openMenu} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                }) : (
                  <div className="mx-4 mt-4 flex flex-col items-start gap-3 rounded-[20px] bg-ink/[0.04] px-5 py-5">
                    <p className="text-[16px] font-semibold text-ink">{t("mobile.home.onlyPinnedTitle")}</p>
                    <p className="text-[15px] leading-[22px] text-ink-secondary">{t("mobile.home.onlyPinnedBody")}</p>
                    <button type="button" onClick={() => onOpenSheet({ kind: "create" })} className="mobile-press mt-1 flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-app"><Plus size={18} />{t("mobile.home.emptyAction")}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </PullToRefresh>
      </div>

      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 z-[5] h-[calc(var(--m-safe-top)+72px)] bg-gradient-to-b from-app from-60% to-transparent transition-opacity duration-150", scrolled ? "opacity-100" : "opacity-0")} />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-5" style={{ paddingTop: BAR_TOP }}>
        <RoundButton floating label={unreadNotes ? t("mobile.home.youWithNotifications", { count: unreadNotes }) : t("mobile.home.you")} onClick={() => onOpenSheet({ kind: "settings" })} className="pointer-events-auto overflow-visible">
          {face
            ? <UserFace account={face} size={40} className="size-full" />
            : <span className="text-[14px] font-semibold">{you?.initials ?? <UserRound size={19} />}</span>}
          {unreadNotes > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[11px] font-semibold tabular-nums text-app ring-2 ring-app">{unreadNotes > 9 ? "9+" : unreadNotes}</span>}
        </RoundButton>
        <div className="flex-1" />
        <ConnectionPill notice={live.notice} trying={live.trying} onRetry={live.retry} testId="mobile-connection-status" />
        <RoundButton floating label={t("mobile.home.search")} onClick={() => onOpenSheet({ kind: "search" })} className="pointer-events-auto"><Search size={19} strokeWidth={1.9} /></RoundButton>
        <RoundButton floating label={t("mobile.home.newBot")} onClick={() => onOpenSheet({ kind: "create" })} className="pointer-events-auto"><Plus size={21} strokeWidth={1.9} /></RoundButton>
      </header>

      <ContextMenu
        open={Boolean(menu)}
        anchor={menu?.rect ?? null}
        label={menu ? t("sidebar.bot.actions", { name: menu.entry.kind === "bot" ? menu.entry.bot.name : menu.entry.group.name }) : ""}
        preview={menu ? (menu.pinnedTile && menu.entry.kind === "bot" ? <PinnedTileFace bot={menu.entry.bot} /> : <RowFace entry={menu.entry} />) : null}
        actions={menu ? actionsFor(menu.entry) : []}
        source={menu?.source}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function botEntry(bot: Bot, state: ReturnType<typeof useStore>["state"]): Entry {
  return { kind: "bot", id: bot.id, bot, at: lastAt(bot), preview: botPreview(bot, sidebarPreviewMessages(bot), state.instances), unread: botShowsUnread(bot) };
}

function RefreshMark({ bot, progress, refreshing }: { bot?: Bot; progress: MotionValue<number>; refreshing: boolean }) {
  const scale = useTransform(progress, [0, 1, 1.6], [0.55, 1, 1.08]);
  const y = useTransform(progress, [0, 1], [-10, 0]);
  return (
    <motion.div style={{ scale, y }} className="pt-1">
      {bot
        ? <BotAvatar bot={bot} size={30} state={refreshing ? "working" : "idle"} animated={refreshing} label={t("mobile.home.refreshing")} />
        : <MausAvatar color="blue" size={30} state={refreshing ? "working" : "idle"} label={t("mobile.home.refreshing")} />}
    </motion.div>
  );
}

const PinnedTile = memo(function PinnedTile({ bot, onOpen, onMenu }: { bot: Bot; onOpen: (id: string) => void; onMenu: (rect: DOMRect, source: HTMLElement | null) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useLongPress(ref, (rect) => onMenu(rect, ref.current));
  return (
    <button ref={ref} type="button" onClick={(event) => { holdPressed(event.currentTarget); onOpen(bot.id); }} className="mobile-press flex min-w-0 flex-col items-center rounded-[20px]" aria-label={botShowsUnread(bot) ? t("mobile.home.unreadChat", { name: bot.name }) : bot.name}>
      <PinnedTileFace bot={bot} />
    </button>
  );
});

function PinnedTileFace({ bot }: { bot: Bot }) {
  const unread = botShowsUnread(bot);
  return (
    <span className="flex w-full min-w-0 flex-col items-center gap-2 py-1">
      <span className="relative">
        <BotAvatar bot={bot} size={88} state={bot.busy ? "working" : "idle"} animated={bot.busy} label="" />
        {bot.chiefOfStaff && (
          <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-[var(--identity-orange)] text-white ring-[3px] ring-app">
            <Star size={12} fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 items-center justify-center gap-1.5 px-1">
        <span className={cn("min-w-0 truncate text-center text-[16px] leading-5", unread ? "font-semibold text-ink" : "text-ink")}>{bot.name}</span>
        {unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />}
      </span>
    </span>
  );
}

const HomeRow = memo(function HomeRow({ entry, onOpen, onMenu }: { entry: Entry; onOpen: (id: string) => void; onMenu: (entry: Entry, rect: DOMRect, source: HTMLElement | null) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useLongPress(ref, (rect) => onMenu(entry, rect, ref.current));
  const name = entry.kind === "bot" ? entry.bot.name : entry.group.name;
  return (
    <button
      ref={ref}
      type="button"
      onClick={(event) => { holdPressed(event.currentTarget); onOpen(entry.id); }}
      aria-label={entry.unread ? t("mobile.home.unreadChat", { name }) : undefined}
      className="mobile-row block w-full text-left"
    >
      <RowFace entry={entry} />
    </button>
  );
});

function RowFace({ entry }: { entry: Entry }) {
  const name = entry.kind === "bot" ? entry.bot.name : entry.group.name;
  const working = entry.kind === "bot" ? Boolean(entry.bot.busy) : Boolean(entry.group.working);
  const avatar: ReactNode = entry.kind === "bot"
    ? <BotAvatar bot={entry.bot} size={44} state={working ? "working" : stateForBot(entry.bot) === "failed" ? "failed" : "idle"} animated={working} label="" />
    : <GroupAvatar members={entry.members} size={44} />;
  return (
    <span className="flex min-h-20 items-center gap-[18px] px-5 py-2.5">
      <span className="shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 truncate text-[17px] leading-[22px] text-ink", entry.unread && "font-semibold")}>{name}</span>
          {entry.unread && <span aria-hidden className="size-2 shrink-0 self-center rounded-full bg-accent" />}
          <span className="flex-1" />
          {entry.at > 0 && <span className="shrink-0 text-[15px] tabular-nums leading-5 text-ink-secondary">{listTime(entry.at)}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[17px] leading-[22px]", entry.unread ? "text-ink" : "text-ink-secondary")}>
            {working && <WorkingDots size={3} className="me-1.5 inline-flex align-middle" />}
            {entry.preview || " "}
          </span>
        </span>
      </span>
    </span>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="px-5">
      <div className="grid grid-cols-3 pb-4 pt-1">
        {[0, 1, 2].map((i) => <div key={i} className="flex flex-col items-center gap-2"><div className="size-[88px] rounded-full bg-ink/[0.06]" /><div className="h-3 w-12 rounded-full bg-ink/[0.06]" /></div>)}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex min-h-20 items-center gap-[18px]">
          <div className="size-11 shrink-0 rounded-full bg-ink/[0.06]" />
          <div className="flex-1 space-y-2"><div className="h-3.5 w-1/3 rounded-full bg-ink/[0.07]" /><div className="h-3 w-2/3 rounded-full bg-ink/[0.05]" /></div>
        </div>
      ))}
    </div>
  );
}
