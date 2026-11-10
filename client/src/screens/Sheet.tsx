import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  /** Closed, the sheet stays in the page, hidden, so app.css can fade it out as it closes. */
  open: boolean;
  onClose: () => void;
  /** The id of the sheet's heading, which names the dialog for a screen reader. */
  labelledBy: string;
  /** What takes the focus when the sheet opens; the first control when absent or not found. */
  focusFirst?: string;
  children: ReactNode;
};

const CONTROLS = 'button:enabled, a[href]';

/** A sheet over the screen, from the bottom: Escape or a tap outside closes it, Tab stays inside it, and the focus
 * goes back where it was however it closes. */
export default function Sheet({ open, onClose, labelledBy, focusFirst, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = (focusFirst && sheet.current?.querySelector<HTMLElement>(focusFirst)) || sheet.current?.querySelector<HTMLElement>(CONTROLS);
    first?.focus();
    return () => opener?.focus();
  }, [open, focusFirst]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !sheet.current) return;
      // Tab goes round the sheet's controls instead of leaving for the screen behind it.
      const controls = sheet.current.querySelectorAll<HTMLElement>(CONTROLS);
      const first = controls[0];
      const last = controls[controls.length - 1];
      const inside = sheet.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    // A swipe on the sheet must not move the screen behind it (the check screen to another check).
    <div className="sheet-backdrop" hidden={!open} aria-hidden={!open || undefined} onClick={onClose} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
