import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Reply } from "../icons";
import { selectionReply } from "@/lib/replies";
import { t } from "@/lib/i18n";

type Spot = { messageId: string; quote: string; x: number; y: number; below: boolean };

export function SelectionReply({ onReply }: { onReply: (messageId: string, quote: string) => void }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      const picked = selectionReply(selection);
      if (!picked || !selection?.rangeCount) return setSpot(null);
      const box = selection.getRangeAt(0).getBoundingClientRect();
      // iOS and Android draw their own copy menu above a touch selection, so the button goes under it there.
      const below = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setSpot({ ...picked, x: box.left + box.width / 2, y: below ? box.bottom + 8 : box.top - 8, below });
    };
    document.addEventListener("selectionchange", read);
    window.addEventListener("scroll", read, true);
    window.addEventListener("resize", read);
    return () => {
      document.removeEventListener("selectionchange", read);
      window.removeEventListener("scroll", read, true);
      window.removeEventListener("resize", read);
    };
  }, []);

  if (!spot) return null;
  const reply = () => {
    onReply(spot.messageId, spot.quote);
    window.getSelection()?.removeAllRanges();
    setSpot(null);
  };
  return createPortal(
    <button
      type="button"
      data-selection-reply=""
      onPointerDown={(event) => event.preventDefault()}
      onClick={reply}
      style={{ left: spot.x, top: spot.y }}
      className={`fixed z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-ink shadow-lg ring-1 ring-ink/10 hover:bg-ink/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${spot.below ? "" : "-translate-y-full"}`}
    >
      <Reply size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
      {t("chat.reply.selection")}
    </button>,
    document.body,
  );
}
