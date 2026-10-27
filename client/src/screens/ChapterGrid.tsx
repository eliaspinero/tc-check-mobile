import { useEffect } from 'react';
import { t } from '../i18n';

export type ChapterState = 'none' | 'open' | 'done';

type Props = {
  /** One entry per chapter of the book, chapter 1 first. */
  chapters: ChapterState[];
  current: number;
  onPick: (chapter: number) => void;
  onClose: () => void;
};

/** The book's chapters as a grid, as YouVersion shows them: greyed with no checks, ✓ when all are checked. */
export default function ChapterGrid({ chapters, current, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // A swipe on the grid must not move the check screen behind it to another check.
    <div className="sheet-backdrop" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="chapters-title" onClick={(e) => e.stopPropagation()}>
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
