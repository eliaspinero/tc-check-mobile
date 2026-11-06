import { useRef } from 'react';
import { flushSync } from 'react-dom';

/** The px a pointer moves before the gesture counts as sideways or as a scroll. */
const AXIS_AFTER = 6;
/** A flick: a whole gesture of at least this far (px) in under this long (ms). */
const FLICK_FROM = 30;
const FLICK_WITHIN = 200;

const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Horizontal swipe: a pointer move that starts sideways and goes at least 60 px, or a quick flick (a finger or a pen).
 * Left is next, right is previous. Vertical moves stay scrolls. `onNext` or `onPrev` is missing at the
 * last or the first check.
 *
 * While the finger is down, `content` follows it sideways; on release it slides on to the neighbour's peek or back
 * to its place. The hook writes only the custom property `--drag` on `content`, straight to the DOM (a React render
 * on every pointer move would redraw every pane); app.css turns it into a transform, and only when the phone allows
 * motion.
 *
 * The neighbour is already drawn whole at the edge, so the slide moves what is there and React renders nothing
 * while it runs: the check changes when the slide ends. Until then anything the checker does on the screen (a press,
 * a key) first lands the slide, so a tap or a second swipe acts on the check they see arriving. */
export const useSwipe = (onNext?: () => void, onPrev?: () => void) => {
  const content = useRef<HTMLDivElement>(null);
  // `from` is where the content was when the finger came down. `axis` is decided by the first move and holds for the
  // whole gesture, so a finger that drifts does not stop the drag.
  const start = useRef<{ x: number; y: number; t: number; from: number; axis: 'x' | 'y' | null } | null>(null);
  // A slide on its way to a neighbour: what changes the check, and how far the content moves to get there.
  const pending = useRef<{ go: () => void; by: number } | null>(null);

  const place = (to: string | null, animated: boolean) => {
    const el = content.current!;
    el.style.transition = animated ? '' : 'none';
    if (to === null) el.style.removeProperty('--drag');
    else el.style.setProperty('--drag', to);
  };
  const shift = () => new DOMMatrixReadOnly(getComputedStyle(content.current!).transform).m41;

  /** The slide ends: the check changes, and the content is back at rest, now showing the neighbour that slid in.
   * Returns how far the content still was from there. */
  const land = () => {
    const p = pending.current;
    if (!p) return 0;
    pending.current = null;
    const left = shift() - p.by;
    flushSync(p.go);
    place(null, false);
    return left;
  };
  /** Slides on to the neighbour on `side`, whose peek waits that far away (app.css .peek). */
  const slideTo = (side: 'next' | 'prev', go: () => void) => {
    const peek = content.current!.querySelector<HTMLElement>(`:scope > .peek.${side}`);
    const by = peek ? -peek.offsetLeft : 0;
    if (!motionAllowed() || !peek) {
      go();
      return place(null, false);
    }
    pending.current = { go, by };
    place(`${by}px`, true);
  };
  const next = () => {
    land();
    if (onNext) slideTo('next', onNext);
  };
  const prev = () => {
    land();
    if (onPrev) slideTo('prev', onPrev);
  };

  return {
    content,
    next,
    prev,
    area: {
      onPointerDownCapture: (e: React.PointerEvent) => {
        // A slide still running lands first, and the finger picks the new check up where it is.
        const left = land();
        if (left) place(`${left}px`, false);
        start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, from: left || shift(), axis: null };
      },
      onKeyDownCapture: () => {
        land();
      },
      onTransitionEnd: (e: React.TransitionEvent) => {
        if (e.target === content.current && e.propertyName === 'transform') land();
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_AFTER) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        // A mouse drag selects text, as before; only a finger or a pen moves the check.
        if (s.axis !== 'x' || e.pointerType === 'mouse') return;
        // With no check on that side, the content moves a quarter of the way: a hint that it ends here.
        const side = dx < 0 ? onNext : onPrev;
        place(`${s.from + (side ? dx : dx / 4)}px`, false);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        // A mouse drag of that length is a text selection, so a flick is a finger's or a pen's.
        const flick = e.pointerType !== 'mouse' && Math.abs(dx) >= FLICK_FROM && e.timeStamp - s.t < FLICK_WITHIN;
        const go = s.axis === 'x' && (Math.abs(dx) >= 60 || flick) ? (dx < 0 ? onNext : onPrev) : undefined;
        if (!go) return place(null, true);
        slideTo(dx < 0 ? 'next' : 'prev', go);
      },
      // The phone took the move for a scroll.
      onPointerCancel: () => {
        start.current = null;
        place(null, true);
      },
    },
  };
};
