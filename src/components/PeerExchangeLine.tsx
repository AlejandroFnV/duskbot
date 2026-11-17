import type { ReactNode } from "react";
import type { Bot } from "@/state/store";
import type { ExchangeSummary, PeerRef } from "@/lib/peer-exchange";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { AvatarStack } from "./AvatarStack";
import { EventChip, EventLabel, EventLine } from "./EventLine";

function peerBot(peer: PeerRef, bots: readonly Pick<Bot, "id" | "name" | "color">[]) {
  return bots.find((bot) => bot.id === peer.id) ?? (peer.name ? bots.find((bot) => bot.name === peer.name) : undefined);
}

/** One run of bot-to-bot messages as grok draws it; a chip opens the messages under the line. */
export function PeerExchangeLine({ summary, bots, expanded, onToggle }: {
  summary: ExchangeSummary;
  bots: readonly Bot[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const chip = (peer: PeerRef): ReactNode => {
    const bot = peerBot(peer, bots);
    const name = bot?.name ?? peer.name;
    return (
      <EventChip
        key={peer.id ?? peer.name}
        wideGap
        leading={<BotAvatar bot={bot ?? { name, color: (peer.color ?? "blue") as Bot["color"] }} state="happy" size={16} motion="none" motionKey={0} animated={false} />}
        title={name}
        aria-expanded={expanded}
        aria-label={t(expanded ? "chat.event.hideExchange" : "chat.event.showExchange", { name })}
        onClick={onToggle}
      >
        {name}
      </EventChip>
    );
  };
  const crowd = (peers: readonly PeerRef[]): ReactNode => {
    const names = peers.map((peer) => peerBot(peer, bots)?.name ?? peer.name).join(", ");
    const stacked = peers.map((peer) => peerBot(peer, bots) ?? { id: peer.id, name: peer.name, color: (peer.color ?? "blue") as Bot["color"] });
    return (
      <EventChip
        wideGap
        leading={<AvatarStack bots={stacked} label={names} />}
        title={names}
        aria-expanded={expanded}
        aria-label={t(expanded ? "chat.event.hideExchange" : "chat.event.showExchange", { name: names })}
        onClick={onToggle}
      >
        {t("chat.event.botsMany", { count: peers.length })}
      </EventChip>
    );
  };
  const peersPart = (peers: readonly PeerRef[]): ReactNode => {
    if (peers.length >= 3) return crowd(peers);
    if (peers.length === 2) return <>{chip(peers[0]!)}<EventLabel tone="tertiary">{t("chat.event.and")}</EventLabel>{chip(peers[1]!)}</>;
    return peers[0] ? chip(peers[0]) : null;
  };
  const label = summary.kind === "single"
    ? t(summary.direction === "inbound" ? "chat.event.messageFrom" : "chat.event.messaged")
    : summary.kind === "fanout" ? t("chat.event.messaged") : t("chat.event.messagesWith", { count: summary.count });
  return (
    <EventLine data-peer-exchange={summary.kind}>
      <EventLabel>{label}</EventLabel>
      {summary.kind === "single" ? chip(summary.peer) : peersPart(summary.peers)}
    </EventLine>
  );
}
