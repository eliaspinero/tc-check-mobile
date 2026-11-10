import { t } from '../i18n';
import Sheet from './Sheet';

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
  // Focus goes to the current chapter while the grid is open, and back where it was (the title) however it closes.
  return (
    <Sheet open={open} onClose={onClose} labelledBy="chapters-title" focusFirst='[aria-current="true"]:enabled'>
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
    </Sheet>
  );
}
