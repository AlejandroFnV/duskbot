import type { Bot, Message } from "@/state/store";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { EventChip, EventLabel, EventLine } from "./EventLine";

export function QueuedHandoffsLine({ message, bots, onOpen }: {
  message: Pick<Message, "queuedHandoffs" | "from" | "threadRef" | "tool">;
  bots: readonly Pick<Bot, "id" | "name" | "color">[];
  onOpen?: () => void;
}) {
  const queued = message.queuedHandoffs;
  if (!queued) return null;
  const bot = bots.find((one) => one.id === queued.botId);
  const name = bot?.name ?? message.from?.name ?? "";
  const avatar = bot ?? { name, color: (message.from?.color ?? "blue") as Bot["color"] };
  const label = queued.count === 1 ? t("chat.event.handoffsWaiting.one", { count: 1 }) : t("chat.event.handoffsWaiting.many", { count: queued.count });
  const open = message.threadRef && onOpen;
  return (
    <EventLine data-queued-handoffs={String(queued.count)}>
      <EventLabel>{label}</EventLabel>
      <EventChip
        wideGap
        leading={<BotAvatar bot={avatar as Bot} state="happy" size={16} motion="none" motionKey={0} animated={false} />}
        title={open ? t("chat.openThread", { title: message.threadRef!.title }) : message.tool?.name ?? name}
        {...(open ? { onClick: onOpen } : {})}
      >
        {name}
      </EventChip>
    </EventLine>
  );
}
