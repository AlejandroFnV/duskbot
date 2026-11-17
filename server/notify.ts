import type { Notification, NotificationLine, NotifyKind } from "../shared/notification.ts";
import { personMentionExcerpt } from "../shared/person-mention.ts";
import { conversationLanguage, serverLine, type ServerLineKey } from "./server-lines.ts";

export type { Notification, NotificationLine, NotifyKind } from "../shared/notification.ts";

type Line = { key: ServerLineKey; params?: Record<string, string | Line> };

function lineText(language: string | undefined, line: NotificationLine): string {
  const params = Object.fromEntries(Object.entries(line.params ?? {}).map(([name, value]) => [name, typeof value === "string" ? value : lineText(language, value)]));
  return serverLine(language, line.key as ServerLineKey, params);
}

/** The notification's title in `language`, for a reader whose language may not be the one it was made in. */
export function notificationTitle(notification: Pick<Notification, "title" | "titleLine">, language: string | undefined): string {
  return notification.titleLine ? lineText(language, notification.titleLine) : notification.title;
}

export function summarize(text: string, max = 140): string {
  const line = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export interface NotifyBot {
  id: string;
  name: string;
  threadId: string;
  notifications?: boolean;
  /** Archived: its finished work stays in its chat without a ping, since the app has no row to open it from. */
  hidden?: boolean;
}

/** Something dusk bot did on its own about `bot` that the person hears once, in one plain line. */
export function buildNoticeNotification(bot: Pick<NotifyBot, "id" | "name">, threadId: string, text: string): Notification {
  return { kind: "notice", botId: bot.id, botName: bot.name, threadId, title: bot.name, body: summarize(text, 240) };
}


const TITLE: Partial<Record<NotifyKind, ServerLineKey>> = {
  approval: "server.notify.approval",
  question: "server.notify.question",
  "routine-failed": "server.notify.routineFailed",
  "routine-deferred": "server.notify.routineDeferred",
  "turn-failed": "server.notify.turnFailed",
  incident: "server.notify.incident",
  "delegation-settled": "server.notify.delegationSettled",
  mention: "server.notify.mention",
  wait: "server.notify.wait",
};

export function buildNotification(
  kind: NotifyKind,
  bot: Omit<NotifyBot, "threadId"> & { threadId?: string },
  threadId: string,
  detail: string,
  extra?: { avatarUrl?: string; group?: { id: string; name: string }; site?: string; label?: string; app?: string; check?: boolean },
): Notification | null {
  if (bot.notifications === false) return null;

  const body = summarize(detail);
  const language = conversationLanguage(threadId);
  const who: string | Line = extra?.group ? { key: "server.notify.inRoom", params: { bot: bot.name, room: extra.group.name } } : bot.name;
  const titleLine: Line = kind === "secret" ? { key: "server.notify.secret", params: { who, label: extra?.label ?? "" } }
    : kind === "sign-in"
      ? extra?.app ? { key: "server.notify.connect", params: { who, app: extra.app } }
        : extra?.check && extra.site ? { key: "server.notify.humanCheck", params: { who, site: extra.site } }
        : extra?.site ? { key: "server.notify.signIn", params: { who, site: extra.site } } : { key: "server.notify.signInWebsite", params: { who } }
      : { key: TITLE[kind] ?? "server.notify.done", params: { who } };
  const title = lineText(language, titleLine);

  if ((kind === "done" || kind === "mention") && !body) return null;
  if (kind === "done" && bot.hidden) return null;

  const notification: Notification = { kind, botId: bot.id, botName: bot.name, threadId, title, titleLine, body };
  if (extra?.avatarUrl) notification.avatarUrl = extra.avatarUrl;
  if (extra?.group) notification.groupId = extra.group.id;
  return notification;
}

type MentionSource = {
  activePath(threadId: string): readonly { role: string; kind: string; text?: string; turnId?: string; from?: { botId: string } }[];
  bot(id: string): { name: string; hidden?: boolean } | null | undefined;
};

export function buildMentionNotification(
  source: MentionSource,
  bot: Omit<NotifyBot, "threadId"> & { avatarUrl?: string },
  room: { id: string; name: string; dm?: boolean; memberIds: readonly string[] },
  turn: { threadId: string; turnId?: string; reply: string; profileName?: string; tagged?: string },
): Notification | null {
  if (room.dm) return null;
  const texts = turn.turnId
    ? source.activePath(turn.threadId).filter((m) => m.role === "bot" && m.kind === "text" && m.turnId === turn.turnId && m.from?.botId === bot.id).map((m) => m.text ?? "")
    : [turn.reply];
  const botNames = room.memberIds.flatMap((id) => {
    const member = source.bot(id);
    return member && !member.hidden ? [member.name] : [];
  });
  for (const text of texts) {
    const excerpt = personMentionExcerpt(text, { profileName: turn.profileName, botNames });
    if (excerpt) return buildNotification("mention", { ...bot, threadId: turn.threadId }, turn.threadId, excerpt, { avatarUrl: bot.avatarUrl, group: room });
  }
  // `tagged`: the line that tagged the person as "@you" before the tag was rewritten as plain words; it still reaches them
  return turn.tagged ? buildNotification("mention", { ...bot, threadId: turn.threadId }, turn.threadId, turn.tagged, { avatarUrl: bot.avatarUrl, group: room }) : null;
}
