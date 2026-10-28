import type { CheckingEngine, CheckItem, DerivedBook } from '../engine/CheckingEngine';
import type { Pane } from '../session/loadCheckContext';

export const verseOf = (book: DerivedBook | null, item: CheckItem) => {
  const r = item.contextId.reference as { chapter?: unknown; verse?: unknown };
  return book?.chapters[String(r.chapter)]?.[String(r.verse)];
};

/** The words a check is about, as the first source pane renders them (tC4 card titles, glTitleFor);
 * the original-language quote when no pane resolves it. */
export const gatewayOf = (engine: CheckingEngine, panes: Pane[], item: CheckItem): string => {
  const quote = item.contextId.quote as string | Array<{ word: string }>;
  const occurrence = Number(item.contextId.occurrence);
  for (const pane of panes) {
    const words = engine.gatewayQuote(verseOf(pane.book, item), quote, occurrence);
    if (words) return words;
  }
  return String(item.contextId.quoteString ?? (typeof quote === 'string' ? quote : quote.map((w) => w.word).join(' ')));
};
