import { BotAvatar } from "./Avatar";

type StackBot = Parameters<typeof BotAvatar>[0]["bot"];

export const AVATAR_STACK_MAX = 4;

/** Several bots' avatars side by side, each overlapping the one before; past `max`, a "+N" count stands in for the rest. */
export function AvatarStack({ bots, size = 16, max = AVATAR_STACK_MAX, label }: {
  bots: readonly StackBot[];
  size?: number;
  max?: number;
  label: string;
}) {
  const shown = bots.slice(0, max);
  const hidden = bots.length - shown.length;
  const overlap = Math.round(size * 0.25);
  return (
    <span role="group" aria-label={label} data-avatar-stack="" className="flex items-center">
      {shown.map((bot, index) => (
        <span
          key={`${bot.id ?? bot.name}:${index}`}
          data-avatar-stack-item=""
          className="relative flex shrink-0 rounded-full ring-2 ring-app"
          style={{ marginInlineStart: index ? -overlap : undefined, zIndex: shown.length - index }}
        >
          <BotAvatar bot={bot} state="happy" size={size} motion="none" motionKey={0} animated={false} label={bot.name} />
        </span>
      ))}
      {hidden > 0 && (
        <span
          data-avatar-stack-more=""
          className="relative flex shrink-0 items-center justify-center rounded-full bg-raised text-[9px] font-semibold leading-none text-ink-secondary"
          style={{ height: size, minWidth: size, paddingInline: 3, marginInlineStart: 2 }}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
