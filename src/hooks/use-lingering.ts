import { useEffect, useState } from "react";

/** Holds `on` for `ms` after it turns off; a new `key` (another chat) drops what the last one was holding. */
export function useLingering(on: boolean, ms: number, key = ""): boolean {
  const [held, setHeld] = useState({ key, on });
  if (held.key !== key || (on && !held.on)) setHeld({ key, on });
  const lingering = held.key === key && held.on;
  useEffect(() => {
    if (on || !lingering) return;
    const timer = setTimeout(() => setHeld({ key, on: false }), ms);
    return () => clearTimeout(timer);
  }, [on, lingering, ms, key]);
  return on || lingering;
}
