import { deriveForProject, deriveTargetBible, mergeAndReattach, progressOf, twArticlesOf } from '../checking/derive';
import { oldTwlPin, resolveToolBook } from '../checking/resolve';
import { matchQuote, tokenizeVerse } from '../checking/sourceHighlight';
import { targetWords, tokenIndicesFromSelections } from '../checking/selections';
import type { CheckingEngine } from './CheckingEngine';

export const tsEngine: CheckingEngine = {
  resolve: (resources, tool, book, coverage) => ({
    ...resolveToolBook(resources, tool, book, coverage),
    oldTwl: tool === 'translationWords' && oldTwlPin(resources) !== null,
  }),
  deriveItems: async (input) => {
    // As tC4 state.jsx does: derive without the saved decisions, then merge them in two passes
    // (identity key, then reference + original quote + occurrence with the groupId tiebreak).
    const derived = await deriveForProject({
      tsv: input.tsv,
      tool: input.tool,
      bookId: input.bookId,
      from: input.from,
      to: input.to,
      schemes: input.schemes,
      scopeRanges: input.scopeRanges,
      twArticles: input.twArticles,
    });
    const { items, orphaned } = mergeAndReattach(derived.items, input.saved, { keepInvalidated: input.keepInvalidated });
    return { ...derived, items, orphaned };
  },
  progress: (items) => progressOf(items),
  twArticles: (meta) => twArticlesOf(meta),
  parseBook: (usfm) => deriveTargetBible(usfm),
  verseText: (verse) => tokenizeVerse(verse).map((t) => t.text).join('').trim(),
  sourceTokens: (verse, quote, occurrence) => {
    const tokens = tokenizeVerse(verse);
    return { tokens, highlighted: [...matchQuote(tokens, quote, occurrence)].sort((a, b) => a - b) };
  },
  targetTokens: (verseText, selections) => ({
    tokens: targetWords(verseText),
    selected: tokenIndicesFromSelections(verseText, selections),
  }),
};
