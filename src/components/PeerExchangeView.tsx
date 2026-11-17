import type { Bot } from "@/state/store";
import type { PeerConversationLine, PeerRef } from "@/lib/peer-exchange";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { BotAvatar } from "./Avatar";
import { GrokDialog, mdSecondaryCls } from "./ui/GrokDialog";

function peerBot(peer: PeerRef, bots: readonly Pick<Bot, "id" | "name" | "color">[]) {
  return bots.find((bot) => bot.id === peer.id) ?? (peer.name ? bots.find((bot) => bot.name === peer.name) : undefined);
}

/** The messages this chat's bot traded with one or more other bots, on their own sheet ("Nova ↔ Quill"), so they never
 * read as part of the person's thread. Esc, the close button or "Back to chat" return to it. */
export function PeerExchangeView({ self, peers, lines, bots, onClose }: {
  self: { name: string; color?: string };
  peers: readonly PeerRef[];
  lines: readonly PeerConversationLine[];
  bots: readonly Bot[];
  onClose: () => void;
}) {
  const peerNames = peers.map((peer) => peerBot(peer, bots)?.name ?? peer.name).join(", ");
  const title = t("chat.exchange.title", { self: self.name, peers: peerNames });
  const footer = <button type="button" className={mdSecondaryCls} onClick={onClose} data-exchange-back="">{t("chat.exchange.back")}</button>;
  return (
    <GrokDialog data-panel-modal="peer-exchange" title={title} width={560} onClose={onClose} footer={footer}>
      {lines.length === 0
        ? <p className="m-0 text-[13px] leading-[18px] text-ink/68">{t("chat.exchange.empty")}</p>
        : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label={title}>
            {lines.map((line) => {
              const peer = peerBot(line.peer, bots);
              const author = line.direction === "outbound"
                ? { name: self.name, color: (self.color ?? "blue") as Bot["color"] }
                : peer ?? { name: line.peer.name, color: (line.peer.color ?? "blue") as Bot["color"] };
              const to = line.direction === "outbound" ? (peer?.name ?? line.peer.name) : self.name;
              return (
                <li key={line.id} data-exchange-line={line.direction} className={cn("flex gap-2", line.direction === "outbound" && "flex-row-reverse")}>
                  <BotAvatar bot={author} state="happy" size={20} motion="none" motionKey={0} animated={false} />
                  <div className={cn("min-w-0 max-w-[85%] rounded-[14px] px-3 py-2", line.direction === "outbound" ? "bg-ink/8" : "bg-ink/4")}>
                    <div className="mb-0.5 text-[11px] leading-4 text-ink/56">
                      {t("chat.exchange.fromTo", { from: author.name, to })}
                      {" · "}
                      <time dateTime={new Date(line.at).toISOString()}>{new Date(line.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time>
                    </div>
                    <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-ink">{line.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </GrokDialog>
  );
}
