import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { ModelPicker } from "../ModelPicker";

/** The model picker's trigger drawn as Grok's ghost select pill ("Liora ▾"): 24px, an 8px radius, a 7% ink hairline
 * at rest (focused or not, styles.css keeps it through the app's focus reset) that gives way to a 6% fill on hover,
 * open or keyboard focus, the value in ink and a 10px chevron. Usage stays out of the pill; `UsageMeterRow` shows it on its own row. */
export const MODEL_PILL = cn(
  "[&_[data-tour=model]]:-my-[3px]! [&_[data-tour=model]]:-me-[5px]! [&_[data-tour=model]]:h-6! [&_[data-tour=model]]:max-w-[180px]! [&_[data-tour=model]]:gap-1! [&_[data-tour=model]]:rounded-lg! [&_[data-tour=model]]:border [&_[data-tour=model]]:border-transparent",
  "[&_[data-tour=model]]:py-0.5! [&_[data-tour=model]]:ps-1.5! [&_[data-tour=model]]:pe-1! [&_[data-tour=model]]:text-ink! [&_[data-tour=model]]:tracking-[-0.08px] [&_[data-tour=model]]:duration-100!",
  "[&_[data-tour=model]]:focus-visible:outline-none",
  "[&_[data-tour=model]]:disabled:opacity-50",
  "[&_[data-tour=model]>span:first-child]:hidden [&_[data-tour=model]_[data-usage-bars]]:hidden",
  "[&_[data-tour=model]>svg:last-child]:ms-0! [&_[data-tour=model]>svg:last-child]:size-2.5! [&_[data-tour=model]>svg:last-child]:text-ink/[0.66]!",
);

/** A panel row: "Model" on the left, the bot's model as a ghost pill on the right. Picking runs the real model picker
 * (sign-in, keys, the ask-first confirmation and reasoning levels included). */
export function ModelSelectRow({ bot, threadId, title, thinking = false }: { bot: Bot; threadId?: string; title?: string; thinking?: boolean }) {
  return (
    <div data-panel-row="model" className={cn("flex min-h-[30px] items-center gap-2 rounded-lg px-2 py-1.5", MODEL_PILL)}>
      <ModelPicker
        bot={bot}
        threadId={threadId ?? bot.threadId}
        contained
        containedThinking={thinking}
        size="sm"
        label={<span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] tracking-[0.015em] text-ink">{title ?? t("model.simple.model")}</span>}
      />
    </div>
  );
}
