import type { CheckingEngine, CheckItem } from '../engine/CheckingEngine';
import { chapterCount } from '../i18n/books';
import type { ChapterState } from './ChapterGrid';

/** A check's chapter and verse, as numbers for the chapter and as written for the verse. */
export const refOf = (item: CheckItem): { chapter: number; verse: string } => {
  const r = item.contextId.reference as { chapter?: unknown; verse?: unknown };
  return { chapter: Number(r.chapter), verse: String(r.verse) };
};

/** Each chapter's state for the grid: no checks, checks left, or all checked. */
export const chapterStates = (book: string, items: CheckItem[], engine: CheckingEngine): ChapterState[] => {
  const last = Math.max(chapterCount(book), ...items.map((i) => refOf(i).chapter));
  return Array.from({ length: last }, (_, i) => {
    const inChapter = items.filter((item) => refOf(item).chapter === i + 1);
    if (inChapter.length === 0) return 'none';
    const p = engine.progress(inChapter);
    return p.decided === p.total ? 'done' : 'open';
  });
};
