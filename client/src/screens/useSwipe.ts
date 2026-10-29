import { useRef } from 'react';

/** Where a check slides in from: where its peek waits (app.css .peek), past the end or the start. */
const EDGE = { next: 'calc(100% + var(--peek-gap))', prev: 'calc(-100% - var(--peek-gap))' };

/** Horizontal swipe: a pointer move of at least 60 px that is more horizontal than vertical.
 * Left is next, right is previous. Vertical moves stay scrolls. `onNext` or `onPrev` is missing at the
 * last or the first check.
 *
 * While the finger is down, `content` follows it sideways; on release it slides on to the new check or
 * back to its place. The hook writes only the custom property `--drag` on `content`, straight to the DOM
 * (a React render on every pointer move would redraw every pane); app.css turns it into a transform, and
 * only when the phone allows motion. The check changes on release, not after the slide, so a tap or a
 * second swipe made while it slides acts on the check already shown. */
export const useSwipe = (onNext?: () => void, onPrev?: () => void) => {
  const content = useRef<HTMLDivElement>(null);
  // `from` is where the content was when the finger came down: a slide still running carries on from there.
  const start = useRef<{ x: number; y: number; from: number } | null>(null);

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
    onNext();
    slideIn(EDGE.next);
  };
  const prev = () => {
    if (!onPrev) return;
    onPrev();
    slideIn(EDGE.prev);
  };

  return {
    content,
    next,
    prev,
    area: {
      onPointerDown: (e: React.PointerEvent) => {
        const from = new DOMMatrixReadOnly(getComputedStyle(content.current!).transform).m41;
        start.current = { x: e.clientX, y: e.clientY, from };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        // A mouse drag selects text, as before; only a finger or a pen moves the check.
        if (!s || e.pointerType === 'mouse') return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) <= Math.abs(e.clientY - s.y)) return;
        // With no check on that side, the content moves a quarter of the way: a hint that it ends here.
        const side = dx < 0 ? onNext : onPrev;
        place(`${s.from + (side ? dx : dx / 4)}px`, false);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const go = Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) ? (dx < 0 ? onNext : onPrev) : undefined;
        if (!go) return place(null, true);
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
