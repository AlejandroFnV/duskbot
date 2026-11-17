import { activeLocale } from "@/lib/i18n";

const formats = new Map<string, Intl.DateTimeFormat>();

/** The clock in the app's own language, so Spanish reads 18:05 even on a phone set to English. */
function timeFormat(): Intl.DateTimeFormat {
  const locale = activeLocale();
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    formats.set(locale, format);
  }
  return format;
}

export function formatTime(at: number) {
  const date = new Date(at);
  // toLocaleTimeString's output, where Intl.DateTimeFormat.format would throw
  return Number.isNaN(date.getTime()) ? "Invalid Date" : timeFormat().format(date);
}
