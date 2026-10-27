// Copied from unfoldingWord/translationCore4 src/state.jsx at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: withSpanMembers only, typed, over a parsed book's chapters instead of a "chapter:verse" text index.
import type { DerivedBook } from './derive';

/** #63: a check item is keyed by its resource verse. When the draft holds
 * that verse inside a span ("2:9-10"), the span's text is the verse's text —
 * so the item can be re-checked against the span, and a decision on it
 * revalidates against the words it can actually see. */
export function withSpanMembers(book: DerivedBook): DerivedBook {
  const chapters: DerivedBook['chapters'] = {};
  for (const [chapter, verses] of Object.entries(book.chapters ?? {})) {
    const out = { ...verses };
    for (const [key, verse] of Object.entries(verses)) {
      const m = /^(\d+)-(\d+)$/.exec(key);
      if (!m) continue;
      for (let n = Number(m[1]); n <= Number(m[2]); n++) out[String(n)] ??= verse;
    }
    chapters[chapter] = out;
  }
  return { ...book, chapters };
}
