import { useRef } from 'react';

/** Horizontal swipe: a pointer move of at least 60 px that is more horizontal than vertical.
 * Left is next, right is previous. Vertical moves stay scrolls. */
export const useSwipe = (onNext: () => void, onPrev: () => void) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
};
