import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";

/** The role a bot's profile gives it (its title), as the desktop sidebar and chat head show it; nothing when it is
 * empty or only repeats the Chief of Staff badge. */
export function botRole(bot: Pick<Bot, "title" | "chiefOfStaff">): string {
  const role = (bot.title ?? "").trim();
  if (!role) return "";
  if (bot.chiefOfStaff && role.toLocaleLowerCase() === t("chat.chiefOfStaff").toLocaleLowerCase()) return "";
  return role;
}

/** "Name · Role" on one line: the name as given, the role muted after it, and the whole cut with an ellipsis. Its text
 * reads "Name · Role", so screen readers and the native glass title say both. */
export function NameRole({ name, role, className, roleClassName }: { name: string; role: string; className?: string; roleClassName?: string }) {
  return (
    <span className={cn("min-w-0 truncate", className)}>
      {name}
      {role && <span className={cn("font-normal text-ink-secondary", roleClassName)}>{` · ${role}`}</span>}
    </span>
  );
}
