import { useEffect, useRef } from 'react';
import { t } from '../i18n';

export type ChapterState = 'none' | 'open' | 'done';

type Props = {
  /** Closed, the grid stays in the page, hidden, so app.css can fade it out as it closes. */
  open: boolean;
  /** One entry per chapter of the book, chapter 1 first. */
  chapters: ChapterState[];
  current: number;
  onPick: (chapter: number) => void;
  onClose: () => void;
};

/** The book's chapters as a grid, as YouVersion shows them: greyed with no checks, ✓ when all are checked. */
export default function ChapterGrid({ open, chapters, current, onPick, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);

  // Focus goes to the current chapter while the grid is open, and back where it was (the title) however it closes.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const buttons = sheet.current?.querySelectorAll<HTMLButtonElement>('button:enabled');
    (sheet.current?.querySelector<HTMLButtonElement>('[aria-current="true"]:enabled') ?? buttons?.[0])?.focus();
    return () => opener?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !sheet.current) return;
      // Tab goes round the sheet's buttons instead of leaving for the screen behind it.
      const buttons = sheet.current.querySelectorAll<HTMLButtonElement>('button:enabled');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
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
    // A swipe on the grid must not move the check screen behind it to another check.
    <div className="sheet-backdrop" hidden={!open} aria-hidden={!open || undefined} onClick={onClose} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="chapters-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="chapters-title">{t('chapters')}</h2>
          <button className="icon" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="chapter-grid">
          {chapters.map((state, i) => {
            const chapter = i + 1;
            const label = t(state === 'done' ? 'chapterDone' : state === 'none' ? 'chapterEmpty' : 'chapter', { chapter });
            return (
              <button
                key={chapter}
                className={`chapter ${state}${chapter === current ? ' current' : ''}`}
                aria-label={label}
                aria-current={chapter === current ? 'true' : undefined}
                disabled={state === 'none'}
                onClick={() => onPick(chapter)}
              >
                {chapter}
                {state === 'done' && <span className="done-mark" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
