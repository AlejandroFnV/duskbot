import { useEffect, useRef, useState, type Dispatch, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { nextRename } from "@/lib/rename";
import { BOTS_SECTION_ID, userSectionName } from "@/lib/sidebar-layout";
import { botListOf, pinsOnRelease, stepBot, unusedName, type BotLists, type BotMove } from "@/lib/sidebar-bot-drop";
import {
  autoScrollStep, clampLift, landingTop, pressStep, releaseMove, reorderShifts, reorderTarget, sameTarget, SLIDE_EASE, SLIDE_MS, TOUCH_HOLD_MS,
  type Press, type ReorderShifts, type ReorderSnapshot, type ReorderTarget,
} from "@/lib/sidebar-reorder";
import type { Action, Bot } from "@/state/store";
import { moveBotsToSection, renameDepartment, saveBotOrder, setBotPinned, useMayMoveBots } from "./bot-sections";
import { friendlyError } from "@/lib/plain-error";

/** The department being named, before it exists. The server trims names and never keeps a control character. */
export const NEW_DEPARTMENT = "\u0000new";

export type BotRowDrag = {
  row(botId: string): { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onDragStart: (event: DragEvent<HTMLElement>) => void };
  step(botId: string, direction: -1 | 1): void;
};

export type SectionNaming = { value: string; label: string; onCommit: (name: string) => void; onCancel: () => void };

type Naming = { kind: "new"; botIds: string[]; name: string } | { kind: "rename"; section: string };

type Arranged = { enabled: boolean; lists: BotLists; bots: Bot[]; taken: string[] };

const failure = (cause: unknown) => (friendlyError(cause));

/** The lifted row: the composer's surface and the popover shadow, over the rows it slides past. */
export function botRowDropClass(dragging: boolean | undefined): string {
  return cn(dragging && "relative z-20 rounded-[12px] bg-composer shadow-(--shadow-popover)");
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const LIFT_SCALE = "1.02";

/** The click a drag ends with opens nothing: swallowed until the button is up and its click has gone by. */
function swallowClick(held: boolean) {
  const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  const release = () => window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
  window.addEventListener("click", swallow, true);
  if (!held) return release();
  const up = () => { window.removeEventListener("pointerup", up, true); release(); };
  window.addEventListener("pointerup", up, true);
}

function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/** One drag, from the press to the row settling: everything moves by inline transforms, so React draws nothing per
 * frame and the rows' layout is read once, when the row lifts. */
type Session = {
  botId: string;
  wrapper: HTMLElement;
  pointerId: number;
  scroller: HTMLElement;
  view: { top: number; bottom: number; left: number; width: number };
  snapshot: ReorderSnapshot;
  rowEls: Map<string, HTMLElement>;
  zoneEls: Map<string, HTMLElement>;
  originTop: number;
  height: number;
  /** The pointer's offset into the row, so the row keeps the spot it was grabbed by. */
  grab: number;
  clientY: number;
  target: ReorderTarget | null;
  shifts: ReorderShifts;
  line: HTMLElement;
  frame: number;
  /** whether the button or finger is still down */
  held: boolean;
  /** the pointer is above the list, over the pinned bots: letting go pins the bot */
  pin: boolean;
  restore: () => void;
};

/** Dragging bots within and between the rows outside any department and each department's, Discord's way: the row lifts
 * after a few pixels (a short hold on touch), the rest slide to make room, Escape puts everything back. Alt+Up/Down does
 * the same from the keyboard. Let go above the list, over the pinned bots, the row's bot is pinned, as its menu's Pin does. Also the name field a new or renamed department shows in its heading. */
export function useSidebarBotDrag({ dispatch, announce, onNamed, onRenamed, onError, onCancelled }: {
  dispatch: Dispatch<Action>;
  announce: (text: string) => void;
  onNamed: (name: string) => void;
  onRenamed: (from: string, to: string) => void;
  onError: (message: string) => void;
  onCancelled: () => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** a folded section the row would go into, its heading marked */
  const [into, setInto] = useState<string | null>(null);
  const [pinning, setPinning] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  const mayMove = useMayMoveBots();
  const latest = useRef<Arranged>({ enabled: false, lists: new Map(), bots: [], taken: [] });
  const session = useRef<Session | null>(null);
  /** a row still gliding into place: no new drag until it lands */
  const settling = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const controller = useRef<BotRowDrag | null>(null);
  const actions = useRef({ dispatch, announce });
  actions.current = { dispatch, announce };

  useEffect(() => () => { pending.current?.(); session.current?.restore(); }, []);

  const startNew = (botIds: string[]) => setNaming({ kind: "new", botIds, name: unusedName(t("sidebar.grok.newSection"), latest.current.taken) });
  const apply = (botId: string, move: BotMove, keyboard: boolean) => {
    if (move.kind === "group") return startNew(move.botIds);
    const { lists, bots } = latest.current;
    if (botListOf(lists, botId) !== move.section) moveBotsToSection(actions.current.dispatch, [botId], move.section);
    saveBotOrder(actions.current.dispatch, bots, move.order);
    const name = bots.find((bot) => bot.id === botId)?.name ?? "";
    actions.current.announce(t("sidebar.section.moved", { name, position: move.order.indexOf(botId) + 1, count: move.order.length }));
    if (keyboard) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sidebar-bot-row="${CSS.escape(botId)}"]`)?.focus());
  };

  const paint = (s: Session, animate: boolean) => {
    const slide = animate && !reducedMotion() ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : "none";
    for (const [id, element] of s.rowEls) {
      if (id === s.botId) continue;
      element.style.transition = slide;
      const shift = s.shifts.rows.get(id) ?? 0;
      element.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
    }
    for (const [id, element] of s.zoneEls) {
      element.style.transition = slide;
      const shift = s.shifts.zones.get(id) ?? 0;
      element.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
    }
  };
  /** the dragged row's own transform, less what its section is moved by */
  const own = (s: Session, top: number) => top - s.originTop - (s.shifts.zones.get(zoneIdOf(s, s.botId)) ?? 0);
  const zoneIdOf = (s: Session, botId: string) => {
    const list = s.snapshot.rows.find((row) => row.id === botId)?.list;
    return s.snapshot.zones.find((zone) => zone.list === list)?.id ?? "";
  };
  const placeLine = (s: Session) => {
    if (s.pin) {
      s.line.style.opacity = "1";
      s.line.style.transform = `translate3d(${s.view.left + 8}px, ${s.view.top + 1}px, 0)`;
      return;
    }
    const land = landingTop(s.snapshot, s.botId, s.target, s.shifts);
    const y = land === null ? null : land - s.snapshot.gap / 2 - 1 - s.scroller.scrollTop + s.view.top;
    const shown = y !== null && y > s.view.top && y < s.view.bottom;
    s.line.style.opacity = shown ? "1" : "0";
    if (shown) s.line.style.transform = `translate3d(${s.view.left + 8}px, ${y}px, 0)`;
  };

  const frame = () => {
    const s = session.current;
    if (!s) return;
    const step = autoScrollStep(s.clientY, s.view.top, s.view.bottom);
    if (step) s.scroller.scrollTop += step;
    const contentY = s.clientY - s.view.top + s.scroller.scrollTop;
    const top = clampLift(contentY - s.grab, s.height, s.snapshot.zones);
    const pin = pinsOnRelease(s.clientY, s.view.top, false);
    if (pin !== s.pin) { s.pin = pin; setPinning(pin); }
    const target = pin ? null : reorderTarget(s.snapshot, latest.current.lists, s.botId, top + s.height / 2);
    if (!sameTarget(target, s.target)) {
      s.target = target;
      s.shifts = reorderShifts(s.snapshot, s.botId, target);
      paint(s, true);
      setInto(target?.folded ? target.list : null);
    }
    s.wrapper.style.transform = `translate3d(0, ${own(s, top)}px, 0)`;
    placeLine(s);
    s.frame = requestAnimationFrame(frame);
  };

  /** Lets go: the row glides into its gap, or back to where it was, and only then does the order change. */
  const settle = (cancelled: boolean) => {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.frame);
    session.current = null;
    settling.current = true;
    swallowClick(s.held);
    const lists = latest.current.lists;
    const pin = latest.current.enabled && s.pin && pinsOnRelease(s.clientY, s.view.top, cancelled);
    const move = latest.current.enabled && !pin ? releaseMove(lists, s.botId, s.target, cancelled) : null;
    if (!move) s.shifts = reorderShifts(s.snapshot, s.botId, null);
    const land = move ? landingTop(s.snapshot, s.botId, s.target, s.shifts) : null;
    const animate = !reducedMotion();
    paint(s, true);
    s.line.style.opacity = "0";
    s.wrapper.style.transition = animate ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}, scale ${SLIDE_MS}ms ${SLIDE_EASE}` : "none";
    s.wrapper.style.transform = land !== null ? `translate3d(0, ${own(s, land)}px, 0)` : "";
    s.wrapper.style.scale = "";
    const done = () => {
      flushSync(() => {
        if (move) apply(s.botId, move, false);
        if (pin) {
          setBotPinned(actions.current.dispatch, s.botId, true);
          const name = latest.current.bots.find((bot) => bot.id === s.botId)?.name ?? "";
          actions.current.announce(`${name}: ${t("sidebar.section.pinned")}`);
        }
        setDragging(null);
        setInto(null);
        setPinning(false);
      });
      s.restore();
      settling.current = false;
    };
    if (animate) window.setTimeout(done, SLIDE_MS); else done();
  };

  const lift = (press: { wrapper: HTMLElement; botId: string; pointerId: number; clientY: number }) => {
    const scroller = scrollerOf(press.wrapper);
    const { lists } = latest.current;
    if (!scroller || !latest.current.enabled || botListOf(lists, press.botId) === undefined) return;
    const box = scroller.getBoundingClientRect();
    const toContent = (y: number) => y - box.top + scroller.scrollTop;
    const zoneEls = new Map<string, HTMLElement>(), rowEls = new Map<string, HTMLElement>();
    const zones = [...scroller.querySelectorAll<HTMLElement>("[data-sidebar-section-id]")].map((element) => {
      const rect = element.getBoundingClientRect(), id = element.dataset.sidebarSectionId!;
      zoneEls.set(id, element);
      return { id, list: element.hasAttribute("data-bot-drop-list") ? element.getAttribute("data-bot-drop-list") : null, top: toContent(rect.top), bottom: toContent(rect.bottom) };
    });
    const rows = [...scroller.querySelectorAll<HTMLElement>("[data-bot-reorder-row]")].flatMap((element) => {
      const id = element.dataset.botReorderRow!, list = botListOf(lists, id);
      if (list === undefined) return [];
      const rect = element.getBoundingClientRect();
      rowEls.set(id, element);
      return [{ id, list, top: toContent(rect.top), height: rect.height }];
    });
    const dragged = rows.find((row) => row.id === press.botId);
    if (!dragged) return;
    const mine = rows.filter((row) => row.list === dragged.list);
    const gap = mine.length > 1 ? Math.max(0, mine[1]!.top - (mine[0]!.top + mine[0]!.height)) : 4;
    const line = document.createElement("div");
    line.setAttribute("aria-hidden", "true");
    line.dataset.botDropLine = "";
    line.className = "pointer-events-none fixed left-0 top-0 z-[60] h-0.5 rounded-full bg-accent";
    Object.assign(line.style, { width: `${Math.max(0, box.width - 16)}px`, opacity: "0", transition: reducedMotion() ? "none" : "opacity 120ms ease" });
    document.body.append(line);
    const root = document.documentElement, body = document.body;
    const before = { cursor: root.style.cursor, select: body.style.userSelect };
    root.style.cursor = "grabbing";
    body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();
    const onMove = (event: PointerEvent) => { if (event.pointerId === press.pointerId && session.current) session.current.clientY = event.clientY; };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== press.pointerId) return;
      if (session.current) session.current.held = false;
      settle(event.type === "pointercancel");
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); settle(true); } };
    const onBlur = () => { if (session.current) session.current.held = false; settle(true); };
    // a finger that holds still for the lift must not scroll the list once it moves
    const onTouchMove = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    const onMenu = (event: Event) => event.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("contextmenu", onMenu, true);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    try { press.wrapper.setPointerCapture(press.pointerId); } catch {}
    const restore = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("touchmove", onTouchMove);
      // the menu a long press asks for is gone with the drag
      window.setTimeout(() => window.removeEventListener("contextmenu", onMenu, true), 0);
      try { press.wrapper.releasePointerCapture(press.pointerId); } catch {}
      for (const element of [...rowEls.values(), ...zoneEls.values()]) Object.assign(element.style, { transition: "", transform: "", scale: "" });
      line.remove();
      root.style.cursor = before.cursor;
      body.style.userSelect = before.select;
    };
    const s: Session = {
      botId: press.botId, wrapper: press.wrapper, pointerId: press.pointerId, scroller,
      view: { top: box.top, bottom: box.bottom, left: box.left, width: box.width },
      snapshot: { rows, zones, gap }, rowEls, zoneEls, originTop: dragged.top, height: dragged.height,
      grab: toContent(press.clientY) - dragged.top, clientY: press.clientY, target: null, shifts: reorderShifts({ rows, zones, gap }, press.botId, null), line, frame: 0, held: true, pin: false, restore,
    };
    session.current = s;
    s.target = reorderTarget(s.snapshot, lists, s.botId, dragged.top + dragged.height / 2);
    s.shifts = reorderShifts(s.snapshot, s.botId, s.target);
    press.wrapper.style.transition = reducedMotion() ? "none" : `scale ${SLIDE_MS}ms ${SLIDE_EASE}`;
    if (!reducedMotion()) press.wrapper.style.scale = LIFT_SCALE;
    setDragging(press.botId);
    s.frame = requestAnimationFrame(frame);
  };

  controller.current ??= {
    row: (botId) => ({
      // an avatar image's own drag would cancel the pointer's
      onDragStart: (event) => event.preventDefault(),
      onPointerDown: (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || session.current || settling.current || pending.current) return;
        if (!latest.current.enabled || botListOf(latest.current.lists, botId) === undefined) return;
        if ((event.target as HTMLElement).closest("button, input, textarea, [data-bot-actions]")) return;
        const wrapper = event.currentTarget;
        const pointerId = event.pointerId;
        const press: Press = { kind: event.pointerType === "touch" ? "touch" : "mouse", x: event.clientX, y: event.clientY, at: performance.now() };
        let clientY = event.clientY;
        let timer = 0;
        const stop = () => {
          window.clearTimeout(timer);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", stop);
          window.removeEventListener("pointercancel", stop);
          pending.current = null;
        };
        const begin = () => { stop(); lift({ wrapper, botId, pointerId, clientY }); };
        const onMove = (move: PointerEvent) => {
          if (move.pointerId !== pointerId) return;
          clientY = move.clientY;
          const next = pressStep(press, move.clientX, move.clientY, performance.now());
          if (next === "abandon") stop();
          else if (next === "drag") begin();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
        if (press.kind === "touch") timer = window.setTimeout(begin, TOUCH_HOLD_MS);
        pending.current = stop;
      },
    }),
    step: (botId, direction) => {
      const move = latest.current.enabled ? stepBot(latest.current.lists, botId, direction) : null;
      if (move) apply(botId, move, true);
    },
  };

  const finishNaming = (current: Naming, draft: string) => {
    setNaming(null);
    if (current.kind === "new") {
      const name = draft.trim() || current.name;
      moveBotsToSection(dispatch, current.botIds.filter((id) => latest.current.bots.some((bot) => bot.id === id && !bot.hidden)), name);
      onNamed(name);
      return;
    }
    const to = nextRename(current.section, draft);
    if (to) renameDepartment(dispatch, current.section, to).then(() => onRenamed(current.section, to), (cause) => onError(failure(cause)));
  };

  return {
    pending: naming?.kind === "new" ? [NEW_DEPARTMENT] : [],
    preview: <T extends Bot>(bots: T[]): T[] => naming?.kind === "new" ? bots.map((bot) => (naming.botIds.includes(bot.id) ? { ...bot, section: NEW_DEPARTMENT } : bot)) : bots,
    startNew: (botIds: string[]) => startNew(botIds),
    startRename: (section: string) => setNaming({ kind: "rename", section }),
    arrange({ enabled, main, sectioned, departments, bots, taken }: {
      enabled: boolean; main: Bot[]; sectioned: Bot[]; departments: string[]; bots: Bot[]; taken: string[];
    }) {
      const movable = enabled && mayMove;
      const lists = new Map<string, string[]>([["", main.map((bot) => bot.id)]]);
      for (const name of departments) if (name !== NEW_DEPARTMENT) lists.set(name, sectioned.filter((bot) => bot.section === name).map((bot) => bot.id));
      latest.current = { enabled: movable, lists, bots, taken };
      const active = movable && dragging !== null && botListOf(lists, dragging) !== undefined ? dragging : null;
      const listFor = (sectionId: string) => (sectionId === BOTS_SECTION_ID ? "" : userSectionName(sectionId));
      return {
        /** the list a section's rows belong to, for the drag to find; none where bots cannot be dropped */
        list: (sectionId: string): string | undefined => {
          const list = listFor(sectionId);
          return movable && list !== null && lists.has(list) ? list : undefined;
        },
        row: (botId: string): { botDrag?: BotRowDrag; botDragging?: boolean } => {
          if (!movable || botListOf(lists, botId) === undefined) return {};
          return { botDrag: controller.current!, botDragging: active === botId };
        },
        into: (name: string | null) => active !== null && name !== null && into === name,
        /** a dragged row is over the pinned bots: letting go pins it */
        pinning: active !== null && pinning,
        naming: (name: string | null): SectionNaming | undefined => {
          if (!naming || name === null) return undefined;
          const value = naming.kind === "new" ? (name === NEW_DEPARTMENT ? naming.name : null) : (name === naming.section ? naming.section : null);
          if (value === null) return undefined;
          return {
            value,
            label: naming.kind === "new" ? t("sidebar.grok.newSection") : t("sidebar.grok.renameSection"),
            onCommit: (draft) => finishNaming(naming, draft),
            onCancel: () => { setNaming(null); if (naming.kind === "rename") onNamed(naming.section); else onCancelled(); },
          };
        },
      };
    },
  };
}
