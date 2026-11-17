import type { Message } from "@/state/store";
import { t } from "./i18n";
import { peerLine } from "./peer-message";
import { withoutCitationMarkers } from "./citations";

export function replySnippet(text: string, limit = 160): string {
  const clean = withoutCitationMarkers(text)
    .replace(
      /<attached-(image|file)\s+path="[^"]*"(?:\s+name="[^"]*")?\s*\/>/g,
      (_tag, kind: "image" | "file") => (kind === "image" ? t("chat.reply.image") : t("chat.reply.file")),
    )
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
export function replyAuthor(message: Message, fallback?: string): string {
  if (message.role === "user") return peerLine(message)?.name ?? t("chat.you");
  return message.from?.name ?? fallback ?? t("chat.assistant");
}

export function escapeCancelsReply(
  event: { key: string; isComposing?: boolean },
  { replying, recording }: { replying: boolean; recording: boolean },
): boolean {
  return event.key === "Escape" && replying && !recording && !event.isComposing;
}

export const REPLY_SOURCE = "data-reply-source";

export function selectionReply(
  selection: { isCollapsed: boolean; toString(): string; anchorNode: Node | null; focusNode: Node | null } | null,
): { messageId: string; quote: string } | null {
  if (!selection || selection.isCollapsed) return null;
  const quote = selection.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;
  const source = (node: Node | null) => {
    const element = node && (node.nodeType === 1 ? node as Element : node.parentElement);
    return element?.closest(`[${REPLY_SOURCE}]`) ?? null;
  };
  const start = source(selection.anchorNode);
  if (!start || start !== source(selection.focusNode)) return null;
  const messageId = start.getAttribute(REPLY_SOURCE);
  return messageId ? { messageId, quote } : null;
}
