import { activeLocale } from "@/lib/i18n";

const SYSTEM_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const appFormats = new Map<string, Intl.DateTimeFormat>();
let appLocaleClock = false;

/** The phone app turns this on so its clock follows the app's language (Spanish reads 18:05 on a phone set to
 * English), like its chat list. The desktop never calls it and keeps the system's own clock. */
export function setAppLocaleClock(on: boolean): void {
  appLocaleClock = on;
}

function timeFormat(): Intl.DateTimeFormat {
  if (!appLocaleClock) return SYSTEM_FORMAT;
  const locale = activeLocale();
  let format = appFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    appFormats.set(locale, format);
  }
  return format;
}

export function formatTime(at: number) {
  const date = new Date(at);
  // toLocaleTimeString's output, where Intl.DateTimeFormat.format would throw
  return Number.isNaN(date.getTime()) ? "Invalid Date" : timeFormat().format(date);
}
