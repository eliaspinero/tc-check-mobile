import { useRef } from 'react';
import { leaveCheck } from './leave';

/** Where a check slides in from: where its peek waits (app.css .peek), past the end or the start. */
const EDGE = { next: 'calc(100% + var(--peek-gap))', prev: 'calc(-100% - var(--peek-gap))' };

/** The px a pointer moves before the gesture counts as sideways or as a scroll. */
const AXIS_AFTER = 6;
/** A flick: a whole gesture of at least this far (px) in under this long (ms). */
const FLICK_FROM = 30;
const FLICK_WITHIN = 200;

/** Horizontal swipe: a pointer move that starts sideways and goes at least 60 px, or a quick flick (a finger or a pen).
 * Left is next, right is previous. Vertical moves stay scrolls. `onNext` or `onPrev` is missing at the
 * last or the first check.
 *
 * While the finger is down, `content` follows it sideways; on release it slides on to the new check or
 * back to its place. The hook writes only the custom property `--drag` on `content`, straight to the DOM
 * (a React render on every pointer move would redraw every pane); app.css turns it into a transform, and
 * only when the phone allows motion. The check changes on release, not after the slide, so a tap or a
 * second swipe made while it slides acts on the check already shown. The old check leaves whole, as a still copy in
 * `slot` where its neighbour's peek waits (leave.ts), so it moves on from where the finger left it. */
export const useSwipe = (onNext?: () => void, onPrev?: () => void) => {
  const content = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  // `from` is where the content was when the finger came down: a slide still running carries on from there.
  // `axis` is decided by the first move and holds for the whole gesture, so a finger that drifts does not stop the drag.
  const start = useRef<{ x: number; y: number; t: number; from: number; axis: 'x' | 'y' | null } | null>(null);

  const place = (to: string | null, animated: boolean) => {
    const el = content.current!;
    el.style.transition = animated ? '' : 'none';
    if (to === null) el.style.removeProperty('--drag');
    else el.style.setProperty('--drag', to);
  };
  /** The new check enters from `edge`, `at` px further on, where the finger left the old one. */
  const slideIn = (edge: string, at = 0) => {
    place(`calc(${edge} + ${at}px)`, false);
    content.current!.getBoundingClientRect(); // applies that start, so the move to rest below is animated
    place(null, true);
  };
  const next = () => {
    if (!onNext) return;
    leaveCheck(content.current!, slot.current!, 'prev');
    onNext();
    slideIn(EDGE.next);
  };
  const prev = () => {
    if (!onPrev) return;
    leaveCheck(content.current!, slot.current!, 'next');
    onPrev();
    slideIn(EDGE.prev);
  };

  return {
    content,
    slot,
    next,
    prev,
    area: {
      onPointerDown: (e: React.PointerEvent) => {
        const from = new DOMMatrixReadOnly(getComputedStyle(content.current!).transform).m41;
        start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, from, axis: null };
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
        leaveCheck(content.current!, slot.current!, dx < 0 ? 'prev' : 'next');
        go();
        slideIn(dx < 0 ? EDGE.next : EDGE.prev, s.from + dx);
      },
      // The phone took the move for a scroll.
      onPointerCancel: () => {
        start.current = null;
        place(null, true);
      },
    },
  };
};
